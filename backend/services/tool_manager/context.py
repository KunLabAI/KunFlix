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
    from models import Agent, LLMProvider

logger = logging.getLogger(__name__)


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

    async def resolve_image_provider_type(self) -> str | None:
        """Resolve the image provider's provider_type from DB (cached after first call)."""
        return self._image_provider_type if self._image_provider_resolved else await self._do_resolve_image_provider()

    async def _do_resolve_image_provider(self) -> str | None:
        from models import LLMProvider
        self._image_provider_resolved = True
        provider_id = (self.agent.image_config or {}).get("image_provider_id")
        result = provider_id and await self.db.execute(
            select(LLMProvider).filter(LLMProvider.id == provider_id)
        )
        prov = result.scalar_one_or_none() if result else None
        self._image_provider_type = prov.provider_type.lower() if prov else None
        return self._image_provider_type
