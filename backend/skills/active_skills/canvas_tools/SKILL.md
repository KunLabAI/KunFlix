---
name: canvas_tools
description: "Canvas node CRUD operations. Provides tools to list, get, create, update, and delete theater canvas nodes."
metadata:
  builtin_skill_version: "1.0"
---
# Canvas Tools

Use this skill when the user asks to view, create, update, or delete content on the theater canvas (nodes).

Loading this skill activates the following tools:
- `list_canvas_nodes` — List all nodes on the canvas
- `get_canvas_node` — Get full details of a specific node
- `create_canvas_node` — Create a new node
- `update_canvas_node` — Update an existing node
- `delete_canvas_node` — Delete a node

## Node Types

The canvas supports these node types (available types depend on agent configuration):

### text
Text nodes for scripts, copy, ads, and other written content. Supports rich text (Markdown).

Fields:
- `title` (string, required) — Node title
- `content` (string, Markdown) — Body text. Supports headings (#/##/###), paragraphs, bold (**text**), italic (*text*), code blocks, etc. Required when creating; omit when updating if unchanged.
- `tags` (array, optional) — Tags for categorization

### image
Image nodes for character designs, scenes, posters, and visual content.

Fields:
- `name` (string) — Image name
- `description` (string) — Image description (scene, character info, etc.)
- `imageUrl` (string) — Image URL path (e.g. `/media/xxx.jpg`), supports JPEG/PNG/JPG
- `fitMode` (string) — "cover" (fill) or "contain" (fit)

### video
Video nodes for animations, short films, and motion content.

Fields:
- `name` (string) — Video name
- `description` (string) — Video description (scene, duration, etc.)
- `videoUrl` (string) — Video URL path (e.g. `/media/xxx.mp4`), supports MP4
- `fitMode` (string) — "cover" (fill) or "contain" (fit)

### storyboard
Storyboard nodes for shot breakdowns and multi-dimensional table content.

Fields:
- `shotNumber` (string) — Shot number (e.g. "1-1", "2-3")
- `description` (string) — Shot description
- `duration` (integer) — Duration in seconds
- `pivotConfig` (JSON) — Multi-dimensional table config with custom field types

## Tool: list_canvas_nodes

List all nodes on the canvas, optionally filtered by type.

Parameters:
- `node_type` (string, optional) — Filter by node type (e.g. "text", "image", "video", "storyboard")

Returns a list of node summaries (id, type, position, key fields).

## Tool: get_canvas_node

Get full details of a specific node.

Parameters:
- `node_id` (string, required) — ID of the node to retrieve

Returns complete node data including all fields, position, and metadata.

## Tool: create_canvas_node

Create a new node on the canvas.

Parameters:
- `node_type` (string, required) — Type of node to create
- `data` (object, required) — Node data matching the type's field schema
- `position_x` (number, optional) — X position. Auto-calculated if omitted.
- `position_y` (number, optional) — Y position. Auto-calculated if omitted.

Example — create a text node:
```
create_canvas_node(
  node_type="text",
  data={
    "title": "Chapter 1 Outline",
    "content": "# Chapter 1\n\nThe story begins...\n\n## Scene 1\n\nThe protagonist appears.",
    "tags": ["outline", "chapter1"]
  }
)
```

Example — create an image node:
```
create_canvas_node(
  node_type="image",
  data={
    "name": "Hero Portrait",
    "description": "Main character, age 18, cheerful personality",
    "imageUrl": "/media/generated-image.jpg",
    "fitMode": "cover"
  }
)
```

## Tool: update_canvas_node

Update an existing node's data.

Parameters:
- `node_id` (string, required) — ID of the node to update
- `data` (object, required) — Fields to update (partial update supported)

Example:
```
update_canvas_node(
  node_id="node-uuid-here",
  data={"title": "Updated Title", "tags": ["revised"]}
)
```

## Tool: delete_canvas_node

Delete a node from the canvas.

Parameters:
- `node_id` (string, required) — ID of the node to delete

## Tips

- Always use `list_canvas_nodes` first to see what exists before creating or modifying.
- When creating nodes, omit position to let the system auto-place them.
- Only include fields you want to change in `update_canvas_node`.
- Node types are restricted by agent configuration — you can only create/access allowed types.
