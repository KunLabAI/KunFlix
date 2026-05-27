"""DialogAgent 与 NarrativeEngine —— 基于 AgentScope 2.0。

变更说明（1.0 → 2.0）：
- DialogAgent 继承 ``agentscope.agent.Agent``，复用 2.0 的 ReAct loop / 上下文压缩。
- 模型实例统一通过 ``Credential`` 注入 ``api_key`` / ``base_url``，按家族映射表分派。
- 删除 1.0 的 ``ToolGuardMixin`` / ``MemoryCompactionHook`` / 手工 formatter / self.memory；
  2.0 的 Permission 系统、Middleware、ContextConfig 已分别取代它们的职责。
- Skill 通过 ``Toolkit(skills_or_loaders=[...])`` 在构造时一次性注册到 active_skills 目录。
- MCP 在每次 reply 之前懒注册到 toolkit，沿用 mcp_manager 的热加载语义。
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from agentscope.agent import Agent
from agentscope.credential import (
    AnthropicCredential,
    DashScopeCredential,
    GeminiCredential,
    OpenAICredential,
)
from agentscope.message import Msg
from agentscope.model import (
    AnthropicChatModel,
    DashScopeChatModel,
    GeminiChatModel,
    OllamaChatModel,
    OpenAIChatModel,
)
from agentscope.tool import Toolkit
from sqlalchemy.future import select

from config import settings
from database import AsyncSessionLocal
from mcp_manager.manager import MCPClientManager
from models import LLMProvider
from skills_manager import (
    get_active_skills_dir,
    list_available_skills,
    sync_skills,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Provider → ChatModel 工厂（映射表替代 if-else 链）
# ---------------------------------------------------------------------------

# 默认 base_url：与 1.0 行为对齐，OpenAI 兼容供应商兜底
_DEFAULT_BASE_URLS: dict[str, str] = {
    "deepseek": "https://api.deepseek.com",
    "minimax": "https://api.minimax.io/anthropic",
    "xai": "https://api.x.ai/v1",
    "ark": "https://ark.cn-beijing.volces.com/api/v3",
}

# 家族识别：子串包含即视为 Anthropic 系；其余落到 OpenAI 兼容路径
_ANTHROPIC_FAMILY_KEYWORDS: tuple[str, ...] = ("anthropic", "minimax")


def _build_credential(cred_cls: Any, api_key: str, base_url: str | None) -> Any:
    """构造 Credential。某些 Credential 不支持 base_url 字段，此时回退至仅 api_key。"""
    cred_kwargs: dict[str, Any] = {"api_key": api_key}
    base_url and cred_kwargs.update(base_url=base_url)
    try:
        return cred_cls(**cred_kwargs)
    except TypeError:
        cred_kwargs.pop("base_url", None)
        return cred_cls(**cred_kwargs)


def _factory_with_credential(cred_cls: Any, model_cls: Any):
    """通用工厂：Credential + ChatModel 组合，参数一致。"""

    def factory(api_key: str, model_name: str, base_url: str | None,
                parameters: Any | None = None) -> Any:
        credential = _build_credential(cred_cls, api_key, base_url)
        model_kwargs: dict[str, Any] = {"credential": credential, "model": model_name}
        parameters is not None and model_kwargs.update(parameters=parameters)
        return model_cls(**model_kwargs)

    return factory


def _ollama_factory(api_key: str, model_name: str, base_url: str | None,
                    parameters: Any | None = None) -> Any:
    """Ollama: credential 可选；host 指向本地服务地址。"""
    kwargs: dict[str, Any] = {"model": model_name}
    base_url and kwargs.update(host=base_url)
    return OllamaChatModel(**kwargs)


# 直接命中：provider_type 完全匹配
_DIRECT_MODEL_FACTORIES = {
    "dashscope": _factory_with_credential(DashScopeCredential, DashScopeChatModel),
    "gemini": _factory_with_credential(GeminiCredential, GeminiChatModel),
    "ollama": _ollama_factory,
}

# 家族兜底：OpenAI / Anthropic
_FAMILY_FACTORIES = {
    "openai": _factory_with_credential(OpenAICredential, OpenAIChatModel),
    "anthropic": _factory_with_credential(AnthropicCredential, AnthropicChatModel),
}


def _resolve_factory(provider_type: str):
    """根据 provider_type 选定模型工厂（直接匹配 → Anthropic 家族 → OpenAI 兜底）。"""
    pt = provider_type.lower()
    direct = _DIRECT_MODEL_FACTORIES.get(pt)
    if direct:
        return direct
    family_key = "anthropic" if any(k in pt for k in _ANTHROPIC_FAMILY_KEYWORDS) else "openai"
    return _FAMILY_FACTORIES[family_key]


def create_chat_model(
    provider_type: str,
    api_key: str,
    model_name: str,
    base_url: str | None = None,
    parameters: Any | None = None,
) -> Any:
    """统一构造 2.0 ChatModel：1.0 风格的 (provider_type, api_key, base_url) → Credential。

    供 narrative_engine、services.agent_executor、routers.llm_config 复用，
    集中收敛 Credential 拆包逻辑，避免散落多处的 if-else 链。
    """
    factory = _resolve_factory(provider_type)
    effective_base_url = base_url or _DEFAULT_BASE_URLS.get(provider_type.lower())
    return factory(api_key, model_name, effective_base_url, parameters)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_response_text(response_msg: Any) -> str:
    """从 2.0 Msg 中提取纯文本（兼容 TextBlock / dict / str 多形态 content）。"""
    helper = getattr(response_msg, "get_text_content", None)
    if callable(helper):
        return helper() or ""

    content = getattr(response_msg, "content", None)
    extractors = {
        str: lambda c: c,
        list: lambda c: "".join(_block_to_text(b) for b in c),
    }
    return extractors.get(type(content), lambda c: str(c) if c else "")(content)


def _block_to_text(block: Any) -> str:
    """单个 content block → text。兼容 Pydantic TextBlock 与历史 dict 形态。"""
    if isinstance(block, dict):
        return block.get("text", "") if block.get("type") == "text" else ""
    return getattr(block, "text", "") or ""


# ---------------------------------------------------------------------------
# DialogAgent（KunFlix 项目对 2.0 Agent 的最薄封装）
# ---------------------------------------------------------------------------

class DialogAgent(Agent):
    """保留 1.0 风格的构造签名，便于 services.agent_executor / routers 零改动接入。

    - skills 通过 Toolkit(skills_or_loaders=[...]) 一次性注册
    - mcp 在 reply 前懒注册（兼容 mcp_manager 热加载）
    """

    def __init__(
        self,
        name: str,
        sys_prompt: str,
        model: Any,
        max_tokens: int = 4000,  # noqa: ARG002 — 1.0 兼容签名；2.0 由 ContextConfig 接管
        mcp_manager: MCPClientManager | None = None,
        skill_names: list[str] | None = None,
    ) -> None:
        sync_skills()  # 同步 builtin / customized → active_skills
        active_dir = get_active_skills_dir()
        active_dir.exists() or active_dir.mkdir(parents=True, exist_ok=True)

        skills_or_loaders = self._collect_skill_paths(active_dir, skill_names)
        toolkit_kwargs = {"skills_or_loaders": skills_or_loaders} if skills_or_loaders else {}
        toolkit = Toolkit(**toolkit_kwargs)

        super().__init__(
            name=name,
            system_prompt=sys_prompt,
            model=model,
            toolkit=toolkit,
        )

        self.mcp_manager = mcp_manager
        self._mcp_registered = False

    @staticmethod
    def _collect_skill_paths(active_dir: Path, skill_names: list[str] | None) -> list[str]:
        """从 active_skills 中挑选目录路径，必要时按 skill_names 过滤。"""
        available = list_available_skills()
        wanted = [s for s in available if s in skill_names] if skill_names else available
        return [str(active_dir / name) for name in wanted]

    async def _ensure_mcp_registered(self) -> None:
        """懒注册 MCP 客户端到 toolkit；首次 reply 之前完成。"""
        if not self.mcp_manager or self._mcp_registered:
            return

        # 兼容 toolkit 在不同 2.0 版本中的方法名（register_mcp_client / register_mcp）
        register = (
            getattr(self.toolkit, "register_mcp_client", None)
            or getattr(self.toolkit, "register_mcp", None)
        )
        if not callable(register):
            logger.debug("Toolkit has no MCP registration hook; skipping MCP injection.")
            self._mcp_registered = True
            return

        for client in await self.mcp_manager.get_clients():
            try:
                res = register(client)
                asyncio.iscoroutine(res) and await res
                logger.info("Registered MCP client: %s", getattr(client, "name", "unknown"))
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed to register MCP client: %s", exc)
        self._mcp_registered = True

    async def reply(self, *args: Any, **kwargs: Any) -> Msg:  # type: ignore[override]
        """覆盖 Agent.reply，在第一次推理前确保 MCP 已注册。"""
        await self._ensure_mcp_registered()
        return await super().reply(*args, **kwargs)


# ---------------------------------------------------------------------------
# NarrativeEngine：从 DB 读取 active LLMProvider，热加载为 chat model
# ---------------------------------------------------------------------------

class NarrativeEngine:
    def __init__(self) -> None:
        self.initialized = False
        self.current_model: Any = None

    async def load_config_from_db(self, db_session: Any | None = None) -> None:
        """Load active LLM configuration from DB. Reuse session if provided."""
        if db_session:
            return await self._fetch_and_init(db_session)

        async with AsyncSessionLocal() as session:
            return await self._fetch_and_init(session)

    async def _fetch_and_init(self, session: Any) -> None:
        result = await session.execute(
            select(LLMProvider)
            .filter(LLMProvider.is_active == True)  # noqa: E712 — SQLAlchemy 表达式
            .order_by(LLMProvider.is_default.desc())
        )
        provider = result.scalars().first()

        if not provider:
            logger.warning(
                "No active LLM Provider in DB; falling back to settings.OPENAI_API_KEY."
            )
            settings.OPENAI_API_KEY and self.initialize(
                api_key=settings.OPENAI_API_KEY,
                model_name=settings.STORY_GENERATION_MODEL,
                base_url=None,
            )
            return

        logger.info("Initializing NarrativeEngine with provider: %s", provider.name)
        self.initialize(
            api_key=provider.api_key,
            model_name=self._pick_first_model(provider.models),
            base_url=provider.base_url,
            provider_type=provider.provider_type,
            config_json=provider.config_json,
        )

    @staticmethod
    def _pick_first_model(models_field: Any) -> str:
        """Resolve provider.models (list / json-string / str) to a single model name."""
        if isinstance(models_field, list) and models_field:
            return models_field[0]
        if isinstance(models_field, str) and models_field:
            try:
                parsed = json.loads(models_field)
                return parsed[0] if isinstance(parsed, list) and parsed else models_field
            except json.JSONDecodeError:
                return models_field
        return "gpt-4"

    def initialize(
        self,
        api_key: str | None = None,
        model_name: str = "gpt-4",
        base_url: str | None = None,
        provider_type: str = "openai_chat",
        config_json: Any | None = None,  # noqa: ARG002 — 留作未来 parameters 注入位
    ) -> None:
        if not api_key:
            logger.warning("API Key not provided for Narrative Engine; skipping init.")
            return

        try:
            self.current_model = create_chat_model(
                provider_type=provider_type,
                api_key=api_key,
                model_name=model_name,
                base_url=base_url,
            )
            logger.info("AgentScope chat model ready: %s (%s)", model_name, provider_type)
            self.initialized = True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to initialize chat model: %s", exc)

    async def reload_config(self, db_session: Any) -> None:
        """Trigger a reload of configuration from DB."""
        await self.load_config_from_db(db_session)


narrative_engine = NarrativeEngine()
# Note: Initial loading happens via startup.lifespan or admin API endpoints.
