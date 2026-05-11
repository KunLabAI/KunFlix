// AudioGeneratePanel 共享常量

// Provider logo mapping — 与 VideoGeneratePanel 对齐
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
  suno: '/provider/suno.svg',
};

/** 音频面板专有 select 样式（复用 Video 面板样式） */
export const SELECT_CLS =
  'w-full h-7 rounded-md border border-border/50 bg-background px-2 text-[11px] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring';

export const SELECT_ARROW_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 6px center',
  paddingRight: '20px',
} as const;

/** 音频参考图上限（Lyria 多模态输入） */
export const MAX_REFERENCE_IMAGES = 4;

/** 判断是否 Lyria 系列模型（映射表驱动，避免 if 分支堆叠） */
export const LYRIA_MODEL_SET: ReadonlySet<string> = new Set([
  'lyria-3-clip-preview',
  'lyria-3-pro-preview',
]);

/** 仅 Pro 模型支持的能力集合 */
export const LYRIA_PRO_MODEL_SET: ReadonlySet<string> = new Set([
  'lyria-3-pro-preview',
]);

/** 默认提交参数 */
export const DEFAULT_OUTPUT_FORMAT: 'mp3' | 'wav' = 'mp3';
export const DEFAULT_BPM = 120;
