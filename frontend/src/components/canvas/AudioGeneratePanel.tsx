'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { XCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import {
  useMusicModels,
  useMusicModelCapabilities,
  type MusicCreateParams,
  type MusicModelFlat,
} from '@/hooks/useMusicGeneration';
import { usePanelResize } from '@/hooks/usePanelResize';
import { onPanelInject } from '@/lib/canvas/panelEvents';
import { mediaUrlsToDataUrls, TEXT_PROMPT_MAX } from '@/lib/canvas/edgePayload';
import type { CanvasNode } from '@/store/useCanvasStore';
import { edgeToast } from '@/lib/canvas/toast';

import { AttachmentPreviews, type ReferenceImage } from './AudioGeneratePanel/AttachmentPreviews';
import { PromptInputArea } from './AudioGeneratePanel/PromptInputArea';
import { ModelSelector } from './AudioGeneratePanel/ModelSelector';
import { NodeRefPicker } from './AudioGeneratePanel/NodeRefPicker';
import {
  PanelActionButtons,
  ApplyButton,
} from './AudioGeneratePanel/PanelActionButtons';
import { ConfigPanelRouter, type MusicFormState } from './AudioGeneratePanel/ConfigPanelRouter';
import {
  DEFAULT_BPM,
  DEFAULT_OUTPUT_FORMAT,
  MAX_REFERENCE_IMAGES,
} from './AudioGeneratePanel/constants';
import { isLyriaModel, getImageNodeUrl, normalizeUrl } from './AudioGeneratePanel/utils';
import type {
  AudioGeneratePanelProps,
  FlatMusicModelItem,
} from './AudioGeneratePanel/types';

// 对外类型 re-export —— 保持向后兼容
export type { AudioGeneratePanelProps } from './AudioGeneratePanel/types';

/**
 * 音乐生成面板入口（参考 VideoGeneratePanel 结构）。
 *
 * 模型选择后按 provider_type / 模型名分派到对应 ConfigPanel：
 * - Lyria 系列 → LyriaConfigPanel（10 字段完整）
 * - 其它 → GenericMusicConfigPanel（输出格式 + 反向提示）
 */
