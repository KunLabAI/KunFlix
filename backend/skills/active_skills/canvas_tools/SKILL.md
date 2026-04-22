---
name: canvas_tools
description: "Canvas node and edge CRUD operations. Provides tools to manage theater canvas nodes and connections between them."
metadata:
  builtin_skill_version: "1.3"
---
# Canvas Tools

Use this skill when the user asks to view, create, update, or delete content on the theater canvas (nodes and edges).

Loading this skill activates 8 tools: `list_canvas_nodes`, `get_canvas_node`, `create_canvas_node`, `update_canvas_node`, `delete_canvas_node`, `list_canvas_edges`, `create_canvas_edge`, `delete_canvas_edge`.

---

## Node Types & Data Fields

### text — 文本节点
For scripts, copy, and written content. Supports Markdown.

| Field | Type | Notes |
|-------|------|-------|
| `title` | string | Required |
| `content` | string | Markdown body (`#`, `**bold**`, code blocks, lists). Required on create; **omit on update if unchanged**. |
| `tags` | string[] | Optional, for categorization |

### image — 图像节点
For character designs, scenes, posters.

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Required |
| `description` | string | Scene/character description |
| `imageUrl` | string | `/api/media/xxx.jpg` — JPEG/PNG/WebP |
| `fitMode` | string | `"cover"` or `"contain"` |

### video — 视频节点

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Required |
| `description` | string | Scene/duration description |
| `videoUrl` | string | `/api/media/xxx.mp4` — MP4 |
| `fitMode` | string | `"cover"` or `"contain"` |

### audio — 音频节点

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Required |
| `description` | string | Style/purpose description |
| `audioUrl` | string | `/api/media/xxx.mp3` — MP3/WAV/OGG |
| `lyrics` | string | Optional lyrics text |

### storyboard — 分镜/多维表格节点
For shot breakdowns and table content. **Supports embedding media in cells.**

| Field | Type | Notes |
|-------|------|-------|
| `shotNumber` | string | e.g. `"1-1"` |
| `description` | string | Shot description |
| `duration` | integer | Seconds |
| `tableColumns` | array | `[{key, label, type}]` — type: `"text"`, `"number"`, `"image"`, `"video"`, `"audio"` |
| `tableData` | array | `[{key: value, ...}]` — media cells use `/api/media/xxx.ext` paths |

---

## Positioning & Layout

Nodes live on an infinite 2D canvas. Each node has `position_x` (horizontal) and `position_y` (vertical), where **right = +X**, **down = +Y**.

### Auto-placement
When creating nodes **without** specifying position, the system places them automatically to the right of existing nodes, wrapping to new rows when space runs out. **Use auto-placement by default** unless the user requests a specific layout.

### Manual positioning
Both `create_canvas_node` and `update_canvas_node` accept optional `position_x` and `position_y` parameters (top-level, not inside `data`).

**Typical node sizes for spacing reference:**
- Standard node: ~420×300 px
- Horizontal gap: ~40–80 px
- Vertical gap: ~60–100 px

### Layout patterns
When the user asks to "arrange" or "rearrange" nodes:
1. Call `list_canvas_nodes` to get current positions and node list
2. Calculate new positions based on desired layout (grid, tree, flow, etc.)
3. Call `update_canvas_node` for each node with new `position_x` and `position_y`

**Common layouts:**
- **Horizontal flow:** nodes in a row, X increments by ~500, same Y
- **Grid:** rows of 3–4 nodes, X increments by ~500, Y increments by ~400 per row
- **Tree/hierarchy:** parent centered on top, children spread below

Example — move a node to a new position:
```
update_canvas_node(node_id="uuid", position_x=800, position_y=300)
```

Example — update both data and position:
```
update_canvas_node(node_id="uuid", data={"title": "New Title"}, position_x=100, position_y=200)
```

---

## Edge Conventions

Edges connect nodes left-to-right. Always use the standard direction:
- `source_handle`: `"right-source"` (default)
- `target_handle`: `"left-target"` (default)

Only deviate if the user explicitly requests a different flow direction.

---

## Return Values

| Tool | Returns |
|------|---------|
| `list_canvas_nodes` | `{count, nodes: [{id, node_type, position: {x, y}, ...key_fields}]}` |
| `get_canvas_node` | Full node object with all fields, position, dimensions |
| `create_canvas_node` | `{success: true, node: {full node object}}` |
| `update_canvas_node` | `{success: true, node: {full node object}}` |
| `delete_canvas_node` | `{success: true, deleted_node_id}` |
| `list_canvas_edges` | `{count, edges: [{id, source_node_id, target_node_id, ...}]}` |
| `create_canvas_edge` | `{success: true, edge: {edge object}}` |
| `delete_canvas_edge` | `{success: true, deleted_edge: {source, target}}` |

---

## Workflow Patterns

### Creating a set of connected nodes
```
1. create_canvas_node(type="text", data={...})           → get node_id_A
2. create_canvas_node(type="image", data={...})          → get node_id_B
3. create_canvas_edge(source=node_id_A, target=node_id_B)
```

### Rebuilding canvas (delete all, recreate)
```
1. list_canvas_nodes()                    → get all node IDs
2. delete_canvas_node(node_id=...) × N   → edges auto-deleted
3. create_canvas_node(...) × N           → new nodes
4. create_canvas_edge(...) × M           → new connections
```

### Rearranging existing nodes
```
1. list_canvas_nodes()                                  → get IDs and current positions
2. update_canvas_node(node_id=..., position_x=, position_y=) × N
```

### Referencing media across nodes
To embed an existing image/video/audio node's media in a storyboard table:
```
1. get_canvas_node(node_id="image-node-uuid")  → extract imageUrl
2. Use that URL as the cell value in storyboard tableData
```

---

## Best Practices

1. **List before mutate** — always call `list_canvas_nodes` first to understand current state.
2. **Auto-place by default** — omit position unless the user specifies coordinates or requests a layout.
3. **Minimal updates** — only include changed fields in `update_canvas_node`. Never re-send `content` on text nodes unless it changed.
4. **Check edges before connecting** — use `list_canvas_edges` to avoid duplicate connections.
5. **Position is top-level** — pass `position_x`/`position_y` as top-level parameters, not inside `data`.
6. **Batch awareness** — when creating multiple nodes, the system auto-places them in a grid. For custom layouts, create first, then rearrange with update calls.
7. **Node types are restricted** — you can only access node types allowed by the agent configuration.
