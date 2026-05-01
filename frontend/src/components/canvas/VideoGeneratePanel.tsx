'use client';

import React, { useRef, useState } from 'react';
import { XCircle } from 'lucide-react';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import { useVideoPanelForm } from '@/hooks/useVideoPanelForm';
import { useVideoPanelReferences } from '@/hooks/useVideoPanelReferences';
import { useVideoPanelResize } from '@/hooks/useVideoPanelResize';
import { AttachmentPreviews } from './VideoGeneratePanel/AttachmentPreviews';
import { PromptInputArea } from './VideoGeneratePanel/PromptInputArea';
import { ModelSelector } from './VideoGeneratePanel/ModelSelector';
import { VirtualHumanPicker } from './VideoGeneratePanel/VirtualHumanPicker';
import { NodeRefPicker } from './VideoGeneratePanel/NodeRefPicker';
import {
  PanelActionButtons,
  ApplyButton,
} from './VideoGeneratePanel/PanelActionButtons';
import { ConfigPanel } from './VideoGeneratePanel/ConfigPanel';
import type { VideoGeneratePanelProps } from './VideoGeneratePanel/types';

// 对外类型 re-export —— 保持向后兼容
export type { VideoGeneratePanelProps } from './VideoGeneratePanel/types';

export default function VideoGeneratePanel(props: VideoGeneratePanelProps) {
  const {
    onSubmit,
    onStop,
    isSubmitting,
    taskActive,
    taskDone,
    taskFailed,
    taskError,
    submitError,
    hasExistingVideo,
    onApplyToNode,
    onApplyToNextNode,
    canvasNodes = [],
    initialConfig,
    onLinkNode,
    onUnlinkNode,
  } = props;

  // ── 三大 hook ──
  const form = useVideoPanelForm(initialConfig);
  const refs = useVideoPanelReferences({
    videoMode: form.videoMode,
    capabilities: form.capabilities,
    selectedModel: form.selectedModel,
    canvasNodes,
    prompt: form.prompt,
    setPrompt: form.setPrompt,
    setVideoMode: form.setVideoMode,
    onLinkNode,
    onUnlinkNode,
  });
  const { inputContainerRef, inputMaxHeight, resizeHandlers } = useVideoPanelResize();

  // ── 展开配置区（仅主文件自己管） ──
  const [showConfig, setShowConfig] = useState(false);
  const configRef = useRef<HTMLDivElement>(null);
  const [showNodePicker, setShowNodePicker] = useState(false);

  useDropdownOutside([[showConfig, configRef, setShowConfig]]);

  const canSubmit =
    !!form.selectedModel &&
    form.prompt.trim().length > 0 &&
    !isSubmitting &&
    !taskActive;

  const handleModelSelect = (key: string) => {
    refs.unlinkAll();
    form.handleModelChange(key);
  };

  const handleSubmit = () => {
    const m = form.selectedModel;
    const isRef = form.videoMode === 'reference_images';
    const imgRefs = refs.referenceImages.filter((r) => r.refType === 'image');
    const vidRefs = refs.referenceImages.filter((r) => r.refType === 'video');
    const audRefs = refs.referenceImages.filter((r) => r.refType === 'audio');
    m && onSubmit({
      provider_id: m.provider_id,
      model: m.model_name,
      video_mode: form.videoMode,
      prompt: form.prompt.trim(),
      image_url: form.visibility.showFirstFrame ? refs.imageUrl || undefined : undefined,
      last_frame_image: form.visibility.showLastFrame ? refs.lastFrameImageUrl || undefined : undefined,
      reference_images: isRef && imgRefs.length > 0 ? imgRefs.map((r) => ({ url: r.url })) : undefined,
      reference_videos: isRef && vidRefs.length > 0 ? vidRefs.map((r) => ({ url: r.url })) : undefined,
      reference_audios: isRef && audRefs.length > 0 ? audRefs.map((r) => ({ url: r.url })) : undefined,
      extension_video_url:
        (form.videoMode === 'edit' || form.videoMode === 'video_extension') && refs.extensionVideoUrl
          ? refs.extensionVideoUrl
          : undefined,
      config: {
        duration: form.duration,
        quality: form.quality,
        aspect_ratio: form.aspectRatio,
        prompt_optimizer: form.visibility.showPromptOptimizer ? form.promptOptimizer : undefined,
        fast_pretreatment: form.visibility.showFastPretreatment ? form.fastPretreatment : undefined,
      },
    });
  };

  const handleSelectNode = (node: Parameters<typeof refs.handleSelectNode>[0]) => {
    const shouldClose = refs.handleSelectNode(node);
    return shouldClose;
  };

  return (
    <div
      className="w-full space-y-1.5"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={inputContainerRef}
        className="bg-muted/50 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200 flex flex-col relative"
      >
        <AttachmentPreviews
          pickerMode={refs.pickerMode}
          imageUrl={refs.imageUrl}
          lastFrameImageUrl={refs.lastFrameImageUrl}
          referenceImages={refs.referenceImages}
          extensionVideoUrl={refs.extensionVideoUrl}
          maxTotalRefs={refs.maxTotalRefs}
          showLastFrame={form.visibility.showLastFrame}
          onOpenPicker={() => setShowNodePicker(true)}
          onClearImage={refs.clearImage}
          onClearFirstLast={refs.clearFirstLastFrames}
          onClearLastFrame={refs.clearLastFrame}
          onClearExtensionVideo={refs.clearExtensionVideo}
          onRemoveRefImage={refs.handleRemoveRefImage}
        />

        <PromptInputArea
          inputRef={refs.inputRef}
          prompt={form.prompt}
          setPrompt={form.setPrompt}
          referenceImages={refs.referenceImages}
          taskActive={taskActive}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          maxHeight={inputMaxHeight}
          resizeHandlers={resizeHandlers}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
          <div className="flex items-center gap-1">
            <ModelSelector
              selectedModelKey={form.selectedModelKey}
              selectedModel={form.selectedModel}
              selectedProviderType={form.selectedProviderType}
              flatModels={form.flatModels}
              modelsCount={form.models.length}
              modelsLoading={form.modelsLoading}
              taskActive={taskActive}
              onSelect={handleModelSelect}
            />
          </div>

          <div className="flex items-center gap-1">
            {refs.showVhButton && (
              <VirtualHumanPicker
                presets={refs.vhPresets}
                imageRefCount={refs.imageRefCount}
                maxRefImages={refs.maxRefImages}
                taskActive={taskActive}
                onSelect={refs.handleSelectVhPreset}
              />
            )}

            {refs.pickerMode !== 'none' && (
              <NodeRefPicker
                open={showNodePicker}
                onOpenChange={setShowNodePicker}
                pickerMode={refs.pickerMode}
                pickerNodes={refs.pickerNodes}
                imageNodes={refs.imageNodes}
                imageUrl={refs.imageUrl}
                hasPickerSelection={refs.hasPickerSelection}
                taskActive={taskActive}
                imageRefCount={refs.imageRefCount}
                videoRefCount={refs.videoRefCount}
                audioRefCount={refs.audioRefCount}
                maxRefImages={refs.maxRefImages}
                maxRefVideos={refs.maxRefVideos}
                maxRefAudios={refs.maxRefAudios}
                maxTotalRefs={refs.maxTotalRefs}
                onSelect={handleSelectNode}
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

      {/* 生成成功后的应用按钮 */}
      {taskDone && (
        <ApplyButton
          hasExistingVideo={hasExistingVideo}
          onApplyToNode={onApplyToNode}
          onApplyToNextNode={onApplyToNextNode}
        />
      )}

      {/* 展开配置区 */}
      {showConfig && form.selectedModel && (
        <ConfigPanel
          containerRef={configRef}
          capabilities={form.capabilities}
          visibility={form.visibility}
          videoMode={form.videoMode}
          setVideoMode={form.setVideoMode}
          duration={form.duration}
          setDuration={form.setDuration}
          quality={form.quality}
          setQuality={form.setQuality}
          aspectRatio={form.aspectRatio}
          setAspectRatio={form.setAspectRatio}
          promptOptimizer={form.promptOptimizer}
          setPromptOptimizer={form.setPromptOptimizer}
          fastPretreatment={form.fastPretreatment}
          setFastPretreatment={form.setFastPretreatment}
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
