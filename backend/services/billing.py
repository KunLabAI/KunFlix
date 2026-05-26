"""
多维度积分计费计算器 - 映射表驱动，避免 if 分支

架构说明（与 ModelPricing 模型配套）：
- 进价(USD) 仍由 LLMProvider.model_costs 承载。
- 卖价(积分) 由 ModelPricing(provider_id, model).dimensions 统一承载。
- 计费函数一律以 rate_map: Dict[str, float] 为入参，不再从 Agent 表读取费率。
"""
from typing import Dict, Tuple, Optional
from decimal import Decimal
from sqlalchemy import update, select
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio
import logging
from models import User, Admin, CreditTransaction, ModelPricing

logger = logging.getLogger(__name__)

# 计费维度映射表：dim_name -> scale
# scale=1_000_000 表示每 1M tokens 计费，scale=1 表示每次/张/秒计费
# 费率从 ModelPricing.dimensions[dim_name] 读取
BILLING_DIMENSIONS: Dict[str, int] = {
    "input":            1_000_000,
    "text_output":      1_000_000,
    "image_output":     1_000_000,
    "search":           1,
    "image_generation": 1,
}

# 视频计费维度映射表：dim_name -> scale
VIDEO_BILLING_DIMENSIONS: Dict[str, int] = {
    "video_input_image":  1,
    "video_input_second": 1,
    "video_output_480p":  1,
    "video_output_720p":  1,
}

# 视频质量 -> 输出计费维度映射
QUALITY_BILLING_FIELD: Dict[str, str] = {
    "480p": "video_output_480p",
    "720p": "video_output_720p",
}

# 音乐计费维度映射表
MUSIC_BILLING_DIMENSIONS: Dict[str, int] = {
    "audio_generation": 1,
}

# 进程级定价缓存：(provider_id, model) -> {dim_name: rate}
# 由 admin_pricing CRUD 调用 invalidate_pricing_cache 或 Redis Pub/Sub 失效事件清理
_PRICING_CACHE: Dict[Tuple[str, str], Dict[str, float]] = {}
_PRICING_CACHE_LOCK = asyncio.Lock()


class InsufficientCreditsError(Exception):
    """用户积分不足异常"""
    pass

class BalanceFrozenError(Exception):
    """用户资金已冻结异常"""
    pass


async def load_pricing(
    provider_id: Optional[str],
    model: Optional[str],
    session: AsyncSession,
) -> Dict[str, float]:
    """读取 (provider, model) 的卖价字典；未配置返回空 dict（视为免费）。

    进程级缓存命中后不查表；is_active=False 也返回空 dict。
    """
    if not provider_id or not model:
        return {}

    cache_key = (provider_id, model)
    cached = _PRICING_CACHE.get(cache_key)
    if cached is not None:
        return cached

    async with _PRICING_CACHE_LOCK:
        # double-checked locking
        cached = _PRICING_CACHE.get(cache_key)
        if cached is not None:
            return cached

        stmt = select(ModelPricing.dimensions, ModelPricing.is_active).where(
            ModelPricing.provider_id == provider_id,
            ModelPricing.model == model,
        )
        row = (await session.execute(stmt)).first()
        rate_map: Dict[str, float] = {}
        if row and row.is_active and isinstance(row.dimensions, dict):
            rate_map = {k: float(v or 0) for k, v in row.dimensions.items()}
        _PRICING_CACHE[cache_key] = rate_map
        return rate_map


def invalidate_pricing_cache(provider_id: Optional[str] = None, model: Optional[str] = None) -> None:
    """清理进程级定价缓存。

    - 不传参数：清空所有。
    - 只传 provider_id：清除该供应商下所有条目。
    - 传 (provider_id, model)：只清除单条。
    """
    drop_all = provider_id is None and model is None
    drop_all and _PRICING_CACHE.clear()
    if drop_all:
        return
    if model is None:
        for k in [k for k in _PRICING_CACHE if k[0] == provider_id]:
            _PRICING_CACHE.pop(k, None)
        return
    _PRICING_CACHE.pop((provider_id, model), None)


def is_paid_model(rate_map: Dict[str, float]) -> bool:
    """映射表驱动判定是否为付费模型（任一维度费率 > 0）。"""
    return any((v or 0) > 0 for v in rate_map.values())


def is_paid_agent(agent, rate_map: Optional[Dict[str, float]] = None) -> bool:
    """向后兼容别名：供遗留调用点使用。优先使用 is_paid_model(rate_map)。

    rate_map 不为 None 时以它为准；agent 仅用于诊断/日志。
    没有传 rate_map 的调用在无 session 路径上无法查表，保守返回 False。
    """
    if rate_map is not None:
        return is_paid_model(rate_map)
    return False


