---
name: canvas_tools
description: "Canvas node and edge CRUD operations. Provides tools to manage theater canvas nodes and connections between them."
metadata:
  builtin_skill_version: "1.2"
---
# Canvas Tools

Use this skill when the user asks to view, create, update, or delete content on the theater canvas (nodes and edges).

Loading this skill activates 8 tools across two categories:

## Quick Reference

| Tool | Purpose |
|------|---------|
| `list_canvas_nodes` | List all nodes (optionally filter by type) |
| `get_canvas_node` | Get full node details by ID |
| `create_canvas_node` | Create a new node |
| `update_canvas_node` | Update node data (incremental merge) |
| `delete_canvas_node` | Delete a node and its edges |
| `list_canvas_edges` | List all edges |
| `create_canvas_edge` | Connect two nodes |
| `delete_canvas_edge` | Remove a connection |

---

## Node Types & Field Reference

Available node types depend on agent configuration. Below are all supported types and their data fields.

### text — 文本节点
For scripts, copy, ads, and written content. Supports Markdown.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Node title |
| `content` | string | on create | Markdown body. Supports `#/##/###` headings, `**bold**`, `*italic*`, code blocks, lists. **Omit when updating if unchanged** to save tokens. |
| `tags` | string[] | no | Tags for categorization |

### image — 图像节点
For character designs, scenes, posters, and visual content.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Image name |
| `description` | string | yes | Scene/character description |
| `imageUrl` | string | no | Image URL (e.g. `/api/media/xxx.jpg`). Supports JPEG/PNG/WebP. |
| `fitMode` | string | no | `"cover"` (fill) or `"contain"` (fit) |

### video — 视频节点
For animations, short films, and motion content.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Video name |
| `description` | string | yes | Scene/duration description |
| `videoUrl` | string | no | Video URL (e.g. `/api/media/xxx.mp4`). Supports MP4. |
| `fitMode` | string | no | `"cover"` (fill) or `"contain"` (fit) |

### audio — 音频节点
For background music, sound effects, voiceover, and audio content.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Audio name |
| `description` | string | yes | Style/purpose description |
| `audioUrl` | string | no | Audio URL (e.g. `/api/media/xxx.mp3`). Supports MP3/WAV/OGG. |
| `lyrics` | string | no | Lyrics text |

### storyboard — 分镜/多维表格节点
For shot breakdowns and multi-dimensional table content. **Supports embedding media (images, videos, audio) in table cells.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `shotNumber` | string | no | Shot number (e.g. `"1-1"`, `"2-3"`) |
| `description` | string | no | Shot description |
| `duration` | integer | no | Duration in seconds |
| `tableColumns` | array | yes (for table) | Column definitions. Each item: `{key, label, type}`. |
| `tableData` | array | yes (for table) | Row data. Each item is an object matching column keys. |

**Column `type` options:**
- `"text"` — plain text cell
- `"number"` — numeric cell
- `"image"` — renders image thumbnail from URL; click to preview full-size
- `"video"` — renders video thumbnail with play icon; click to preview
- `"audio"` — renders audio play button; click to play in full-screen player

Media cell values should be `/api/media/xxx.ext` paths or full URLs.

**Example — storyboard with media columns:**
```json
{
  "tableColumns": [
    {"key": "scene", "label": "场景", "type": "text"},
    {"key": "duration", "label": "时长", "type": "number"},
    {"key": "ref_image", "label": "参考图", "type": "image"},
    {"key": "ref_video", "label": "参考视频", "type": "video"},
    {"key": "bgm", "label": "背景音乐", "type": "audio"}
  ],
  "tableData": [
    {
      "scene": "城市夜景",
      "duration": 5,
      "ref_image": "/api/media/abc.jpg",
      "ref_video": "/api/media/xyz.mp4",
      "bgm": "/api/media/music.mp3"
    }
  ]
}
```

---

## Tool Usage Guide

### list_canvas_nodes

List all nodes. Returns summaries with `id`, `node_type`, `position`, and key fields (e.g. `title` for text, `name` for image/video/audio, `shotNumber` for storyboard).

**Always call this first** to understand what exists before creating or modifying.

Parameters:
- `node_type` (string, optional) — filter by type

### get_canvas_node

Get complete node data. Use when you need full field details (e.g. content text, media URLs, table data).

Parameters:
- `node_id` (string, required) — node UUID from `list_canvas_nodes`

### create_canvas_node

Create a new node. Position is auto-calculated (placed to the right of existing nodes) if omitted.

Parameters:
- `node_type` (string, required)
- `data` (object, required) — fields matching the node type schema above
- `position_x` (number, optional)
- `position_y` (number, optional)

**Examples:**
```
create_canvas_node(
  node_type="text",
  data={"title": "第一章", "content": "# 开头\n\n故事开始...", "tags": ["大纲"]}
)

create_canvas_node(
  node_type="image",
  data={"name": "主角立绘", "description": "18岁，性格开朗"}
)

create_canvas_node(
  node_type="audio",
  data={"name": "背景音乐", "description": "城市夜景氛围钢琴曲"}
)
```

### update_canvas_node

Incremental merge — only provide fields you want to change. Unmentioned fields remain unchanged.

Parameters:
- `node_id` (string, required)
- `data` (object, required) — partial fields to update

**Example:**
```
update_canvas_node(
  node_id="uuid-here",
  data={"title": "修改后的标题", "tags": ["已修订"]}
)
```

### delete_canvas_node

Delete a node and automatically remove all connected edges.

Parameters:
- `node_id` (string, required)

### list_canvas_edges

List all connections. Returns `id`, `source_node_id`, `target_node_id`, `source_handle`, `target_handle`.

Use before creating edges to avoid duplicates.

### create_canvas_edge

Connect two nodes. Canvas flows left-to-right.

Parameters:
- `source_node_id` (string, required) — starting node
- `target_node_id` (string, required) — ending node
- `source_handle` (string, optional) — `"right-source"` (default, recommended) or `"left-source"`
- `target_handle` (string, optional) — `"left-target"` (default, recommended) or `"right-target"`

**Standard direction:** `right-source` → `left-target` (left-to-right flow). Always use this unless the user specifically requests a different layout.

**Example:**
```
create_canvas_edge(
  source_node_id="script-uuid",
  target_node_id="storyboard-uuid",
  source_handle="right-source",
  target_handle="left-target"
)
```

### delete_canvas_edge

Remove a connection between two nodes.

Parameters:
- `source_node_id` (string, required)
- `target_node_id` (string, required)

---

## Best Practices

1. **Always list before mutating** — call `list_canvas_nodes` to see current state before creating, updating, or deleting.
2. **Omit position** — let the system auto-place nodes unless the user specifies coordinates.
3. **Minimal updates** — only include changed fields in `update_canvas_node` to minimize payload.
4. **Check edges first** — use `list_canvas_edges` before creating connections to avoid duplicates.
5. **Standard edge direction** — always use `right-source` → `left-target` for consistent left-to-right flow.
6. **Media references in storyboard** — when referencing existing canvas media in a storyboard table, use `get_canvas_node` to retrieve the media URL, then set it as the cell value for the corresponding `image`/`video`/`audio` column type.
7. **Node types are restricted** — you can only create/access node types allowed by the agent configuration.
