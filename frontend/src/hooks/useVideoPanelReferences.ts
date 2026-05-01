'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  selectNodesByUpdatedDesc,
  type CanvasNode,
} from '@/store/useCanvasStore';
import {
  useVirtualHumanPresets,
  type VideoModelCapabilities,
  type VideoModel,
} from '@/hooks/useVideoGeneration';
import type { RefImage, RefType, RefTagInputRef } from '@/components/canvas/RefTagInput';
import {
  PICKER_MODE_MAP,
  DEFAULT_MAX_REFS,
  TAG_PREFIX_MAP,
} from '@/components/canvas/VideoGeneratePanel/constants';
import {
  getImageNodeUrl,
  getVideoNodeUrl,
  getAudioNodeUrl,
} from '@/components/canvas/VideoGeneratePanel/utils';
import type { PickerMode } from '@/components/canvas/VideoGeneratePanel/types';

interface Options {
  videoMode: string;
  capabilities: VideoModelCapabilities | null;
  selectedModel: VideoModel | null;
  canvasNodes?: CanvasNode[];
  prompt: string;
  setPrompt: (v: string) => void;
  setVideoMode: (mode: string) => void;
  onLinkNode?: (sourceNodeId: string) => void;
  onUnlinkNode?: (sourceNodeId: string) => void;
}

/**
 * 附件（参考图 / 首尾帧 / 延展视频）状态 + 连线维护 +
 * pickerMode 派生 + 虚拟人预设选择 + 选择节点 / 移除节点。
 */
