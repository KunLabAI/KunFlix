'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { XCircle, Users, Send, Settings2, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useTtsModels,
  useTtsVoices,
  deleteReplicatedVoice,
  type TtsCreateParams,
  type TtsModelFlat,
  type TtsSpeakerInput,
  type ReplicateVoiceResult,
} from '@/hooks/useTtsGeneration';
import { usePanelResize } from '@/hooks/usePanelResize';
import { useCreditsGuard } from '@/hooks/useCreditsGuard';
import { onPanelInject } from '@/lib/canvas/panelEvents';
import { TEXT_PROMPT_MAX } from '@/lib/canvas/edgePayload';
import type { TtsNodeData, TtsSpeakerEntry } from '@/store/useCanvasStore';
import { cn } from '@/lib/utils';

import { ModelSelector, type FlatTtsModelItem } from './TtsGeneratePanel/ModelSelector';
import { VoiceSelector } from './TtsGeneratePanel/VoiceSelector';
import { StyleSelector } from './TtsGeneratePanel/StyleSelector';
import { TtsConfigPanel } from './TtsGeneratePanel/TtsConfigPanel';
import TtsTextEditor, { type TtsTextEditorRef } from './TtsGeneratePanel/TtsTextEditor';
import { ReplicateVoiceDialog } from './TtsGeneratePanel/ReplicateVoiceDialog';
import { MAX_SPEAKERS } from './TtsGeneratePanel/constants';

const MAX_TEXT = Math.min(TEXT_PROMPT_MAX, 20000);

interface SpeakerFormState {
  speaker: string;
  voice: string;
  text: string;
  style: string;
}

const EMPTY_SPEAKER: SpeakerFormState = { speaker: '', voice: '', text: '', style: '' };

export interface TtsGeneratePanelProps {
  nodeId: string;
  onSubmit: (params: TtsCreateParams) => void;
  isSubmitting: boolean;
  taskActive: boolean;
  taskDone: boolean;
  taskFailed: boolean;
  taskError: string | null;
  submitError: string | null;
  hasExistingAudio: boolean;
  initialConfig: TtsNodeData['initialGenConfig'] | null;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
}

/** 从 provider name / model 启发式推断 provider_type（用于 logo 匹配，对齐音频卡） */
function inferProviderType(m: TtsModelFlat): string {
  const name = `${m.provider_name || ''} ${m.model_name || ''}`.toLowerCase();
  const KEY_MAP: Record<string, string> = {
    gemini: 'gemini', google: 'gemini',
  };
  for (const k of Object.keys(KEY_MAP)) {
    if (name.includes(k)) return KEY_MAP[k];
  }
  return '';
}

/**
 * TTS 语音合成面板（对齐 AudioGeneratePanel 设计体系）：
 * 模型选择器（图标+昵称）/ 音色选择器（自动·复刻·预置，中英语气）/ 语气风格 / 单·双说话人。
 * 全部使用主题变量，自动适配深浅色。
 */