async def require_positive_balance(user_id: str, session: AsyncSession, min_credits: float = 0.0001) -> None:
    """严格余额检查：用户/管理员 credits <= min_credits 或账户冻结 → 抛异常。

    用于付费 API 的前置拦截，修复 `check_balance_sufficient(uid, 0, db)` 返回 True 的漏洞。
    min_credits 默认 0.0001，略大于 0 以规避浮点正零边界问题。

    Raises:
        InsufficientCreditsError: 余额 <= min_credits
        BalanceFrozenError: 账户被冻结
    """
    # 1. User 路径
    stmt = select(User.credits, User.is_balance_frozen).where(User.id == user_id)
    row = (await session.execute(stmt)).first()
    if row:
        if row.is_balance_frozen:
            raise BalanceFrozenError(f"User {user_id} balance is frozen")
        if float(row.credits or 0) <= min_credits:
            raise InsufficientCreditsError("Insufficient credits. Please recharge to continue.")
        return

    # 2. Admin 路径（无冻结字段）
    stmt_admin = select(Admin.credits).where(Admin.id == user_id)
    row_admin = (await session.execute(stmt_admin)).first()
    if row_admin is None:
        # 身份未知 → 不需要在这里报错，由上层鉴权拦截
        return
    if float(row_admin.credits or 0) <= min_credits:
        raise InsufficientCreditsError("Insufficient credits. Please recharge to continue.")


async def check_balance_sufficient(user_id: str, estimated_cost: float, session: AsyncSession) -> bool:
    """
    检查用户余额是否足够支付预估费用，并检查是否冻结。
    同时支持 User 和 Admin 双路查询（映射表驱动）。
    
    Args:
        user_id: 用户ID
        estimated_cost: 预估费用
        session: 数据库会话
        
    Returns:
        bool: 是否足够
        
    Raises:
        BalanceFrozenError: 如果账户被冻结
    """
    # 1. 尝试查询用户
    stmt = select(User.credits, User.is_balance_frozen).where(User.id == user_id)
    result = await session.execute(stmt)
    row = result.first()
    
    if row:
        if row.is_balance_frozen:
            raise BalanceFrozenError(f"User {user_id} balance is frozen")
        return float(row.credits or 0) >= estimated_cost

    # 2. 尝试查询管理员（Admin 无冻结状态）
    stmt_admin = select(Admin.credits).where(Admin.id == user_id)
    result_admin = await session.execute(stmt_admin)
    row_admin = result_admin.first()
    
    return float(row_admin.credits or 0) >= estimated_cost if row_admin else False

async def _check_idempotency(session: AsyncSession, key: str) -> Optional[CreditTransaction]:
    """幂等性检查：查找已有相同 idempotency_key 的交易记录"""
    stmt = select(CreditTransaction).where(CreditTransaction.idempotency_key == key)
    result = await session.execute(stmt)
    return result.scalars().first()


async def record_credit_grant(
    user_id: str,
    amount: float,
    session: AsyncSession,
    balance_after: float,
    metadata: Dict = None,
    description: str = "Credit grant",
    idempotency_key: str = None,
    transaction_type: str = "recharge",
) -> Optional[CreditTransaction]:
    """写入积分发放/增加的审计记录，不修改余额（余额已由调用方直接设置）。

    用于注册赠送 / 月度重置等场景：调用方已在 User.credits 上直接赋值，
    此函数仅负责落地一条 CreditTransaction 作为审计轨迹。

    Args:
        amount: 变动金额（正=增加，负=扣除；为 0 返回 None）
        balance_after: 变动后余额
        transaction_type: recharge | monthly_reset | admin_adjust 等
    """
    if amount == 0:
        return None

    if idempotency_key:
        existing = await _check_idempotency(session, idempotency_key)
        if existing:
            logger.info(f"Idempotent grant hit: key={idempotency_key}")
            return existing

    transaction = CreditTransaction(
        user_id=user_id,
        amount=float(amount),
        balance_before=float(balance_after) - float(amount),
        balance_after=float(balance_after),
        transaction_type=transaction_type,
        metadata_json=metadata or {},
        description=description,
        idempotency_key=idempotency_key,
    )
    session.add(transaction)
    return transaction


