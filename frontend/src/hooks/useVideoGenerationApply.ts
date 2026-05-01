'use client';

import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { useReactFlow } from '@xyflow/react';
import { useVideoTask, type VideoCreateParams } from '@/hooks/useVideoGeneration';
import {
  useCanvasStore,
  type CanvasNode,
  type VideoNodeData,
  type VideoGenHistoryEntry,
} from '@/store/useCanvasStore';

/**
 * AI 视频生成的提交 + 完成自动应用 + applyToNode / applyToNextNode：
 * - submit 前保存 prevVideoUrl 快照以支持"应用到下一节点"回滚
 * - 完成后累计到 generatedVideos 历史（去重），并替换当前节点视频
 */
export function useVideoGenerationApply(id: string, data: VideoNodeData) {
  const { t } = useTranslation();
  const { getNode, getEdges } = useReactFlow();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const addNode = useCanvasStore((s) => s.addNode);
  const onConnect = useCanvasStore((s) => s.onConnect);

  const videoTask = useVideoTask();
  const taskActive = !!videoTask.taskId && !videoTask.isTerminal;
  const taskDone = videoTask.isCompleted;
  const taskFailed = videoTask.isFailed;

  const prevVideoUrlRef = useRef<string | null>(null);
  const lastSubmitParamsRef = useRef<VideoCreateParams | null>(null);

  // 完成后自动写入当前节点 + 累积历史记录（去重）
  useEffect(() => {
    const url = videoTask.status?.video_url;
    (url && videoTask.isCompleted) && (() => {
      const sp = lastSubmitParamsRef.current;
      const entry: VideoGenHistoryEntry = {
        url,
        quality: videoTask.status?.quality,
        prompt: videoTask.status?.prompt || sp?.prompt,
        model: videoTask.status?.model || sp?.model,
        provider_id: sp?.provider_id,
        video_mode: sp?.video_mode,
        duration: sp?.config?.duration,
        aspect_ratio: sp?.config?.aspect_ratio,
        createdAt: new Date().toISOString(),
      };
      const prev = data.generatedVideos || [];
      const exists = prev.some((v) => v.url === url);
      updateNodeData(id, {
        videoUrl: url,
        uploading: false,
        ...(!exists && { generatedVideos: [entry, ...prev] }),
      } as Partial<VideoNodeData>);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoTask.isCompleted, videoTask.status?.video_url]);

  const submit = useCallback((params: VideoCreateParams) => {
    prevVideoUrlRef.current = data.videoUrl || null;
    lastSubmitParamsRef.current = params;
    videoTask.submit(params);
  }, [data.videoUrl, videoTask]);

  const applyToNode = useCallback(() => {
    // 已在 effect 中自动写入，这里仅 reset
    videoTask.reset();
  }, [videoTask]);

  const applyToNextNode = useCallback(() => {
    const generatedUrl = videoTask.status?.video_url;
    generatedUrl || videoTask.reset();

    // 回滚本节点视频
    const prevUrl = prevVideoUrlRef.current;
    prevUrl && updateNodeData(id, { videoUrl: prevUrl } as Partial<VideoNodeData>);

    generatedUrl && (() => {
      const edges = getEdges();
      const outEdge = edges.find((e) => e.source === id);
      const targetNode = outEdge ? getNode(outEdge.target) : null;
      const isVideoTarget = targetNode?.type === 'video';
      const targetId = isVideoTarget ? targetNode!.id : `video-${uuidv4()}`;

      isVideoTarget
        ? updateNodeData(targetId, { videoUrl: generatedUrl } as Partial<VideoNodeData>)
        : (() => {
            const currentNode = getNode(id);
            const posX = (currentNode?.position.x ?? 0) + (currentNode?.measured?.width ?? 300) + 80;
            const posY = currentNode?.position.y ?? 0;
            const newNode: CanvasNode = {
              id: targetId,
              type: 'video',
              position: { x: posX, y: posY },
              data: {
                name: t('canvas.node.video.aiGenerated'),
                videoUrl: generatedUrl,
                fitMode: 'contain',
              } as VideoNodeData,
            };
            addNode(newNode);
            onConnect({
              source: id,
              sourceHandle: 'right-source',
              target: targetId,
              targetHandle: 'left-target',
            });
          })();
    })();

    videoTask.reset();
  }, [videoTask, id, getEdges, getNode, updateNodeData, addNode, onConnect, t]);

  return {
    videoTask,
    taskActive,
    taskDone,
    taskFailed,
    prevVideoUrlRef,
    submit,
    applyToNode,
    applyToNextNode,
  };
}