export default function TtsGeneratePanel(props: TtsGeneratePanelProps) {
  const { t } = useTranslation();
  const {
    nodeId, onSubmit, isSubmitting, taskActive, taskDone, taskFailed,
    taskError, submitError, hasExistingAudio, initialConfig,
    onApplyToNode, onApplyToNextNode,
  } = props;
  const { creditsExhausted, tooltipText } = useCreditsGuard();

  // ── 模型 / 音色列表 ──
  const { models, isLoading: modelsLoading } = useTtsModels();
  const { voices, refetch: refetchVoices } = useTtsVoices();

  const flatModels = useMemo<FlatTtsModelItem[]>(
    () => models.map((m) => ({ key: `${m.provider_id}:${m.model_name}`, model: m, providerType: inferProviderType(m) })),
    [models],
  );

  const [selectedModelKey, setSelectedModelKey] = useState<string>('');

  // initialConfig 预填模型（来自历史或占位节点）
  useEffect(() => {
    const initModel = initialConfig?.model;
    const initProvider = initialConfig?.provider_id;
    const matchKey = (initModel && initProvider)
      ? `${initProvider}:${initModel}`
      : (initModel && flatModels.find((f) => f.model.model_name === initModel)?.key) || '';
    matchKey && setSelectedModelKey((prev) => prev || matchKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConfig?.model, initialConfig?.provider_id, flatModels.length]);

  const selectedItem = flatModels.find((f) => f.key === selectedModelKey);
  const selectedModel: TtsModelFlat | null = selectedItem?.model || null;
  const selectedProviderType = selectedItem?.providerType || '';

  // ── 表单状态 ──
  const [text, setText] = useState<string>(initialConfig?.text || '');
  const [voice, setVoice] = useState<string>(initialConfig?.voice || 'auto');
  const [style, setStyle] = useState<string>(initialConfig?.style || '');
  const [multiSpeaker, setMultiSpeaker] = useState<boolean>((initialConfig?.speakers?.length || 0) > 1);
  const [speakers, setSpeakers] = useState<SpeakerFormState[]>(
    (initialConfig?.speakers || []).map((s: TtsSpeakerEntry) => ({
      speaker: s.speaker || '', voice: s.voice || '', text: s.text || '', style: s.style || '',
    })),
  );
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [showReplicate, setShowReplicate] = useState<boolean>(false);

  // 底部拖拽缩放（containerRef 供手柄读取当前高度；内容自适应在 TtsTextEditor 内部）
  const { textareaRef, effectiveMaxH, resizeHandlers } = usePanelResize(text);
  const editorContainerRef = textareaRef as unknown as React.RefObject<HTMLDivElement | null>;
  // 内联音效标签编辑器句柄（供配置面板点击插入）
  const editorRef = useRef<TtsTextEditorRef | null>(null);

  // ── 订阅 panel 事件（文本节点连线注入 text→tts） ──
  useEffect(() => {
    const handlers: Record<string, (ev: unknown) => void> = {
      'prompt-prefix': (ev: unknown) => {
        const e = ev as { text: string };
        setText((current) => {
          const prefix = e.text.trim();
          const next = current.trim().length > 0 ? `${prefix}\n\n${current}` : prefix;
          return next.slice(0, MAX_TEXT);
        });
      },
    };
    return onPanelInject(nodeId, (ev) => { handlers[ev.type]?.(ev); });
  }, [nodeId]);

  // ── 多说话人编辑 ──
  const toggleMultiSpeaker = useCallback(() => {
    setMultiSpeaker((prev) => {
      const next = !prev;
      next && setSpeakers((curr) => (curr.length >= MAX_SPEAKERS
        ? curr
        : [...curr, ...Array.from({ length: MAX_SPEAKERS - curr.length }, () => ({ ...EMPTY_SPEAKER }))]));
      return next;
    });
  }, []);

  const updateSpeaker = useCallback((idx: number, patch: Partial<SpeakerFormState>) => {
    setSpeakers((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  // ── 音色复刻回调 ──
  const handleReplicated = useCallback((result: ReplicateVoiceResult) => {
    refetchVoices();
    // 复刻成功后自动选用新音色
    result.voice_id && setVoice(result.voice_id);
  }, [refetchVoices]);

  const handleDeleteReplicated = useCallback(async (id: string) => {
    try {
      await deleteReplicatedVoice(id);
    } catch {
      // 忽略删除错误
    }
    refetchVoices();
  }, [refetchVoices]);

  // ── 能否提交 ──
  const validSpeakers = speakers.filter((s) => s.speaker.trim() && s.text.trim());
  const canSubmit =
    !!selectedModel &&
    (multiSpeaker ? validSpeakers.length >= MAX_SPEAKERS : text.trim().length > 0) &&
    !isSubmitting && !taskActive && !creditsExhausted;

  // ── 提交 ──
  const handleSubmit = useCallback(() => {
    const m = selectedModel;
    if (!m || !canSubmit) return;

    const speakerPayload: TtsSpeakerInput[] | undefined = multiSpeaker
      ? validSpeakers.slice(0, MAX_SPEAKERS).map((s) => ({
          speaker: s.speaker.trim(),
          voice: (s.voice && s.voice !== 'auto') ? s.voice : undefined,
          text: s.text.trim(),
          style: s.style.trim() || undefined,
        }))
      : undefined;

    onSubmit({
      provider_id: m.provider_id,
      model: m.model_name,
      text: multiSpeaker ? '' : text.trim().slice(0, MAX_TEXT),
      voice: (!multiSpeaker && voice && voice !== 'auto') ? voice : 'auto',
      style: multiSpeaker ? undefined : (style.trim() || undefined),
      speakers: speakerPayload,
      output_format: 'wav',
    });
  }, [selectedModel, canSubmit, multiSpeaker, validSpeakers, text, voice, style, onSubmit]);

  const sendTitle = taskActive
    ? t('canvas.node.tts.generating', '合成中…')
    : creditsExhausted ? tooltipText : t('canvas.node.tts.generate', '生成语音');

  return (
    <div className="w-full space-y-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="bg-muted/50 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200 flex flex-col relative">
        {multiSpeaker ? (
          /* ── 双说话人对话编辑区 ── */
          <div className="px-2 pt-2 space-y-2">
            {speakers.slice(0, MAX_SPEAKERS).map((s, idx) => (
              <div key={idx} className="rounded-lg border border-border/40 bg-background/50 p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    value={s.speaker}
                    onChange={(e) => updateSpeaker(idx, { speaker: e.target.value })}
                    placeholder={t('canvas.node.tts.speakerName', '角色名')}
                    className="nodrag flex-1 min-w-0 h-7 px-2 text-[11px] rounded-md border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    disabled={taskActive}
                  />
                  <VoiceSelector
                    value={s.voice || 'auto'}
                    voices={voices}
                    onChange={(v) => updateSpeaker(idx, { voice: v })}
                    onReplicate={() => setShowReplicate(true)}
                    onDeleteReplicated={handleDeleteReplicated}
                    disabled={taskActive}
                    providerId={selectedModel?.provider_id}
                    compact
                  />
                </div>
                <textarea
                  value={s.text}
                  onChange={(e) => updateSpeaker(idx, { text: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={t('canvas.node.tts.speakerTextPlaceholder', '该角色的台词…')}
                  rows={2}
                  className="nodrag w-full px-2 py-1.5 text-[11px] rounded-md border border-border/50 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring custom-scrollbar disabled:opacity-50"
                  disabled={taskActive}
                />
                <StyleSelector
                  value={s.style}
                  onChange={(v) => updateSpeaker(idx, { style: v })}
                  disabled={taskActive}
                  compact
                />
              </div>
            ))}
          </div>
        ) : (
          /* ── 单说话人文本输入（交互式内联标签编辑器 + 拖拽缩放） ── */
          <>
            <TtsTextEditor
              ref={editorRef}
              value={text}
              onChange={(v) => setText(v.slice(0, MAX_TEXT))}
              onEnterSubmit={() => canSubmit && handleSubmit()}
              placeholder={t('canvas.node.tts.textPlaceholder', '输入要朗读的文本…（语言自动识别）')}
              disabled={taskActive}
              maxHeight={typeof effectiveMaxH === 'number' ? effectiveMaxH : undefined}
              containerRef={editorContainerRef}
            />
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center justify-center h-3 w-12 cursor-ns-resize group/resize select-none z-10"
              {...resizeHandlers}
            >
              <div className="w-8 h-[3px] rounded-full bg-border/40 group-hover/resize:bg-border/80 group-active/resize:bg-primary/60 transition-colors" />
            </div>
          </>
        )}

        {/* ── 底部工具栏 ── */}
        <div className="flex items-center justify-between px-1.5 pb-1.5 pt-1 gap-1">
          <div className="flex items-center gap-0.5 min-w-0">
            <ModelSelector
              selectedModelKey={selectedModelKey}
              selectedModel={selectedModel}
              selectedProviderType={selectedProviderType}
              flatModels={flatModels}
              modelsCount={models.length}
              modelsLoading={modelsLoading}
              taskActive={taskActive}
              onSelect={setSelectedModelKey}
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* 双说话人切换 */}
            <button
              type="button"
              onClick={toggleMultiSpeaker}
              disabled={taskActive}
              title={t('canvas.node.tts.multiSpeaker', '双说话人对话')}
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                multiSpeaker ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <Users className="w-4 h-4" />
            </button>

            {/* 高级配置（语气风格，仅单说话人） */}
            {!multiSpeaker && (
              <button
                type="button"
                onClick={() => setShowConfig((v) => !v)}
                disabled={taskActive}
                title={t('canvas.node.tts.advanced', '语气风格')}
                className={cn(
                  'h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200',
                  'text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed',
                  showConfig && 'bg-accent text-foreground',
                )}
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}

            {/* 单说话人音色选择 */}
            {!multiSpeaker && (
              <div className="w-[124px]">
                <VoiceSelector
                  value={voice}
                  voices={voices}
                  onChange={setVoice}
                  onReplicate={() => setShowReplicate(true)}
                  onDeleteReplicated={handleDeleteReplicated}
                  disabled={taskActive}
                  providerId={selectedModel?.provider_id}
                />
              </div>
            )}

            {/* 生成按钮 */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              title={sendTitle}
              className={cn(
                'h-8 w-8 rounded-lg transition-all duration-200 flex items-center justify-center',
                canSubmit
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 任务完成的应用按钮 */}
      {taskDone && (
        <button
          type="button"
          onClick={hasExistingAudio ? onApplyToNextNode : onApplyToNode}
          className="w-full h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          {hasExistingAudio
            ? t('canvas.node.tts.applyToNext', '应用到下一节点')
            : t('canvas.node.tts.done', '完成')}
        </button>
      )}

      {/* 高级配置区（语气风格下拉 + 交互式内联标签） */}
      {showConfig && !multiSpeaker && (
        <TtsConfigPanel style={style} setStyle={setStyle} taskActive={taskActive} editorRef={editorRef} />
      )}

      {/* 任务失败提示 */}
      {taskFailed && taskError && (
        <div className="flex items-center gap-1.5 text-destructive text-[11px] p-1">
          <XCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{taskError}</span>
        </div>
      )}

      {/* 提交错误提示 */}
      {submitError && (
        <div className="flex items-center gap-1.5 text-destructive text-[11px] p-1">
          <XCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{submitError}</span>
        </div>
      )}

      {/* 音色复刻弹窗 */}
      <ReplicateVoiceDialog
        open={showReplicate}
        onOpenChange={setShowReplicate}
        providerId={selectedModel?.provider_id}
        model={selectedModel?.model_name}
        onReplicated={handleReplicated}
      />
    </div>
  );
}