export default function AudioGeneratePanel(props: AudioGeneratePanelProps) {
  const { t } = useTranslation();
  const {
    onSubmit,
    onStop,
    isSubmitting,
    taskActive,
    taskDone,
    taskFailed,
    taskError,
    submitError,
    hasExistingAudio,
    onApplyToNode,
    onApplyToNextNode,
    canvasNodes = [],
    initialConfig,
    nodeId,
    onLinkNode,
    onUnlinkNode,
  } = props;

  // ── 模型列表 ──
  const { models, isLoading: modelsLoading } = useMusicModels();

  const flatModels = useMemo<FlatMusicModelItem[]>(() => {
    return models.map((m) => ({
      key: `${m.provider_id}:${m.model_name}`,
      model: m,
      providerType: inferProviderType(m),
    }));
  }, [models]);

  // 默认空（对齐图像面板：展示“选择模型”占位，不自动选第一个）
  const [selectedModelKey, setSelectedModelKey] = useState<string>('');

  // initialConfig 预填（来自历史或菜单）
  useEffect(() => {
    const initModel = initialConfig?.model;
    const initProvider = initialConfig?.provider_id;
    const matchKey = (initModel && initProvider)
      ? `${initProvider}:${initModel}`
      : (initModel && flatModels.find((f) => f.model.model_name === initModel)?.key) || '';
    matchKey && setSelectedModelKey(matchKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConfig?.model, initialConfig?.provider_id, flatModels.length]);

  const selectedItem = flatModels.find((f) => f.key === selectedModelKey);
  const selectedModel: MusicModelFlat | null = selectedItem?.model || null;
  const selectedProviderType = selectedItem?.providerType || '';

  const { capabilities } = useMusicModelCapabilities(selectedModel?.model_name || null);

  // ── 表单状态 ──
  const [prompt, setPrompt] = useState<string>('');

  // 输入框自适应 + 底部拖拽缩放（对齐 ImageGeneratePanel）
  const { textareaRef, effectiveMaxH, resizeHandlers } = usePanelResize(prompt);
  const [outputFormat, setOutputFormat] = useState<'mp3' | 'wav'>(
    (initialConfig?.output_format as 'mp3' | 'wav') || DEFAULT_OUTPUT_FORMAT,
  );
  const [negativePrompt, setNegativePrompt] = useState<string>('');

  // Lyria 结构化字段
  const [genre, setGenre] = useState<string>(initialConfig?.genre || '');
  const [instruments, setInstruments] = useState<string[]>(initialConfig?.instruments || []);
  const [bpm, setBpm] = useState<number>(initialConfig?.bpm || DEFAULT_BPM);
  const [keyScale, setKeyScale] = useState<string>(initialConfig?.key_scale || '');
  const [mood, setMood] = useState<string>(initialConfig?.mood || '');
  const [lyrics, setLyrics] = useState<string>(initialConfig?.lyrics || '');
  const [timeline, setTimeline] = useState<string>(initialConfig?.timeline || '');
  const [language, setLanguage] = useState<string>(initialConfig?.language || 'English');
  const [vocals, setVocals] = useState<boolean>(initialConfig?.vocals ?? true);

  // 参考图
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [showNodePicker, setShowNodePicker] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // initialConfig 填充 prompt（从历史拖拽）
  useEffect(() => {
    const p = initialConfig?.prompt;
    p && setPrompt(p);
  }, [initialConfig?.prompt]);

  // ── 模型切换处理：重置 capability 相关字段 ──
  const handleModelChange = useCallback((key: string) => {
    setSelectedModelKey(key);
    // 仅在当前 outputFormat 不被新模型支持时才回退
    setOutputFormat((curr) => (curr === 'wav' ? 'mp3' : curr));
  }, []);

  // ── 订阅 panel 事件（prompt 前缀追加、参考图添加） ──
  useEffect(() => {
    const addRefImage = (sourceNodeId: string, url: string, name?: string) => {
      const normalized = normalizeUrl(url) || url;
      const exists = references.some((r) => r.url === normalized);
      const full = references.length >= MAX_REFERENCE_IMAGES;
      exists && edgeToast.info(t('canvas.node.audio.refImageDuplicate', '该参考图已存在'));
      !exists && full && edgeToast.warn(t('canvas.node.audio.refImageLimit', '参考图数量已达上限'));
      !exists && !full && setReferences((prev) => [
        ...prev,
        { id: uuidv4(), url: normalized, sourceNodeId, name },
      ]);
      !exists && !full && sourceNodeId && onLinkNode?.(sourceNodeId);
    };

    const handlers: Record<string, (ev: unknown) => void> = {
      'prompt-prefix': (ev: unknown) => {
        const e = ev as { text: string };
        const current = prompt;
        const prefix = e.text.trim();
        const next = current.trim().length > 0 ? `${prefix}\n\n${current}` : prefix;
        setPrompt(next.slice(0, TEXT_PROMPT_MAX));
      },
      'add-reference-image': (ev: unknown) => {
        const e = ev as { sourceNodeId: string; url: string; name?: string };
        addRefImage(e.sourceNodeId, e.url, e.name);
      },
      'smart-image-inject': (ev: unknown) => {
        const e = ev as { sourceNodeId: string; urls: string[]; name?: string };
        (e.urls || []).forEach((u, i) =>
          addRefImage(e.sourceNodeId, u, e.urls.length > 1 ? `${e.name || ''} ${i + 1}` : e.name),
        );
      },
    };
    return onPanelInject(nodeId, (ev) => {
      handlers[ev.type]?.(ev);
    });
  }, [nodeId, prompt, references, onLinkNode, t]);

  // ── 参考图选择：从节点 picker ──
  const handleSelectRefNode = (node: CanvasNode): boolean => {
    const url = getImageNodeUrl(node);
    const exists = !!url && references.some((r) => r.url === url);
    const full = references.length >= MAX_REFERENCE_IMAGES;
    url && !exists && !full && setReferences((prev) => [
      ...prev,
      { id: uuidv4(), url, sourceNodeId: node.id, name: (node.data as Record<string, unknown>)?.name as string },
    ]);
    url && !exists && !full && onLinkNode?.(node.id);
    return true;
  };

  const handleRemoveRef = (id: string) => {
    setReferences((prev) => {
      const target = prev.find((r) => r.id === id);
      target?.sourceNodeId && onUnlinkNode?.(target.sourceNodeId);
      return prev.filter((r) => r.id !== id);
    });
  };

  // 画布图像节点（用于 picker）
  const imageNodes = useMemo(() => {
    return canvasNodes.filter((n) => n.type === 'character' || n.type === 'image');
  }, [canvasNodes]);

  // ── Config 状态集合 ──
  const formState: MusicFormState = {
    outputFormat, setOutputFormat,
    negativePrompt, setNegativePrompt,
    genre, setGenre,
    instruments, setInstruments,
    bpm, setBpm,
    keyScale, setKeyScale,
    mood, setMood,
    lyrics, setLyrics,
    timeline, setTimeline,
    language, setLanguage,
    vocals, setVocals,
  };

  // ── 能否提交 ──
  const canSubmit =
    !!selectedModel &&
    prompt.trim().length > 0 &&
    !isSubmitting &&
    !taskActive;

  // ── 提交 ──
  const handleSubmit = useCallback(async () => {
    const m = selectedModel;
    if (!m) return;
    const lyria = isLyriaModel(m.model_name);

    // 参考图转 data URL（本地 /api/media/ 需要）
    const refUrls = await mediaUrlsToDataUrls(references.map((r) => r.url));
    const reference_images = refUrls.length > 0
      ? refUrls.map((url) => ({ url }))
      : undefined;

    // 结构化字段（仅 Lyria 有意义）
    const structured = lyria ? {
      genre: genre || undefined,
      instruments: instruments.length > 0 ? instruments : undefined,
      bpm: bpm || undefined,
      key_scale: keyScale || undefined,
      mood: mood || undefined,
      language: vocals ? (language || undefined) : 'Instrumental',
      vocals,
      lyrics: vocals && lyrics.trim() ? lyrics : undefined,
      timeline: timeline.trim() || undefined,
    } : undefined;

    const params: MusicCreateParams = {
      provider_id: m.provider_id,
      model: m.model_name,
      prompt: prompt.trim().slice(0, TEXT_PROMPT_MAX),
      output_format: outputFormat,
      negative_prompt: negativePrompt.trim() || undefined,
      structured,
      reference_images,
    };
    onSubmit(params);
  }, [
    selectedModel, prompt, outputFormat, negativePrompt,
    genre, instruments, bpm, keyScale, mood, lyrics, timeline, language, vocals,
    references, onSubmit,
  ]);

  return (
    <div
      className="w-full space-y-1.5"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bg-muted/50 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200 flex flex-col relative">
        {/* 参考图（仅 Lyria 模型显示） */}
        {isLyriaModel(selectedModel?.model_name) && (
          <AttachmentPreviews
            references={references}
            maxImages={MAX_REFERENCE_IMAGES}
            onRemove={handleRemoveRef}
            onOpenPicker={() => setShowNodePicker(true)}
            taskActive={taskActive}
          />
        )}

        <PromptInputArea
          prompt={prompt}
          setPrompt={setPrompt}
          taskActive={taskActive}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          maxHeight={effectiveMaxH}
          textareaRef={textareaRef}
          resizeHandlers={resizeHandlers}
        />

        {/* 底部工具栏 */}
        <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
          <div className="flex items-center gap-1">
            <ModelSelector
              selectedModelKey={selectedModelKey}
              selectedModel={selectedModel}
              selectedProviderType={selectedProviderType}
              flatModels={flatModels}
              modelsCount={models.length}
              modelsLoading={modelsLoading}
              taskActive={taskActive}
              onSelect={handleModelChange}
            />
          </div>

          <div className="flex items-center gap-1">
            {isLyriaModel(selectedModel?.model_name) && (
              <NodeRefPicker
                open={showNodePicker}
                onOpenChange={setShowNodePicker}
                imageNodes={imageNodes}
                taskActive={taskActive}
                hasSelection={references.length > 0}
                imageRefCount={references.length}
                maxImages={MAX_REFERENCE_IMAGES}
                onSelect={handleSelectRefNode}
              />
            )}

            <PanelActionButtons
              taskActive={taskActive}
              canSubmit={canSubmit}
              hasSelectedModel={!!selectedModel}
              showConfig={showConfig}
              onToggleConfig={() => setShowConfig((v) => !v)}
              onStop={onStop}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>

      {/* 任务完成的应用按钮 */}
      {taskDone && (
        <ApplyButton
          hasExistingAudio={hasExistingAudio}
          onApplyToNode={onApplyToNode}
          onApplyToNextNode={onApplyToNextNode}
        />
      )}

      {/* 展开配置区 */}
      {showConfig && selectedModel && (
        <ConfigPanelRouter
          modelName={selectedModel.model_name}
          capabilities={capabilities}
          state={formState}
        />
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
    </div>
  );
}

/** 从 provider name / id 启发式推断 provider_type（用于 logo 匹配） */
function inferProviderType(m: MusicModelFlat): string {
  const name = `${m.provider_name || ''} ${m.model_name || ''}`.toLowerCase();
  const KEY_MAP: Record<string, string> = {
    gemini: 'gemini',
    google: 'gemini',
    lyria: 'gemini',
    suno: 'suno',
    openai: 'openai',
    minimax: 'minimax',
    doubao: 'doubao',
    ark: 'ark',
  };
  for (const k of Object.keys(KEY_MAP)) {
    if (name.includes(k)) return KEY_MAP[k];
  }
  return '';
}
