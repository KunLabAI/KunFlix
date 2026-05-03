'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { XCircle } from 'lucide-react';
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

  // 智能图像注入 handler（提出以便订阅 + pending drain 共用）
  const handleSmartImageInject = useCallback(
    (event: { sourceNodeId: string; urls: string[]; name?: string }) => {
      const urls = (event.urls || []).filter((u) => typeof u === 'string' && u.length > 0);
      if (urls.length === 0) return;
      // 1 张 → edit；多张 → reference_images
      const targetMode = urls.length === 1 ? 'edit' : 'reference_images';
      const modeLabel = targetMode === 'edit' ? '图像编辑' : '多图参考';
      const supported = form.visibility.supportedModes.includes(targetMode);
      if (!supported) {
        edgeToast.warn(`当前模型不支持「${modeLabel}」模式，请先手动切换模型`);
        return;
      }
      const baseLabel = event.name || t('canvas.node.image.refItem', '参考图');
      const items = urls.map((url, i) => ({
        url,
        name: urls.length > 1 ? `${baseLabel} ${i + 1}` : baseLabel,
        sourceNodeId: event.sourceNodeId,
      }));
      const { appliedCount, droppedCount } = refs.applySmartInject(targetMode, items);
      droppedCount > 0 && edgeToast.info(`已截断为前 ${appliedCount} 张（「${modeLabel}」模式上限）`);
    },
    [form.visibility.supportedModes, refs, t],
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
      'smart-image-inject': handleSmartImageInject,
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
      config: {
        aspect_ratio: form.aspectRatio || undefined,
        quality: (form.quality as 'standard' | 'hd' | 'ultra') || undefined,
        batch_count: form.batchCount,
        output_format: (form.outputFormat as 'png' | 'jpeg' | 'webp') || undefined,
      },
    });
  };

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
