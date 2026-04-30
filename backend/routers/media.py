"""媒体文件服务路由"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, Body
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
import re
import logging
import uuid
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models import Agent, LLMProvider, Asset, User, SubscriptionPlan, generate_uuid, ToolConfig
from auth import get_current_active_user
from schemas import (
    BatchImageGenerateRequest,
    BatchImageGenerateResponse,
    SingleImageResultResponse,
    BatchImageConfigRequest,
    AssetResponse,
    AssetListResponse,
)
from services.batch_image_gen import batch_generate_images, BatchImageConfig
from services.xai_image_gen import batch_generate_xai_images, XAIBatchImageConfig
from services.image_config_adapter import to_provider_config
from services.media_utils import build_media_storage_path, resolve_media_filepath, MEDIA_DIR
from storage import get_storage_backend
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/media", tags=["media"])

# 按文件类型的上传大小限制（字节）
_MAX_UPLOAD_SIZES = {
    "image": 50 * 1024 * 1024,    # 50MB
    "video": 500 * 1024 * 1024,   # 500MB
    "audio": 100 * 1024 * 1024,   # 100MB
}
_MAX_UPLOAD_LABELS = { "image": "50MB", "video": "500MB", "audio": "100MB" }

# 安全文件名：UUID + 已知媒体扩展名（图片 + 视频 + 音频）
_SAFE_FILENAME = re.compile(r'^[a-f0-9\-]{36}\.(png|jpg|jpeg|webp|gif|mp4|webm|mov|mp3|wav|ogg)$')


async def _fallback_presign_post(
    backend,
    user_id: str,
    file_type: str,
    filename: str,
    content_type: str,
    max_size: int,
) -> Optional[dict]:
    """下级预签名方式：存在 presign_upload (POST policy) 时用之；否则返回 None。"""
    fn = getattr(backend, "presign_upload", None)
    return await fn(
        user_id=user_id,
        file_type=file_type,
        filename=filename,
        content_type=content_type,
        max_size=max_size,
    ) if fn else None
# 纯 UUID（无扩展名）— LLM 模型可能在回复中截断文件扩展名
_UUID_ONLY = re.compile(r'^[a-f0-9\-]{36}$')

# 扩展名回退查找顺序
_FALLBACK_EXTS = ("png", "jpg", "jpeg", "webp", "gif")

# 扩展名 -> MIME
_EXT_MIME = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "svg": "image/svg+xml",
    "mp3": "audio/mpeg",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "ogg": "video/ogg",
    "mov": "video/quicktime",
    "wav": "audio/wav"
}

# MIME 前缀 -> 文件类型分类（避免 if-else）
_MIME_CATEGORY = {"image/": "image", "audio/": "audio", "video/": "video"}

# file_type 筛选映射表（避免 if-else）
_TYPE_FILTERS = {
    None: lambda q: q,
    "all": lambda q: q,
    "image": lambda q: q.where(Asset.file_type == "image"),
    "video": lambda q: q.where(Asset.file_type == "video"),
    "audio": lambda q: q.where(Asset.file_type == "audio"),
}


def _derive_file_type(mime: str) -> str:
    """从 MIME 类型派生文件分类"""
    for prefix, category in _MIME_CATEGORY.items():
        if mime.startswith(prefix):
            return category
    return "other"


def _asset_to_response(asset: Asset) -> AssetResponse:
    """将 Asset ORM 对象转换为响应模型"""
    resp = AssetResponse.model_validate(asset)
    resp.url = f"/api/media/{asset.filename}"
    return resp


@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """上传媒体文件，创建 Asset 记录关联当前用户，返回文件 URL 和资源详情"""
    file.filename or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="No file uploaded")
    )

    ext = file.filename.rsplit(".", 1)[-1].lower()
    ext in _EXT_MIME or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    )

    MEDIA_DIR.mkdir(exist_ok=True)
    new_filename = f"{uuid.uuid4()}.{ext}"

    contents = await file.read()

    # 按文件类型校验大小限制（在 try 外部，避免被 except 吞掉）
    file_type = _derive_file_type(_EXT_MIME[ext])
    max_size = _MAX_UPLOAD_SIZES.get(file_type, 50 * 1024 * 1024)
    max_label = _MAX_UPLOAD_LABELS.get(file_type, "50MB")
    len(contents) <= max_size or (_ for _ in ()).throw(
        HTTPException(status_code=413, detail=f"文件大小超出限制（{file_type} 最大 {max_label}），当前 {len(contents) / 1024 / 1024:.1f}MB")
    )

    # 存储配额校验
    file_size = len(contents)
    used = current_user.storage_used_bytes or 0
    # 有效配额：取用户个人配额与订阅套餐配额的较大值
    quota = current_user.storage_quota_bytes or 2147483648
    plan_result = await db.execute(
        select(SubscriptionPlan.storage_quota_bytes)
        .where(SubscriptionPlan.id == current_user.subscription_plan_id)
    ) if current_user.subscription_plan_id else None
    plan_quota = (plan_result.scalar() if plan_result else None) or 0
    effective_quota = max(quota, plan_quota)
    (used + file_size <= effective_quota) or (_ for _ in ()).throw(
        HTTPException(
            status_code=413,
            detail=f"存储空间不足。已用 {used / 1024 / 1024 / 1024:.2f}GB / 配额 {effective_quota / 1024 / 1024 / 1024:.1f}GB",
        )
    )

    # 写入用户隔离目录
    filepath, relative_path = build_media_storage_path(current_user.id, file_type, new_filename)
    try:
        filepath.write_bytes(contents)
        logger.info(f"Uploaded file saved: {relative_path} ({len(contents)} bytes)")
    except Exception as e:
        logger.error(f"Error saving uploaded file: {e}")
        raise HTTPException(status_code=500, detail="Failed to save file")

    # 创建 Asset 数据库记录
    mime = _EXT_MIME[ext]
    asset = Asset(
        id=generate_uuid(),
        user_id=current_user.id,
        filename=new_filename,
        original_name=file.filename,
        file_path=relative_path,
        file_type=_derive_file_type(mime),
        mime_type=mime,
        size=len(contents),
    )
    db.add(asset)

    # 更新用户已用存储空间
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalars().first()
    user.storage_used_bytes = (user.storage_used_bytes or 0) + len(contents)

    await db.commit()
    await db.refresh(asset)

    return {"url": f"/api/media/{new_filename}", "asset": _asset_to_response(asset)}


# ---------------------------------------------------------------------------
# 资源 CRUD 端点（账号级别）— 必须在 /{filename} 之前注册，避免路由被通配符拦截
# ---------------------------------------------------------------------------

@router.get("/assets", response_model=AssetListResponse)
async def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    file_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """获取当前用户的资源列表（分页，可按类型筛选）"""
    base = select(Asset).where(Asset.user_id == current_user.id)

    # 应用类型筛选（映射表模式）
    apply_filter = _TYPE_FILTERS.get(file_type, _TYPE_FILTERS[None])
    base = apply_filter(base)

    # 计算总数
    count_q = select(func.count()).select_from(base.subquery())
    total = await db.scalar(count_q) or 0

    # 分页查询
    query = base.order_by(Asset.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    assets = result.scalars().all()

    return AssetListResponse(
        items=[_asset_to_response(a) for a in assets],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.put("/assets/{asset_id}")
async def update_asset(
    asset_id: str,
    original_name: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """更新资源（重命名和/或替换文件）"""
    # 查询并验证所有权
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    )
    asset = result.scalars().first()
    asset or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Asset not found"))

    # 重命名
    original_name and setattr(asset, "original_name", original_name)

    # 替换文件
    if file and file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
        ext in _EXT_MIME or (_ for _ in ()).throw(
            HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
        )

        mime = _EXT_MIME[ext]
        new_file_type = _derive_file_type(mime)
        new_filename = f"{uuid.uuid4()}.{ext}"
        filepath, relative_path = build_media_storage_path(current_user.id, new_file_type, new_filename)

        try:
            contents = await file.read()
            filepath.write_bytes(contents)
        except Exception as e:
            logger.error(f"Error saving replacement file: {e}")
            raise HTTPException(status_code=500, detail="Failed to save file")

        # 删除旧文件（file_path 兼容平铺和隔离两种结构）
        old_path = MEDIA_DIR / asset.file_path
        old_path.unlink(missing_ok=True)

        # 更新记录
        asset.filename = new_filename
        asset.file_path = relative_path
        asset.mime_type = mime
        asset.file_type = new_file_type
        asset.size = len(contents)

    await db.commit()
    await db.refresh(asset)

    return _asset_to_response(asset)


@router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """硬删除资源（删除数据库记录 + 文件系统文件）"""
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    )
    asset = result.scalars().first()
    asset or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Asset not found"))

    file_path = asset.file_path
    asset_size = asset.size or 0

    # 先删数据库记录
    await db.delete(asset)

    # 扣减用户已用存储空间
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalars().first()
    user.storage_used_bytes = max(0, (user.storage_used_bytes or 0) - asset_size)

    await db.commit()

    # 再删文件系统文件（file_path 兼容平铺和隔离两种结构）
    (MEDIA_DIR / file_path).unlink(missing_ok=True)
    logger.info(f"Hard deleted asset: {asset_id} / {file_path}")

    return {"detail": "Asset deleted"}


@router.post("/assets/batch-delete")
async def batch_delete_assets(
    asset_ids: List[str] = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """批量硬删除资源（单事务，性能优化）"""
    # 一次性查出当前用户拥有的目标资产
    result = await db.execute(
        select(Asset).where(Asset.id.in_(asset_ids), Asset.user_id == current_user.id)
    )
    assets = result.scalars().all()

    total_freed = 0
    file_paths: list[str] = []
    for asset in assets:
        total_freed += asset.size or 0
        file_paths.append(asset.file_path)
        await db.delete(asset)

    # 一次性扣减存储配额
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalars().first()
    user.storage_used_bytes = max(0, (user.storage_used_bytes or 0) - total_freed)

    await db.commit()

    # 事务成功后再删文件（file_path 兼容平铺和隔离两种结构）
    for fp in file_paths:
        (MEDIA_DIR / fp).unlink(missing_ok=True)

    logger.info(f"Batch deleted {len(assets)} assets for user {current_user.id}")
    return {"deleted": len(assets), "requested": len(asset_ids)}


@router.get("/storage-usage")
async def storage_usage(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """返回当前用户的存储空间使用情况"""
    used = current_user.storage_used_bytes or 0
    quota = current_user.storage_quota_bytes or 2147483648
    # 查询订阅套餐配额
    plan_quota = 0
    plan_result = await db.execute(
        select(SubscriptionPlan.storage_quota_bytes)
        .where(SubscriptionPlan.id == current_user.subscription_plan_id)
    ) if current_user.subscription_plan_id else None
    plan_quota = (plan_result.scalar() if plan_result else None) or 0
    effective_quota = max(quota, plan_quota)
    usage_percent = round(used / effective_quota * 100, 2) if effective_quota else 0

    return {
        "used_bytes": used,
        "quota_bytes": effective_quota,
        "usage_percent": usage_percent,
    }


# ---------------------------------------------------------------------------
# Phase1+: 预签名上传端点（仅 STORAGE_BACKEND=s3 生效，客户端直传对象存储）
# ---------------------------------------------------------------------------

@router.post("/presign-upload")
async def presign_upload(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """生成对象存储预签名上传凭证，允许客户端直传 S3/MinIO。

    Body:
    - filename: 原始文件名（仅用于推断扩展名，实际 key 使用 UUID）
    - mime_type / content_type: 客户端上传的 Content-Type
    - file_size (可选): 预检查配额

    仅在 settings.STORAGE_BACKEND == 's3' 时返回预签名凭证；本地后端返回 400。
    """
    settings.STORAGE_BACKEND == "s3" or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Presigned upload is only available when STORAGE_BACKEND=s3")
    )

    original = (payload.get("filename") or "").strip()
    original or (_ for _ in ()).throw(HTTPException(status_code=400, detail="filename is required"))
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    ext in _EXT_MIME or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    )

    mime = payload.get("content_type") or payload.get("mime_type") or _EXT_MIME[ext]
    file_type = _derive_file_type(mime)
    new_filename = f"{uuid.uuid4()}.{ext}"

    # 可选预检查配额
    declared_size = int(payload.get("file_size") or 0)
    max_size = _MAX_UPLOAD_SIZES.get(file_type, 50 * 1024 * 1024)
    (declared_size <= max_size) or (_ for _ in ()).throw(
        HTTPException(status_code=413, detail=f"file_size {declared_size} exceeds max {max_size} for {file_type}")
    )

    # 存储配额预检查（同步与 upload_media）
    used = current_user.storage_used_bytes or 0
    quota = current_user.storage_quota_bytes or 2147483648
    plan_result = await db.execute(
        select(SubscriptionPlan.storage_quota_bytes)
        .where(SubscriptionPlan.id == current_user.subscription_plan_id)
    ) if current_user.subscription_plan_id else None
    plan_quota = (plan_result.scalar() if plan_result else None) or 0
    effective_quota = max(quota, plan_quota)
    (declared_size == 0 or used + declared_size <= effective_quota) or (_ for _ in ()).throw(
        HTTPException(status_code=413, detail="存储空间不足")
    )

    backend = get_storage_backend()
    # 优先走协议标准 PUT 预签名；返回 None 则回落到 POST policy
    result = None
    put_signer = getattr(backend, "presigned_put_url", None)
    put_signer and (result := await put_signer(
        user_id=current_user.id,
        file_type=file_type,
        filename=new_filename,
        content_type=mime,
    ))
    result or (result := await _fallback_presign_post(
        backend, current_user.id, file_type, new_filename, mime, max_size,
    ))
    result or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Backend does not support presigned upload")
    )
    return {
        "upload": result,
        "filename": new_filename,
        "original_name": original,
        "mime_type": mime,
        "file_type": file_type,
    }


@router.post("/presign-confirm")
async def presign_confirm(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """客户端预签名直传成功后调用此端点创建 Asset 记录与扣减配额。

    Body: { key, filename, original_name, mime_type, file_type, size }
    """
    fields = {k: payload.get(k) for k in ("key", "filename", "original_name", "mime_type", "file_type", "size")}
    all(fields[k] for k in ("key", "filename", "mime_type", "file_type")) or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Missing required fields: key/filename/mime_type/file_type")
    )
    size = int(fields["size"] or 0)

    asset = Asset(
        id=generate_uuid(),
        user_id=current_user.id,
        filename=fields["filename"],
        original_name=fields["original_name"] or fields["filename"],
        file_path=fields["key"],
        file_type=fields["file_type"],
        mime_type=fields["mime_type"],
        size=size,
    )
    db.add(asset)

    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalars().first()
    user.storage_used_bytes = (user.storage_used_bytes or 0) + size

    await db.commit()
    await db.refresh(asset)
    return {"asset": _asset_to_response(asset)}



# ---------------------------------------------------------------------------
# 虚拟人像预览图子目录
# ---------------------------------------------------------------------------

@router.get("/virtual-humans/{filename}")
async def serve_virtual_human_preview(filename: str):
    """提供虚拟人像预览图文件"""
    matched = _SAFE_FILENAME.match(filename)
    matched or (_ for _ in ()).throw(HTTPException(status_code=400, detail="Invalid filename"))
    filepath = MEDIA_DIR / "virtual-humans" / filename
    filepath.is_file() or (_ for _ in ()).throw(HTTPException(status_code=404, detail="File not found"))
    ext = filename.rsplit(".", 1)[-1]
    return FileResponse(
        filepath,
        media_type=_EXT_MIME.get(ext, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=31536000"},
    )


# ---------------------------------------------------------------------------
# 通配符路由 — 必须放在所有具体路径之后，否则会拦截 /assets 等路径
# ---------------------------------------------------------------------------

@router.get("/{filename}")
async def serve_media(filename: str, db: AsyncSession = Depends(get_db)):
    """安全地提供媒体文件（支持本地后端 + S3 预签名重定向）"""
    # 优先精确匹配（带扩展名）
    matched = _SAFE_FILENAME.match(filename)
    matched or _UUID_ONLY.match(filename) or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Invalid filename")
    )

    # S3 后端：根据 Asset 查出 key 后重定向到预签名/公网 URL
    s3_handlers = {
        "s3": lambda: _serve_s3(filename, db),
        "local": lambda: _serve_local(filename),
    }
    handler = s3_handlers.get(settings.STORAGE_BACKEND, s3_handlers["local"])
    return await handler()


async def _serve_s3(filename: str, db: AsyncSession):
    """S3 后端：查 Asset.file_path 作为 key，302 跳转到预签名 URL。"""
    asset_q = await db.execute(select(Asset).where(Asset.filename == filename))
    asset = asset_q.scalars().first()
    asset or (_ for _ in ()).throw(HTTPException(status_code=404, detail="File not found"))
    backend = get_storage_backend()
    target_url = await backend._resolve_url(asset.file_path)  # noqa: SLF001 - intentional reuse
    return RedirectResponse(url=target_url, status_code=302)


async def _serve_local(filename: str):
    """本地后端：保持原有逆向查找逻辑。"""
    matched = _SAFE_FILENAME.match(filename)
    if matched:
        filepath = resolve_media_filepath(filename)
        filepath or (_ for _ in ()).throw(HTTPException(status_code=404, detail="File not found"))
        ext = filename.rsplit(".", 1)[-1]
        return FileResponse(
            filepath,
            media_type=_EXT_MIME.get(ext, "application/octet-stream"),
            headers={"Cache-Control": "public, max-age=31536000"},
        )

    # 回退：纯 UUID（LLM 模型可能在回复中截断文件扩展名）
    if _UUID_ONLY.match(filename):
        for ext in _FALLBACK_EXTS:
            candidate = resolve_media_filepath(f"{filename}.{ext}")
            if candidate:
                return FileResponse(
                    candidate,
                    media_type=_EXT_MIME.get(ext, "application/octet-stream"),
                    headers={"Cache-Control": "public, max-age=31536000"},
                )

    raise HTTPException(status_code=400, detail="Invalid filename")


@router.post("/batch-generate", response_model=BatchImageGenerateResponse)
async def batch_generate(
    request: BatchImageGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    批量图片生成 API
    
    使用指定智能体的配置（API key、模型）并行生成多张图片。
    支持 Gemini 和 xAI 供应商。
    
    - **agent_id**: 智能体 ID
    - **prompts**: 提示词列表（1-8 条）
    - **config**: 图片生成配置（可选）
    - **max_concurrent**: 最大并发数（1-8，默认 4）
    """
    # 获取智能体配置
    agent = await db.get(Agent, request.agent_id)
    agent or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Agent not found"))
    
    # 获取供应商配置
    provider = await db.get(LLMProvider, agent.provider_id)
    provider or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Provider not found"))
    
    provider_type = provider.provider_type.lower()
    handler = _BATCH_GENERATE_HANDLERS.get(provider_type)
    handler or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"Batch image generation not supported for provider: {provider_type}")
    )

    return await handler(agent, provider, request, db)


