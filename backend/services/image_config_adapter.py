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
    "gemini": {"standard": "1024", "hd": "2K", "ultra": "4K"},
    "xai":    {"standard": "1k",   "hd": "2k", "ultra": "2k"},
}

# ---------------------------------------------------------------------------
# Batch count: field name + max per provider
# ---------------------------------------------------------------------------
_BATCH_MAP: dict[str, dict[str, Any]] = {
    "gemini": {"field": "batch_count", "max": 8},
    "xai":    {"field": "n",           "max": 10},
}

# ---------------------------------------------------------------------------
# Provider-supported aspect ratios (for validation / fallback)
# ---------------------------------------------------------------------------
_ASPECT_RATIO_SUPPORTED: dict[str, set[str]] = {
    "gemini": {"auto", "16:9", "4:3", "1:1", "3:4", "9:16"},
    "xai":    {"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3",
               "2:1", "1:2", "19.5:9", "9:19.5", "20:9", "9:20", "auto"},
}

_ASPECT_RATIO_DEFAULT: dict[str, str] = {
    "gemini": "auto",
    "xai":    "1:1",
}

# ---------------------------------------------------------------------------
# Output format mapping
# ---------------------------------------------------------------------------
_OUTPUT_FORMAT_SUPPORTED: dict[str, set[str]] = {
    "gemini": {"png", "jpeg", "webp"},
    "xai":    set(),  # xAI 不支持用户指定输出格式
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
    },
    "xai": {
        "aspect_ratios": sorted(_ASPECT_RATIO_SUPPORTED["xai"]),
        "qualities": ["standard", "hd"],
        "output_formats": [],
        "batch_count": {"min": 1, "max": _BATCH_MAP["xai"]["max"]},
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


# ---------------------------------------------------------------------------
# Adapter registry (mapping table)
# ---------------------------------------------------------------------------
_ADAPTERS: dict[str, callable] = {
    "gemini": _adapt_to_gemini,
    "xai":    _adapt_to_xai,
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
        "gemini": lambda u: (_merge_gemini(agent.gemini_config, u), agent.xai_image_config),
        "xai":    lambda u: (agent.gemini_config, u),
    }
    _fallback = lambda u: (agent.gemini_config, agent.xai_image_config)

    adapted = to_provider_config(provider_lower, unified) if has_unified else {}
    resolver = _CONFIG_KEY_MAP.get(provider_lower, _fallback)
    return resolver(adapted) if has_unified else (agent.gemini_config, agent.xai_image_config)


def resolve_global_image_configs(
    global_config: dict,
    agent,
    provider_type: str,
) -> tuple[dict | None, dict | None]:
    """使用全局 ToolConfig 解析有效的图像配置。

    Args:
        global_config: 从 ToolConfig 表读取的全局图像生成配置
        agent: Agent 实例（用于读取 legacy 配置）
        provider_type: 供应商类型

    Returns:
        (effective_gemini_config, effective_xai_image_config)
    """
    has_enabled = global_config.get("image_generation_enabled", False)
    provider_lower = provider_type.lower()

    _CONFIG_KEY_MAP = {
        "gemini": lambda u: (_merge_gemini(agent.gemini_config, u), agent.xai_image_config),
        "xai":    lambda u: (agent.gemini_config, u),
    }
    _fallback = lambda u: (agent.gemini_config, agent.xai_image_config)

    adapted = to_provider_config(provider_lower, global_config) if has_enabled else {}
    resolver = _CONFIG_KEY_MAP.get(provider_lower, _fallback)
    return resolver(adapted) if has_enabled else (agent.gemini_config, agent.xai_image_config)


def _merge_gemini(legacy_config: dict | None, adapted: dict) -> dict:
    """Merge adapted image config into legacy gemini_config, preserving non-image fields."""
    base = dict(legacy_config or {})
    # 覆盖图像相关字段
    base["image_generation_enabled"] = adapted.get("image_generation_enabled", False)
    adapted.get("image_config") and base.update(image_config=adapted["image_config"])
    return base
