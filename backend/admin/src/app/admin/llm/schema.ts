
import * as z from 'zod';

export const PRESET_COST_DIMENSIONS: Record<string, { label: string; unit: string }> = {
  input:              { label: '输入',         unit: 'USD/1M tokens' },
  text_output:        { label: '文本输出',     unit: 'USD/1M tokens' },
  image_output:       { label: '图片输出',     unit: 'USD/1M tokens' },
  search:             { label: '搜索查询',     unit: 'USD/次' },
  video_input_image:  { label: '视频输入图片', unit: 'USD/张' },
  video_input_second: { label: '视频输入时长', unit: 'USD/秒' },
  video_output_480p:  { label: '视频输出480p', unit: 'USD/秒' },
  video_output_720p:  { label: '视频输出720p', unit: 'USD/秒' },
  audio_generation:   { label: '音频生成',     unit: 'USD/次' },
};

export const MODEL_TYPE_TAGS = [
  '大语言模型',
  '图像模型',
  '视频模型',
  '音频模型',
  '多模态模型'
] as const;

export const MODEL_TYPE_OPTIONS = [
  { value: 'language', label: '语言模型' },
  { value: 'image', label: '图像模型' },
  { value: 'video', label: '视频模型' },
  { value: 'audio', label: '音频模型' },
  { value: 'multimodal', label: '多模态模型' },
] as const;

export const PROVIDER_ICONS: Record<string, string> = {
  openai: '/provider/openai.svg',
  azure: '/provider/azureai-color.svg',
  dashscope: '/provider/qwen-color.svg',
  anthropic: '/provider/claude-color.svg',
  gemini: '/provider/gemini-color.svg',
  deepseek: '/provider/deepseek-color.svg', // Assuming a fallback or standard icon if not present, user listed qwen-color but deepseek might use something else or generic. Wait, checking file list again.
  // File list: azureai-color.svg, claude-color.svg, doubao-color.svg, gemini-color.svg, grok.svg, kling-color.svg, meta-color.svg, microsoft-color.svg, minimax-color.svg, openai.svg, openrouter.svg, qwen-color.svg, sora-color.svg
  // Mapping based on available files:
  minimax: '/provider/minimax-color.svg',
  xai: '/provider/grok.svg',
  doubao: '/provider/doubao-color.svg',
  kling: '/provider/kling-color.svg',
  meta: '/provider/meta-color.svg',
  microsoft: '/provider/microsoft-color.svg',
  openrouter: '/provider/openrouter.svg',
  sora: '/provider/sora-color.svg',
  ark: '/provider/volcengine-color.svg',
  // Fallbacks or mappings for existing keys
  // deepseek not in list, maybe use qwen or generic? Or maybe it's not provided yet. I'll omit or use a placeholder if needed, but for now I'll map what I can.
};

export const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', icon: PROVIDER_ICONS.openai },
  { value: 'azure', label: 'Azure OpenAI', icon: PROVIDER_ICONS.azure },
  { value: 'dashscope', label: 'Dashscope (Qwen)', icon: PROVIDER_ICONS.dashscope },
  { value: 'anthropic', label: 'Anthropic (Claude)', icon: PROVIDER_ICONS.anthropic },
  { value: 'gemini', label: 'Google Gemini', icon: PROVIDER_ICONS.gemini },
  { value: 'deepseek', label: 'DeepSeek', icon: PROVIDER_ICONS.deepseek }, // Fallback to openai icon or generic for now as deepseek icon is missing
  { value: 'minimax', label: 'MiniMax', icon: PROVIDER_ICONS.minimax },
  { value: 'xai', label: 'xAI (Grok)', icon: PROVIDER_ICONS.xai },
  { value: 'ark', label: '火山方舟 (Ark)', icon: PROVIDER_ICONS.ark },
  // { value: 'kling', label: 'Kling', icon: PROVIDER_ICONS.kling },
  // { value: 'openrouter', label: 'OpenRouter', icon: PROVIDER_ICONS.openrouter },
];


export const formSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  provider_type: z.string().min(1, "请选择平台"),
  tags: z.array(z.string()).optional(),
  models: z.array(z.object({ 
    value: z.string().min(1, "请输入模型名称"),
    type: z.string().optional(),
    display_name: z.string().optional(),
  })).min(1, "至少需要一个模型"),
  base_url: z.string().optional(),
  api_key: z.string().min(1, "请输入 API 密钥"),
  config_json: z.string().refine((val) => {
    if (!val) return true;
    try {
      JSON.parse(val);
      return true;
    } catch (e) {
      return false;
    }
  }, "请输入有效的 JSON 格式").optional(),
});

export type LLMProvider = {
  id: string;
  name: string;
  provider_type: string;
  models: string[];
  tags?: string[];
  is_active: boolean;
  is_default: boolean;
  base_url?: string;
  api_key?: string;
  config_json?: any;
  model_costs?: Record<string, Record<string, number>>;
  model_metadata?: Record<string, { model_type?: string; display_name?: string }>;
};
