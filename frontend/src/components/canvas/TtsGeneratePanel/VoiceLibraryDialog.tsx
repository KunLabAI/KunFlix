'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2, XCircle, Library, Play, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fetchVoiceLibrary, previewVoice, type LibraryVoice } from '@/hooks/useTtsGeneration';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (voice: LibraryVoice) => void;
  providerId?: string;
}

const PAGE_SIZE = 50;

// 语言筛选（BCP-47 精确匹配，Google 语义为 exact match）
const LANGUAGE_OPTIONS = [
  { value: '', labelKey: 'canvas.node.tts.langAll' },
  { value: 'zh-CN', labelKey: 'canvas.node.tts.langZhHans' },
  { value: 'zh-TW', labelKey: 'canvas.node.tts.langZhHant' },
  { value: 'en-US', labelKey: 'canvas.node.tts.langEnUS' },
  { value: 'en-GB', labelKey: 'canvas.node.tts.langEnGB' },
  { value: 'ja-JP', labelKey: 'canvas.node.tts.langJa' },
  { value: 'ko-KR', labelKey: 'canvas.node.tts.langKo' },
  { value: 'es-ES', labelKey: 'canvas.node.tts.langEs' },
  { value: 'fr-FR', labelKey: 'canvas.node.tts.langFr' },
  { value: 'de-DE', labelKey: 'canvas.node.tts.langDe' },
];

const SELECT_CLS =
  'h-8 rounded-md border border-border/50 bg-background px-2 text-[11px] text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring';

/** 性别徽标 */
function GenderBadge({ gender }: { gender: string }) {
  const isMale = gender === 'male';
  const isFemale = gender === 'female';
  return (isMale || isFemale) ? (
    <span className={cn('shrink-0 text-xs font-semibold', isMale ? 'text-sky-500' : 'text-rose-400')}>
      {isMale ? '♂' : '♀'}
    </span>
  ) : <span className="shrink-0 text-xs text-muted-foreground/50">⚧</span>;
}

/**
 * 扩展音色库浏览弹窗：搜索 + 性别/语言/音高筛选 + 分页加载，选中即回填。
 * 数据来源为后端代理的 Google GET /v1beta/voices（数百个音色）。
 */
