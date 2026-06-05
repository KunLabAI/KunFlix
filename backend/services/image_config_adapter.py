"""
Unified image config → provider-specific config adapter.

Uses mapping tables to convert provider-agnostic image settings
into Gemini / xAI specific formats (no if-else chains).
"""
from typing import Any

# ---------------------------------------------------------------------------
# Quality → provider-specific resolution / image_size
# ---------------------------------------------------------------------------
_QUALITY_MAP: dict[str, dict[str, str]] = {
    # Gemini 官方 API 标准字面量为 1K/2K/4K，与 batch_image_gen.IMAGE_SIZE_MAP 一致
    "gemini": {"standard": "1K",   "hd": "2K", "ultra": "4K"},
    "xai":    {"standard": "1k",   "hd": "2k", "ultra": "2k"},
    "ark":    {"standard": "2K",   "hd": "3K", "ultra": "4K"},
}

# ---------------------------------------------------------------------------
# Batch count: field name + max per provider
# ---------------------------------------------------------------------------
_BATCH_MAP: dict[str, dict[str, Any]] = {
    "gemini":     {"field": "batch_count", "max": 4},
    "xai":        {"field": "n",           "max": 4},
    "ark":        {"field": "n",           "max": 4},
    "openrouter": {"field": "n",           "max": 4},
}

# ---------------------------------------------------------------------------
# Supported modes per provider (text_to_image / edit / reference_images)
# ---------------------------------------------------------------------------
_SUPPORTED_MODES: dict[str, list[str]] = {
    "gemini":     ["text_to_image", "edit", "reference_images"],
    "xai":        ["text_to_image", "edit", "reference_images"],
    "ark":        ["text_to_image", "edit", "reference_images", "sequential"],
    "openrouter": ["text_to_image", "edit", "reference_images"],
}

