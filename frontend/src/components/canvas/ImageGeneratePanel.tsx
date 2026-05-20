'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { XCircle, FileImage, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useImagePanelForm } from '@/hooks/useImagePanelForm';
import { useImagePanelReferences } from '@/hooks/useImagePanelReferences';
import { usePanelResize } from '@/hooks/usePanelResize';
import { onPanelInject, takePendingSmartInject, hasPendingSmartInject } from '@/lib/canvas/panelEvents';
import { mediaUrlsToDataUrls, TEXT_PROMPT_MAX } from '@/lib/canvas/edgePayload';
import { edgeToast } from '@/lib/canvas/toast';
import { ReferenceImagesBar } from './ImageGeneratePanel/ReferenceImagesBar';
import { PromptInput } from './ImageGeneratePanel/PromptInput';
import { ModelSelector } from './ImageGeneratePanel/ModelSelector';
import { NodeRefPicker } from './ImageGeneratePanel/NodeRefPicker';
import { PanelActionButtons, ApplyButton } from './ImageGeneratePanel/PanelActionButtons';
import { ConfigPanel } from './ImageGeneratePanel/ConfigPanel';
import type { ImageGeneratePanelProps } from './ImageGeneratePanel/types';

// 对外命名类型 re-export（保持向后兼容）
export type { ImageRef, ImagePanelModeRequest, ImageGeneratePanelProps } from './ImageGeneratePanel/types';