export function VoiceLibraryDialog({ open, onOpenChange, onPick, providerId }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [gender, setGender] = useState('');
  const [languageCode, setLanguageCode] = useState('');
  const [pitch, setPitch] = useState('');

  const [voices, setVoices] = useState<LibraryVoice[]>([]);
  const [nextToken, setNextToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  // 试听状态
  const [sampleText, setSampleText] = useState('');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const defaultSample = t('canvas.node.tts.previewSampleText', '你好，这是我的音色试听示例。');

  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  // 弹窗关闭时停止播放
  useEffect(() => {
    !open && stopPreview();
  }, [open, stopPreview]);

  // 卸载时释放音频
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const handlePreview = useCallback(async (v: LibraryVoice) => {
    // 再次点击正在播放的音色 → 停止
    if (playingId === v.id) { stopPreview(); return; }
    stopPreview();
    setPreviewingId(v.id);
    setError(null);
    try {
      const dataUri = await previewVoice({
        voice: v.id,
        text: sampleText.trim() || defaultSample,
        providerId,
      });
      const audio = new Audio(dataUri);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId(null); audioRef.current = null; };
      audio.onerror = () => { setPlayingId(null); audioRef.current = null; };
      await audio.play();
      setPlayingId(v.id);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err?.response?.data?.detail || err?.message || t('canvas.node.tts.previewFailed', '试听失败，请重试'));
    } finally {
      setPreviewingId(null);
    }
  }, [playingId, stopPreview, sampleText, defaultSample, providerId, t]);

  const loadPage = useCallback(async (reset: boolean, token: string) => {
    const reqId = ++reqIdRef.current;
    reset ? setLoading(true) : setLoadingMore(true);
    setError(null);
    try {
      const res = await fetchVoiceLibrary({
        provider_id: providerId || undefined,
        gender: gender || undefined,
        language_code: languageCode || undefined,
        pitch: pitch || undefined,
        search: appliedSearch || undefined,
        page_size: PAGE_SIZE,
        page_token: token || undefined,
      });
      // 丢弃过期请求结果
      if (reqId !== reqIdRef.current) return;
      setVoices((prev) => (reset ? res.voices : [...prev, ...res.voices]));
      setNextToken(res.next_page_token || '');
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      reqId === reqIdRef.current && setError(err?.response?.data?.detail || err?.message || t('canvas.node.tts.libraryError', '音色库加载失败'));
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [gender, languageCode, pitch, appliedSearch, providerId, t]);

  // 打开或筛选条件变化 → 重新加载首页
  useEffect(() => {
    open && loadPage(true, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gender, languageCode, pitch, appliedSearch]);

  const handleSearchSubmit = () => setAppliedSearch(search.trim());

  const handlePick = (v: LibraryVoice) => {
    onPick(v);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Library className="w-4 h-4 text-primary" />
            {t('canvas.node.tts.libraryTitle', '扩展音色库')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('canvas.node.tts.libraryDesc', '浏览数百个附加音色，可按性别、语言、音高与关键词筛选。')}
          </DialogDescription>
        </DialogHeader>

        {/* 搜索 + 筛选 */}
        <div className="space-y-2 py-1">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { e.stopPropagation(); e.key === 'Enter' && handleSearchSubmit(); }}
                placeholder={t('canvas.node.tts.searchVoice', '搜索音色名称或描述…')}
                className="w-full h-8 pl-7 pr-2 rounded-md border border-border/50 bg-background text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              type="button"
              onClick={handleSearchSubmit}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors shrink-0"
            >
              {t('canvas.node.tts.search', '搜索')}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* 性别 */}
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={cn(SELECT_CLS, 'flex-1')}>
              <option value="">{t('canvas.node.tts.genderAll', '全部性别')}</option>
              <option value="female">{t('canvas.node.tts.genderFemale', '女声')}</option>
              <option value="male">{t('canvas.node.tts.genderMale', '男声')}</option>
              <option value="neutral">{t('canvas.node.tts.genderNeutral', '中性')}</option>
            </select>
            {/* 语言 */}
            <select value={languageCode} onChange={(e) => setLanguageCode(e.target.value)} className={cn(SELECT_CLS, 'flex-1')}>
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey, o.value || '全部语言')}</option>
              ))}
            </select>
            {/* 音高 */}
            <select value={pitch} onChange={(e) => setPitch(e.target.value)} className={cn(SELECT_CLS, 'flex-1')}>
              <option value="">{t('canvas.node.tts.pitchAll', '全部音高')}</option>
              <option value="low">{t('canvas.node.tts.pitchLow', '低')}</option>
              <option value="medium">{t('canvas.node.tts.pitchMedium', '中')}</option>
              <option value="high">{t('canvas.node.tts.pitchHigh', '高')}</option>
            </select>
          </div>

          {/* 试听文本（留空则用默认短句） */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground shrink-0">{t('canvas.node.tts.previewText', '试听文本')}</span>
            <input
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value.slice(0, 200))}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={defaultSample}
              className="flex-1 h-7 px-2 rounded-md border border-border/50 bg-background text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* 结果列表 */}
        <div className="max-h-[340px] min-h-[200px] overflow-y-auto custom-scrollbar rounded-lg border border-border/50 bg-muted/20">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-destructive">
              <XCircle className="w-6 h-6" />
              <span className="text-xs px-4 text-center">{error}</span>
            </div>
          ) : voices.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
              {t('canvas.node.tts.noLibraryVoices', '未找到匹配的音色')}
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {voices.map((v) => (
                <div key={v.id} className="flex items-start gap-1 px-3 py-2 hover:bg-accent transition-colors">
                  {/* 主区域：点击选用 */}
                  <button
                    type="button"
                    onClick={() => handlePick(v)}
                    className="flex-1 min-w-0 flex items-start gap-2 text-left cursor-pointer"
                  >
                    <GenderBadge gender={v.gender} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground truncate">{v.display_name || v.id}</span>
                        {v.language_code && <span className="text-[9px] px-1 py-px rounded bg-muted text-muted-foreground shrink-0">{v.language_code}</span>}
                        {v.accent && <span className="text-[9px] px-1 py-px rounded bg-muted text-muted-foreground shrink-0">{v.accent}</span>}
                        {v.pitch && <span className="text-[9px] px-1 py-px rounded bg-muted text-muted-foreground shrink-0">{v.pitch}</span>}
                      </div>
                      {(v.description || v.persona) && (
                        <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">{v.description || v.persona}</p>
                      )}
                    </div>
                  </button>
                  {/* 试听按钮 */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handlePreview(v); }}
                    disabled={previewingId === v.id}
                    title={playingId === v.id ? t('canvas.node.tts.stopPreview', '停止试听') : t('canvas.node.tts.preview', '试听')}
                    className={cn(
                      'shrink-0 mt-0.5 h-7 w-7 rounded-md flex items-center justify-center transition-colors',
                      playingId === v.id
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                      previewingId === v.id && 'opacity-60 cursor-wait',
                    )}
                  >
                    {previewingId === v.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : playingId === v.id
                        ? <Square className="w-3.5 h-3.5" fill="currentColor" />
                        : <Play className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 加载更多 */}
        {!loading && !error && nextToken && (
          <button
            type="button"
            onClick={() => loadPage(false, nextToken)}
            disabled={loadingMore}
            className="w-full h-8 rounded-md border border-border/50 text-[11px] font-medium text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('canvas.node.tts.loadMore', '加载更多')}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
