"""Skill prompt builder — Tool Wrapper pattern implementation.

Architecture:
- System prompt contains a LIGHTWEIGHT skill index (name + description only)
- A `load_skill` meta-tool is registered alongside execution tools
- Skills are tutorials: they teach the LLM how to perform specific tasks
- load_skill returns the FULL SKILL.md content (instructions, examples, references)
- load_skill with file_path returns any file within the skill directory
- Normal conversations cost ~0 extra tokens; skill-heavy conversations load on demand

This module is INDEPENDENT of the tool_manager — skills and tools are
peer-level concepts orchestrated together by the chat generation layer.
"""
import logging
from pathlib import Path

import frontmatter as fm

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_SKILL_INDEX_HEADER = (
    "# Available Skills\n"
    "You have the following skills installed. "
    "Each skill is a tutorial that teaches you how to perform specific tasks.\n"
    "You MUST call `load_skill` BEFORE attempting any skill-related task — "
    "do NOT tell the user you cannot do it; load the skill first and follow its instructions.\n"
    "When a skill is no longer needed for the current task, call `load_skill` with "
    "`action: \"unload\"` to release it and reduce context noise.\n"
)

_SKILL_INDEX_ITEM = "- **{name}**: {description}"


# ---------------------------------------------------------------------------
# Skill prompt builder
# ---------------------------------------------------------------------------

def build_skill_prompt(
    skill_names: list[str],
    active_skills_dir: Path,
) -> str:
    """Build a lightweight skill index for the system prompt.

    Only includes skill name and one-line description — NOT the full body.
    The LLM uses load_skill() to fetch full content when needed.
    """
    items: list[str] = []

    for skill_name in skill_names:
        skill_md_path = active_skills_dir / skill_name / "SKILL.md"
        skill_md_path.exists() or logger.debug("SKILL.md not found for '%s', skipping", skill_name)
        if not skill_md_path.exists():
            continue

        try:
            post = fm.load(str(skill_md_path))
            name = str(post.get("name", skill_name))
            description = str(post.get("description", ""))
            items.append(_SKILL_INDEX_ITEM.format(name=name, description=description))
            logger.info("Indexed skill: %s", name)
        except Exception as exc:
            logger.warning("Failed to index skill '%s': %s", skill_name, exc)

    return (_SKILL_INDEX_HEADER + "\n".join(items)) if items else ""


# ---------------------------------------------------------------------------
# Skill content loader
# ---------------------------------------------------------------------------

def load_skill_content(skill_name: str, active_skills_dir: Path, file_path: str | None = None) -> str:
    """Load skill content — either SKILL.md or a specific file.

    - file_path=None → load SKILL.md (main tutorial) + list available files
    - file_path="xxx" → load that specific file from the skill directory
    """
    # Route to file loader when file_path is provided
    if file_path:
        return _load_skill_file(skill_name, file_path, active_skills_dir)

    skill_md_path = active_skills_dir / skill_name / "SKILL.md"
    if not skill_md_path.exists():
        return f"Skill '{skill_name}' not found."

    try:
        post = fm.load(str(skill_md_path))
        name = str(post.get("name", skill_name))
        body = (post.content or "").strip()

        # List all sub-files in the skill directory (excluding SKILL.md itself)
        skill_dir = active_skills_dir / skill_name
        sub_files = _collect_skill_files(skill_dir, skill_dir)
        files_listing = (
            "\n\n## Skill Files\n"
            "The following files are available in this skill. "
            "Call `load_skill` again with `file_path` parameter to read their content.\n"
            + "\n".join(f"- `{f}`" for f in sub_files)
        ) if sub_files else ""

        logger.info("Loaded full skill content: %s (%d chars)", name, len(body))
        return f"# Skill: {name}\n\n{body}{files_listing}"
    except Exception as exc:
        logger.error("Failed to load skill '%s': %s", skill_name, exc)
        return f"Error loading skill '{skill_name}': {exc}"


