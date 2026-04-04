import * as z from 'zod';

const emptyStringToNull = (val: unknown) => {
  if (val === "" || val === "undefined") return null;
  return val;
};

// Gemini 3.1 配置 schema（仅保留思考、媒体、搜索相关字段）
const geminiConfigSchema = z.object({
  thinking_level: z.preprocess(emptyStringToNull, z.enum(["high", "medium", "low", "minimal"]).optional().nullable()),
  media_resolution: z.preprocess(emptyStringToNull, z.enum(["ultra_high", "high", "medium", "low"]).optional().nullable()),
  google_search_enabled: z.boolean().optional().default(false),
  google_image_search_enabled: z.boolean().optional().default(false),
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

// 视频生成配置 schema（Agent 级别仅需开关）
const videoGenConfigSchema = z.object({
  video_generation_enabled: z.boolean().optional().default(false),
}).optional().nullable();

// 上下文压缩配置 schema
const compactionConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
  provider_id: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  model: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  compact_ratio: z.number().min(0.5).max(0.95).optional().default(0.75),
  reserve_ratio: z.number().min(0.05).max(0.4).optional().default(0.15),
  tool_old_threshold: z.number().min(100).max(5000).optional().default(500),
  tool_recent_n: z.number().min(1).max(20).optional().default(5),
  max_summary_tokens: z.number().min(4096).max(131072).optional().default(4096),
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
  // 统一图像生成配置
  image_config: unifiedImageGenConfigSchema,
  image_credit_per_image: z.number().min(0, "不能为负数").default(0),
  // 视频生成配置
  video_config: videoGenConfigSchema,
  // 上下文压缩配置
  compaction_config: compactionConfigSchema,
}).refine((data) => {
  // 启用能力时，至少需要选择一个技能、启用图像/视频生成或画布工具
  const hasSkills = (data.tools?.length ?? 0) > 0;
  const hasImageGen = !!data.image_config?.image_generation_enabled;
  const hasVideoGen = !!data.video_config?.video_generation_enabled;
  const hasCanvas = (data.target_node_types?.length ?? 0) > 0;
  return !data.tools_enabled || hasSkills || hasImageGen || hasVideoGen || hasCanvas;
}, {
  message: "启用能力时至少开启一项工具或功能",
  path: ["tools"],
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;
