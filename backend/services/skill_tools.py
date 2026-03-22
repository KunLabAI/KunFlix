"""
Skill prompt builder — injects skill descriptions into the LLM system prompt.

CoPaw-aligned approach:
- Skills are NOT function-calling tools; they are knowledge/instruction documents
- SKILL.md content is injected into the system prompt so the LLM knows how to
  handle specialized tasks
- The LLM uses its own built-in tools (read_file, execute_shell_command, etc.)
  to carry out the instructions from SKILL.md
"""
import logging
from pathlib import Path

import frontmatter as fm

logger = logging.getLogger(__name__)

_SKILL_INSTRUCTION = (
    "# Agent Skills\n"
    "The agent skills are a collection of instructions, scripts, and resources "
    "that you can use to improve performance on specialized tasks. "
    "Each agent skill below includes its description and detailed instructions."
)

_SKILL_SECTION_TEMPLATE = "## {name}\n{description}\n\n{content}"


def build_skill_prompt(
    skill_names: list[str],
    active_skills_dir: Path,
) -> str:
    """Build a skill prompt section to inject into the system prompt.

    Reads each skill's SKILL.md, extracts its frontmatter (name, description)
    and markdown body, then assembles a combined prompt section.

    Args:
        skill_names: List of skill names to include.
        active_skills_dir: Path to the active_skills directory.

    Returns:
        Combined skill prompt string, or empty string if no skills loaded.
    """
    sections: list[str] = []

    for skill_name in skill_names:
        skill_md_path = active_skills_dir / skill_name / "SKILL.md"
        if not skill_md_path.exists():
            logger.debug("SKILL.md not found for '%s', skipping", skill_name)
            continue

        try:
            post = fm.load(str(skill_md_path))
            name = str(post.get("name", skill_name))
            description = str(post.get("description", ""))
            body = (post.content or "").strip()

            sections.append(_SKILL_SECTION_TEMPLATE.format(
                name=name,
                description=description,
                content=body,
            ))
            logger.info("Loaded skill prompt: %s", name)
        except Exception as exc:
            logger.warning("Failed to load SKILL.md for '%s': %s", skill_name, exc)

    return f"{_SKILL_INSTRUCTION}\n\n" + "\n\n".join(sections) if sections else ""