async def refund_credits_atomic(
    user_id: str,
    amount: float,
    session: AsyncSession,
    metadata: Dict = None,
    description: str = "Refund",
    idempotency_key: str = None,
) -> Optional[CreditTransaction]:
    """
    原子退还用户积分。
    
    Args:
        user_id: 用户ID
        amount: 退还金额 (必须 >= 0)
        session: 数据库会话
        metadata: 交易元数据
        description: 描述
        idempotency_key: 幂等键（防重复退款）
        
    Returns:
        CreditTransaction: 交易记录，amount<=0 时返回 None
    """
    if amount < 0:
        raise ValueError("Refund amount cannot be negative")
    
    if amount == 0:
        return None

    # 幂等性检查
    if idempotency_key:
        existing = await _check_idempotency(session, idempotency_key)
        if existing:
            logger.info(f"Idempotent refund hit: key={idempotency_key}")
            return existing

    amount_val = Decimal(str(amount))
    
    # 1. 先获取当前余额作为 balance_before (精度改进)
    balance_before_user = await session.execute(select(User.credits).where(User.id == user_id))
    user_balance_row = balance_before_user.scalar()
    
    # 2. 原子增加余额 (User)
    stmt = (
        update(User)
        .where(User.id == user_id)
        .values(credits=User.credits + amount_val)
        .execution_options(synchronize_session="fetch")
    )
    
    result = await session.execute(stmt)
    
    if result.rowcount == 0:
        # 尝试增加 Admin 余额
        balance_before_admin = await session.execute(select(Admin.credits).where(Admin.id == user_id))
        admin_balance_row = balance_before_admin.scalar()
        
        stmt_admin = (
            update(Admin)
            .where(Admin.id == user_id)
            .values(credits=Admin.credits + amount_val)
            .execution_options(synchronize_session="fetch")
        )
        result_admin = await session.execute(stmt_admin)
        
        if result_admin.rowcount == 0:
            raise ValueError(f"User/Admin {user_id} not found")
        
        balance_before = float(admin_balance_row or 0)
        transaction = CreditTransaction(
            admin_id=user_id,
            amount=float(amount_val),
            balance_before=balance_before,
            balance_after=balance_before + float(amount_val),
            transaction_type="refund",
            metadata_json=metadata or {},
            description=description,
            idempotency_key=idempotency_key,
        )
        session.add(transaction)
        return transaction
    
    # User 路径
    balance_before = float(user_balance_row or 0)
    
    transaction = CreditTransaction(
        user_id=user_id,
        amount=float(amount_val),
        balance_before=balance_before,
        balance_after=balance_before + float(amount_val),
        transaction_type="refund",
        metadata_json=metadata or {},
        description=description,
        idempotency_key=idempotency_key,
    )
    session.add(transaction)
    
    return transaction

async def _drain_balance_to_zero(
    session: AsyncSession,
    entity_model,
    entity_id: str,
    current_balance: Decimal,
    attempted_cost: Decimal,
    metadata: Optional[Dict],
    transaction_type: str,
    idempotency_key: Optional[str],
    is_admin: bool,
) -> None:
    """生成已发生但余额不足时，把余额清零并落 underpaid 流水。

    使用 WHERE credits > 0 AND credits < attempted_cost 作为守卫条件：
    - credits > 0：防止重复清零（并发安全）
    - credits < attempted_cost：仅在余额确实不足时清零，若并发充值使余额 >= cost 则跳过

    注意：不使用 credits == current_balance 精确相等比较，因为 SQLite 以 REAL（float64）
    存储 Numeric 列，浮点精度差异会导致 WHERE 条件不匹配而静默跳过清零。
    """
    if current_balance <= 0:
        return
    stmt_clear = (
        update(entity_model)
        .where(entity_model.id == entity_id)
        .where(entity_model.credits > 0)
        .where(entity_model.credits < attempted_cost)
        .values(credits=0)
        .execution_options(synchronize_session="fetch")
    )
    res = await session.execute(stmt_clear)
    if res.rowcount <= 0:
        return  # 并发竞争：余额已被其他请求处理，或充值后余额已足够
    tx_meta = dict(metadata or {})
    tx_meta.update({
        "underpaid": True,
        "attempted_cost": float(attempted_cost),
    })
    transaction = CreditTransaction(
        user_id=None if is_admin else entity_id,
        admin_id=entity_id if is_admin else None,
        amount=-float(current_balance),
        balance_before=float(current_balance),
        balance_after=0,
        transaction_type=transaction_type,
        metadata_json=tx_meta,
        idempotency_key=idempotency_key,
    )
    session.add(transaction)


