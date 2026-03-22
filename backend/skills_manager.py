"""Skills management: sync skills from code to working_dir."""

import logging
import shutil
from pathlib import Path
from typing import Any, Dict, List

import frontmatter
from packaging.version import Version
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class SkillInfo(BaseModel):
    """Skill information structure (aligned with CoPaw)."""

    name: str
    description: str = ""
    content: str
    source: str  # "builtin", "customized", or "active"
    path: str
    references: dict[str, Any] = {}
    scripts: dict[str, Any] = {}


def _dedupe_skills_by_name(skills: list[SkillInfo]) -> list[SkillInfo]:
    """Return one skill per name, preferring later entries (customized > builtin)."""
    merged: dict[str, SkillInfo] = {}
    for skill in skills:
        merged[skill.name] = skill
    return list(merged.values())


# ---------------------------------------------------------------------------
# Path helpers (backward-compatible: no-arg calls use default base dir)
# ---------------------------------------------------------------------------

def get_skills_base_dir() -> Path:
    """Get the base directory for skills."""
    return Path(__file__).parent / "skills"


def get_builtin_skills_dir() -> Path:
    """Get the path to built-in skills directory in the code."""
    return get_skills_base_dir() / "builtin_skills"


def get_customized_skills_dir(workspace_dir: Path = None) -> Path:
    """Get the path to customized skills directory."""
    base = workspace_dir or get_skills_base_dir()
    return base / "customized_skills"


def get_active_skills_dir(workspace_dir: Path = None) -> Path:
    """Get the path to active skills directory."""
    base = workspace_dir or get_skills_base_dir()
    return base / "active_skills"


# ---------------------------------------------------------------------------
# Internal utilities
# ---------------------------------------------------------------------------

def _collect_skills_from_dir(directory: Path) -> Dict[str, Path]:
    """Collect skills (dirs containing SKILL.md) from a directory."""
    skills: Dict[str, Path] = {}
    if not directory.exists():
        return skills
    for skill_dir in directory.iterdir():
        if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
            skills[skill_dir.name] = skill_dir
    return skills


def _build_directory_tree(directory: Path) -> dict[str, Any]:
    """Recursively build a tree: {file: None, dir: {nested...}}."""
    tree: dict[str, Any] = {}
    if not directory.exists() or not directory.is_dir():
        return tree
    for item in sorted(directory.iterdir()):
        tree[item.name] = _build_directory_tree(item) if item.is_dir() else None
    return tree


def _create_files_from_tree(base_dir: Path, tree: dict[str, Any]) -> None:
    """Create files and directories from a tree structure.

    - {filename: str_content} -> file with content
    - {filename: None}        -> empty file
    - {dirname: {nested}}     -> directory (recursive)
    """
    for name, value in (tree or {}).items():
        item_path = base_dir / name
        if isinstance(value, dict):
            item_path.mkdir(parents=True, exist_ok=True)
            _create_files_from_tree(item_path, value)
        else:
            content = value if isinstance(value, str) else ""
            item_path.write_text(content, encoding="utf-8")


def _read_skills_from_dir(directory: Path, source: str) -> list[SkillInfo]:
    """Read skills from a directory and return SkillInfo list."""
    skills: list[SkillInfo] = []
    if not directory.exists():
        return skills

    for skill_dir in directory.iterdir():
        if not skill_dir.is_dir():
            continue
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            continue
        try:
            content = skill_md.read_text(encoding="utf-8")
            description = ""
            try:
                post = frontmatter.loads(content)
                description = str(post.get("description", "") or "")
            except Exception as e:
                logger.warning("Failed to parse SKILL.md frontmatter for '%s': %s", skill_dir.name, e)

            references_dir = skill_dir / "references"
            scripts_dir = skill_dir / "scripts"
            skills.append(SkillInfo(
                name=skill_dir.name,
                description=description,
                content=content,
                source=source,
                path=str(skill_dir),
                references=_build_directory_tree(references_dir) if references_dir.is_dir() else {},
                scripts=_build_directory_tree(scripts_dir) if scripts_dir.is_dir() else {},
            ))
        except Exception as e:
            logger.error("Failed to read skill '%s': %s", skill_dir.name, e)

    return skills


