
import * as z from 'zod';
import type { TFunction } from 'i18next';

export const PRESET_COST_DIMENSIONS: Record<string, { labelKey: string; unit: string }> = {
  input:              { labelKey: 'llm.costDimension.input',              unit: 'USD/1M tokens' },
  text_output:        { labelKey: 'llm.costDimension.text_output',        unit: 'USD/1M tokens' },
  image_output:       { labelKey: 'llm.costDimension.image_output',       unit: 'USD/1M tokens' },
  search:             { labelKey: 'llm.costDimension.search',             unit: 'USD/次' },
  video_input_image:  { labelKey: 'llm.costDimension.video_input_image',  unit: 'USD/张' },
  video_input_second: { labelKey: 'llm.costDimension.video_input_second', unit: 'USD/秒' },
  video_output_480p:  { labelKey: 'llm.costDimension.video_output_480p',  unit: 'USD/秒' },
  video_output_720p:  { labelKey: 'llm.costDimension.video_output_720p',  unit: 'USD/秒' },
  audio_generation:   { labelKey: 'llm.costDimension.audio_generation',   unit: 'USD/次' },
};

export const MODEL_TYPE_TAGS = [
  '大语言模型',
  '图像模型',
  '视频模型',
  '音频模型',
  '多模态模型'
] as const;

export const MODEL_TYPE_OPTIONS = [
  { value: 'language', labelKey: 'llm.modelType.language' },
  { value: 'image', labelKey: 'llm.modelType.image' },
  { value: 'video', labelKey: 'llm.modelType.video' },
  { value: 'audio', labelKey: 'llm.modelType.audio' },
  { value: 'multimodal', labelKey: 'llm.modelType.multimodal' },
] as const;

export const PROVIDER_ICONS: Record<string, string> = {
  openai: '/provider/openai.svg',
  azure: '/provider/azureai-color.svg',
  dashscope: '/provider/qwen-color.svg',
  anthropic: '/provider/claude-color.svg',
  gemini: '/provider/gemini-color.svg',
  deepseek: '/provider/deepseek-color.svg',
  minimax: '/provider/minimax-color.svg',
  xai: '/provider/grok.svg',
  doubao: '/provider/doubao-color.svg',
  kling: '/provider/kling-color.svg',
  meta: '/provider/meta-color.svg',
  microsoft: '/provider/microsoft-color.svg',
  openrouter: '/provider/openrouter.svg',
  sora: '/provider/sora-color.svg',
  ark: '/provider/volcengine-color.svg',
};

// Provider brand labels come from the vendor itself (proper nouns), not translated.
export const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', icon: PROVIDER_ICONS.openai },
  { value: 'azure', label: 'Azure OpenAI', icon: PROVIDER_ICONS.azure },
  { value: 'dashscope', label: 'Dashscope (Qwen)', icon: PROVIDER_ICONS.dashscope },
  { value: 'anthropic', label: 'Anthropic (Claude)', icon: PROVIDER_ICONS.anthropic },
  { value: 'gemini', label: 'Google Gemini', icon: PROVIDER_ICONS.gemini },
  { value: 'deepseek', label: 'DeepSeek', icon: PROVIDER_ICONS.deepseek },
  { value: 'minimax', label: 'MiniMax', icon: PROVIDER_ICONS.minimax },
  { value: 'xai', label: 'xAI (Grok)', icon: PROVIDER_ICONS.xai },
  { value: 'ark', label: '火山方舟 (Ark)', icon: PROVIDER_ICONS.ark },
];

export const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('llm.form.validation.nameRequired')),
  provider_type: z.string().min(1, t('llm.form.validation.providerRequired')),
  tags: z.array(z.string()).optional(),
  models: z.array(z.object({
    value: z.string().min(1, t('llm.form.validation.modelNameRequired')),
    type: z.string().optional(),
    display_name: z.string().optional(),
  })).min(1, t('llm.form.validation.modelsRequired')),
  base_url: z.string().optional(),
  api_key: z.string().min(1, t('llm.form.validation.apiKeyRequired')),
  config_json: z.string().refine((val) => {
    if (!val) return true;
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, t('llm.form.validation.invalidJson')).optional(),
});

export type FormValues = {
  name: string;
  provider_type: string;
  tags?: string[];
  models: { value: string; type?: string; display_name?: string }[];
  base_url?: string;
  api_key: string;
  config_json?: string;
};

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