export default function ImageGeneratePanel(props: ImageGeneratePanelProps) {
  const {
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
    modeRequest,
  } = props;
  const { t } = useTranslation();

  // 表单 + 参考图 + 缩放 三大 hook
  const form = useImagePanelForm(initialConfig);
  const refs = useImagePanelReferences({
    mode: form.mode,
    setMode: form.setMode,
    nodeId,
    canvasNodes,
    modeRequest,
    onLinkNode,
    onUnlinkNode,
  });
  const { textareaRef, effectiveMaxH, resizeHandlers } = usePanelResize(form.prompt);

  const [showConfig, setShowConfig] = useState(false);

  // 图像节点连线到图像节点的注入处理：
  // 设计原则：连线 == 「源节点加入参考图列表」，**不**主动切换生成模式，由用户手动选择。
  // - 源节点可能有多张图，这里只取第一张作为该源对应的参考图（一个源节点 → 一个参考图条目）。
  // - 当前模式不接受参考图（text_to_image 容量=0）或已达上限时，toast 提示用户切模式
  //   （用户切到 edit/reference_images 后，useImagePanelReferences 的 mode-change effect 会
  //   从已有的 incoming edges 自动回填参考图）。
  const handleSmartImageInject = useCallback(
    (event: { sourceNodeId: string; urls: string[]; name?: string }) => {
      const urls = (event.urls || []).filter((u) => typeof u === 'string' && u.length > 0);
      if (urls.length === 0) return;
      const url = urls[0];
      const name = event.name || t('canvas.node.image.refItem', '参考图');
      const result = refs.addRefExternal(event.sourceNodeId, url, name);
      // duplicate 静默（重复连线等常见无害场景）；limit 时给出可操作提示
      result.ok === false && result.reason === 'limit' && edgeToast.warn(
        t(
          'canvas.node.image.refLimitReached',
          '当前模式不接受更多参考图，请切换到「图像编辑」或「多图参考」模式',
        ),
      );
    },
    [refs, t],
  );

  // 订阅由上游连线触发的面板注入事件
  useEffect(() => {
    const handlers: Record<string, (event: any) => void> = {
      'prompt-prefix': (event: { text: string }) => {
        // 追加到 prompt 开头，已存在内容用双换行隔开
        const current = form.prompt;
        const prefix = event.text.trim();
        const next = current.trim().length > 0 ? `${prefix}\n\n${current}` : prefix;
        form.setPrompt(next.slice(0, TEXT_PROMPT_MAX));
      },
      'add-reference-image': (event: { sourceNodeId: string; url: string; name?: string }) => {
        const result = refs.addRefExternal(event.sourceNodeId, event.url, event.name);
        result.ok === false && result.reason === 'limit' && edgeToast.warn(
          t('canvas.node.image.refLimitReached', '参考图已达上限，无法再添加'),
        );
      },
      'smart-image-inject': (event: { sourceNodeId: string; urls: string[]; name?: string }) => {
        // 消费可能已写入的 pending，避免 drain effect 因 refs 引用变化而重复触发同一事件
        takePendingSmartInject(nodeId);
        handleSmartImageInject(event);
      },
    };
    const unsubscribe = onPanelInject(nodeId, (ev) => {
      handlers[ev.type]?.(ev as unknown as { text: string } & { sourceNodeId: string; url: string; urls: string[]; name?: string });
    });
    return unsubscribe;
  }, [nodeId, form, refs, t, handleSmartImageInject]);

  // capabilities 就绪后 drain pending smart-image-inject（涵盖 QuickAdd 时序不同步 + 模型未选场景）
  useEffect(() => {
    if (!form.capabilities) return;
    const pending = takePendingSmartInject(nodeId);
    pending && handleSmartImageInject(pending);
  }, [nodeId, form.capabilities, handleSmartImageInject]);

  // 有 pending 却还没选模型 → 自动选模型列表第一个（图像模型普遍支持 edit，动作安全）
  // 触发链：flatModels 到达 → handleModelSelect → selectedModel 变化 → capabilities 到达 → drain effect
  useEffect(() => {
    const shouldAuto = !form.selectedModelKey
      && form.flatModels.length > 0
      && hasPendingSmartInject(nodeId);
    shouldAuto && form.handleModelSelect(form.flatModels[0].key);
  }, [nodeId, form.selectedModelKey, form.flatModels, form.handleModelSelect]);

  const canSubmit =
    !!form.selectedModel &&
    form.prompt.trim().length > 0 &&
    !isSubmitting &&
    !taskActive &&
    form.enabled &&
    refs.refsOk;

  const handleSubmit = async () => {
    const m = form.selectedModel;
    if (!m) return;
    // 将 /api/media/ 本地 URL 转为 base64 data URL，保证 provider 可读
    const refUrls = refs.referenceImages.map((r) => r.url);
    const dataUrls = await mediaUrlsToDataUrls(refUrls);
    onSubmit({
      provider_id: m.provider_id,
      model: m.model_name,
      prompt: form.prompt.trim().slice(0, TEXT_PROMPT_MAX),
      mode: form.mode,
      reference_images: dataUrls.length > 0 ? dataUrls.map((url) => ({ url })) : undefined,
      mask_url: (form.mode === 'edit' && form.maskUrl) ? form.maskUrl : undefined,
      config: {
        aspect_ratio: form.aspectRatio || undefined,
        quality: (form.quality as 'standard' | 'hd' | 'ultra') || undefined,
        batch_count: form.batchCount,
        output_format: (form.outputFormat as 'png' | 'jpeg' | 'webp') || undefined,
        background: (form.background as 'auto' | 'transparent' | 'opaque') || undefined,
        moderation: (form.moderation as 'auto' | 'low') || undefined,
        output_compression: form.outputCompression ?? undefined,
      },
    });
  };

  // P2: 蒙版上传（edit 模式且能力允许）
  const maskInputRef = useRef<HTMLInputElement | null>(null);
  const handleMaskFile = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      typeof result === 'string' && form.setMaskUrl(result);
    };
    reader.readAsDataURL(file);
  }, [form]);

  return (
    <div className="w-full space-y-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {/* 全局禁用提示 */}
      {!form.enabled && !form.modelsLoading && (
        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] p-1.5 rounded-md bg-muted/40 border border-border/40">
          <XCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{t('canvas.node.image.disabledGlobally', '图像生成功能未启用')}</span>
        </div>
      )}

      {/* Main input container */}
      <div className="bg-muted/50 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200 flex flex-col relative">
        <ReferenceImagesBar
          referenceImages={refs.referenceImages}
          taskActive={taskActive}
          onRemove={refs.removeRef}
        />

        <PromptInput
          value={form.prompt}
          onChange={form.setPrompt}
          taskActive={taskActive}
          maxHeight={effectiveMaxH}
          textareaRef={textareaRef}
          resizeHandlers={resizeHandlers}
          onSubmit={handleSubmit}
          canSubmit={canSubmit}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
          <div className="flex items-center gap-1">
            <ModelSelector
              selectedModelKey={form.selectedModelKey}
              selectedModel={form.selectedModel}
              flatModels={form.flatModels}
              modelsCount={form.models.length}
              modelsLoading={form.modelsLoading}
              enabled={form.enabled}
              taskActive={taskActive}
              onSelect={form.handleModelSelect}
            />
          </div>

          <div className="flex items-center gap-1">
            {form.selectedModel && form.mode !== 'text_to_image' && (
              <NodeRefPicker
                pickableNodes={refs.pickableNodes}
                referencesCount={refs.referenceImages.length}
                maxRefs={refs.maxRefs}
                taskActive={taskActive}
                onSelect={refs.selectNode}
              />
            )}

            {/* P2: edit 模式 + 供应商支持蒙版 → 蒙版上传按钮 */}
            {form.selectedModel && form.mode === 'edit' && form.visibility.supportsMask && (
              <>
                <input
                  ref={maskInputRef}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(e) => {
                    handleMaskFile(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={taskActive}
                  onClick={() => form.maskUrl ? form.setMaskUrl('') : maskInputRef.current?.click()}
                  title={form.maskUrl
                    ? t('canvas.node.image.maskRemove', '移除蒙版')
                    : t('canvas.node.image.maskUpload', '上传 PNG 蒙版（透明区=被编辑）')}
                  className={`h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${form.maskUrl ? 'text-primary' : ''}`}
                >
                  {form.maskUrl ? <X className="w-4 h-4" /> : <FileImage className="w-4 h-4" />}
                </button>
              </>
            )}

            <PanelActionButtons
              taskActive={taskActive}
              canSubmit={canSubmit}
              hasSelectedModel={!!form.selectedModel}
              showConfig={showConfig}
              onToggleConfig={() => setShowConfig((v) => !v)}
              onStop={onStop}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>

      {/* Apply button — 生成成功后 */}
      {taskDone && (
        <ApplyButton
          hasExistingImage={hasExistingImage}
          onApplyToNode={onApplyToNode}
          onApplyToNextNode={onApplyToNextNode}
        />
      )}

      {/* Expandable config section */}
      {showConfig && form.selectedModel && (
        <ConfigPanel
          visibility={form.visibility}
          mode={form.mode}
          setMode={form.setMode}
          aspectRatio={form.aspectRatio}
          setAspectRatio={form.setAspectRatio}
          quality={form.quality}
          setQuality={form.setQuality}
          batchCount={form.batchCount}
          setBatchCount={form.setBatchCount}
          outputFormat={form.outputFormat}
          setOutputFormat={form.setOutputFormat}
          background={form.background}
          setBackground={form.setBackground}
          moderation={form.moderation}
          setModeration={form.setModeration}
          outputCompression={form.outputCompression}
          setOutputCompression={form.setOutputCompression}
        />
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