def _get_builtin_skill_version(skill_dir: Path) -> Version | None:
    """Read builtin_skill_version from SKILL.md front matter."""
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        return None
    try:
        post = frontmatter.loads(skill_md.read_text(encoding="utf-8"))
        metadata = post.get("metadata") or {}
        ver = metadata.get("builtin_skill_version")
        return Version(str(ver)) if ver is not None else None
    except Exception as e:
        logger.warning("Could not parse version for skill '%s': %s", skill_dir.name, e)
    return None


def _replace_skill_dir(source: Path, target: Path) -> None:
    """Remove target (if exists) and copy source in its place."""
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)


def _skill_md_differs(dir_a: Path, dir_b: Path) -> bool:
    """Return True when SKILL.md files differ or one side is missing."""
    md_a = dir_a / "SKILL.md"
    md_b = dir_b / "SKILL.md"
    if not md_a.exists() or not md_b.exists():
        return True
    return md_a.read_text(encoding="utf-8") != md_b.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Sync functions
# ---------------------------------------------------------------------------

def sync_skills_to_working_dir(
    workspace_dir: Path,
    skill_names: list[str] | None = None,
    force: bool = False,
) -> tuple[int, int]:
    """Sync skills from builtin and customized to active_skills.

    Returns (synced_count, skipped_count).
    """
    builtin_skills = get_builtin_skills_dir()
    customized_skills = get_customized_skills_dir(workspace_dir)
    active_skills = get_active_skills_dir(workspace_dir)
    active_skills.mkdir(parents=True, exist_ok=True)

    # Collect (customized overrides builtin)
    skills_to_sync = _collect_skills_from_dir(builtin_skills)
    skills_to_sync.update(_collect_skills_from_dir(customized_skills))

    # Filter by names
    if skill_names is not None:
        skills_to_sync = {k: v for k, v in skills_to_sync.items() if k in skill_names}

    synced_count = 0
    skipped_count = 0

    for skill_name, skill_dir in skills_to_sync.items():
        target_dir = active_skills / skill_name

        # New or forced: copy directly
        if not target_dir.exists() or force:
            _replace_skill_dir(skill_dir, target_dir)
            logger.debug("Synced skill '%s' to active_skills.", skill_name)
            synced_count += 1
            continue

        # Customized override: propagate when SKILL.md differs
        customized_dir = customized_skills / skill_name
        if customized_dir.exists() and _skill_md_differs(customized_dir, target_dir):
            _replace_skill_dir(customized_dir, target_dir)
            logger.debug("Customized skill '%s' updated in active_skills.", skill_name)
            synced_count += 1
            continue

        skipped_count += 1

    return synced_count, skipped_count


def sync_skills() -> None:
    """Backward-compatible: sync all skills using default base dir."""
    sync_skills_to_working_dir(get_skills_base_dir())


def list_available_skills(workspace_dir: Path = None) -> List[str]:
    """List skill names in active_skills directory.

    Backward-compatible: called with no args from agents.py.
    """
    active_skills = get_active_skills_dir(workspace_dir)
    if not active_skills.exists():
        return []
    return [
        d.name for d in active_skills.iterdir()
        if d.is_dir() and (d / "SKILL.md").exists()
    ]


def ensure_skills_initialized(workspace_dir: Path) -> None:
    """Log check for active skills presence."""
    available = list_available_skills(workspace_dir)
    log = logger.debug if available else logger.warning
    messages = {
        True: "Loaded %d skill(s) from active_skills: %s",
        False: "No skills found in active_skills directory.",
    }
    args = (len(available), ", ".join(available)) if available else ()
    log(messages[bool(available)], *args)


# ---------------------------------------------------------------------------
# SkillService
# ---------------------------------------------------------------------------

