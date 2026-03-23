"""
Base execution tools — read_file, list_directory.

Architecture:
- Execution functions: actual file/directory operations
- Tool definitions: OpenAI-format dicts for LLM registration
- Dispatcher: lookup-map based routing (no if chains)
"""
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_MAX_LINES = 1000
_MAX_BYTES = 30 * 1024  # 30 KB
_MAX_DIR_ENTRIES = 200

# ---------------------------------------------------------------------------
# Path validation
# ---------------------------------------------------------------------------

def _validate_path(raw_path: str) -> tuple[Path, str | None]:
    """Resolve *raw_path* and reject path-traversal attempts.

    Returns (resolved_path, error_string_or_None).
    """
    has_traversal = ".." in raw_path.replace("\\", "/").split("/")
    error = f"Path rejected: '..' segment not allowed in '{raw_path}'" if has_traversal else None
    resolved = Path(raw_path).expanduser().resolve()
    return resolved, error


# ---------------------------------------------------------------------------
# Execution functions
# ---------------------------------------------------------------------------

def _exec_read_file(args: dict) -> str:
    file_path: str = args.get("file_path", "")
    start_line: int | None = args.get("start_line")
    end_line: int | None = args.get("end_line")

    resolved, err = _validate_path(file_path)
    return err or _read_file_impl(resolved, start_line, end_line)


def _read_file_impl(path: Path, start_line: int | None, end_line: int | None) -> str:
    """Core read logic after validation."""
    exists = path.exists() and path.is_file()
    return _do_read(path, start_line, end_line) if exists else f"Error: '{path}' does not exist or is not a file."


def _do_read(path: Path, start_line: int | None, end_line: int | None) -> str:
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        return f"Error reading '{path}': {exc}"

    lines = raw.splitlines(keepends=True)
    total = len(lines)

    # Apply line range (1-based inclusive)
    sl = max(1, start_line or 1)
    el = min(total, end_line or total)
    selected = lines[sl - 1 : el]

    # Truncation check
    content = "".join(selected)
    line_count = len(selected)
    truncated = line_count > _MAX_LINES or len(content.encode("utf-8")) > _MAX_BYTES

    display_lines = selected[:_MAX_LINES] if truncated else selected
    display_content = "".join(display_lines)
    # Further truncate by bytes
    encoded = display_content.encode("utf-8")
    byte_truncated = len(encoded) > _MAX_BYTES
    display_content = encoded[:_MAX_BYTES].decode("utf-8", errors="ignore") if byte_truncated else display_content

    # Format with line numbers
    numbered = []
    for i, line in enumerate(display_content.splitlines(keepends=True), start=sl):
        numbered.append(f"{i:>6}\t{line}")
    result = "".join(numbered)

    # Continuation hint
    remaining = total - el
    shown = len(display_content.splitlines())
    hint = ""
    hint_needed = truncated or remaining > 0
    hint = (
        f"\n[Showing lines {sl}-{sl + shown - 1} of {total} total. "
        f"Use start_line/end_line to read other sections.]"
    ) if hint_needed else ""

    return f"File: {path}\nTotal lines: {total}\n\n{result}{hint}"


def _exec_list_directory(args: dict) -> str:
    dir_path: str = args.get("path", ".")
    resolved, err = _validate_path(dir_path)
    return err or _list_dir_impl(resolved)


def _list_dir_impl(path: Path) -> str:
    exists = path.exists() and path.is_dir()
    return _do_list(path) if exists else f"Error: '{path}' does not exist or is not a directory."


def _do_list(path: Path) -> str:
    try:
        entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except Exception as exc:
        return f"Error listing '{path}': {exc}"

    total = len(entries)
    visible = entries[:_MAX_DIR_ENTRIES]

    lines: list[str] = [f"Directory: {path}  ({total} entries)\n"]
    for entry in visible:
        tag = "[DIR] " if entry.is_dir() else "[FILE]"
        size_str = f"  ({_human_size(entry.stat().st_size)})" if entry.is_file() else ""
        lines.append(f"  {tag} {entry.name}{size_str}")

    overflow = total - _MAX_DIR_ENTRIES
    (overflow > 0) and lines.append(f"\n[{overflow} more entries not shown]")

    return "\n".join(lines)


def _human_size(nbytes: int) -> str:
    """Format bytes into human-readable size."""
    _THRESHOLDS = [(1 << 30, "GB"), (1 << 20, "MB"), (1 << 10, "KB")]
    return next(
        (f"{nbytes / t:.1f} {u}" for t, u in _THRESHOLDS if nbytes >= t),
        f"{nbytes} B",
    )


# ---------------------------------------------------------------------------
# Tool definitions (OpenAI format)
# ---------------------------------------------------------------------------

def build_base_tool_defs() -> list[dict]:
    """Return OpenAI-format tool definitions for all base tools."""
    return [
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": (
                    "Read the contents of a file. Returns text with line numbers. "
                    "For large files, use start_line/end_line to read specific sections."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {
                            "type": "string",
                            "description": "Path to the file to read.",
                        },
                        "start_line": {
                            "type": "integer",
                            "description": "Start line number (1-based, inclusive). Optional.",
                        },
                        "end_line": {
                            "type": "integer",
                            "description": "End line number (1-based, inclusive). Optional.",
                        },
                    },
                    "required": ["file_path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_directory",
                "description": (
                    "List files and subdirectories in a directory. "
                    "Shows type markers ([DIR]/[FILE]) and file sizes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the directory to list.",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
    ]


# ---------------------------------------------------------------------------
# Dispatcher (lookup map)
# ---------------------------------------------------------------------------

_EXECUTORS: dict[str, callable] = {
    "read_file": _exec_read_file,
    "list_directory": _exec_list_directory,
}

BASE_TOOL_NAMES: frozenset[str] = frozenset(_EXECUTORS)


def execute_base_tool(tool_name: str, arguments: dict) -> str:
    """Execute a base tool by name. Returns result string."""
    executor = _EXECUTORS.get(tool_name)
    result = executor(arguments) if executor else f"Unknown tool: {tool_name}"
    logger.info("execute_base_tool(%s) -> %d chars", tool_name, len(result))
    return result