# ---------------------------------------------------------------------------
# 批量生成供应商处理器映射表（避免 if-else 分支）
# ---------------------------------------------------------------------------

async def _batch_generate_gemini(agent: Agent, provider: LLMProvider, request: BatchImageGenerateRequest) -> BatchImageGenerateResponse:
    """Gemini 批量图片生成处理器"""
    cfg = request.config or BatchImageConfigRequest()
    batch_config = BatchImageConfig(
        aspect_ratio=cfg.aspect_ratio,
        image_size=cfg.image_size,
        output_format=cfg.output_format,
        google_search_enabled=cfg.google_search_enabled,
        google_image_search_enabled=cfg.google_image_search_enabled,
    )

    # 处理模型名称（移除 "gemini/" 前缀）
    model = agent.model
    model.startswith("gemini/") and (model := model[7:])

    logger.info(f"Batch generate [gemini]: agent={agent.name}, model={model}, prompts={len(request.prompts)}")

    result = await batch_generate_images(
        api_key=provider.api_key,
        model=model,
        prompts=request.prompts,
        config=batch_config,
        max_concurrent=request.max_concurrent,
    )

    return BatchImageGenerateResponse(
        success=result.success,
        total_prompts=result.total_prompts,
        completed=result.completed,
        failed=result.failed,
        results=[
            SingleImageResultResponse(
                prompt_index=r.prompt_index,
                prompt=r.prompt,
                success=r.success,
                image_url=r.image_url,
                text_response=r.text_response,
                input_tokens=r.input_tokens,
                output_tokens=r.output_tokens,
                error=r.error,
            )
            for r in result.results
        ],
    )


