
import * as z from 'zod';
import type { TFunction } from 'i18next';
import { withBasePath } from '@/lib/utils';

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
  openai: withBasePath('/provider/openai.svg'),
  azure: withBasePath('/provider/azureai-color.svg'),
  dashscope: withBasePath('/provider/qwen-color.svg'),
  anthropic: withBasePath('/provider/claude-color.svg'),
  gemini: withBasePath('/provider/gemini-color.svg'),
  deepseek: withBasePath('/provider/deepseek-color.svg'),
  minimax: withBasePath('/provider/minimax-color.svg'),
  xai: withBasePath('/provider/grok.svg'),
  doubao: withBasePath('/provider/doubao-color.svg'),
  kling: withBasePath('/provider/kling-color.svg'),
  meta: withBasePath('/provider/meta-color.svg'),
  microsoft: withBasePath('/provider/microsoft-color.svg'),
  openrouter: withBasePath('/provider/openrouter.svg'),
  sora: withBasePath('/provider/sora-color.svg'),
  ark: withBasePath('/provider/volcengine-color.svg'),
  ollama: withBasePath('/provider/ollama.svg'),
  kimi: withBasePath('/provider/kimi-color.svg'),
};

// Provider brand labels come from the vendor itself (proper nouns), not translated.
// docsUrl 指向厂商官方 API Key / 开发者平台入口，供品牌卡片快捷跳转使用。
export const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', icon: PROVIDER_ICONS.openai, docsUrl: 'https://platform.openai.com/api-keys' },
  { value: 'azure', label: 'Azure OpenAI', icon: PROVIDER_ICONS.azure, docsUrl: 'https://oai.azure.com/portal' },
  { value: 'dashscope', label: 'Dashscope (Qwen)', icon: PROVIDER_ICONS.dashscope, docsUrl: 'https://bailian.console.aliyun.com/?apiKey=1' },
  { value: 'anthropic', label: 'Anthropic (Claude)', icon: PROVIDER_ICONS.anthropic, docsUrl: 'https://platform.claude.com/' },
  { value: 'gemini', label: 'Google Gemini', icon: PROVIDER_ICONS.gemini, docsUrl: 'https://aistudio.google.com/apikey' },
  { value: 'deepseek', label: 'DeepSeek', icon: PROVIDER_ICONS.deepseek, docsUrl: 'https://platform.deepseek.com/api_keys' },
  { value: 'minimax', label: 'MiniMax', icon: PROVIDER_ICONS.minimax, docsUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key' },
  { value: 'xai', label: 'xAI (Grok)', icon: PROVIDER_ICONS.xai, docsUrl: 'https://console.x.ai/' },
  { value: 'kimi', label: 'Kimi (Moonshot)', icon: PROVIDER_ICONS.kimi, docsUrl: 'https://platform.kimi.ai/' },
  { value: 'ark', label: '火山方舟 (Ark)', icon: PROVIDER_ICONS.ark, docsUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey' },
  { value: 'openrouter', label: 'OpenRouter', icon: PROVIDER_ICONS.openrouter, docsUrl: 'https://openrouter.ai/settings/keys' },
  { value: 'ollama', label: 'Ollama (Local)', icon: PROVIDER_ICONS.ollama, docsUrl: 'https://ollama.com/search' },
];

// 本地部署且无鉴权的供应商（如 Ollama）允许 api_key 为空
const PROVIDERS_WITHOUT_AUTH = new Set(['ollama']);

// base_url 必填的供应商：DashScope 百炼 Wan3.0 要求模型/Endpoint/API Key 同地域，
// 必须配置为 https://{业务空间ID}.{地域}.maas.aliyuncs.com
export const PROVIDERS_REQUIRE_BASE_URL = (providerType: string) =>
  (providerType || '').startsWith('dashscope');

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
  // 顶层 superRefine 根据 provider_type 动态决定是否必填
  api_key: z.string().optional().default(''),
  config_json: z.string().refine((val) => {
    if (!val) return true;
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, t('llm.form.validation.invalidJson')).optional(),
}).superRefine((data, ctx) => {
  // Ollama 等本地部署跳过 api_key 校验，其余供应商仍需非空
  !PROVIDERS_WITHOUT_AUTH.has(data.provider_type) && !data.api_key && ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['api_key'],
    message: t('llm.form.validation.apiKeyRequired'),
  });
  // DashScope 百炼: 同地域 Endpoint 必填
  PROVIDERS_REQUIRE_BASE_URL(data.provider_type) && !(data.base_url || '').trim() && ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['base_url'],
    message: t('llm.form.validation.baseUrlRequiredDashscope'),
  });
});

export type FormValues = {
  name: string;
  provider_type: string;
  tags?: string[];
  models: { value: string; type?: string; display_name?: string }[];
  base_url?: string;
  api_key?: string;
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
