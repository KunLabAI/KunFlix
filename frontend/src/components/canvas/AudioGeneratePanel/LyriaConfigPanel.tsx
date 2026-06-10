'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Mic, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import {
  MUSIC_GENRE_OPTIONS,
  MUSIC_INSTRUMENT_OPTIONS,
  MUSIC_KEY_SCALE_OPTIONS,
  MUSIC_LANGUAGE_OPTIONS,
  MUSIC_MOOD_OPTIONS,
  MUSIC_OUTPUT_FORMAT_LABELS,
  type MusicModelCapabilities,
} from '@/hooks/useMusicGeneration';
import { ToggleSwitch } from './ToggleSwitch';

/* ─── SegmentedControl（像素级指示器，对齐 Video ConfigPanel） ─── */
interface SegmentOption { value: string; label?: React.ReactNode; }

function SegmentedControl({ options, value, onChange, label }: {
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const el = itemRefs.current.get(value);
    el && setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    innerRef.current && ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [measure, options.length]);

  return (
    <div className="space-y-1">
      {label && <label className="text-[11px] font-medium text-muted-foreground">{label}</label>}
      <div ref={innerRef} className="relative flex items-center gap-0.5 p-[3px] rounded-lg bg-muted/50">
        {indicator && (
          <motion.span
            className="absolute top-[3px] bottom-[3px] rounded-md bg-background shadow-sm"
            animate={{ left: indicator.left, width: indicator.width }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              ref={(el) => { el ? itemRefs.current.set(opt.value, el) : itemRefs.current.delete(opt.value); }}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'relative z-[1] flex-1 flex items-center justify-center rounded-md font-medium whitespace-nowrap',
                'cursor-pointer select-none gap-1 px-2.5 py-1 text-[11px]',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70',
              )}
            >
              <span className="relative z-[1]">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 统一下拉触发器样式 ─── */
const TRIGGER_CLS = 'w-full h-7 rounded-md bg-muted/50 px-2 text-[11px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring transition-colors hover:bg-muted/70';

interface Props {
  capabilities: MusicModelCapabilities | null;
  /** 是否 Lyria Pro（启用 timeline + WAV） */
  isPro: boolean;

  // === 10 个字段 ===
  genre: string;
  setGenre: (v: string) => void;
  instruments: string[];
  setInstruments: (v: string[]) => void;
  bpm: number;
  setBpm: (v: number) => void;
  keyScale: string;
  setKeyScale: (v: string) => void;
  mood: string;
  setMood: (v: string) => void;
  lyrics: string;
  setLyrics: (v: string) => void;
  timeline: string;
  setTimeline: (v: string) => void;
  outputFormat: 'mp3' | 'wav';
  setOutputFormat: (v: 'mp3' | 'wav') => void;
  language: string;
  setLanguage: (v: string) => void;
  vocals: boolean;
  setVocals: (v: boolean) => void;
}

/**
 * Lyria 3 专属配置面板 —— 参考 GeminiAPILyria3 文档实现的全部特色字段。
 *
 * 字段分组：
 * 1. 基础：流派 / 乐器 / BPM / 音调
 * 2. 氛围：情绪 / 语言 / 人声开关
 * 3. 结构：歌词（支持 [Verse][Chorus][Bridge] 标签）+ 时间轴（仅 Pro）
 * 4. 输出：格式（Pro 额外支持 WAV）
 */
export function LyriaConfigPanel({
  capabilities,
  isPro,
  genre, setGenre,
  instruments, setInstruments,
  bpm, setBpm,
  keyScale, setKeyScale,
  mood, setMood,
  lyrics, setLyrics,
  timeline, setTimeline,
  outputFormat, setOutputFormat,
  language, setLanguage,
  vocals, setVocals,
}: Props) {
  const { t } = useTranslation();

  const [genreOpen, setGenreOpen] = useState(false);
  const [instrumentsOpen, setInstrumentsOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  const genreRef = useRef<HTMLDivElement>(null);
  const instrumentsRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<HTMLDivElement>(null);
  useDropdownOutside([
    [genreOpen, genreRef, setGenreOpen],
    [instrumentsOpen, instrumentsRef, setInstrumentsOpen],
    [keyOpen, keyRef, setKeyOpen],
    [moodOpen, moodRef, setMoodOpen],
    [languageOpen, languageRef, setLanguageOpen],
  ]);

  // Pro 特有能力：WAV 输出 + timeline 编辑器
  const supportsWav = capabilities?.supports_wav ?? isPro;
  const supportsTimeline = capabilities?.supports_timeline ?? isPro;
  const availableFormats = (capabilities?.formats && capabilities.formats.length > 0)
    ? capabilities.formats
    : (supportsWav ? ['mp3', 'wav'] : ['mp3']);

  const toggleInstrument = (name: string) => {
    const exists = instruments.includes(name);
    setInstruments(exists ? instruments.filter((x) => x !== name) : [...instruments, name]);
  };

  return (
    <div className="rounded-xl bg-card p-2.5 space-y-2.5 text-xs cursor-default animate-in fade-in slide-in-from-top-1 border duration-150">
      {/* === 1. Genre + Mood === */}
      <div className="grid grid-cols-2 gap-2">
        {/* Genre */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            {t('canvas.node.audio.genre', '流派')}
          </label>
          <div className="relative" ref={genreRef}>
            <button
              type="button"
              onClick={() => setGenreOpen((v) => !v)}
              className={cn(TRIGGER_CLS, 'flex items-center justify-between')}
            >
              <span className="truncate">{genre || t('canvas.node.audio.genrePlaceholder', '自动')}</span>
              <ChevronDown className={cn('w-3 h-3 shrink-0 text-muted-foreground transition-transform', genreOpen && 'rotate-180')} />
            </button>
            {genreOpen && (
              <div className="absolute top-full left-0 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                <button
                  type="button"
                  onClick={() => { setGenre(''); setGenreOpen(false); }}
                  className="w-full flex items-center px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent cursor-pointer"
                >
                  {t('canvas.node.audio.clear', '清空')}
                </button>
                {MUSIC_GENRE_OPTIONS.map((g) => {
                  const isSelected = g === genre;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => { setGenre(g); setGenreOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <span className="flex-1 text-left">{g}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Mood */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            {t('canvas.node.audio.mood', '情绪')}
          </label>
          <div className="relative" ref={moodRef}>
            <button
              type="button"
              onClick={() => setMoodOpen((v) => !v)}
              className={cn(TRIGGER_CLS, 'flex items-center justify-between')}
            >
              <span className="truncate">{mood || t('canvas.node.audio.moodPlaceholder', '自动')}</span>
              <ChevronDown className={cn('w-3 h-3 shrink-0 text-muted-foreground transition-transform', moodOpen && 'rotate-180')} />
            </button>
            {moodOpen && (
              <div className="absolute top-full left-0 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                <button
                  type="button"
                  onClick={() => { setMood(''); setMoodOpen(false); }}
                  className="w-full flex items-center px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent cursor-pointer"
                >
                  {t('canvas.node.audio.clear', '清空')}
                </button>
                {MUSIC_MOOD_OPTIONS.map((m) => {
                  const isSelected = m === mood;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMood(m); setMoodOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <span className="flex-1 text-left">{m}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === 2. Instruments (multi-select) === */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          {t('canvas.node.audio.instruments', '乐器')}
        </label>
        <div className="relative" ref={instrumentsRef}>
          <button
            type="button"
            onClick={() => setInstrumentsOpen((v) => !v)}
            className={cn(TRIGGER_CLS, 'flex items-center justify-between')}
          >
            <span className="truncate">
              {instruments.length > 0
                ? instruments.join(' / ')
                : t('canvas.node.audio.instrumentsPlaceholder', '自动')}
            </span>
            <ChevronDown className={cn('w-3 h-3 shrink-0 text-muted-foreground transition-transform', instrumentsOpen && 'rotate-180')} />
          </button>
          {instrumentsOpen && (
            <div className="absolute top-full left-0 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
              {MUSIC_INSTRUMENT_OPTIONS.map((inst) => {
                const isSelected = instruments.includes(inst);
                return (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => toggleInstrument(inst)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                      isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                    )}
                  >
                    <span className="flex-1 text-left">{inst}</span>
                    {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* === 3. BPM + Key === */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t('canvas.node.audio.bpm', 'BPM')}
            </label>
            <span className="text-[11px] font-medium">{bpm}</span>
          </div>
          <Slider
            value={[bpm]}
            onValueChange={(v) => setBpm(v[0])}
            min={40}
            max={220}
            step={1}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            {t('canvas.node.audio.keyScale', '音调 / 音阶')}
          </label>
          <div className="relative" ref={keyRef}>
            <button
              type="button"
              onClick={() => setKeyOpen((v) => !v)}
              className={cn(TRIGGER_CLS, 'flex items-center justify-between')}
            >
              <span className="truncate">{keyScale || t('canvas.node.audio.keyScalePlaceholder', '自动')}</span>
              <ChevronDown className={cn('w-3 h-3 shrink-0 text-muted-foreground transition-transform', keyOpen && 'rotate-180')} />
            </button>
            {keyOpen && (
              <div className="absolute top-full left-0 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                <button
                  type="button"
                  onClick={() => { setKeyScale(''); setKeyOpen(false); }}
                  className="w-full flex items-center px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent cursor-pointer"
                >
                  {t('canvas.node.audio.clear', '清空')}
                </button>
                {MUSIC_KEY_SCALE_OPTIONS.map((k) => {
                  const isSelected = k === keyScale;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { setKeyScale(k); setKeyOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <span className="flex-1 text-left">{k}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === 4. Vocals toggle + Language === */}
      <div className="grid grid-cols-2 gap-2 items-end">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            {t('canvas.node.audio.language', '语言')}
          </label>
          <div className="relative" ref={languageRef}>
            <button
              type="button"
              onClick={() => setLanguageOpen((v) => !v)}
              disabled={!vocals}
              className={cn(
                TRIGGER_CLS,
                'flex items-center justify-between',
                !vocals && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span className="truncate">{language || t('canvas.node.audio.languagePlaceholder', 'English')}</span>
              <ChevronDown className={cn('w-3 h-3 shrink-0 text-muted-foreground transition-transform', languageOpen && 'rotate-180')} />
            </button>
            {languageOpen && vocals && (
              <div className="absolute top-full left-0 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                {MUSIC_LANGUAGE_OPTIONS.map((lang) => {
                  const isSelected = lang === language;
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => { setLanguage(lang); setLanguageOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <span className="flex-1 text-left">{lang}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="pb-0.5">
          <ToggleSwitch
            checked={vocals}
            onChange={setVocals}
            label={t('canvas.node.audio.vocals', '包含人声')}
            icon={vocals ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
          />
        </div>
      </div>

      {/* === 5. Lyrics (with structured tag hints) === */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>{t('canvas.node.audio.lyrics', '歌词')}</span>
          <span className="text-[10px] text-muted-foreground/70">
            {t('canvas.node.audio.lyricsHint', '支持 [Verse] [Chorus] [Bridge]')}
          </span>
        </label>
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          disabled={!vocals}
          rows={4}
          placeholder={
            vocals
              ? t('canvas.node.audio.lyricsPlaceholder', '[Verse 1]\n在清晨的阳光里...\n\n[Chorus]\n...')
              : t('canvas.node.audio.lyricsDisabled', '（人声关闭时无法编辑歌词）')
          }
          className={cn(
            'w-full resize-none rounded-md border border-border/50 bg-background px-2 py-1.5 text-[11px] font-mono',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            !vocals && 'opacity-50 cursor-not-allowed',
          )}
        />
      </div>

      {/* === 6. Timeline (Pro only) === */}
      {supportsTimeline && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
            <span>{t('canvas.node.audio.timeline', '时间轴')}</span>
            <span className="text-[10px] text-muted-foreground/70">
              {t('canvas.node.audio.timelineHint', '格式：[0:00 - 0:10] 描述')}
            </span>
          </label>
          <textarea
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            rows={3}
            placeholder={t(
              'canvas.node.audio.timelinePlaceholder',
              '[0:00 - 0:15] 轻柔钢琴前奏\n[0:15 - 0:45] 鼓点渐入\n[0:45 - 1:30] 主歌人声',
            )}
            className="w-full resize-none rounded-md border border-border/50 bg-background px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* === 7. Output Format === */}
      <SegmentedControl
        label={t('canvas.node.audio.outputFormat', '输出格式')}
        options={availableFormats.map((f) => ({
          value: f,
          label: MUSIC_OUTPUT_FORMAT_LABELS[f] || f.toUpperCase(),
        }))}
        value={outputFormat}
        onChange={(v) => setOutputFormat(v as 'mp3' | 'wav')}
      />
    </div>
  );
}
