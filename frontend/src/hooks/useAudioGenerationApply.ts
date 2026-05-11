'use client';

import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { useReactFlow } from '@xyflow/react';
import { useMusicTask, type MusicCreateParams } from '@/hooks/useMusicGeneration';
import {
  useCanvasStore,
  type CanvasNode,
  type AudioNodeData,
  type AudioGenHistoryEntry,
} from '@/store/useCanvasStore';

/**
 * AI 音乐生成的提交 + 完成自动应用 + applyToNode / applyToNextNode：
 * - submit 前保存 prevAudioUrl 快照以支持"应用到下一节点"回滚
 * - 完成后累计到 generatedAudios 历史（去重），并替换当前节点音频
 */
export function useAudioGenerationApply(id: string, data: AudioNodeData) {
  const { t } = useTranslation();
  const { getNode, getEdges } = useReactFlow();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const addNode = useCanvasStore((s) => s.addNode);
  const onConnect = useCanvasStore((s) => s.onConnect);

  const musicTask = useMusicTask();
  const taskActive = !!musicTask.taskId && !musicTask.isTerminal;
  const taskDone = musicTask.isCompleted;
  const taskFailed = musicTask.isFailed;

  const prevAudioUrlRef = useRef<string | null>(null);
  const lastSubmitParamsRef = useRef<MusicCreateParams | null>(null);

  // 完成后自动写入当前节点 + 累积历史记录（去重）
  useEffect(() => {
    const url = musicTask.status?.audio_url;
    (url && musicTask.isCompleted) && (() => {
      const sp = lastSubmitParamsRef.current;
      const structured = sp?.structured || {};
      const entry: AudioGenHistoryEntry = {
        url,
        prompt: musicTask.status?.prompt || sp?.prompt,
        lyrics: musicTask.status?.lyrics || structured.lyrics,
        model: musicTask.status?.model || sp?.model,
        provider_id: sp?.provider_id,
        output_format: (musicTask.status?.output_format as 'mp3' | 'wav') || sp?.output_format,
        genre: structured.genre,
        instruments: structured.instruments,
        bpm: structured.bpm,
        key_scale: structured.key_scale,
        mood: structured.mood,
        language: structured.language,
        vocals: structured.vocals,
        timeline: structured.timeline,
        createdAt: new Date().toISOString(),
      };
      const prev = data.generatedAudios || [];
      const exists = prev.some((v) => v.url === url);
      updateNodeData(id, {
        audioUrl: url,
        uploading: false,
        lyrics: entry.lyrics || data.lyrics,
        ...(!exists && { generatedAudios: [entry, ...prev] }),
      } as Partial<AudioNodeData>);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicTask.isCompleted, musicTask.status?.audio_url]);

  const submit = useCallback((params: MusicCreateParams) => {
    prevAudioUrlRef.current = data.audioUrl || null;
    lastSubmitParamsRef.current = params;
    musicTask.submit({ ...params, node_id: id });
  }, [data.audioUrl, musicTask, id]);

  const applyToNode = useCallback(() => {
    musicTask.reset();
  }, [musicTask]);

  const applyToNextNode = useCallback(() => {
    const generatedUrl = musicTask.status?.audio_url;
    generatedUrl || musicTask.reset();

    // 回滚本节点音频
    const prevUrl = prevAudioUrlRef.current;
    prevUrl && updateNodeData(id, { audioUrl: prevUrl } as Partial<AudioNodeData>);

    generatedUrl && (() => {
      const edges = getEdges();
      const outEdge = edges.find((e) => e.source === id);
      const targetNode = outEdge ? getNode(outEdge.target) : null;
      const isAudioTarget = targetNode?.type === 'audio';
      const targetId = isAudioTarget ? targetNode!.id : uuidv4();

      isAudioTarget
        ? updateNodeData(targetId, { audioUrl: generatedUrl } as Partial<AudioNodeData>)
        : (() => {
            const currentNode = getNode(id);
            const posX = (currentNode?.position.x ?? 0) + (currentNode?.measured?.width ?? 300) + 80;
            const posY = currentNode?.position.y ?? 0;
            const newNode: CanvasNode = {
              id: targetId,
              type: 'audio',
              position: { x: posX, y: posY },
              data: {
                name: t('canvas.node.audio.aiGenerated', 'AI 生成'),
                description: '',
                audioUrl: generatedUrl,
              } as AudioNodeData,
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

    musicTask.reset();
  }, [musicTask, id, getEdges, getNode, updateNodeData, addNode, onConnect, t]);

  return {
    musicTask,
    taskActive,
    taskDone,
    taskFailed,
    prevAudioUrlRef,
    submit,
    applyToNode,
    applyToNextNode,
  };
}
