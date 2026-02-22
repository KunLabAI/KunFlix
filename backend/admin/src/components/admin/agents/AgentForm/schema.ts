import * as z from 'zod';

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
  input_credit_per_1k: z.number().min(0, "不能为负数").default(0),
  output_credit_per_1k: z.number().min(0, "不能为负数").default(0),
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