export function useVideoPanelReferences({
  videoMode,
  capabilities,
  selectedModel,
  canvasNodes = [],
  prompt,
  setPrompt,
  setVideoMode,
  onLinkNode,
  onUnlinkNode,
}: Options) {
  // ── 附件状态 ──
  const [imageUrl, setImageUrl] = useState('');
  const [lastFrameImageUrl, setLastFrameImageUrl] = useState('');
  const [referenceImages, setReferenceImages] = useState<RefImage[]>([]);
  const [extensionVideoUrl, setExtensionVideoUrl] = useState('');

  // 单附件槽位的来源节点 ID（multi-ref 用 RefImage.sourceNodeId）
  const imageNodeIdRef = useRef<string | null>(null);
  const lastFrameNodeIdRef = useRef<string | null>(null);
  const extensionVideoNodeIdRef = useRef<string | null>(null);

  // RefTagInput 引用（用于插入 <IMAGE_N> 等 tag）
  const inputRef = useRef<RefTagInputRef>(null);

  // ── link / unlink ──
  const linkNode = useCallback((sourceId: string) => {
    onLinkNode?.(sourceId);
  }, [onLinkNode]);

  const unlinkNode = useCallback((sourceId: string | null) => {
    sourceId && onUnlinkNode?.(sourceId);
  }, [onUnlinkNode]);

  // 当前所有已连接节点统一解除
  const unlinkAllRef = useRef<() => void>(() => undefined);
  unlinkAllRef.current = () => {
    unlinkNode(imageNodeIdRef.current);
    unlinkNode(lastFrameNodeIdRef.current);
    unlinkNode(extensionVideoNodeIdRef.current);
    referenceImages.forEach((r) => r.sourceNodeId && unlinkNode(r.sourceNodeId));
    imageNodeIdRef.current = null;
    lastFrameNodeIdRef.current = null;
    extensionVideoNodeIdRef.current = null;
  };
  const unlinkAll = useCallback(() => unlinkAllRef.current(), []);

  // ── 模式变更时清空对应字段并解除连线 ──
  useEffect(() => {
    unlinkAll();
    videoMode === 'text_to_video' && (setImageUrl(''), setLastFrameImageUrl(''), setReferenceImages([]), setExtensionVideoUrl(''));
    videoMode === 'image_to_video' && (setReferenceImages([]), setExtensionVideoUrl(''));
    videoMode === 'reference_images' && (setImageUrl(''), setLastFrameImageUrl(''), setExtensionVideoUrl(''));
    (videoMode === 'edit' || videoMode === 'video_extension') && (setReferenceImages([]), setImageUrl(''), setLastFrameImageUrl(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoMode]);

  // ── 能力派生 ──
  const maxRefImages = capabilities?.max_reference_images ?? DEFAULT_MAX_REFS;
  const supportsRefVideos = capabilities?.supports_reference_videos ?? false;
  const supportsRefAudios = capabilities?.supports_reference_audios ?? false;
  const maxRefVideos = capabilities?.max_reference_videos ?? 0;
  const maxRefAudios = capabilities?.max_reference_audios ?? 0;
  const maxTotalRefs = maxRefImages + maxRefVideos + maxRefAudios;

  const imageRefCount = referenceImages.filter((r) => r.refType === 'image').length;
  const videoRefCount = referenceImages.filter((r) => r.refType === 'video').length;
  const audioRefCount = referenceImages.filter((r) => r.refType === 'audio').length;

  // ── 画布节点（按 updatedAt 倒序筛选） ──
  const imageNodes = useMemo(
    () => selectNodesByUpdatedDesc(canvasNodes.filter((n) => n.type === 'image' && getImageNodeUrl(n))),
    [canvasNodes],
  );
  const videoNodes = useMemo(
    () => selectNodesByUpdatedDesc(canvasNodes.filter((n) => n.type === 'video' && getVideoNodeUrl(n))),
    [canvasNodes],
  );
  const audioNodes = useMemo(
    () => selectNodesByUpdatedDesc(canvasNodes.filter((n) => n.type === 'audio' && getAudioNodeUrl(n))),
    [canvasNodes],
  );

  const pickerMode: PickerMode = PICKER_MODE_MAP[videoMode] || 'none';

  const pickerNodes = useMemo(() => {
    const isMulti = pickerMode === 'multi_image';
    const isVid = pickerMode === 'video';
    const nodes = isVid ? videoNodes : isMulti ? [
      ...imageNodes,
      ...(supportsRefVideos ? videoNodes : []),
      ...(supportsRefAudios ? audioNodes : []),
    ] : imageNodes;
    return isMulti ? selectNodesByUpdatedDesc(nodes) : nodes;
  }, [pickerMode, imageNodes, videoNodes, audioNodes, supportsRefVideos, supportsRefAudios]);

  const hasPickerSelection =
    (pickerMode === 'single_image' && !!imageUrl) ||
    (pickerMode === 'first_last_frame' && !!imageUrl && !!lastFrameImageUrl) ||
    (pickerMode === 'multi_image' && referenceImages.length > 0) ||
    (pickerMode === 'video' && !!extensionVideoUrl);

  // ── 虚拟人预设 ──
  const { presets: vhPresets, isSeedance } = useVirtualHumanPresets(selectedModel?.model_name || null);
  const showVhButton = isSeedance && (videoMode === 'reference_images' || videoMode === 'image_to_video');

  const handleSelectVhPreset = useCallback((preset: typeof vhPresets[number]) => {
    (imageRefCount < maxRefImages) && (() => {
      setReferenceImages((prev) => [...prev, {
        url: preset.asset_uri,
        name: preset.name,
        refType: 'image' as RefType,
        previewUrl: preset.preview_url,
      }]);
      // 在 image_to_video 模式下加入虚拟人时自动切换到 reference_images
      videoMode === 'image_to_video' && setVideoMode('reference_images');
      inputRef.current?.insertTag(imageRefCount + 1, preset.name, 'image', true);
    })();
    return imageRefCount + 1 >= maxRefImages; // 提示调用方可关闭 picker
  }, [imageRefCount, maxRefImages, videoMode, setVideoMode]);

  // ── 移除参考项（并修正 prompt 中的 tag 编号） ──
  const handleRemoveRefImage = useCallback((removeIdx: number) => {
    const removedRef = referenceImages[removeIdx];
    removedRef || (void 0);
    if (!removedRef) return;
    removedRef.sourceNodeId && unlinkNode(removedRef.sourceNodeId);

    const removedType = removedRef.refType;
    const prefix = TAG_PREFIX_MAP[removedType];
    const typeIdx = referenceImages.slice(0, removeIdx).filter((r) => r.refType === removedType).length + 1;
    const totalOfType = referenceImages.filter((r) => r.refType === removedType).length;

    let updated = prompt;
    updated = updated.replace(new RegExp(`<${prefix}_${typeIdx}>`, 'g'), '');
    for (let i = totalOfType; i > typeIdx; i--) {
      updated = updated.replace(new RegExp(`<${prefix}_${i}>`, 'g'), `<${prefix}_${i - 1}>`);
    }
    updated = updated.replace(/  +/g, ' ').trim();

    setReferenceImages((prev) => prev.filter((_, i) => i !== removeIdx));
    setPrompt(updated);
  }, [referenceImages, prompt, setPrompt, unlinkNode]);

  // ── 选择画布节点填充附件（4 种 pickerMode 分支） ──
  const handleSelectNode = useCallback((node: CanvasNode): boolean => {
    const data = node.data as Record<string, unknown>;
    const nodeName = (data.name as string) || node.id.slice(0, 8);

    // single_image
    if (pickerMode === 'single_image') {
      const url = getImageNodeUrl(node);
      url && (() => {
        unlinkNode(imageNodeIdRef.current);
        setImageUrl(url);
        imageNodeIdRef.current = node.id;
        linkNode(node.id);
      })();
      return true;
    }

    // first_last_frame —— 先首帧，再尾帧
    if (pickerMode === 'first_last_frame') {
      const url = getImageNodeUrl(node);
      if (!url) return false;
      if (!imageUrl) {
        setImageUrl(url);
        imageNodeIdRef.current = node.id;
        linkNode(node.id);
        return false; // 还要再选尾帧
      }
      setLastFrameImageUrl(url);
      lastFrameNodeIdRef.current = node.id;
      linkNode(node.id);
      return true;
    }

    // multi_image —— 支持 image/video/audio
    if (pickerMode === 'multi_image') {
      const nt = node.type as string;
      const urlMap: Record<string, () => string | null> = {
        image: () => getImageNodeUrl(node),
        video: () => getVideoNodeUrl(node),
        audio: () => getAudioNodeUrl(node),
      };
      const limitMap: Record<string, [number, number]> = {
        image: [imageRefCount, maxRefImages],
        video: [videoRefCount, maxRefVideos],
        audio: [audioRefCount, maxRefAudios],
      };
      const refType: RefType = nt === 'video' ? 'video' : nt === 'audio' ? 'audio' : 'image';
      const url = urlMap[nt]?.() ?? getImageNodeUrl(node);
      const [count, max] = limitMap[nt] ?? [imageRefCount, maxRefImages];
      (url && count < max) && (() => {
        setReferenceImages((prev) => [...prev, { url, name: nodeName, refType, sourceNodeId: node.id }]);
        linkNode(node.id);
        inputRef.current?.insertTag(count + 1, nodeName, refType);
      })();
      return referenceImages.length + 1 >= maxTotalRefs;
    }

    // video —— 延展视频
    if (pickerMode === 'video') {
      const url = getVideoNodeUrl(node);
      url && (() => {
        unlinkNode(extensionVideoNodeIdRef.current);
        setExtensionVideoUrl(url);
        extensionVideoNodeIdRef.current = node.id;
        linkNode(node.id);
      })();
      return true;
    }

    return false;
  }, [
    pickerMode,
    imageUrl,
    imageRefCount,
    videoRefCount,
    audioRefCount,
    maxRefImages,
    maxRefVideos,
    maxRefAudios,
    maxTotalRefs,
    referenceImages.length,
    linkNode,
    unlinkNode,
  ]);

  // ── 单槽位移除（single_image / first_last_frame / video 的 X 按钮） ──
  const clearImage = useCallback(() => {
    unlinkNode(imageNodeIdRef.current);
    imageNodeIdRef.current = null;
    setImageUrl('');
  }, [unlinkNode]);

  const clearFirstLastFrames = useCallback(() => {
    unlinkNode(imageNodeIdRef.current);
    unlinkNode(lastFrameNodeIdRef.current);
    imageNodeIdRef.current = null;
    lastFrameNodeIdRef.current = null;
    setImageUrl('');
    setLastFrameImageUrl('');
  }, [unlinkNode]);

  const clearLastFrame = useCallback(() => {
    unlinkNode(lastFrameNodeIdRef.current);
    lastFrameNodeIdRef.current = null;
    setLastFrameImageUrl('');
  }, [unlinkNode]);

  const clearExtensionVideo = useCallback(() => {
    unlinkNode(extensionVideoNodeIdRef.current);
    extensionVideoNodeIdRef.current = null;
    setExtensionVideoUrl('');
  }, [unlinkNode]);

  return {
    // 状态
    imageUrl,
    lastFrameImageUrl,
    referenceImages,
    extensionVideoUrl,
    // 引用
    inputRef,
    // 派生
    pickerMode,
    imageNodes,
    videoNodes,
    audioNodes,
    pickerNodes,
    hasPickerSelection,
    maxRefImages,
    maxRefVideos,
    maxRefAudios,
    maxTotalRefs,
    imageRefCount,
    videoRefCount,
    audioRefCount,
    // 虚拟人
    vhPresets,
    isSeedance,
    showVhButton,
    handleSelectVhPreset,
    // 动作
    unlinkAll,
    handleSelectNode,
    handleRemoveRefImage,
    clearImage,
    clearFirstLastFrames,
    clearLastFrame,
    clearExtensionVideo,
  };
}

export type UseVideoPanelReferencesReturn = ReturnType<typeof useVideoPanelReferences>;
