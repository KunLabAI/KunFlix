import * as z from 'zod';

const emptyStringToNull = (val: unknown) => {
  if (val === "" || val === "undefined") return null;
  return val;
};

// Gemini 3.1 配置 schema
const geminiImageConfigSchema = z.object({
  aspect_ratio: z.preprocess(emptyStringToNull, z.enum(["auto", "16:9", "4:3", "1:1", "3:4", "9:16"]).optional().nullable()),
  image_size: z.preprocess(emptyStringToNull, z.enum(["4K", "2K", "1024", "512", "auto"]).optional().nullable()),
  output_format: z.preprocess(emptyStringToNull, z.enum(["png", "jpeg", "webp"]).optional().nullable()),
  batch_count: z.preprocess(val => val === "" ? null : val, z.coerce.number().min(1).max(8).optional().nullable()),
  max_person_images: z.preprocess(val => val === "" ? null : val, z.coerce.number().min(0).max(4).optional().nullable()),
  max_object_images: z.preprocess(val => val === "" ? null : val, z.coerce.number().min(0).max(10).optional().nullable()),
}).optional().nullable();

const geminiConfigSchema = z.object({
  thinking_level: z.preprocess(emptyStringToNull, z.enum(["high", "medium", "low", "minimal"]).optional().nullable()),
  media_resolution: z.preprocess(emptyStringToNull, z.enum(["ultra_high", "high", "medium", "low"]).optional().nullable()),
  image_generation_enabled: z.boolean().optional().default(false),
  image_config: geminiImageConfigSchema,
  google_search_enabled: z.boolean().optional().default(false),
  google_image_search_enabled: z.boolean().optional().default(false),
}).optional().nullable();

// xAI 图像生成配置 schema
const xaiImageConfigSchema = z.object({
  aspect_ratio: z.preprocess(emptyStringToNull, z.enum([
    "1:1", "16:9", "9:16", "4:3", "3:4",
    "3:2", "2:3", "2:1", "1:2",
    "19.5:9", "9:19.5", "20:9", "9:20", "auto",
  ]).optional().nullable()),
  resolution: z.preprocess(emptyStringToNull, z.enum(["1k", "2k"]).optional().nullable()),
  n: z.preprocess(val => val === "" ? null : val, z.coerce.number().min(1).max(10).optional().nullable()),
  response_format: z.preprocess(emptyStringToNull, z.enum(["url", "b64_json"]).optional().nullable()),
}).optional().nullable();

const xaiImageGenConfigSchema = z.object({
  image_generation_enabled: z.boolean().optional().default(false),
  image_config: xaiImageConfigSchema,
}).optional().nullable();

// 统一图像生成配置 schema（供应商无关）
const unifiedImageConfigSchema = z.object({
  aspect_ratio: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  quality: z.preprocess(emptyStringToNull, z.enum(["standard", "hd", "ultra"]).optional().nullable()),
  batch_count: z.preprocess(val => val === "" ? null : val, z.coerce.number().min(1).max(10).optional().nullable()),
  output_format: z.preprocess(emptyStringToNull, z.enum(["png", "jpeg", "webp"]).optional().nullable()),
}).optional().nullable();

const unifiedImageGenConfigSchema = z.object({
  image_generation_enabled: z.boolean().optional().default(false),
  image_provider_id: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  image_model: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  image_config: unifiedImageConfigSchema,
}).optional().nullable();

export const agentFormSchema = z.object({
  name: z.string().min(1, "请输入智能体名称").max(50, "最大长度50字符"),
  description: z.string().min(1, "请输入描述").max(500, "最大长度500字符"),
  provider_id: z.string().min(1, "请选择供应商"),
  model: z.string().min(1, "请选择模型"),
  agent_type: z.enum(["text", "image", "multimodal", "video"]).default("text"),
  system_prompt: z.string().min(1, "请输入系统提示词").max(5000, "最大长度5000字符"),
  temperature: z.number().min(0).max(1),
  context_window: z.number().min(4096, "最小值为4096").max(262144, "最大值为262144"),
  thinking_mode: z.boolean().optional(),
  tools_enabled: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
  input_credit_per_1m: z.number().min(0, "不能为负数").default(0),
  output_credit_per_1m: z.number().min(0, "不能为负数").default(0),
  image_output_credit_per_1m: z.number().min(0, "不能为负数").default(0),
  search_credit_per_query: z.number().min(0, "不能为负数").default(0),
  // Video pricing
  video_input_image_credit: z.number().min(0, "不能为负数").default(0),
  video_input_second_credit: z.number().min(0, "不能为负数").default(0),
  video_output_480p_credit: z.number().min(0, "不能为负数").default(0),
  video_output_720p_credit: z.number().min(0, "不能为负数").default(0),
  // 画布节点控制
  target_node_types: z.array(
    z.enum(["script", "character", "storyboard", "video"])
  ).default([]),
  // Leader configuration
  is_leader: z.boolean().optional().default(false),
  coordination_modes: z.array(z.string()).optional().default(["unified"]),
  member_agent_ids: z.array(z.string()).optional().default([]),
  max_subtasks: z.number().min(1).max(20).optional().default(10),
  enable_auto_review: z.boolean().optional().default(true),
  // Gemini 3.1 配置
  gemini_config: geminiConfigSchema,
  // xAI 图像生成配置
  xai_image_config: xaiImageGenConfigSchema,
  // 统一图像生成配置
  image_config: unifiedImageGenConfigSchema,
  image_credit_per_image: z.number().min(0, "不能为负数").default(0),
}).refine((data) => {
  if (data.tools_enabled && (!data.tools || data.tools.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "启用工具时至少选择一个工具",
  path: ["tools"],
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;
