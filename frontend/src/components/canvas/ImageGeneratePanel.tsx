'use client';

import React, { useState } from 'react';
import { XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useImagePanelForm } from '@/hooks/useImagePanelForm';
import { useImagePanelReferences } from '@/hooks/useImagePanelReferences';
import { usePanelResize } from '@/hooks/usePanelResize';
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

  const canSubmit =
    !!form.selectedModel &&
    form.prompt.trim().length > 0 &&
    !isSubmitting &&
    !taskActive &&
    form.enabled &&
    refs.refsOk;

  const handleSubmit = () => {
    const m = form.selectedModel;
    m && onSubmit({
      provider_id: m.provider_id,
      model: m.model_name,
      prompt: form.prompt.trim(),
      mode: form.mode,
      reference_images: refs.referenceImages.length > 0
        ? refs.referenceImages.map((r) => ({ url: r.url }))
        : undefined,
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
