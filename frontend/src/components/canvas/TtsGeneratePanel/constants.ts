// TtsGeneratePanel 共享常量（对齐 AudioGeneratePanel 设计体系）

// Provider logo 映射 —— 直接复用音频卡面板，保证图标一致
export { PROVIDER_ICONS } from '../AudioGeneratePanel/constants';

/** 下拉触发器样式（对齐 LyriaConfigPanel TRIGGER_CLS，主题变量驱动深浅色） */
export const TRIGGER_CLS =
  'w-full h-7 rounded-md bg-muted/50 px-2 text-[11px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring transition-colors hover:bg-muted/70';

/** 下拉浮层样式（主题变量驱动，自动适配深浅色） */
export const DROPDOWN_CLS =
  'absolute top-full left-0 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar';

/** 下拉选项样式（选中 / 未选中） */
export const OPTION_CLS =
  'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer';
export const OPTION_SELECTED_CLS = 'bg-primary/10 text-primary font-medium';
export const OPTION_IDLE_CLS = 'text-foreground hover:bg-accent';

/** 多说话人上限（Gemini TTS conversational 模式最多 2 人） */
export const MAX_SPEAKERS = 2;

/**
 * 20 种预设语气风格（speech_metadata.style，turn-level）。
 * value 为发送给模型的英文描述；labelKey 为 i18n 键，英文兜底 labelEn。
 * 参考 Gemini TTS 官方 Prompting guide：情绪/语速/音量/演绎方式属于 style 字段。
 */
export interface TtsStylePreset {
  value: string;
  labelEn: string;
  labelKey: string;
}

export const STYLE_PRESETS: TtsStylePreset[] = [
  { value: 'cheerful and friendly', labelEn: 'Cheerful & Friendly', labelKey: 'canvas.node.tts.styles.cheerfulFriendly' },
  { value: 'calm and relaxed', labelEn: 'Calm & Relaxed', labelKey: 'canvas.node.tts.styles.calmRelaxed' },
  { value: 'warm narrator tone', labelEn: 'Warm Narrator', labelKey: 'canvas.node.tts.styles.warmNarrator' },
  { value: 'whispering', labelEn: 'Whisper', labelKey: 'canvas.node.tts.styles.whisper' },
  { value: 'whispered urgently', labelEn: 'Urgent Whisper', labelKey: 'canvas.node.tts.styles.whisperedUrgently' },
  { value: 'podcast host, conversational and engaging', labelEn: 'Podcast Host', labelKey: 'canvas.node.tts.styles.podcastHost' },
  { value: 'documentary narration, neutral and clear', labelEn: 'Documentary Narration', labelKey: 'canvas.node.tts.styles.documentary' },
  { value: 'news anchor, professional and articulate', labelEn: 'News Anchor', labelKey: 'canvas.node.tts.styles.newsAnchor' },
  { value: 'audiobook storytelling, immersive and expressive', labelEn: 'Audiobook Storytelling', labelKey: 'canvas.node.tts.styles.audiobook' },
  { value: 'dramatic and intense', labelEn: 'Dramatic & Intense', labelKey: 'canvas.node.tts.styles.dramatic' },
  { value: 'excited and energetic', labelEn: 'Excited & Energetic', labelKey: 'canvas.node.tts.styles.excited' },
  { value: 'sad and melancholic', labelEn: 'Sad & Melancholic', labelKey: 'canvas.node.tts.styles.sad' },
  { value: 'angry tone', labelEn: 'Angry', labelKey: 'canvas.node.tts.styles.angry' },
  { value: 'sarcastic', labelEn: 'Sarcastic', labelKey: 'canvas.node.tts.styles.sarcastic' },
  { value: 'monotone and flat', labelEn: 'Monotone & Flat', labelKey: 'canvas.node.tts.styles.monotone' },
  { value: 'speaking rapidly', labelEn: 'Fast Pace', labelKey: 'canvas.node.tts.styles.rapid' },
  { value: 'speaking slowly', labelEn: 'Slow Pace', labelKey: 'canvas.node.tts.styles.slow' },
  { value: 'out of breath', labelEn: 'Out of Breath', labelKey: 'canvas.node.tts.styles.outOfBreath' },
  { value: 'muttering', labelEn: 'Muttering', labelKey: 'canvas.node.tts.styles.muttering' },
  { value: 'warm and enthusiastic', labelEn: 'Warm & Enthusiastic', labelKey: 'canvas.node.tts.styles.warmEnthusiastic' },
];

/**
 * 内联音效标签（point-in-time vocal bursts / pauses）。
 * tag 为写入文本的原样尖括号标记；labelKey 为 i18n 键，英文兜底 labelEn。
 * 官方约束：仅限人声类瞬时音效，避免非人声特效（掌声/撞击声等）。
 */
export interface TtsInlineTag {
  tag: string;
  labelEn: string;
  labelKey: string;
}

export const INLINE_TAG_LIST: TtsInlineTag[] = [
  { tag: '<laugh>', labelEn: 'Laugh', labelKey: 'canvas.node.tts.tags.laugh' },
  { tag: '<chuckle>', labelEn: 'Chuckle', labelKey: 'canvas.node.tts.tags.chuckle' },
  { tag: '<sigh>', labelEn: 'Sigh', labelKey: 'canvas.node.tts.tags.sigh' },
  { tag: '<gasp>', labelEn: 'Gasp', labelKey: 'canvas.node.tts.tags.gasp' },
  { tag: '<cough>', labelEn: 'Cough', labelKey: 'canvas.node.tts.tags.cough' },
  { tag: '<breath>', labelEn: 'Breath', labelKey: 'canvas.node.tts.tags.breath' },
  { tag: '<throat-clearing>', labelEn: 'Throat clearing', labelKey: 'canvas.node.tts.tags.throatClearing' },
  { tag: '<short pause>', labelEn: 'Short pause', labelKey: 'canvas.node.tts.tags.shortPause' },
  { tag: '<long pause>', labelEn: 'Long pause', labelKey: 'canvas.node.tts.tags.longPause' },
];

/**
 * 30 个预置音色的中文语气标签（音色名 -> 中文）。
 * 英文语气由后端 /tts/voices 的 tone 字段提供；此处仅补充中文显示，
 * 音色名（API voice ID）本身不做本地化。
 */
export const VOICE_TONES_ZH: Record<string, string> = {
  Zephyr: '明亮', Puck: '欢快', Charon: '沉稳',
  Kore: '坚定', Fenrir: '激越', Leda: '年轻',
  Orus: '坚定', Aoede: '轻快', Callirrhoe: '随和',
  Autonoe: '明亮', Enceladus: '气声', Iapetus: '清澈',
  Umbriel: '随和', Algieba: '柔滑', Despina: '柔滑',
  Erinome: '清澈', Algenib: '沙哑', Rasalgethi: '沉稳',
  Laomedeia: '欢快', Achernar: '柔和', Alnilam: '坚定',
  Schedar: '平稳', Gacrux: '成熟', Pulcherrima: '直接',
  Achird: '友好', Zubenelgenubi: '随意', Vindemiatrix: '温柔',
  Sadachbia: '活泼', Sadaltager: '博学', Sulafat: '温暖',
};

/** 根据当前语言返回音色的本地化语气标签（复刻音色无 tone 时返回空串）。 */
export function localizeVoiceTone(name: string, tone: string, lang: string): string {
  const isZh = (lang || '').toLowerCase().startsWith('zh');
  return isZh ? (VOICE_TONES_ZH[name] || tone || '') : (tone || '');
}
