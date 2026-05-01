'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IMAGE_MODE_MAX_REFS,
  type ImageMode,
} from '@/hooks/useImageGeneration';
import { selectNodesByUpdatedDesc, type CanvasNode, type CharacterNodeData } from '@/store/useCanvasStore';
import { getImageNodeUrl } from '@/components/canvas/ImageGeneratePanel/utils';
import type { ImageRef, ImagePanelModeRequest } from '@/components/canvas/ImageGeneratePanel/types';

interface Options {
  mode: ImageMode;
  setMode: (m: ImageMode) => void;
  nodeId?: string;
  canvasNodes?: CanvasNode[];
  modeRequest?: ImagePanelModeRequest | null;
  onLinkNode?: (sourceNodeId: string) => void;
  onUnlinkNode?: (sourceNodeId: string) => void;
}

/**
 * 参考图状态管理：
 * - 受控 referenceImages 数组
 * - mode 切换时清空并解除连线
 * - 响应外部 modeRequest（token 驱动）
 * - 筛选可选的画布节点（按 updatedAt 倒序）
 */
export function useImagePanelReferences({
  mode,
  setMode,
  nodeId,
  canvasNodes = [],
  modeRequest,
  onLinkNode,
  onUnlinkNode,
}: Options) {
  const { t } = useTranslation();

  const [referenceImages, setReferenceImages] = useState<ImageRef[]>([]);
  const maxRefs = IMAGE_MODE_MAX_REFS[mode] || 0;

  // mode 切换时：清空参考图并解除已建立的连线
  const prevModeRef = useRef<ImageMode>(mode);
  useEffect(() => {
    prevModeRef.current !== mode && (() => {
      referenceImages.forEach((r) => r.sourceNodeId !== nodeId && onUnlinkNode?.(r.sourceNodeId));
      setReferenceImages([]);
      prevModeRef.current = mode;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 响应外部 modeRequest
  const appliedModeReqTokenRef = useRef<number | null>(null);
  useEffect(() => {
    const req = modeRequest;
    const tok = req?.token ?? null;
    (tok !== null && appliedModeReqTokenRef.current !== tok) && (() => {
      appliedModeReqTokenRef.current = tok;
      referenceImages.forEach((r) => r.sourceNodeId !== nodeId && onUnlinkNode?.(r.sourceNodeId));
      prevModeRef.current = req!.mode;
      setMode(req!.mode);
      const pres = req!.preselectImages || [];
      const limit = IMAGE_MODE_MAX_REFS[req!.mode] || 0;
      setReferenceImages(limit > 0 ? pres.slice(0, limit) : []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeRequest]);

  // 可用作参考图的画布节点（带 URL 且未被选择，按 updatedAt 倒序）
  const pickableNodes = useMemo(() => {
    const selectedIds = new Set(referenceImages.map((r) => r.sourceNodeId));
    const filtered = (canvasNodes || [])
      .filter((n) => !selectedIds.has(n.id) && !!getImageNodeUrl(n));
    return selectNodesByUpdatedDesc(filtered).map((n) => ({ node: n, url: getImageNodeUrl(n) }));
  }, [canvasNodes, referenceImages]);

  const selectNode = useCallback((node: CanvasNode) => {
    const url = getImageNodeUrl(node);
    const reached = referenceImages.length >= maxRefs;
    (url && !reached) && (() => {
      const data = node.data as CharacterNodeData;
      const name = data.name || t('canvas.node.image.refItem', '参考图');
      setReferenceImages((prev) => [...prev, { url, name, sourceNodeId: node.id }]);
      node.id !== nodeId && onLinkNode?.(node.id);
    })();
    return maxRefs === 1; // 提示调用方可关闭 picker
  }, [referenceImages.length, maxRefs, onLinkNode, nodeId, t]);

  // 先 unlink 再 setState（避免在 updater 中调用外部 setState）
  const removeRef = useCallback((idx: number) => {
    const target = referenceImages[idx];
    target && target.sourceNodeId !== nodeId && onUnlinkNode?.(target.sourceNodeId);
    setReferenceImages((prev) => prev.filter((_, i) => i !== idx));
  }, [referenceImages, onUnlinkNode, nodeId]);

  // 参考图数量校验
  const refsOk =
    mode === 'text_to_image' ||
    (mode === 'edit' && referenceImages.length === 1) ||
    (mode === 'reference_images' && referenceImages.length >= 1 && referenceImages.length <= maxRefs);

  return {
    referenceImages,
    pickableNodes,
    maxRefs,
    refsOk,
    selectNode,
    removeRef,
  };
}