async def deduct_credits_atomic(
    user_id: str, 
    cost: float, 
    session: AsyncSession, 
    metadata: Dict = None,
    transaction_type: str = "consumption",
    idempotency_key: str = None,
) -> Optional[CreditTransaction]:
    """
    原子扣除用户积分。
    使用 UPDATE ... WHERE ... 语句确保并发安全。
    
    Args:
        user_id: 用户ID
        cost: 扣除金额 (必须 >= 0)
        session: 数据库会话
        metadata: 交易元数据
        transaction_type: 交易类型
        idempotency_key: 幂等键（防重复扣费）
        
    Returns:
        CreditTransaction: 创建的交易记录，cost<=0 时返回 None
        
    Raises:
        InsufficientCreditsError: 余额不足
        BalanceFrozenError: 账户冻结
        ValueError: 扣除金额无效
    """
    if cost < 0:
        raise ValueError("Cost cannot be negative")
        
    if cost == 0:
        return None

    # 幂等性检查
    if idempotency_key:
        existing = await _check_idempotency(session, idempotency_key)
        if existing:
            logger.info(f"Idempotent deduction hit: key={idempotency_key}")
            return existing

    cost_val = Decimal(str(cost))
    
    # 1. 先获取当前余额作为 balance_before (精度改进)
    balance_before_stmt = select(User.credits).where(User.id == user_id)
    balance_before_result = await session.execute(balance_before_stmt)
    user_balance_row = balance_before_result.scalar()
    
    # 2. 原子更新余额（User）
    stmt = (
        update(User)
        .where(User.id == user_id)
        .where(User.credits >= cost_val)
        .where(User.is_balance_frozen == False)
        .values(credits=User.credits - cost_val)
        .execution_options(synchronize_session="fetch")
    )
    
    result = await session.execute(stmt)
    
    if result.rowcount > 0:
        # User 扣费成功
        balance_before = float(user_balance_row or 0)
        cost_f = float(cost_val)
        transaction = CreditTransaction(
            user_id=user_id,
            amount=-cost_f,
            balance_before=balance_before,
            balance_after=balance_before - cost_f,
            transaction_type=transaction_type,
            metadata_json=metadata or {},
            idempotency_key=idempotency_key,
        )
        session.add(transaction)
        return transaction
    
    # 3. User 更新失败，尝试 Admin
    balance_before_admin_stmt = select(Admin.credits).where(Admin.id == user_id)
    balance_before_admin_result = await session.execute(balance_before_admin_stmt)
    admin_balance_row = balance_before_admin_result.scalar()
    
    stmt_admin = (
        update(Admin)
        .where(Admin.id == user_id)
        .where(Admin.credits >= cost_val)
        .values(credits=Admin.credits - cost_val)
        .execution_options(synchronize_session="fetch")
    )
    result_admin = await session.execute(stmt_admin)
    
    if result_admin.rowcount > 0:
        balance_before = float(admin_balance_row or 0)
        cost_f = float(cost_val)
        transaction = CreditTransaction(
            admin_id=user_id,
            amount=-cost_f,
            balance_before=balance_before,
            balance_after=balance_before - cost_f,
            transaction_type=transaction_type,
            metadata_json=metadata or {},
            idempotency_key=idempotency_key,
        )
        session.add(transaction)
        return transaction

    # 4. 双路更新均失败，诊断原因
    stmt_check = select(User.credits, User.is_balance_frozen).where(User.id == user_id)
    res_check = await session.execute(stmt_check)
    row = res_check.first()
    
    if row:
        if row.is_balance_frozen:
            raise BalanceFrozenError(f"User {user_id} balance is frozen")
        current_balance_user = float(row.credits or 0)
        if current_balance_user < float(cost_val):
            # 兜底：扣到 0，避免生成已发生但用户余额未变的白嫖漏洞
            await _drain_balance_to_zero(
                session=session,
                entity_model=User,
                entity_id=user_id,
                current_balance=Decimal(str(row.credits or 0)),
                attempted_cost=cost_val,
                metadata=metadata,
                transaction_type=transaction_type,
                idempotency_key=idempotency_key,
                is_admin=False,
            )
            logger.warning(
                f"Insufficient credits for user {user_id}. Cost: {cost}, drained {current_balance_user}"
            )
            raise InsufficientCreditsError(f"Insufficient credits. Required: {cost}")
    
    stmt_check_admin = select(Admin.credits).where(Admin.id == user_id)
    res_check_admin = await session.execute(stmt_check_admin)
    row_admin = res_check_admin.scalar()
    
    if row_admin is not None and float(row_admin or 0) < float(cost_val):
        current_balance_admin = float(row_admin or 0)
        # 兜底：扣到 0，避免生成已发生但管理员余额未变的白嫖漏洞
        await _drain_balance_to_zero(
            session=session,
            entity_model=Admin,
            entity_id=user_id,
            current_balance=Decimal(str(row_admin or 0)),
            attempted_cost=cost_val,
            metadata=metadata,
            transaction_type=transaction_type,
            idempotency_key=idempotency_key,
            is_admin=True,
        )
        logger.warning(
            f"Insufficient credits for admin {user_id}. Cost: {cost}, drained {current_balance_admin}"
        )
        raise InsufficientCreditsError(f"Insufficient credits. Required: {cost}")
    
    if not row and row_admin is None:
        raise ValueError(f"User/Admin {user_id} not found")
        
    raise Exception("Failed to deduct credits (unknown reason)")