async def _batch_generate_xai(agent: Agent, provider: LLMProvider, request: BatchImageGenerateRequest, db: AsyncSession) -> BatchImageGenerateResponse:
    """xAI 批量图片生成处理器"""
    # 从全局 ToolConfig 读取配置
    result = await db.execute(
        select(ToolConfig).where(ToolConfig.tool_name == "generate_image")
    )
    tool_config = result.scalar_one_or_none()
    global_cfg = (tool_config.config if tool_config else {})
    
    # 使用适配器转换为 xAI 配置
    xai_cfg = to_provider_config("xai", global_cfg).get("image_config") or {}

    xai_config = XAIBatchImageConfig(
        aspect_ratio=xai_cfg.get("aspect_ratio", "1:1"),
        resolution=xai_cfg.get("resolution", "1k"),
        n=1,  # 批量模式每个 prompt 生成 1 张，多 prompt 并行
        response_format=xai_cfg.get("response_format", "b64_json"),
    )

    # 处理模型名称（移除 "xai/" 前缀）
    model = agent.model
    model.startswith("xai/") and (model := model[4:])

    logger.info(f"Batch generate [xai]: agent={agent.name}, model={model}, prompts={len(request.prompts)}")

    result = await batch_generate_xai_images(
        api_key=provider.api_key,
        model=model,
        prompts=request.prompts,
        config=xai_config,
        base_url=provider.base_url,
        max_concurrent=request.max_concurrent,
    )

    # 将 xAI 结果展平为统一的响应格式
    return BatchImageGenerateResponse(
        success=result.success,
        total_prompts=result.total_prompts,
        completed=result.completed,
        failed=result.failed,
        results=[
            SingleImageResultResponse(
                prompt_index=r.prompt_index,
                prompt=r.prompt,
                success=r.success,
                image_url=r.image_urls[0] if r.image_urls else None,
                text_response=None,
                input_tokens=0,
                output_tokens=0,
                error=r.error,
            )
            for r in result.results
        ],
    )


_BATCH_GENERATE_HANDLERS = {
    "gemini": _batch_generate_gemini,
    "xai": _batch_generate_xai,
}
