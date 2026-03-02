import * as z from 'zod';

// Gemini 3.1 配置 schema
const geminiImageConfigSchema = z.object({
  aspect_ratio: z.enum(["auto", "16:9", "4:3", "1:1", "3:4", "9:16"]).optional().nullable(),
  image_size: z.enum(["4K", "2K", "1024", "512", "auto"]).optional().nullable(),
  output_format: z.enum(["png", "jpeg", "webp"]).optional().nullable(),
  batch_count: z.number().min(1).max(8).optional().nullable(),
  max_person_images: z.number().min(0).max(4).optional().nullable(),
  max_object_images: z.number().min(0).max(10).optional().nullable(),
}).optional().nullable();

const geminiConfigSchema = z.object({
  thinking_level: z.enum(["high", "medium", "low", "minimal"]).optional().nullable(),
  media_resolution: z.enum(["ultra_high", "high", "medium", "low"]).optional().nullable(),
  image_generation_enabled: z.boolean().optional().default(false),
  image_config: geminiImageConfigSchema,
  google_search_enabled: z.boolean().optional().default(false),
  google_image_search_enabled: z.boolean().optional().default(false),
}).optional().nullable();

export const agentFormSchema = z.object({
  name: z.string().min(1, "请输入智能体名称").max(50, "最大长度50字符"),
  description: z.string().min(1, "请输入描述").max(500, "最大长度500字符"),
  provider_id: z.string().min(1, "请选择供应商"),
  model: z.string().min(1, "请选择模型"),
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
  // Leader configuration
  is_leader: z.boolean().optional().default(false),
  coordination_modes: z.array(z.string()).optional().default([]),
  member_agent_ids: z.array(z.string()).optional().default([]),
  max_subtasks: z.number().min(1).max(20).optional().default(10),
  enable_auto_review: z.boolean().optional().default(true),
  // Gemini 3.1 配置
  gemini_config: geminiConfigSchema,
}).refine((data) => {
  if (data.tools_enabled && (!data.tools || data.tools.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "启用工具时至少选择一个工具",
  path: ["tools"],
}).refine((data) => {
  if (data.is_leader && (!data.coordination_modes || data.coordination_modes.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Leader模式至少选择一种协作方式",
  path: ["coordination_modes"],
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;
