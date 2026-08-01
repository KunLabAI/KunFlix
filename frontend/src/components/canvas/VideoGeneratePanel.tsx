'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { XCircle } from 'lucide-react';
import { useVideoPanelForm } from '@/hooks/useVideoPanelForm';
import { useVideoPanelReferences } from '@/hooks/useVideoPanelReferences';
import { useVideoPanelResize } from '@/hooks/useVideoPanelResize';
import { onPanelInject, takePendingSmartInject, hasPendingSmartInject } from '@/lib/canvas/panelEvents';
import {
  mediaUrlsToDataUrls,
  mediaUrlToDataUrl,
  TEXT_PROMPT_MAX,
} from '@/lib/canvas/edgePayload';
import { edgeToast } from '@/lib/canvas/toast';
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
import { VIDEO_PROMPT_MAX } from './VideoGeneratePanel/constants';
import type { VideoGeneratePanelProps } from './VideoGeneratePanel/types';

// 对外类型 re-export —— 保持向后兼容
export type { VideoGeneratePanelProps } from './VideoGeneratePanel/types';

export default function VideoGeneratePanel(props: VideoGeneratePanelProps) {
  const {
    onSubmit,
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
    nodeId,
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

  // ── 展开配置区（与图像面板对齐：仅由按钮 toggle，不因点击外部（输入框等）而自动关闭）──
  const [showConfig, setShowConfig] = useState(false);
  const [showNodePicker, setShowNodePicker] = useState(false);

  // 智能图像注入 handler（订阅 + pending drain 共用）
  //
  // 规则（尊重用户已选模式，不强制切换）：
  //   - 当前 pickerMode 能接受图像（first_last_frame / multi_image / single_image），
  //     或面板已有参考素材 → 仅「追加」到当前模式，不切换 videoMode。
  //     这修复了「已切到多模态参考但素材为空时，再拖连线会被强制切回图生视频」的 bug。
  //     失败时 toast 提示用户手动切模式。
  //   - 当前 pickerMode 不接受图像（text_to_video / edit / video_extension）且面板空态
  //     （QuickAdd 新建节点的典型场景）：按 url 数量自选模式
  //     （1 张 → image_to_video；多张 → reference_images）。
  const handleSmartImageInject = useCallback(
    (event: { sourceNodeId: string; urls: string[]; name?: string }) => {
      const urls = (event.urls || []).filter((u) => typeof u === 'string' && u.length > 0);
      if (urls.length === 0) return;
      const baseLabel = event.name || '参考图';

      // 当前 pickerMode 是否能接受图像类型
      const pickerAcceptsImage =
        refs.pickerMode === 'single_image' ||
        refs.pickerMode === 'first_last_frame' ||
        refs.pickerMode === 'multi_image';

      const hasExistingContent =
        !!refs.imageUrl ||
        !!refs.lastFrameImageUrl ||
        !!refs.extensionVideoUrl ||
        refs.referenceImages.length > 0;

      // 1) 当前模式能接受图像 OR 面板已有素材 → 仅追加，不切模式
      const appendOnly = pickerAcceptsImage || hasExistingContent;
      if (appendOnly) {
        const results = urls.map((url, i) => {
          const name = urls.length > 1 ? `${baseLabel} ${i + 1}` : baseLabel;
          return refs.addImageExternal(event.sourceNodeId, url, name);
        });
        const okCount = results.filter((r) => r.ok).length;
        const noSlotHit = results.some((r) => r.ok === false && r.reason === 'no_slot');
        const limitHit = results.some((r) => r.ok === false && r.reason === 'limit');
        const dupHit = results.some((r) => r.ok === false && r.reason === 'duplicate');
        okCount === 0 && noSlotHit && edgeToast.warn('当前模式不接受该参考图，请手动切换模式');
        okCount === 0 && !noSlotHit && limitHit && edgeToast.warn('参考图已达当前模式上限');
        okCount === 0 && !noSlotHit && !limitHit && dupHit && edgeToast.info('该参考项已存在');
        okCount > 0 && (noSlotHit || limitHit) &&
          edgeToast.info(`已追加 ${okCount} 张，其余因容量/类型不匹配被跳过`);
        return;
      }

      // 2) 当前模式不接受图像且空态 → 按数量自选模式（QuickAdd 新节点场景）
      const targetMode = urls.length === 1 ? 'image_to_video' : 'reference_images';
      const modeLabel = targetMode === 'image_to_video' ? '图生视频' : '多模态参考';
      const modes = form.capabilities?.modes || [];
      const supported = modes.includes(targetMode);
      if (!supported) {
        edgeToast.warn(`当前模型不支持「${modeLabel}」模式，请先手动切换模型`);
        return;
      }
      const items = urls.map((url, i) => ({
        url,
        name: urls.length > 1 ? `${baseLabel} ${i + 1}` : baseLabel,
        sourceNodeId: event.sourceNodeId,
      }));
      const { appliedCount, droppedCount } = refs.applySmartInject(targetMode, items);
      droppedCount > 0 && edgeToast.info(`已截断为前 ${appliedCount} 张（「${modeLabel}」模式上限）`);
    },
    [form.capabilities, refs],
  );

  // 订阅上游连线触发的面板注入事件
  useEffect(() => {
    const warnLimit = () => edgeToast.warn('参考项已达上限，无法再添加');
    const warnNoSlot = () => edgeToast.warn('当前模式不接受这种参考项');
    const warnDup = () => edgeToast.info('该参考项已存在');
    const handleAfter = (r: { ok: boolean; reason?: 'no_slot' | 'limit' | 'duplicate' }) => {
      r.ok === false && r.reason === 'limit' && warnLimit();
      r.ok === false && r.reason === 'no_slot' && warnNoSlot();
      r.ok === false && r.reason === 'duplicate' && warnDup();
    };
    const handlers: Record<string, (event: any) => void> = {
      'prompt-prefix': (event: { text: string }) => {
        const current = form.prompt;
        const prefix = event.text.trim();
        const next = current.trim().length > 0 ? `${prefix}\n\n${current}` : prefix;
        form.setPrompt(next.slice(0, TEXT_PROMPT_MAX));
      },
      'add-reference-image': (event: { sourceNodeId: string; url: string; name?: string; tag?: 'first-frame' }) => {
        handleAfter(refs.addImageExternal(event.sourceNodeId, event.url, event.name, event.tag));
      },
      'add-reference-video': (event: { sourceNodeId: string; url: string; name?: string }) => {
        handleAfter(refs.addVideoExternal(event.sourceNodeId, event.url, event.name));
      },
      'add-reference-audio': (event: { sourceNodeId: string; url: string; name?: string }) => {
        handleAfter(refs.addAudioExternal(event.sourceNodeId, event.url, event.name));
      },
      'smart-image-inject': (event: { sourceNodeId: string; urls: string[]; name?: string }) => {
        // 消费可能已写入的 pending，避免 drain effect 因 refs 引用变化而重复触发同一事件
        takePendingSmartInject(nodeId);
        handleSmartImageInject(event);
      },
    };
    const unsubscribe = onPanelInject(nodeId, (ev) => {
      handlers[ev.type]?.(ev as unknown as { text: string } & { sourceNodeId: string; url: string; urls: string[]; name?: string; tag?: 'first-frame' });
    });
    return unsubscribe;
  }, [nodeId, form, refs, handleSmartImageInject]);

  // capabilities 就绪后 drain pending smart-image-inject（涵盖 QuickAdd 时序不同步 + 模型未选场景）
  useEffect(() => {
    if (!form.capabilities) return;
    const pending = takePendingSmartInject(nodeId);
    pending && handleSmartImageInject(pending);
  }, [nodeId, form.capabilities, handleSmartImageInject]);

  // 有 pending 却还没选模型 → 自动选模型列表第一个。视频模型不一定支持 image_to_video / reference_images，
  // 不支持时 drain 分支将弹警告提醒用户手动换模型；首选可尽量视为“合理默认”。
  useEffect(() => {
    const shouldAuto = !form.selectedModelKey
      && form.flatModels.length > 0
      && hasPendingSmartInject(nodeId);
    shouldAuto && form.handleModelChange(form.flatModels[0].key);
  }, [nodeId, form.selectedModelKey, form.flatModels, form.handleModelChange]);

  const canSubmit =
    !!form.selectedModel &&
    form.prompt.trim().length > 0 &&
    !isSubmitting &&
    !taskActive;

  const handleModelSelect = (key: string) => {
    refs.unlinkAll();
    form.handleModelChange(key);
  };

  const handleSubmit = async () => {
    const m = form.selectedModel;
    if (!m) return;
    const isRef = form.videoMode === 'reference_images';
    const imgRefs = refs.referenceImages.filter((r) => r.refType === 'image');
    const vidRefs = refs.referenceImages.filter((r) => r.refType === 'video');
    const audRefs = refs.referenceImages.filter((r) => r.refType === 'audio');
    // 将所有本地 /api/media/ URL 转为 base64 data URL
    const [imgUrls, vidUrls, audUrls, firstFrame, lastFrame, extVideo] = await Promise.all([
      mediaUrlsToDataUrls(imgRefs.map((r) => r.url)),
      mediaUrlsToDataUrls(vidRefs.map((r) => r.url)),
      mediaUrlsToDataUrls(audRefs.map((r) => r.url)),
      refs.imageUrl && form.visibility.showFirstFrame ? mediaUrlToDataUrl(refs.imageUrl) : Promise.resolve(''),
      refs.lastFrameImageUrl && form.visibility.showLastFrame ? mediaUrlToDataUrl(refs.lastFrameImageUrl) : Promise.resolve(''),
      refs.extensionVideoUrl && (form.videoMode === 'edit' || form.videoMode === 'video_extension')
        ? mediaUrlToDataUrl(refs.extensionVideoUrl) : Promise.resolve(''),
    ]);
    onSubmit({
      provider_id: m.provider_id,
      model: m.model_name,
      video_mode: form.videoMode,
      prompt: form.prompt.trim().slice(0, VIDEO_PROMPT_MAX),
      image_url: firstFrame || undefined,
      last_frame_image: lastFrame || undefined,
      reference_images: isRef && imgUrls.length > 0 ? imgUrls.map((url) => ({ url })) : undefined,
      reference_videos: isRef && vidUrls.length > 0 ? vidUrls.map((url) => ({ url })) : undefined,
      reference_audios: isRef && audUrls.length > 0 ? audUrls.map((url) => ({ url })) : undefined,
      extension_video_url: extVideo || undefined,
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
