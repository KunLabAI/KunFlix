'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { useReactFlow } from '@xyflow/react';
import {
  useImageGenerationTask,
  type ImageCreateParams,
} from '@/hooks/useImageGeneration';
import {
  useCanvasStore,
  type CanvasNode,
  type CharacterNodeData,
  type ImageGenHistoryEntry,
} from '@/store/useCanvasStore';

const MAX_IMAGES = 9;

/**
 * AI 图像生成的提交 + 完成自动应用 + applyToNode / applyToNextNode：
 * - submit 前保存 prevImages 快照以支持"应用到下一节点"回滚
 * - 完成后累计到 generatedImages 历史（去重），并替换当前节点图像
 */
export function useImageGenerationApply(id: string, data: CharacterNodeData) {
  const { t } = useTranslation();
  const { getNode, getEdges } = useReactFlow();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const addNode = useCanvasStore((s) => s.addNode);
  const onConnect = useCanvasStore((s) => s.onConnect);

  const imageTask = useImageGenerationTask();
  const taskActive = imageTask.isSubmitting;
  const taskDone = imageTask.isCompleted;
  const taskFailed = imageTask.isFailed;

  const prevImagesRef = useRef<string[]>([]);
  const lastSubmitParamsRef = useRef<ImageCreateParams | null>(null);

  // 生成中实时计时（每 100ms）
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = imageTask.startedAt;
    !start && setElapsedMs(0);
    const tick = () => start && setElapsedMs(Date.now() - start);
    tick();
    const tid = start ? setInterval(tick, 100) : null;
    return () => { tid && clearInterval(tid); };
  }, [imageTask.startedAt]);

  // 完成后自动合并入 generatedImages 历史并替换当前节点图像
  useEffect(() => {
    const res = imageTask.result;
    (res && imageTask.isCompleted) && (() => {
      const sp = lastSubmitParamsRef.current;
      const urls = res.images || [];
      urls.length === 0 || (() => {
        const createdAt = new Date().toISOString();
        const newEntries: ImageGenHistoryEntry[] = urls.map((url) => ({
          url,
          prompt: res.prompt || sp?.prompt,
          model: res.model || sp?.model,
          provider_id: res.provider_id || sp?.provider_id,
          aspect_ratio: sp?.config?.aspect_ratio,
          quality: sp?.config?.quality,
          batch_count: sp?.config?.batch_count,
          output_format: sp?.config?.output_format,
          createdAt,
        }));
        const prevHist = data.generatedImages || [];
        const existing = new Set(prevHist.map(e => e.url));
        const merged = [...newEntries.filter(e => !existing.has(e.url)), ...prevHist];

        // 多次生成采用替换而非追加（受 MAX_IMAGES 约束）
        const nextImages = urls.slice(0, MAX_IMAGES);

        updateNodeData(id, {
          generatedImages: merged,
          images: nextImages,
          imageUrl: nextImages[0] || null,
          uploading: false,
        } as Partial<CharacterNodeData>);
      })();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageTask.isCompleted, imageTask.result]);

  const submit = useCallback((params: ImageCreateParams) => {
    prevImagesRef.current = data.images || (data.imageUrl ? [data.imageUrl] : []);
    lastSubmitParamsRef.current = params;
    imageTask.submit(params).catch(() => { /* error handled via hook */ });
  }, [data.images, data.imageUrl, imageTask]);

  const applyToNode = useCallback(() => {
    // 已在 effect 中自动合并，这里仅 reset
    imageTask.reset();
  }, [imageTask]);

  const applyToNextNode = useCallback(() => {
    const urls = imageTask.result?.images || [];
    urls.length === 0 && imageTask.reset();
    urls.length > 0 && (() => {
      // 回滚本节点
      const restored = prevImagesRef.current;
      updateNodeData(id, {
        images: restored,
        imageUrl: restored[0] || null,
      } as Partial<CharacterNodeData>);

      const edges = getEdges();
      const outEdge = edges.find((e) => e.source === id);
      const targetNode = outEdge ? getNode(outEdge.target) : null;
      const isCharTarget = targetNode?.type === 'image';

      const targetId = isCharTarget ? targetNode!.id : `image-${uuidv4()}`;
      const existingImgs = (isCharTarget ? (targetNode!.data as CharacterNodeData)?.images : []) || [];
      const slotsAvailable = MAX_IMAGES - existingImgs.length;
      const urlsToApply = urls.slice(0, Math.max(0, slotsAvailable));
      const nextImages = [...existingImgs, ...urlsToApply];

      isCharTarget && updateNodeData(targetId, {
        images: nextImages,
        imageUrl: nextImages[0] || null,
      } as Partial<CharacterNodeData>);

      isCharTarget || (() => {
        const currentNode = getNode(id);
        const posX = (currentNode?.position.x ?? 0) + (currentNode?.measured?.width ?? 300) + 80;
        const posY = currentNode?.position.y ?? 0;
        const newNode: CanvasNode = {
          id: targetId,
          type: 'image',
          position: { x: posX, y: posY },
          width: 512,
          height: 384,
          data: {
            name: t('canvas.node.image.aiGenerated', 'AI 生成图像'),
            description: '',
            images: urlsToApply,
            imageUrl: urlsToApply[0] || null,
            uploading: false,
          } as CharacterNodeData,
        };
        addNode(newNode);
        onConnect({
          source: id,
          sourceHandle: 'right-source',
          target: targetId,
          targetHandle: 'left-target',
        });
      })();

      imageTask.reset();
    })();
  }, [imageTask, id, getEdges, getNode, updateNodeData, addNode, onConnect, t]);

  return {
    imageTask,
    taskActive,
    taskDone,
    taskFailed,
    elapsedMs,
    prevImagesRef,
    submit,
    applyToNode,
    applyToNextNode,
  };
}