def _collect_skill_files(directory: Path, base_dir: Path) -> list[str]:
    """Recursively collect all files under a skill directory, returning relative paths.

    Excludes SKILL.md (already loaded as main content).
    """
    files: list[str] = []
    if not directory.exists() or not directory.is_dir():
        return files
    for item in sorted(directory.iterdir()):
        rel_path = str(item.relative_to(base_dir)).replace("\\", "/")
        (item.is_file() and item.name != "SKILL.md") and files.append(rel_path)
        item.is_dir() and files.extend(_collect_skill_files(item, base_dir))
    return files


# ---------------------------------------------------------------------------
# Skill file loader (internal)
# ---------------------------------------------------------------------------

def _load_skill_file(
    skill_name: str, file_path: str, active_skills_dir: Path,
) -> str:
    """Load any file from a skill's directory.

    Prevents path traversal and restricts access to within the skill directory.
    """
    normalized = file_path.replace("\\", "/").strip().strip("/")

    # Prevent path traversal
    if ".." in normalized:
        return "Error: path traversal ('..') is not allowed in file_path."

    # SKILL.md is loaded without file_path
    if normalized == "SKILL.md":
        return load_skill_content(skill_name, active_skills_dir)

    skill_dir = active_skills_dir / skill_name
    if not skill_dir.exists():
        return f"Skill '{skill_name}' not found."

    full_path = (skill_dir / normalized).resolve()

    # Ensure resolved path is still within the skill directory
    if not str(full_path).startswith(str(skill_dir.resolve())):
        return "Error: access denied \u2014 path escapes skill directory."

    if not full_path.exists() or not full_path.is_file():
        return f"File '{file_path}' not found in skill '{skill_name}'."

    try:
        content = full_path.read_text(encoding="utf-8")
        logger.info(
            "Loaded skill file: %s/%s (%d chars)",
            skill_name, normalized, len(content),
        )
        return f"# {normalized}\n\n{content}"
    except Exception as exc:
        logger.error(
            "Failed to read '%s' from skill '%s': %s",
            file_path, skill_name, exc,
        )
        return f"Error reading file '{file_path}': {exc}"


# ---------------------------------------------------------------------------
# Tool definition builder
# ---------------------------------------------------------------------------

def build_load_skill_tool_def(skill_names: list[str]) -> dict:
    """Build the OpenAI-format tool definition for the load_skill meta-tool.

    Unified tool: loads SKILL.md by default, or any file when file_path is given.
    Supports action="unload" to release a previously loaded skill and remove its
    gated tools from the active schema — reducing context noise in long sessions.
    The enum covers ALL configured skills (not just remaining ones).
    """
    clean_skill_names = [name.strip() for name in skill_names]
    return {
        "type": "function",
        "function": {
            "name": "load_skill",
            "description": (
                "Load or unload a skill. "
                "action=\"load\" (default): loads the skill tutorial (SKILL.md) and lists available files. "
                "action=\"unload\": releases a previously loaded skill and removes its associated tools. "
                "With file_path (load only): loads the specified file's full content. "
                "You MUST call this (action=\"load\") before performing any skill-related task. "
                "Call with action=\"unload\" when the skill is no longer needed to keep context focused."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "The name of the skill.",
                        "enum": clean_skill_names,
                    },
                    "action": {
                        "type": "string",
                        "description": (
                            "Whether to load or unload the skill. "
                            "Use \"unload\" to release a skill that is no longer needed."
                        ),
                        "enum": ["load", "unload"],
                        "default": "load",
                    },
                    "file_path": {
                        "type": "string",
                        "description": (
                            "Optional. Only used with action=\"load\". "
                            "Relative path to a file within the skill directory. "
                            "When omitted, loads the skill's main tutorial (SKILL.md). "
                            "When provided, loads that specific file. "
                            "Example: 'references/guide.md'"
                        ),
                    },
                },
                "required": ["skill_name"],
            },
        },
    }