# ---------------------------------------------------------------------------
# Provider-supported aspect ratios (for validation / fallback)
# ---------------------------------------------------------------------------
_ASPECT_RATIO_SUPPORTED: dict[str, set[str]] = {
    # Gemini 3.x Image Preview 官方 14 个比例 + auto（gemini-2.5-flash-image 在模型粒度收窄）
    "gemini":     {"auto", "1:1", "1:4", "1:8", "2:3", "3:2", "3:4",
                   "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"},
    "xai":        {"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3",
                   "2:1", "1:2", "19.5:9", "9:19.5", "20:9", "9:20", "auto"},
    "ark":        {"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "auto"},
    # OpenRouter 下面模型诡异很大，取官方文档通用集合（模型不支持时凭 prompt 提示软限制）
    "openrouter": {"auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9"},
}

_ASPECT_RATIO_DEFAULT: dict[str, str] = {
    "gemini":     "auto",
    "xai":        "1:1",
    "ark":        "1:1",
    "openrouter": "1:1",
}

# ---------------------------------------------------------------------------
# Output format mapping
# ---------------------------------------------------------------------------
_OUTPUT_FORMAT_SUPPORTED: dict[str, set[str]] = {
    "gemini":     {"png", "jpeg", "webp"},
    "xai":        set(),  # xAI 不支持用户指定输出格式
    "ark":        {"png", "jpeg"},  # Seedream 5.0 支持 png/jpeg；4.5/4.0 仅 jpeg
    "openrouter": set(),  # OpenRouter 不支持 output_format 透传
}



# ---------------------------------------------------------------------------
# Provider capabilities (consumed by admin API + tool definition builder)
# ---------------------------------------------------------------------------
IMAGE_PROVIDER_CAPABILITIES: dict[str, dict] = {
    "gemini": {
        "aspect_ratios": sorted(_ASPECT_RATIO_SUPPORTED["gemini"]),
        "qualities": ["standard", "hd", "ultra"],
        "output_formats": sorted(_OUTPUT_FORMAT_SUPPORTED["gemini"]),
        "batch_count": {"min": 1, "max": _BATCH_MAP["gemini"]["max"]},
        "supported_modes": _SUPPORTED_MODES["gemini"],
    },
    "xai": {
        "aspect_ratios": sorted(_ASPECT_RATIO_SUPPORTED["xai"]),
        "qualities": ["standard", "hd"],
        "output_formats": [],
        "batch_count": {"min": 1, "max": _BATCH_MAP["xai"]["max"]},
        "supported_modes": _SUPPORTED_MODES["xai"],
    },
    "ark": {
        "aspect_ratios": sorted(_ASPECT_RATIO_SUPPORTED["ark"]),
        "qualities": ["standard", "hd", "ultra"],
        "output_formats": sorted(_OUTPUT_FORMAT_SUPPORTED["ark"]),
        "batch_count": {"min": 1, "max": 15},  # 组图模式参考图+输出 <= 15
        "supported_modes": _SUPPORTED_MODES["ark"],
    },
    "openrouter": {
        "aspect_ratios": sorted(_ASPECT_RATIO_SUPPORTED["openrouter"]),
        # quality 映射为 OpenRouter image_config.image_size（standard→1K, hd→2K, ultra→4K）
        "qualities": ["standard", "hd", "ultra"],
        "output_formats": [],  # OpenRouter 不支持 output_format 透传
        "batch_count": {"min": 1, "max": _BATCH_MAP["openrouter"]["max"]},
        "supported_modes": _SUPPORTED_MODES["openrouter"],
        # OpenRouter 不代理 /images/generations 或 /images/edits，以下能力不可用
        "backgrounds": [],
        "moderations": [],
        "supports_mask": False,
        "supports_output_compression": False,
    },
}


# ---------------------------------------------------------------------------
# Model-level capabilities (per Gemini image model)
#
# Gemini 3 系列模型差异：
#   - gemini-3.1-flash-image-preview：512 / 1K / 2K / 4K，全部 14 个 aspect ratio
#   - gemini-3-pro-image-preview：    1K / 2K / 4K，全部 14 个 aspect ratio
#   - gemini-2.5-flash-image：        仅 1K，常用 aspect ratio 子集（不含 1:4/4:1/1:8/8:1）
#
# 路由 GET /api/images/model-capabilities/{provider}/{model} 在 provider 级能力上叠加返回。
# ---------------------------------------------------------------------------
_GEMINI_FULL_ASPECT_RATIOS: list[str] = sorted(_ASPECT_RATIO_SUPPORTED["gemini"])
_GEMINI3_IMAGE_SIZES_FLASH: list[str] = ["512", "1K", "2K", "4K"]
_GEMINI3_IMAGE_SIZES_PRO:   list[str] = ["1K", "2K", "4K"]
_GEMINI25_IMAGE_SIZES:      list[str] = ["1K"]
_GEMINI25_ASPECT_RATIOS:    list[str] = sorted(
    {"auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9"}
)

# ---------------------------------------------------------------------------
# Seedream 模型粒度能力差异：
#   - doubao-seedream-5-0-260128 / lite：2K / 3K / 4K，输出 png/jpeg，最多 14 张参考图
#   - doubao-seedream-4-5-251128：      2K / 4K，输出 jpeg，最多 14 张参考图
#   - doubao-seedream-4-0-250828：      1K / 2K / 4K，输出 jpeg，最多 14 张参考图
# ---------------------------------------------------------------------------
_SEEDREAM_50_SIZES:  list[str] = ["2K", "3K", "4K"]
_SEEDREAM_45_SIZES:  list[str] = ["2K", "4K"]
_SEEDREAM_40_SIZES:  list[str] = ["2K", "4K"]

# ---------------------------------------------------------------------------
# Seedream aspect_ratio + 分辨率等级 → 精确像素尺寸映射表（来自官方文档）
# 格式：_SEEDREAM_PIXEL_MAP[resolution_level][aspect_ratio] = "WxH"
# ---------------------------------------------------------------------------
_SEEDREAM_PIXEL_MAP: dict[str, dict[str, str]] = {
    "1K": {
        "1:1": "1024x1024", "3:4": "864x1152", "4:3": "1152x864",
        "16:9": "1312x736", "9:16": "736x1312", "2:3": "832x1248",
        "3:2": "1248x832", "21:9": "1568x672",
    },
    "2K": {
        "1:1": "2048x2048", "3:4": "1728x2304", "4:3": "2304x1728",
        "16:9": "2848x1600", "9:16": "1600x2848", "2:3": "1664x2496",
        "3:2": "2496x1664", "21:9": "3136x1344",
    },
    "3K": {
        "1:1": "3072x3072", "3:4": "2592x3456", "4:3": "3456x2592",
        "16:9": "4096x2304", "9:16": "2304x4096", "2:3": "2496x3744",
        "3:2": "3744x2496", "21:9": "4704x2016",
    },
    "4K": {
        "1:1": "4096x4096", "3:4": "3520x4704", "4:3": "4704x3520",
        "16:9": "5504x3040", "9:16": "3040x5504", "2:3": "3328x4992",
        "3:2": "4992x3328", "21:9": "6240x2656",
    },
}


def resolve_ark_pixel_size(quality: str, aspect_ratio: str | None = None) -> str:
    """将 quality 等级 + aspect_ratio 映射为 Seedream API 的 size 参数。

    规则：
      - 有有效 aspect_ratio → 使用精确像素值（如 "2848x1600"）
      - aspect_ratio 为 auto/None/未知 → 直接传递分辨率等级（如 "2K"），由模型自主判断宽高
    """
    level = quality.upper().replace("K", "K") if quality else "2K"
    # 保证 level 在合法范围内
    level = level if level in _SEEDREAM_PIXEL_MAP else "2K"

    # auto 或空：让模型自主决定宽高比
    ar = (aspect_ratio or "").strip()
    pixel_map = _SEEDREAM_PIXEL_MAP.get(level, {})
    return pixel_map.get(ar, level)

IMAGE_MODEL_CAPABILITIES: dict[str, dict] = {
    # Gemini 系列
    "gemini-3.1-flash-image-preview": {
        "aspect_ratios":         _GEMINI_FULL_ASPECT_RATIOS,
        "image_sizes":           _GEMINI3_IMAGE_SIZES_FLASH,
        "max_reference_images":  14,
        "supports_thinking":     True,
    },
    "gemini-3-pro-image-preview": {
        "aspect_ratios":         _GEMINI_FULL_ASPECT_RATIOS,
        "image_sizes":           _GEMINI3_IMAGE_SIZES_PRO,
        "max_reference_images":  14,
        "supports_thinking":     True,
    },
    "gemini-2.5-flash-image": {
        "aspect_ratios":         _GEMINI25_ASPECT_RATIOS,
        "image_sizes":           _GEMINI25_IMAGE_SIZES,
        "max_reference_images":  3,
        "supports_thinking":     False,
    },
    # Seedream 系列
    "doubao-seedream-5-0-260128": {
        "image_sizes":           _SEEDREAM_50_SIZES,
        "output_formats":        ["png", "jpeg"],
        "max_reference_images":  14,
        "supports_sequential":   True,
        "max_sequential_images": 15,
        "supports_web_search":   True,
    },
    "doubao-seedream-5-0-lite-260128": {
        "image_sizes":           _SEEDREAM_50_SIZES,
        "output_formats":        ["png", "jpeg"],
        "max_reference_images":  14,
        "supports_sequential":   True,
        "max_sequential_images": 15,
        "supports_web_search":   True,
    },
    "doubao-seedream-4-5-251128": {
        "image_sizes":           _SEEDREAM_45_SIZES,
        "output_formats":        ["jpeg"],
        "max_reference_images":  14,
        "supports_sequential":   True,
        "max_sequential_images": 15,
    },
    "doubao-seedream-4-0-250828": {
        "image_sizes":           _SEEDREAM_40_SIZES,
        "output_formats":        ["jpeg"],
        "max_reference_images":  14,
        "supports_sequential":   True,
        "max_sequential_images": 15,
    },
}


# ---------------------------------------------------------------------------
# Per-provider adapters
# ---------------------------------------------------------------------------
def _adapt_to_gemini(unified: dict) -> dict:
    """Convert unified image_config → gemini_config partial (image fields only)."""
    cfg = unified.get("image_config") or {}
    result: dict[str, Any] = {
        "image_generation_enabled": unified.get("image_generation_enabled", False),
    }
    img: dict[str, Any] = {}

    # aspect_ratio
    ar = cfg.get("aspect_ratio")
    ar and ar in _ASPECT_RATIO_SUPPORTED["gemini"] and img.update(aspect_ratio=ar)

    # quality → image_size
    q = cfg.get("quality")
    q and img.update(image_size=_QUALITY_MAP["gemini"].get(q, "2K"))

    # batch_count
    bc = cfg.get("batch_count")
    bc and img.update(batch_count=min(bc, _BATCH_MAP["gemini"]["max"]))

    # output_format
    fmt = cfg.get("output_format")
    fmt and fmt in _OUTPUT_FORMAT_SUPPORTED["gemini"] and img.update(output_format=fmt)

    img and result.update(image_config=img)
    return result


def _adapt_to_xai(unified: dict) -> dict:
    """Convert unified image_config → xai_image_config format."""
    cfg = unified.get("image_config") or {}
    result: dict[str, Any] = {
        "image_generation_enabled": unified.get("image_generation_enabled", False),
    }
    img: dict[str, Any] = {}

    # aspect_ratio
    ar = cfg.get("aspect_ratio")
    ar and ar in _ASPECT_RATIO_SUPPORTED["xai"] and img.update(aspect_ratio=ar)

    # quality → resolution
    q = cfg.get("quality")
    q and img.update(resolution=_QUALITY_MAP["xai"].get(q, "1k"))

    # batch_count → n
    bc = cfg.get("batch_count")
    bc and img.update(n=min(bc, _BATCH_MAP["xai"]["max"]))

    # xAI 默认使用 b64_json（本地存储）
    img.update(response_format="b64_json")

    img and result.update(image_config=img)
    return result


def _adapt_to_ark(unified: dict) -> dict:
    """Convert unified image_config → ark Seedream image config format."""
    cfg = unified.get("image_config") or {}
    result: dict[str, Any] = {
        "image_generation_enabled": unified.get("image_generation_enabled", False),
    }
    img: dict[str, Any] = {}

    # aspect_ratio
    ar = cfg.get("aspect_ratio")
    ar and ar in _ASPECT_RATIO_SUPPORTED["ark"] and img.update(aspect_ratio=ar)

    # quality → size
    q = cfg.get("quality")
    q and img.update(size=_QUALITY_MAP["ark"].get(q, "2K"))

    # batch_count → n
    bc = cfg.get("batch_count")
    bc and img.update(n=min(bc, _BATCH_MAP["ark"]["max"]))

    # output_format（Seedream 5.0 支持 png/jpeg）
    fmt = cfg.get("output_format")
    fmt and fmt in _OUTPUT_FORMAT_SUPPORTED["ark"] and img.update(output_format=fmt)

    # web_search（仅 Seedream 5.0 支持联网搜索）
    cfg.get("web_search") and img.update(web_search=True)

    # Seedream 默认使用 url 格式
    img.update(response_format="url")

    img and result.update(image_config=img)
    return result


# ---------------------------------------------------------------------------
# Adapter registry (mapping table)
# ---------------------------------------------------------------------------
def _adapt_to_openrouter(unified: dict) -> dict:
    """OpenRouter 适配：透传 aspect_ratio / quality / batch_count。

    OpenRouter 统一走 chat/completions + image_config，仅支持 aspect_ratio 和 image_size。
    output_format/output_compression/background/moderation 不生效，不再透传。
    """
    cfg = unified.get("image_config") or {}
    result: dict[str, Any] = {
        "image_generation_enabled": unified.get("image_generation_enabled", False),
    }
    img: dict[str, Any] = {}

    ar = cfg.get("aspect_ratio")
    ar and ar in _ASPECT_RATIO_SUPPORTED["openrouter"] and img.update(aspect_ratio=ar)

    q = cfg.get("quality")
    q and img.update(quality=q)

    bc = cfg.get("batch_count")
    bc and img.update(n=min(bc, _BATCH_MAP["openrouter"]["max"]))

    img and result.update(image_config=img)
    return result


_ADAPTERS: dict[str, callable] = {
    "gemini":     _adapt_to_gemini,
    "xai":        _adapt_to_xai,
    "ark":        _adapt_to_ark,
    "openrouter": _adapt_to_openrouter,
}


def to_provider_config(provider_type: str, unified_config: dict) -> dict:
    """Convert unified image config to provider-specific config.

    Args:
        provider_type: Provider type string (e.g. "gemini", "xai")
        unified_config: Unified image generation config dict

    Returns:
        Provider-specific config dict, or empty dict if no adapter found.
    """
    adapter = _ADAPTERS.get(provider_type.lower())
    return adapter(unified_config) if adapter else {}


def resolve_image_configs(
    agent,
    provider_type: str,
) -> tuple[dict | None, dict | None]:
    """Resolve effective gemini_config and xai_image_config for stream_completion.

    Priority: agent.image_config (unified) > legacy per-provider configs.

    Returns:
        (effective_gemini_config, effective_xai_image_config)
    """
    unified = agent.image_config or {}
    has_unified = unified.get("image_generation_enabled", False)

    # 统一配置存在且启用 → 通过适配器转换
    provider_lower = provider_type.lower()
    _CONFIG_KEY_MAP = {
        "gemini": lambda u: (_merge_gemini(agent.gemini_config, u, agent.thinking_mode), agent.xai_image_config),
        "xai":    lambda u: (agent.gemini_config, u),
    }
    _fallback = lambda u: (agent.gemini_config, agent.xai_image_config)

    adapted = to_provider_config(provider_lower, unified) if has_unified else {}
    resolver = _CONFIG_KEY_MAP.get(provider_lower, _fallback)
    
    # 当没有启用统一图像配置时，仍然需要处理 thinking_mode 到 thinking_level 的映射
    if not has_unified and provider_lower == "gemini":
        return (_merge_gemini(agent.gemini_config, {}, agent.thinking_mode), agent.xai_image_config)
    
    return resolver(adapted) if has_unified else (agent.gemini_config, agent.xai_image_config)


def resolve_global_image_configs(
    global_config: dict,
    agent,
    provider_type: str,
) -> tuple[dict | None, dict | None]:
    """使用全局 ToolConfig 解析有效的图像配置。

    注意：全局配置仅用于图像生成工具，不应强制开启智能体的原生图片生成模式。
    智能体的原生图片生成应由 agent.gemini_config / agent.xai_image_config 控制。

    Args:
        global_config: 从 ToolConfig 表读取的全局图像生成配置
        agent: Agent 实例（用于读取 legacy 配置）
        provider_type: 供应商类型

    Returns:
        (effective_gemini_config, effective_xai_image_config)
    """
    provider_lower = provider_type.lower()

    # 智能体级别的图像生成配置（优先使用 agent 自身的配置，不受全局配置影响）
    agent_gemini_cfg = agent.gemini_config or {}
    agent_xai_cfg = agent.xai_image_config or {}
    
    # 检查智能体自身是否启用了原生图片生成
    agent_img_enabled = agent_gemini_cfg.get("image_generation_enabled", False)
    
    # Gemini 配置：合并智能体配置 + 处理 thinking_mode 映射
    # 注意：全局 global_config 仅用于图像生成工具，不传递给 LLM 流式调用
    if provider_lower == "gemini":
        effective_gemini = _merge_gemini(agent_gemini_cfg, {}, agent.thinking_mode)
        return (effective_gemini, agent_xai_cfg)
    
    # xAI 配置：直接使用智能体配置
    if provider_lower == "xai":
        return (agent_gemini_cfg, agent_xai_cfg)
    
    # 其他供应商
    return (agent_gemini_cfg, agent_xai_cfg)


def _merge_gemini(legacy_config: dict | None, adapted: dict, thinking_mode: bool = False) -> dict:
    """Merge adapted image config into legacy gemini_config, preserving non-image fields.
    
    Args:
        legacy_config: 原始的 gemini_config
        adapted: 适配后的图像配置
        thinking_mode: 智能体的思考模式开关，为 True 时自动设置默认 thinking_level
    """
    base = dict(legacy_config or {})
    # 覆盖图像相关字段
    base["image_generation_enabled"] = adapted.get("image_generation_enabled", False)
    adapted.get("image_config") and base.update(image_config=adapted["image_config"])
    
    # 思考模式：如果启用了 thinking_mode 但没有设置 thinking_level，自动设置为 "high"
    # 这是向后兼容处理：前端 thinking_mode 开关需要映射到 Gemini 的 thinking_level
    if thinking_mode and not base.get("thinking_level"):
        base["thinking_level"] = "high"
    
    return base
