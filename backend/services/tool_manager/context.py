"""
ToolContext — unified context for tool availability checks and execution.

Replaces the scattered theater_id / agent / db / active_skills_dir parameters
previously threaded through chat_generation, admin_debug, and chat_tool_dispatch.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from models import Agent, LLMProvider, ToolConfig

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Skill-gated tool mapping: skill name -> set of tool names it gates
# ---------------------------------------------------------------------------
TOOL_SKILL_GATE_MAP: dict[str, frozenset[str]] = {
    "image_tools": frozenset({"generate_image", "edit_image"}),
    "video_tools": frozenset({"generate_video", "edit_video"}),
    "music_tools": frozenset({"generate_music"}),
    "canvas_tools": frozenset({
        "list_canvas_nodes", "get_canvas_node",
        "create_canvas_node", "update_canvas_node", "delete_canvas_node",
    }),
}


# ---------------------------------------------------------------------------
# Tool groups: AgentScope-style dynamic tool group management
# ---------------------------------------------------------------------------
@dataclass
class ToolGroupDef:
    """Definition of a tool group that can be activated/deactivated at runtime."""
    name: str
    description: str
    instructions: str = ""  # Returned to agent when group is activated


TOOL_GROUPS: dict[str, ToolGroupDef] = {
    "canvas": ToolGroupDef(
        name="canvas",
        description="Canvas node CRUD tools for creating and managing theater nodes.",
        instructions="Always use list_canvas_nodes first to understand current state.",
    ),
    "image_gen": ToolGroupDef(
        name="image_gen",
        description="Generate images from text prompts.",
    ),
    "image_edit": ToolGroupDef(
        name="image_edit",
        description="Edit existing images (inpainting, style transfer).",
    ),
    "video_gen": ToolGroupDef(
        name="video_gen",
        description="Generate videos from text/image prompts.",
    ),
    "video_edit": ToolGroupDef(
        name="video_edit",
        description="Edit existing videos (extension, effects).",
    ),
    "music_gen": ToolGroupDef(
        name="music_gen",
        description="Generate music/audio from text prompts.",
    ),
}

# Provider class name -> group name (for build_defs group-state lookup)
PROVIDER_GROUP_MAP: dict[str, str] = {
    "CanvasProvider": "canvas",
    "ImageGenProvider": "image_gen",
    "ImageEditProvider": "image_edit",
    "VideoGenProvider": "video_gen",
    "VideoEditProvider": "video_edit",
    "MusicGenProvider": "music_gen",
}


@dataclass
class ToolContext:
    """Immutable-ish context that travels with a single chat generation request."""

    theater_id: str | None
    agent: "Agent"
    db: AsyncSession

    # --- 日志溯源字段 ---
    session_id: str | None = None
    user_id: str | None = None
    is_admin: bool = False

    # --- lazy-resolved caches (private) ---
    _active_skills_dir: Path | None = field(default=None, repr=False)
    _image_provider_type: str | None = field(default=None, repr=False)
    _image_provider_resolved: bool = field(default=False, repr=False)
    _global_image_config: dict | None = field(default=None, repr=False)
    _video_provider_type: str | None = field(default=None, repr=False)
    _video_provider_resolved: bool = field(default=False, repr=False)
    _global_video_config: dict | None = field(default=None, repr=False)

    # --- music generation caches ---
    _music_provider_type: str | None = field(default=None, repr=False)
    _music_provider_resolved: bool = field(default=False, repr=False)
    _global_music_config: dict | None = field(default=None, repr=False)

    # --- skill-gated tool tracking ---
    loaded_tool_skills: set = field(default_factory=set, repr=False)

    # --- tool group overrides (AgentScope-style reset_tools) ---
    _group_overrides: dict = field(default_factory=dict, repr=False)

    # --- transient event collectors ---
    video_tasks: list = field(default_factory=list, repr=False)
    music_tasks: list = field(default_factory=list, repr=False)

    # ------------------------------------------------------------------
    # Tool group helpers (AgentScope-style reset_tools)
    # ------------------------------------------------------------------

    def is_group_active(self, group_name: str | None) -> bool | None:
        """Check group override state.

        Returns None = use default logic, True = force active, False = force inactive.
        """
        return self._group_overrides.get(group_name) if group_name else None

    def set_group_overrides(self, overrides: dict[str, bool]) -> None:
        """Called by reset_tools execution. Replaces all overrides (final-state semantics)."""
        self._group_overrides = {k: v for k, v in overrides.items() if k in TOOL_GROUPS}

    # ------------------------------------------------------------------
    # Skill-gate helpers
    # ------------------------------------------------------------------

    def is_skill_gated(self, skill_name: str) -> bool:
        """Check if a tool-skill is configured on the agent but not yet loaded."""
        agent_skills = self.agent.tools or []
        return skill_name in agent_skills and skill_name not in self.loaded_tool_skills

    # ------------------------------------------------------------------
    # Lazy accessors
    # ------------------------------------------------------------------

    @property
    def active_skills_dir(self) -> Path:
        """Lazily resolve the active-skills directory (imports skills_manager)."""
        result = self._active_skills_dir
        return result if result is not None else self._resolve_skills_dir()

    def _resolve_skills_dir(self) -> Path:
        from skills_manager import get_active_skills_dir
        self._active_skills_dir = get_active_skills_dir()
        return self._active_skills_dir

    async def get_global_image_config(self) -> dict:
        """获取全局图像生成配置（从 ToolConfig 表，带缓存）。"""
        if self._global_image_config is not None:
            return self._global_image_config
        from models import ToolConfig
        result = await self.db.execute(
            select(ToolConfig).where(ToolConfig.tool_name == "generate_image")
        )
        tool_config = result.scalar_one_or_none()
        self._global_image_config = (tool_config.config if tool_config else {}) or {}
        return self._global_image_config

    async def resolve_image_provider_type(self) -> str | None:
        """Resolve the image provider's provider_type from DB (cached after first call)."""
        return self._image_provider_type if self._image_provider_resolved else await self._do_resolve_image_provider()

    async def _do_resolve_image_provider(self) -> str | None:
        from models import LLMProvider
        self._image_provider_resolved = True
        # 从全局 ToolConfig 读取配置
        global_config = await self.get_global_image_config()
        provider_id = global_config.get("image_provider_id")
        result = provider_id and await self.db.execute(
            select(LLMProvider).filter(LLMProvider.id == provider_id)
        )
        prov = result.scalar_one_or_none() if result else None
        self._image_provider_type = prov.provider_type.lower() if prov else None
        return self._image_provider_type

    async def get_global_video_config(self) -> dict:
        """获取全局视频生成配置（从 ToolConfig 表，带缓存）。"""
        if self._global_video_config is not None:
            return self._global_video_config
        from models import ToolConfig
        result = await self.db.execute(
            select(ToolConfig).where(ToolConfig.tool_name == "generate_video")
        )
        tool_config = result.scalar_one_or_none()
        self._global_video_config = (tool_config.config if tool_config else {}) or {}
        return self._global_video_config

    async def resolve_video_provider_type(self) -> str | None:
        """Resolve the video provider's provider_type from DB (cached after first call)."""
        return self._video_provider_type if self._video_provider_resolved else await self._do_resolve_video_provider()

    async def _do_resolve_video_provider(self) -> str | None:
        from models import LLMProvider
        from services.video_providers import extract_video_provider_type
        
        self._video_provider_resolved = True
        global_config = await self.get_global_video_config()
        provider_id = global_config.get("video_provider_id")
        result = provider_id and await self.db.execute(
            select(LLMProvider).filter(LLMProvider.id == provider_id)
        )
        prov = result.scalar_one_or_none() if result else None
        # 使用标准化的提取函数
        self._video_provider_type = extract_video_provider_type(prov.provider_type) if prov else None
        return self._video_provider_type

    # ------------------------------------------------------------------
    # Music generation config helpers
    # ------------------------------------------------------------------

    async def get_global_music_config(self) -> dict:
        """获取全局音乐生成配置（从 ToolConfig 表，带缓存）。"""
        if self._global_music_config is not None:
            return self._global_music_config
        from models import ToolConfig
        result = await self.db.execute(
            select(ToolConfig).where(ToolConfig.tool_name == "generate_music")
        )
        tool_config = result.scalar_one_or_none()
        self._global_music_config = (tool_config.config if tool_config else {}) or {}
        return self._global_music_config

    async def resolve_music_provider_type(self) -> str | None:
        """Resolve the music provider's provider_type from DB (cached after first call)."""
        return self._music_provider_type if self._music_provider_resolved else await self._do_resolve_music_provider()

    async def _do_resolve_music_provider(self) -> str | None:
        from models import LLMProvider
        from services.music_providers import extract_music_provider_type

        self._music_provider_resolved = True
        global_config = await self.get_global_music_config()
        provider_id = global_config.get("music_provider_id")
        result = provider_id and await self.db.execute(
            select(LLMProvider).filter(LLMProvider.id == provider_id)
        )
        prov = result.scalar_one_or_none() if result else None
        self._music_provider_type = extract_music_provider_type(prov.provider_type) if prov else None
        return self._music_provider_type
