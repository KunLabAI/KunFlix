// ---------------------------------------------------------------------------
// Video Model Capabilities
// ---------------------------------------------------------------------------

export interface VideoModelCapabilities {
  provider: string;
  modes: ('text_to_video' | 'image_to_video' | 'edit' | 'subject_reference')[];
  durations: number[];
  resolutions: string[];
  supports_first_frame: boolean;
  supports_last_frame: boolean;
  supports_prompt_optimizer: boolean;
  supports_fast_pretreatment: boolean;
  aspect_ratios: string[];
}

// 视频模式标签映射
export const VIDEO_MODE_LABELS: Record<string, string> = {
  text_to_video: '文字生成视频',
  image_to_video: '图片生成视频',
  edit: '视频编辑',
  subject_reference: '主题参考生成',
};

// 分辨率标签映射
export const RESOLUTION_LABELS: Record<string, string> = {
  '480p': '480p (流畅)',
  '512p': '512p',
  '720p': '720p (高清)',
  '768p': '768p',
  '1080p': '1080p (全高清)',
};

// 画面比例标签映射
export const ASPECT_RATIO_LABELS: Record<string, string> = {
  '16:9': '16:9 (横屏)',
  '9:16': '9:16 (竖屏)',
  '1:1': '1:1 (方形)',
};

// 默认能力配置（当模型未定义时使用）
export const DEFAULT_VIDEO_CAPABILITIES: VideoModelCapabilities = {
  provider: 'unknown',
  modes: ['text_to_video', 'image_to_video', 'edit'],
  durations: [6, 10],
  resolutions: ['480p', '720p'],
  supports_first_frame: true,
  supports_last_frame: false,
  supports_prompt_optimizer: false,
  supports_fast_pretreatment: false,
  aspect_ratios: ['16:9', '9:16', '1:1'],
};
