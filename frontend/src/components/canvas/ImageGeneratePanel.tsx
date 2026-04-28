'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Settings2, Send, Square, XCircle, ChevronDown, Check, ArrowRight, Paperclip, ImageIcon, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  useImageModels,
  useImageProviders,
  useImageModelCapabilities,
  useImageFormVisibility,
  ASPECT_RATIO_LABELS,
  QUALITY_LABELS,
  IMAGE_MODE_LABELS,
  IMAGE_MODE_MAX_REFS,
  type ImageCreateParams,
  type ImageMode,
} from '@/hooks/useImageGeneration';
import type { ImageGenHistoryEntry, CanvasNode, CharacterNodeData } from '@/store/useCanvasStore';
import { selectNodesByUpdatedDesc } from '@/store/useCanvasStore';
import { NodePickerDropdown, type NodePickerItem } from './NodePickerDropdown';

// ---------------------------------------------------------------------------
// Provider logo mapping（与 VideoGeneratePanel 对齐）
// ---------------------------------------------------------------------------

const PROVIDER_ICONS: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// Aspect ratio SVG icon（与 VideoGeneratePanel 一致）
// ---------------------------------------------------------------------------

function AspectRatioIcon({ ratio, className }: { ratio: string; className?: string }) {
  const [w, h] = ratio.split(':').map(Number);
  const isAuto = !w || !h;
  const maxDim = 14;
  const scale = maxDim / Math.max(w || 1, h || 1);
  const rw = isAuto ? 10 : Math.round(w * scale);
  const rh = isAuto ? 10 : Math.round(h * scale);
  const ox = (16 - rw) / 2;
  const oy = (16 - rh) / 2;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      {isAuto ? (
        <text x="8" y="11" textAnchor="middle" fontSize="9" fontWeight="600" fill="currentColor">A</text>
      ) : (
        <rect x={ox} y={oy} width={rw} height={rh} rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Native select styling（与 VideoGeneratePanel 一致）
// ---------------------------------------------------------------------------

const SELECT_CLS =
  'w-full h-7 rounded-md border border-border/50 bg-background px-2 text-[11px] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring';

const SELECT_ARROW_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 6px center',
  paddingRight: '20px',
} as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ImageGeneratePanelProps {
  onSubmit: (params: ImageCreateParams) => void;
  onStop?: () => void;
  isSubmitting: boolean;
  taskActive: boolean;
  taskDone: boolean;
  taskFailed: boolean;
  taskError?: string | null;
  submitError?: string | null;
  hasExistingImage: boolean;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
  /** 历史拖拽生成新节点时用于预填表单 */
  initialConfig?: Partial<ImageGenHistoryEntry> | null;
  /** 当前宿主图像节点 ID，用于在选取自身作参考图时跳过连线 */
  nodeId?: string;
  /** 画布节点列表（用于 edit / reference_images 模式的参考图选择） */
  canvasNodes?: CanvasNode[];
  /** 选定参考图节点时的 link/unlink 回调 */
  onLinkNode?: (sourceNodeId: string) => void;
  onUnlinkNode?: (sourceNodeId: string) => void;
}

// ---------------------------------------------------------------------------
// 从画布图像节点提取图片 URL
// ---------------------------------------------------------------------------
function getImageNodeUrl(node: CanvasNode): string | null {
  const data = node.data as CharacterNodeData;
  let url: string | null = (data.images && data.images[0]) || data.imageUrl || null;
  url && !url.startsWith('http') && !url.startsWith('/api/media/') && !url.startsWith('data:') && (url = `/api/media/${url}`);
  return url;
}

// 参考图条目（与节点关联用于 unlink）
interface ImageRef {
  url: string;
  name: string;
  sourceNodeId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImageGeneratePanel({
  onSubmit,
  onStop,
  isSubmitting,
  taskActive,
  taskDone,
  taskFailed,
  taskError,
  submitError,
  hasExistingImage,
  onApplyToNode,
  onApplyToNextNode,
  initialConfig,
  nodeId,
  canvasNodes = [],
  onLinkNode,
  onUnlinkNode,
}: ImageGeneratePanelProps) {
  const { t } = useTranslation();

  // Data
  const { models, enabled, isLoading: modelsLoading } = useImageModels();
  const { providers } = useImageProviders();

  // Model dropdown state
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Form state
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const configRef = useRef<HTMLDivElement>(null);

  // Config state
  const [mode, setMode] = useState<ImageMode>('text_to_image');
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const [referenceImages, setReferenceImages] = useState<ImageRef[]>([]);
  const [showNodePicker, setShowNodePicker] = useState(false);
  const nodePickerRef = useRef<HTMLDivElement>(null);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [quality, setQuality] = useState('standard');
  const [batchCount, setBatchCount] = useState(1);
  const [outputFormat, setOutputFormat] = useState('');
  const [showAspectDropdown, setShowAspectDropdown] = useState(false);
  const [showQualityDropdown, setShowQualityDropdown] = useState(false);
  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  const aspectDropdownRef = useRef<HTMLDivElement>(null);
  const qualityDropdownRef = useRef<HTMLDivElement>(null);
  const formatDropdownRef = useRef<HTMLDivElement>(null);

  // Derived
  const selectedModel = models.find((m) => `${m.provider_id}::${m.model_name}` === selectedModelKey) || null;
  const selectedProviderType = selectedModel?.provider_type || '';
  const { capabilities } = useImageModelCapabilities(selectedProviderType || null);
  const visibility = useImageFormVisibility(capabilities);

  // Auto-correct params when capabilities change
  useEffect(() => {
    const caps = capabilities;
    caps && (() => {
      caps.aspect_ratios.length > 0 && !caps.aspect_ratios.includes(aspectRatio) && setAspectRatio(caps.aspect_ratios[0]);
      caps.qualities.length > 0 && !caps.qualities.includes(quality) && setQuality(caps.qualities[0]);
      batchCount < caps.batch_count.min && setBatchCount(caps.batch_count.min);
      batchCount > caps.batch_count.max && setBatchCount(caps.batch_count.max);
      // output format
      const hasFmt = caps.output_formats.length > 0;
      hasFmt && !caps.output_formats.includes(outputFormat) && setOutputFormat(caps.output_formats[0]);
      !hasFmt && outputFormat && setOutputFormat('');
      // mode 自纠：若当前供应商不支持当前 mode，回退到第一项
      const modes = caps.supported_modes || ['text_to_image'];
      !modes.includes(mode) && setMode(modes[0] as ImageMode);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities]);

  // mode 切换时：清空参考图并解除已建立的连线
  const prevModeRef = useRef<ImageMode>(mode);
  useEffect(() => {
    prevModeRef.current !== mode && (() => {
      referenceImages.forEach((r) => r.sourceNodeId !== nodeId && onUnlinkNode?.(r.sourceNodeId));
      setReferenceImages([]);
      setShowNodePicker(false);
      prevModeRef.current = mode;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 可用作参考图的画布节点（带 URL 且未被选择，按 updatedAt 倒序）
  const pickableNodes = useMemo(() => {
    const selectedIds = new Set(referenceImages.map((r) => r.sourceNodeId));
    const filtered = (canvasNodes || [])
      .filter((n) => !selectedIds.has(n.id) && !!getImageNodeUrl(n));
    return selectNodesByUpdatedDesc(filtered).map((n) => ({ node: n, url: getImageNodeUrl(n) }));
  }, [canvasNodes, referenceImages]);

  const maxRefs = IMAGE_MODE_MAX_REFS[mode] || 0;

  const handleSelectNode = useCallback((node: CanvasNode) => {
    const url = getImageNodeUrl(node);
    const reached = referenceImages.length >= maxRefs;
    (url && !reached) && (() => {
      const data = node.data as CharacterNodeData;
      const name = data.name || t('canvas.node.image.refItem', '参考图');
      setReferenceImages((prev) => [...prev, { url, name, sourceNodeId: node.id }]);
      // 选自身不需要连线，否则会形成无意义的自连
      node.id !== nodeId && onLinkNode?.(node.id);
      // edit 模式只能 1 张，选完自动关闭
      maxRefs === 1 && setShowNodePicker(false);
    })();
  }, [referenceImages.length, maxRefs, onLinkNode, nodeId, t]);

  // 先 unlink 再 setState（避免在 updater 中调用外部 setState，解决 React 跨组件渲染警告）
  const handleRemoveRef = useCallback((idx: number) => {
    const target = referenceImages[idx];
    target && target.sourceNodeId !== nodeId && onUnlinkNode?.(target.sourceNodeId);
    setReferenceImages((prev) => prev.filter((_, i) => i !== idx));
  }, [referenceImages, onUnlinkNode, nodeId]);

  // Close dropdowns on outside click — 单一 effect 用映射表驱动
  useEffect(() => {
    const refs: Array<[boolean, React.RefObject<HTMLDivElement | null>, (v: boolean) => void]> = [
      [showModelDropdown, modelDropdownRef, setShowModelDropdown],
      [showAspectDropdown, aspectDropdownRef, setShowAspectDropdown],
      [showQualityDropdown, qualityDropdownRef, setShowQualityDropdown],
      [showFormatDropdown, formatDropdownRef, setShowFormatDropdown],
      [showModeDropdown, modeDropdownRef, setShowModeDropdown],
      [showNodePicker, nodePickerRef, setShowNodePicker],
      [showConfig, configRef, setShowConfig],
    ];
    const handle = (e: MouseEvent) => {
      refs.forEach(([open, ref, setter]) => {
        open && ref.current && !ref.current.contains(e.target as HTMLElement) && setter(false);
      });
    };
    const anyOpen = refs.some(([open]) => open);
    anyOpen && document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showModelDropdown, showAspectDropdown, showQualityDropdown, showFormatDropdown, showModeDropdown, showNodePicker, showConfig]);

  // Apply initialConfig once when models are available
  const appliedInitRef = useRef(false);
  useEffect(() => {
    const cfg = initialConfig;
    (cfg && models.length > 0 && !appliedInitRef.current) && (() => {
      appliedInitRef.current = true;
      cfg.prompt && setPrompt(cfg.prompt);
      const key = cfg.provider_id && cfg.model ? `${cfg.provider_id}::${cfg.model}` : '';
      key && models.some(m => `${m.provider_id}::${m.model_name}` === key) && setSelectedModelKey(key);
      cfg.aspect_ratio && setAspectRatio(cfg.aspect_ratio);
      cfg.quality && setQuality(cfg.quality);
      cfg.batch_count && setBatchCount(cfg.batch_count);
      cfg.output_format && setOutputFormat(cfg.output_format);
    })();
  }, [initialConfig, models]);

  // Flatten models with provider info
  const flatModels = useMemo(() => {
    const list: { key: string; model: typeof models[number]; providerType: string; providerName: string }[] = [];
    const covered = new Set<string>();
    for (const p of providers) {
      covered.add(p.id);
      for (const m of models.filter(mm => mm.provider_id === p.id)) {
        list.push({
          key: `${m.provider_id}::${m.model_name}`,
          model: m,
          providerType: p.provider_type,
          providerName: p.name,
        });
      }
    }
    for (const m of models.filter(mm => !covered.has(mm.provider_id))) {
      list.push({
        key: `${m.provider_id}::${m.model_name}`,
        model: m,
        providerType: m.provider_type,
        providerName: 'Other',
      });
    }
    return list;
  }, [models, providers]);

  const selectedProviderLogo = PROVIDER_ICONS[selectedProviderType] || '';

  // 参考图数量校验：edit 需恰好 1 张；reference_images 至少 1 张；text_to_image 无要求
  const refsOk =
    mode === 'text_to_image' ||
    (mode === 'edit' && referenceImages.length === 1) ||
    (mode === 'reference_images' && referenceImages.length >= 1 && referenceImages.length <= maxRefs);

  const canSubmit = !!selectedModel && prompt.trim().length > 0 && !isSubmitting && !taskActive && enabled && refsOk;

  const handleModelSelect = useCallback((key: string) => {
    setSelectedModelKey(key);
    setShowModelDropdown(false);
  }, []);

  const handleSubmit = () => {
    const m = selectedModel;
    m && onSubmit({
      provider_id: m.provider_id,
      model: m.model_name,
      prompt: prompt.trim(),
      mode,
      reference_images: referenceImages.length > 0 ? referenceImages.map((r) => ({ url: r.url })) : undefined,
      config: {
        aspect_ratio: aspectRatio || undefined,
        quality: (quality as 'standard' | 'hd' | 'ultra') || undefined,
        batch_count: batchCount,
        output_format: (outputFormat as 'png' | 'jpeg' | 'webp') || undefined,
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 提交、Shift+Enter 换行
    e.key === 'Enter' && !e.shiftKey && (() => {
      e.preventDefault();
      canSubmit && handleSubmit();
    })();
  };

  // Textarea auto-resize
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resize handle for input container (对齐 VideoGeneratePanel 实现)
  // 默认最大高度 252px ≈ 12 行（text-[13px] leading-relaxed）
  const DEFAULT_MAX_H = 252;
  const [inputMaxHeight, setInputMaxHeight] = useState<number | null>(null);
  const effectiveMaxH = inputMaxHeight ?? DEFAULT_MAX_H;
  const resizingRef = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = true;
    resizeStartY.current = e.clientY;
    resizeStartH.current = textareaRef.current?.offsetHeight ?? 44;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    resizingRef.current && (() => {
      const delta = e.clientY - resizeStartY.current;
      const newH = Math.max(44, Math.min(400, resizeStartH.current + delta));
      setInputMaxHeight(newH);
    })();
  }, []);

  const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
    resizingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    el && (() => {
      el.style.height = 'auto';
      // 用户拖拽后强制高度 = inputMaxHeight；未拖拽时默认按内容自适应，上限 DEFAULT_MAX_H
      el.style.height = `${inputMaxHeight ?? Math.min(el.scrollHeight, DEFAULT_MAX_H)}px`;
    })();
  }, [prompt, inputMaxHeight]);

  return (
    <div className="w-full space-y-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {/* 全局禁用提示 */}
      {!enabled && !modelsLoading && (
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] p-1.5 rounded-md bg-muted/40 border border-border/40">
          <XCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{t('canvas.node.image.disabledGlobally', '图像生成功能未启用')}</span>
        </div>
      )}

      {/* Main input container */}
      <div ref={inputContainerRef} className="bg-muted/50 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200 flex flex-col relative">
        {/* 参考图缩略图条（仅 edit / reference_images 模式且有条目时显示） */}
        {referenceImages.length > 0 && (
          <div className="px-3 pt-2.5 pb-0 flex gap-1.5 flex-wrap">
            {referenceImages.map((r, i) => (
              <div key={`${r.sourceNodeId}-${i}`} className="relative inline-block group/imgpreview">
                <img
                  src={r.url}
                  alt={r.name}
                  draggable={false}
                  className="h-14 w-14 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveRef(i)}
                  disabled={taskActive}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/imgpreview:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground disabled:opacity-30"
                  title={t('canvas.node.image.removeRef', '移除')}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 px-0.5 py-0.5 rounded-b-lg text-[7px] font-semibold bg-black/70 text-white backdrop-blur-sm text-center leading-tight truncate">
                  <span className="text-blue-300">&lt;IMAGE_{i + 1}&gt;</span>
                  <br />
                  <span className="opacity-80">{r.name}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Prompt textarea */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('canvas.node.image.promptPlaceholder', '描述你想生成的图像内容...')}
          disabled={taskActive}
          rows={2}
          className={cn(
            'w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-relaxed',
            'placeholder:text-muted-foreground/60 focus:outline-none',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
          style={{ maxHeight: effectiveMaxH, minHeight: 44 }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
          {/* Left: model selector + mode selector + node picker */}
          <div className="flex items-center gap-1">
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => setShowModelDropdown(v => !v)}
                disabled={modelsLoading || taskActive || !enabled}
                className={cn(
                  'h-8 pl-2 pr-6 rounded-lg bg-transparent text-sm font-medium cursor-pointer inline-flex items-center gap-1.5',
                  'hover:bg-primary/10 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  selectedModelKey ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {selectedProviderLogo && <img src={selectedProviderLogo} alt="" className="w-4 h-4 object-contain" />}
                {modelsLoading ? '...' : (selectedModel?.display_name || t('canvas.node.image.selectModel', '选择模型'))}
                <ChevronDown className={cn(
                  'absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-transform duration-150',
                  showModelDropdown && 'rotate-180',
                )} />
              </button>

              {showModelDropdown && (
                <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                  {flatModels.map(({ key, model: m, providerType, providerName }) => {
                    const logoSrc = PROVIDER_ICONS[providerType];
                    const isSelected = key === selectedModelKey;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleModelSelect(key)}
                        title={providerName}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-2 text-xs transition-colors cursor-pointer',
                          isSelected
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-accent',
                        )}
                      >
                        {logoSrc
                          ? <img src={logoSrc} alt="" className="w-4 h-4 object-contain shrink-0" />
                          : <span className="w-4 h-4 shrink-0" />}
                        <span className="flex-1 text-left font-medium truncate">{m.display_name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                  {models.length === 0 && !modelsLoading && (
                    <div className="p-3 text-[10px] text-muted-foreground text-center">
                      {t('canvas.node.image.noImageProviders', '未找到图像供应商，请联系管理员配置')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: node picker + config + action buttons */}
          <div className="flex items-center gap-1">
            {/* Node picker — 仅当 mode 需要参考图时显示（与 VideoGeneratePanel 规范一致） */}
            {selectedModel && mode !== 'text_to_image' && (
              <div className="relative" ref={nodePickerRef}>
                <button
                  type="button"
                  onClick={() => setShowNodePicker((v) => !v)}
                  disabled={taskActive || pickableNodes.length === 0}
                  className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center',
                    'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    showNodePicker && 'bg-accent text-foreground',
                    referenceImages.length > 0 && 'text-primary',
                  )}
                  title={t('canvas.node.image.pickRefNode', '选择参考图节点')}
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                {showNodePicker && (
                  <NodePickerDropdown
                    open={showNodePicker}
                    anchor="bottom"
                    align="right"
                    title={t('canvas.node.image.pickRefNodeHint', '已选 {{c}}/{{m}}', { c: referenceImages.length, m: maxRefs })}
                    emptyText={t('canvas.node.image.noPickableNodes', '画布中没有可用的图像节点')}
                    items={pickableNodes.map<NodePickerItem>(({ node, url }) => {
                      const data = node.data as CharacterNodeData;
                      const atLimit = referenceImages.length >= maxRefs;
                      return {
                        node,
                        label: data.name || node.id.slice(0, 8),
                        thumbUrl: url,
                        disabled: atLimit,
                      };
                    })}
                    onSelect={handleSelectNode}
                  />
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              disabled={!selectedModel || taskActive}
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center',
                'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                showConfig && 'bg-accent text-foreground',
              )}
              title={t('canvas.node.image.advancedSettings', '高级设置')}
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {taskActive ? (
              <button
                type="button"
                onClick={onStop}
                disabled={!onStop}
                className="h-8 w-8 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center disabled:opacity-60"
                title={t('canvas.node.image.stopGenerate', '停止生成')}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  'h-8 w-8 rounded-lg transition-all duration-200 flex items-center justify-center',
                  canSubmit
                    ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
                title={t('canvas.node.image.submit', '开始生成')}
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Resize handle — at bottom edge of the input container (对齐 VideoGeneratePanel) */}
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center justify-center h-3 w-12 cursor-ns-resize group/resize select-none z-10"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
        >
          <div className="w-8 h-[3px] rounded-full bg-border/40 group-hover/resize:bg-border/80 group-active/resize:bg-primary/60 transition-colors" />
        </div>
      </div>

      {/* Apply button — 生成成功后 */}
      {taskDone && (
        <button
          type="button"
          onClick={hasExistingImage ? onApplyToNextNode : onApplyToNode}
          className="w-full h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          {hasExistingImage
            ? t('canvas.node.image.applyToNextNode', '应用到新节点')
            : t('canvas.node.image.applyToNode', '应用到当前节点')}
        </button>
      )}

      {/* Expandable config section */}
      {showConfig && selectedModel && (
        <div
          ref={configRef}
          className="rounded-lg border border-border/50 bg-card p-2.5 space-y-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {/* Mode — 仅当供应商支持多个模式时显示（与 VideoGeneratePanel 规范一致） */}
          {visibility.supportedModes.length > 1 && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.modeTitle', '生成模式')}</label>
              <div className="relative" ref={modeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowModeDropdown((v) => !v)}
                  className={cn(SELECT_CLS, 'flex items-center justify-between')}
                  style={SELECT_ARROW_STYLE}
                >
                  {t(`canvas.node.image.mode.${mode}`, IMAGE_MODE_LABELS[mode])}
                </button>
                {showModeDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                    {visibility.supportedModes.map((md) => {
                      const isSelected = md === mode;
                      return (
                        <button
                          key={md}
                          type="button"
                          onClick={() => { setMode(md as ImageMode); setShowModeDropdown(false); }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                            isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                          )}
                        >
                          <span className="flex-1 text-left">
                            {t(`canvas.node.image.mode.${md}`, IMAGE_MODE_LABELS[md])}
                          </span>
                          {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Aspect Ratio + Quality */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.aspectRatio', '画面比例')}</label>
              <div className="relative" ref={aspectDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowAspectDropdown(v => !v)}
                  className={cn(SELECT_CLS, 'flex items-center gap-1.5')}
                  style={SELECT_ARROW_STYLE}
                >
                  <AspectRatioIcon ratio={aspectRatio} className="w-4 h-4 text-muted-foreground shrink-0" />
                  {ASPECT_RATIO_LABELS[aspectRatio] || aspectRatio}
                </button>
                {showAspectDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden max-h-56 overflow-y-auto">
                    {visibility.aspectRatioOptions.map((ar) => {
                      const isSelected = ar === aspectRatio;
                      return (
                        <button
                          key={ar}
                          type="button"
                          onClick={() => { setAspectRatio(ar); setShowAspectDropdown(false); }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                            isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                          )}
                        >
                          <AspectRatioIcon ratio={ar} className={cn('w-4 h-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                          <span className="flex-1 text-left">{ASPECT_RATIO_LABELS[ar] || ar}</span>
                          {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.quality', '画质')}</label>
              <div className="relative" ref={qualityDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowQualityDropdown(v => !v)}
                  className={cn(SELECT_CLS, 'flex items-center justify-between')}
                  style={SELECT_ARROW_STYLE}
                >
                  {QUALITY_LABELS[quality] || quality}
                </button>
                {showQualityDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                    {visibility.qualityOptions.map((q) => {
                      const isSelected = q === quality;
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => { setQuality(q); setShowQualityDropdown(false); }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                            isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                          )}
                        >
                          <span className="flex-1 text-left">{QUALITY_LABELS[q] || q}</span>
                          {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Batch Count */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.batchCount', '生成数量')}</label>
              <span className="text-[11px] font-medium">{batchCount}</span>
            </div>
            <Slider
              value={[batchCount]}
              onValueChange={(v) => setBatchCount(v[0])}
              min={visibility.batchMin}
              max={visibility.batchMax}
              step={1}
            />
          </div>

          {/* Output Format（仅当供应商支持） */}
          {visibility.showOutputFormat && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.outputFormat', '输出格式')}</label>
              <div className="relative" ref={formatDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowFormatDropdown(v => !v)}
                  className={cn(SELECT_CLS, 'flex items-center justify-between')}
                  style={SELECT_ARROW_STYLE}
                >
                  {(outputFormat || visibility.outputFormatOptions[0] || '').toUpperCase()}
                </button>
                {showFormatDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                    {visibility.outputFormatOptions.map((f) => {
                      const isSelected = f === outputFormat;
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => { setOutputFormat(f); setShowFormatDropdown(false); }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                            isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                          )}
                        >
                          <span className="flex-1 text-left">{f.toUpperCase()}</span>
                          {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task failed */}
      {taskFailed && taskError && (
        <div className="flex items-center gap-1.5 text-destructive text-[11px] p-1">
          <XCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{taskError}</span>
        </div>
      )}

      {submitError && (
        <div className="flex items-center gap-1.5 text-destructive text-[11px] p-1">
          <XCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{submitError}</span>
        </div>
      )}
    </div>
  );
}