class SkillService:
    """Service for managing skills across builtin, customized, and active directories."""

    def __init__(self, workspace_dir: Path):
        self.workspace_dir = workspace_dir

    # -- Listing --

    def list_all_skills(self) -> list[SkillInfo]:
        """List all skills from builtin and customized (deduped, customized wins)."""
        skills: list[SkillInfo] = []
        skills.extend(_read_skills_from_dir(get_builtin_skills_dir(), "builtin"))
        skills.extend(_read_skills_from_dir(get_customized_skills_dir(self.workspace_dir), "customized"))
        return _dedupe_skills_by_name(skills)

    def list_available_skills(self) -> list[SkillInfo]:
        """List active skills as SkillInfo objects."""
        return _read_skills_from_dir(get_active_skills_dir(self.workspace_dir), "active")

    # -- Enable / Disable --

    def enable_skill(self, name: str, force: bool = False) -> bool:
        """Enable a skill by syncing it to active_skills."""
        sync_skills_to_working_dir(self.workspace_dir, skill_names=[name], force=force)
        return (get_active_skills_dir(self.workspace_dir) / name).exists()

    def disable_skill(self, name: str) -> bool:
        """Disable a skill by removing it from active_skills."""
        skill_dir = get_active_skills_dir(self.workspace_dir) / name
        if not skill_dir.exists():
            return False
        try:
            shutil.rmtree(skill_dir)
            logger.debug("Disabled skill '%s' from active_skills.", name)
            return True
        except Exception as e:
            logger.error("Failed to disable skill '%s': %s", name, e)
            return False

    # -- Create / Delete --

    def create_skill(
        self,
        name: str,
        content: str,
        overwrite: bool = False,
        references: dict[str, Any] | None = None,
        scripts: dict[str, Any] | None = None,
    ) -> bool:
        """Create a new skill in customized_skills directory."""
        # Validate SKILL.md frontmatter
        try:
            post = frontmatter.loads(content)
            if not post.get("name") or not post.get("description"):
                logger.error("SKILL.md must have 'name' and 'description' in frontmatter.")
                return False
        except Exception as e:
            logger.error("Failed to parse SKILL.md frontmatter: %s", e)
            return False

        customized_dir = get_customized_skills_dir(self.workspace_dir)
        customized_dir.mkdir(parents=True, exist_ok=True)
        skill_dir = customized_dir / name

        if skill_dir.exists() and not overwrite:
            logger.debug("Skill '%s' already exists. Use overwrite=True to replace.", name)
            return False

        try:
            if skill_dir.exists():
                shutil.rmtree(skill_dir)

            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text(content, encoding="utf-8")

            if references:
                refs_dir = skill_dir / "references"
                refs_dir.mkdir(parents=True, exist_ok=True)
                _create_files_from_tree(refs_dir, references)

            if scripts:
                scripts_dir = skill_dir / "scripts"
                scripts_dir.mkdir(parents=True, exist_ok=True)
                _create_files_from_tree(scripts_dir, scripts)

            logger.debug("Created skill '%s' in customized_skills.", name)
            return True
        except Exception as e:
            logger.error("Failed to create skill '%s': %s", name, e)
            return False

    def delete_skill(self, name: str) -> bool:
        """Delete a skill from customized_skills permanently (builtin cannot be deleted)."""
        skill_dir = get_customized_skills_dir(self.workspace_dir) / name
        if not skill_dir.exists():
            logger.debug("Skill '%s' not found in customized_skills.", name)
            return False
        try:
            shutil.rmtree(skill_dir)
            logger.debug("Deleted skill '%s' from customized_skills.", name)
            return True
        except Exception as e:
            logger.error("Failed to delete skill '%s': %s", name, e)
            return False

    # -- File loading --

    def load_skill_file(self, skill_name: str, file_path: str, source: str) -> str | None:
        """Load a file from a skill's references/ or scripts/ directory.

        Validates path prefix and prevents path traversal.
        """
        valid_sources = {"builtin", "customized"}
        if source not in valid_sources:
            logger.error("Invalid source '%s'. Must be 'builtin' or 'customized'.", source)
            return None

        normalized = file_path.replace("\\", "/")

        # Must start with references/ or scripts/
        allowed_prefixes = ("references/", "scripts/")
        if not any(normalized.startswith(p) for p in allowed_prefixes):
            logger.error("Invalid file_path '%s'. Must start with references/ or scripts/.", file_path)
            return None

        # Prevent path traversal
        if ".." in normalized or normalized.startswith("/"):
            logger.error("Invalid file_path '%s': path traversal not allowed.", file_path)
            return None

        base_dirs = {
            "customized": get_customized_skills_dir(self.workspace_dir),
            "builtin": get_builtin_skills_dir(),
        }
        skill_dir = base_dirs[source] / skill_name
        full_path = skill_dir / normalized

        if not skill_dir.exists() or not full_path.exists() or not full_path.is_file():
            return None

        try:
            return full_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.error("Failed to read file '%s' from skill '%s': %s", file_path, skill_name, e)
            return None
