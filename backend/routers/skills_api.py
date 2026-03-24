import logging
from typing import List, Optional

import frontmatter as fm
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import require_admin
from skills_manager import SkillService, get_active_skills_dir, get_skills_base_dir

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin/skills",
    tags=["admin_skills"],
    responses={404: {"description": "Not found"}},
)

_skill_service = SkillService(workspace_dir=get_skills_base_dir())


# ---------------------------------------------------------------------------
# Response / Request models
# ---------------------------------------------------------------------------

class SkillInfoResponse(BaseModel):
    """Frontend-compatible list response model."""
    id: str
    name: str
    description: str
    version: str
    source: str   # "builtin" or "customized"
    status: str   # "active" or "inactive"


class SkillDetailResponse(SkillInfoResponse):
    """Extended response with raw SKILL.md body for editing."""
    content: str  # markdown body (after frontmatter)


class CreateSkillRequest(BaseModel):
    name: str = Field(..., pattern=r"^[a-zA-Z0-9_\-]+$")
    description: str
    content: str = ""          # markdown body
    version: str = "1.0"
    auto_enable: bool = True


class UpdateSkillRequest(BaseModel):
    description: str
    content: str = ""
    version: str = "1.0"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_version(raw: str) -> str:
    try:
        post = fm.loads(raw)
        metadata = post.get("metadata") or {}
        return str(metadata.get("builtin_skill_version", "1.0"))
    except Exception:
        return "1.0"


def _build_skill_md(name: str, description: str, version: str, body: str) -> str:
    """Assemble a complete SKILL.md from parts."""
    post = fm.Post(body)
    post["name"] = name
    post["description"] = description
    post["metadata"] = {"builtin_skill_version": version}
    return fm.dumps(post)


def _active_names() -> set[str]:
    return {s.name for s in _skill_service.list_available_skills()}


def _find_skill(skill_name: str):
    """Find a skill by name from the all-skills list. Returns (skill, active_set)."""
    all_skills = _skill_service.list_all_skills()
    active = _active_names()
    matched = next((s for s in all_skills if s.name == skill_name), None)
    return matched, active


def _to_response(skill, active: set[str]) -> SkillInfoResponse:
    return SkillInfoResponse(
        id=skill.name,
        name=skill.name,
        description=skill.description or "No description",
        version=_extract_version(skill.content),
        source=skill.source,
        status="active" if skill.name in active else "inactive",
    )


def _to_detail(skill, active: set[str]) -> SkillDetailResponse:
    # Extract body (content after frontmatter)
    body = ""
    try:
        post = fm.loads(skill.content)
        body = post.content or ""
    except Exception:
        body = skill.content
    return SkillDetailResponse(
        id=skill.name,
        name=skill.name,
        description=skill.description or "No description",
        version=_extract_version(skill.content),
        source=skill.source,
        status="active" if skill.name in active else "inactive",
        content=body.strip(),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[SkillInfoResponse])
async def list_skills(current_admin=Depends(require_admin)):
    """List all skills and their status."""
    all_skills = _skill_service.list_all_skills()
    active = _active_names()
    return [_to_response(s, active) for s in all_skills]


@router.get("/{skill_name}", response_model=SkillDetailResponse)
async def get_skill(skill_name: str, current_admin=Depends(require_admin)):
    """Get a single skill with full content for editing."""
    skill, active = _find_skill(skill_name)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
    return _to_detail(skill, active)


@router.post("", response_model=SkillInfoResponse)
async def create_skill(req: CreateSkillRequest, current_admin=Depends(require_admin)):
    """Create a new customized skill."""
    full_md = _build_skill_md(req.name, req.description, req.version, req.content)
    success = _skill_service.create_skill(name=req.name, content=full_md)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to create skill '{req.name}' (may already exist)")

    if req.auto_enable:
        _skill_service.enable_skill(req.name, force=True)

    skill, active = _find_skill(req.name)
    return _to_response(skill, active)


@router.put("/{skill_name}", response_model=SkillInfoResponse)
async def update_skill(skill_name: str, req: UpdateSkillRequest, current_admin=Depends(require_admin)):
    """Update an existing skill's content."""
    full_md = _build_skill_md(skill_name, req.description, req.version, req.content)
    success = _skill_service.create_skill(name=skill_name, content=full_md, overwrite=True)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to update skill '{skill_name}'")

    # Re-sync to active if it was active
    active = _active_names()
    if skill_name in active:
        _skill_service.enable_skill(skill_name, force=True)

    skill, active = _find_skill(skill_name)
    return _to_response(skill, active)


@router.delete("/{skill_name}")
async def delete_skill(skill_name: str, current_admin=Depends(require_admin)):
    """Delete a customized skill. Builtin skills cannot be deleted."""
    skill, _ = _find_skill(skill_name)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
    if skill.source == "builtin":
        raise HTTPException(status_code=403, detail="Cannot delete builtin skills")

    # Deactivate first, then delete
    _skill_service.disable_skill(skill_name)
    success = _skill_service.delete_skill(skill_name)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete skill '{skill_name}'")

    return {"status": "success", "message": f"Skill '{skill_name}' deleted"}


@router.post("/{skill_name}/toggle")
async def toggle_skill(skill_name: str, current_admin=Depends(require_admin)):
    """Toggle a skill's active status."""
    active_path = get_active_skills_dir(get_skills_base_dir()) / skill_name

    action, new_state = (
        (_skill_service.disable_skill, "inactive")
        if active_path.exists()
        else (_skill_service.enable_skill, "active")
    )
    success = action(skill_name) if new_state == "inactive" else action(skill_name, force=True)

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to toggle skill {skill_name}")

    verb = "disabled" if new_state == "inactive" else "enabled"
    return {"status": "success", "new_state": new_state, "message": f"Skill {skill_name} {verb}"}