def calculate_credit_cost(result, rate_map: Dict[str, float], agent=None) -> Tuple[float, Dict]:
    """
    计算总积分费用和明细（映射表驱动）。

    兼容 StreamResult 和 ExecutionResult：
    - 有 text_output_tokens 时按模态拆分计费
    - 无 text_output_tokens 时将全部 output_tokens 视为文本输出（向后兼容）

    Args:
        result:   StreamResult 或 ExecutionResult 对象，包含 token 统计
        rate_map: ModelPricing.dimensions 字典 (dim_name -> rate)。
        agent:    仅用于填充 metadata（名称/模型），不参与费率计算。

    Returns:
        (total_cost, metadata_dict)
    """
    # 解析模态 token（兼容无模态拆分的情况）
    image_out = getattr(result, 'image_output_tokens', 0) or 0
    text_out = getattr(result, 'text_output_tokens', 0) or (
        (getattr(result, 'output_tokens', 0) or 0) - image_out
    )

    quantities = {
        "input":            getattr(result, 'input_tokens', 0) or 0,
        "text_output":      text_out,
        "image_output":     image_out,
        "search":           getattr(result, 'search_query_count', 0) or 0,
        "image_generation": getattr(result, 'generated_image_count', 0) or 0,
    }

    total = 0.0
    metadata = {"agent_name": getattr(agent, 'name', ''), "model": getattr(agent, 'model', '')}

    for dim_name, scale in BILLING_DIMENSIONS.items():
        quantity = quantities[dim_name]
        rate = rate_map.get(dim_name, 0) or 0
        cost = quantity / scale * rate
        total += cost
        metadata[f"{dim_name}_tokens"] = quantity
        metadata[f"{dim_name}_rate"] = rate

    return total, metadata


def calculate_video_credit_cost(task, rate_map: Dict) -> Tuple[float, Dict]:
    """
    视频任务积分计费（映射表驱动）。

    Args:
        task:     VideoTask 对象，包含 input_image_count, output_duration_seconds, quality
        rate_map: ModelPricing.dimensions 字典（从 load_pricing 打包读取），dim_name -> credits-per-unit

    Returns:
        (total_cost, metadata_dict)
    """
    output_dim = QUALITY_BILLING_FIELD.get(task.quality, "video_output_720p")

    quantities = {
        "video_input_image":  getattr(task, 'input_image_count', 0) or 0,
        "video_input_second": 0,  # edit 模式才有输入视频时长
        "video_output_480p":  task.output_duration_seconds if output_dim == "video_output_480p" else 0,
        "video_output_720p":  task.output_duration_seconds if output_dim == "video_output_720p" else 0,
    }

    total = 0.0
    metadata = {
        "video_mode": getattr(task, 'video_mode', ''),
        "quality": getattr(task, 'quality', ''),
    }

    for dim_name, scale in VIDEO_BILLING_DIMENSIONS.items():
        quantity = quantities[dim_name]
        rate = rate_map.get(dim_name, 0) or 0
        cost = quantity / scale * rate
        total += cost
        metadata[f"{dim_name}_quantity"] = quantity
        metadata[f"{dim_name}_rate"] = rate

    return total, metadata


def calculate_music_credit_cost(task, rate_map: Dict) -> Tuple[float, Dict]:
    """
    音乐任务积分计费（映射表驱动，按次计费）。

    Args:
        task:     MusicTask 对象
        rate_map: ModelPricing.dimensions 字典（从 load_pricing 打包读取），dim_name -> credits-per-unit

    Returns:
        (total_cost, metadata_dict)
    """
    quantities = {
        "audio_generation": 1,  # 每次生成计 1 次
    }

    total = 0.0
    metadata = {
        "model": getattr(task, 'model', ''),
        "output_format": getattr(task, 'output_format', ''),
    }

    for dim_name, scale in MUSIC_BILLING_DIMENSIONS.items():
        quantity = quantities[dim_name]
        rate = rate_map.get(dim_name, 0) or 0
        cost = quantity / scale * rate
        total += cost
        metadata[f"{dim_name}_quantity"] = quantity
        metadata[f"{dim_name}_rate"] = rate

    return total, metadata
