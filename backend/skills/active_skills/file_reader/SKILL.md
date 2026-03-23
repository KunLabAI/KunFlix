---
name: file_reader
description: "Read and browse local text-based files. Uses read_file for content and list_directory for directory structure."
metadata:
  builtin_skill_version: "2.0"
---
# File Reader

Use this skill when the user asks to read, view, or summarize local text-based files.

## Supported File Types

Text formats: `.txt`, `.md`, `.json`, `.yaml/.yml`, `.csv/.tsv`, `.log`, `.sql`, `.ini`, `.toml`,
source code (`.py`, `.js`, `.ts`, `.html`, `.xml`, `.css`, `.go`, `.java`, `.rs`, etc.)

## How to Read Files

1. If the user mentions a directory or you need to explore, use `list_directory` first to see what's available.
2. Use `read_file` with the file path to fetch content.
3. For JSON/YAML: summarize top-level keys and important fields.
4. For CSV/TSV: show header + first few rows, then summarize columns.
5. For source code: explain the structure, key functions, and logic.

## Large Files

When a file exceeds 1000 lines, `read_file` returns a truncated result with a continuation hint.
Use `start_line` and `end_line` parameters to read specific sections:

- First read without range to see the beginning + total line count.
- Then request specific ranges based on user needs.

Example: `read_file(file_path="data.log", start_line=500, end_line=600)`

## Out of Scope

Do NOT handle with this skill (they require dedicated skills):

- PDF documents
- Office files (docx/xlsx/pptx)
- Images, audio, video
- Archives (zip/tar/gz)

## Safety

- Never execute or run files, only read them.
- Prefer reading the smallest necessary portion.
- If a file type is unsupported, tell the user and suggest alternatives.
