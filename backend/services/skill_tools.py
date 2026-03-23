"""
Skill prompt builder — Tool Wrapper pattern implementation.

Architecture:
- System prompt contains a LIGHTWEIGHT skill index (name + description only)
- A `load_skill` meta-tool is registered alongside base execution tools
- Skills are tutorials: they teach the LLM when/how to use base tools
- load_skill returns the FULL SKILL.md content (instructions, examples, references)
- Normal conversations cost ~0 extra tokens; skill-heavy conversations load on demand
"""
import logging
from pathlib import Path

import frontmatter as fm

logger = logging.getLogger(__name__)

_SKILL_INDEX_HEADER = (
    "# Available Skills\n"
    "You have the following skills installed. "
    "Each skill is a tutorial that teaches you how to use your base tools "
    "(read_file, list_directory) for specific tasks.\n"
    "You MUST call `load_skill` BEFORE attempting any skill-related task — "
    "do NOT tell the user you cannot do it; load the skill first and follow its instructions.\n"
)

_SKILL_INDEX_ITEM = "- **{name}**: {description}"

_BASE_TOOLS_NOTE = (
    "\n## Base Tools\n"
    "- **read_file**: Read file content (supports line ranges)\n"
    "- **list_directory**: List directory structure\n"
)


def build_skill_prompt(
    skill_names: list[str],
    active_skills_dir: Path,
) -> str:
    """Build a lightweight skill index for the system prompt.

    Only includes skill name and one-line description — NOT the full body.
    The LLM uses load_skill() to fetch full content when needed.

    Args:
        skill_names: List of skill names to include.
        active_skills_dir: Path to the active_skills directory.

    Returns:
        Lightweight skill index string, or empty string if no skills found.
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

    return (_SKILL_INDEX_HEADER + "\n".join(items) + _BASE_TOOLS_NOTE) if items else ""


def load_skill_content(skill_name: str, active_skills_dir: Path) -> str:
    """Load the full SKILL.md content for a skill (called by load_skill tool).

    Returns the complete markdown body with instructions, examples, and references.

    Args:
        skill_name: The skill name to load.
        active_skills_dir: Path to the active_skills directory.

    Returns:
        Full SKILL.md content string, or error message if not found.
    """
    skill_md_path = active_skills_dir / skill_name / "SKILL.md"
    if not skill_md_path.exists():
        return f"Skill '{skill_name}' not found."

    try:
        post = fm.load(str(skill_md_path))
        name = str(post.get("name", skill_name))
        body = (post.content or "").strip()

        # List references if the directory exists
        refs_dir = active_skills_dir / skill_name / "references"
        refs_listing = ""
        if refs_dir.is_dir():
            ref_files = [f.name for f in refs_dir.iterdir() if f.is_file()]
            refs_listing = (
                "\n\n## References\n" + "\n".join(f"- {f}" for f in ref_files)
            ) if ref_files else ""

        logger.info("Loaded full skill content: %s (%d chars)", name, len(body))
        return f"# Skill: {name}\n\n{body}{refs_listing}"
    except Exception as exc:
        logger.error("Failed to load skill '%s': %s", skill_name, exc)
        return f"Error loading skill '{skill_name}': {exc}"


def build_load_skill_tool_def(skill_names: list[str]) -> dict:
    """Build the OpenAI-format tool definition for the load_skill meta-tool.

    The enum is restricted to only the skills configured for this agent.

    Args:
        skill_names: List of available skill names for the enum constraint.

    Returns:
        OpenAI-format tool definition dict.
    """
    return {
        "type": "function",
        "function": {
            "name": "load_skill",
            "description": (
                "Load detailed instructions for a specific skill that gives you new capabilities. "
                "You MUST call this before performing any skill-related task. "
                "After loading, follow the skill's instructions to complete the user's request."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "The name of the skill to load.",
                        "enum": skill_names,
                    }
                },
                "required": ["skill_name"],
            },
        },
    }
