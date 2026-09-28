'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, Quote, Copy, Trash2, Pin, PinOff } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';

import {
  useCanvasStore,
  type TtsNodeData,
  type CanvasNode,
  type TtsGenHistoryEntry,
} from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import { useTtsTask, type TtsCreateParams } from '@/hooks/useTtsGeneration';

import NodeEffectOverlay from './NodeEffectOverlay';
import { NodeToolbar, type ToolbarAction } from './NodeToolbar';
import { Input } from '@/components/ui/input';
import { EdgeHandles } from './AudioNode/EdgeHandles';
import { AudioDisplay } from './AudioNode/AudioDisplay';
import TtsGeneratePanel from './TtsGeneratePanel';
import { HistorySidebar } from './TTSNode/HistorySidebar';
import { normalizeAudioUrl } from './AudioNode/utils';
import { cn } from '@/lib/utils';

const MIN_WIDTH = 280;
const MIN_HEIGHT = 180;

/**
 * TTS 语音合成节点：文本 → 语音（Gemini TTS）。
 * 结构对齐 AudioNode：标题 + 工具栏 + 播放卡片 + 下挂生成面板。
 */
const TTSNode = ({ id, data, selected }: NodeProps<Node<TtsNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const { getNode, getEdges, screenToFlowPosition } = useReactFlow();

  // 节点主容器（历史拖拽落点判定）+ 历史侧栏开关
  const nodeRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ── 标题编辑 ──
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(data.name || '');
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    !isEditingTitle && setEditTitle(data.name || '');
  }, [data.name, isEditingTitle]);

  const handleEnterTitleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingTitle(true);
    setEditTitle(data.name || '');
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const shouldCommit = e.key === 'Enter' || e.key === 'Escape';
    shouldCommit && setIsEditingTitle(false);
  };

  // ── TTS 任务 ──
  const ttsTask = useTtsTask();
  const taskActive = ttsTask.isSubmitting || (!!ttsTask.taskId && !ttsTask.isTerminal);
  const taskDone = ttsTask.isCompleted;
  const taskFailed = ttsTask.isFailed;

  const prevAudioUrlRef = useRef<string | null>(null);
  const lastSubmitParamsRef = useRef<TtsCreateParams | null>(null);

  // 生成中实时计时（每 100ms），与音频节点对齐
  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = startedAtRef.current;
    !taskActive && (startedAtRef.current = null);
    !start && setElapsedMs(0);
    const tick = () => start && setElapsedMs(Date.now() - start);
    tick();
    const tid = start ? setInterval(tick, 100) : null;
    return () => { tid && clearInterval(tid); };
  }, [taskActive]);

  // 完成后自动写入当前节点 + 累积历史记录（去重）
  useEffect(() => {
    const url = ttsTask.status?.audio_url;
    (url && ttsTask.isCompleted) && (() => {
      const sp = lastSubmitParamsRef.current;
      const entry: TtsGenHistoryEntry = {
        url,
        text: ttsTask.status?.text || sp?.text,
        model: ttsTask.status?.model || sp?.model,
        provider_id: sp?.provider_id,
        voice: ttsTask.status?.voice || sp?.voice,
        style: ttsTask.status?.style || sp?.style,
        speakers: ttsTask.status?.speakers || sp?.speakers,
        output_format: (ttsTask.status?.output_format as 'wav' | 'l16') || 'wav',
        createdAt: new Date().toISOString(),
      };
      const prev = data.generatedAudios || [];
      const exists = prev.some((v) => v.url === url);
      updateNodeData(id, {
        audioUrl: url,
        text: entry.text || data.text,
        voice: entry.voice || data.voice,
        style: entry.style || data.style,
        speakers: entry.speakers || data.speakers,
        name: data.name || (entry.text ? entry.text.slice(0, 30) : t('canvas.node.tts.aiGenerated', 'AI 语音')),
        ...(!exists && { generatedAudios: [entry, ...prev] }),
      } as Partial<TtsNodeData>);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsTask.isCompleted, ttsTask.status?.audio_url]);

  const handleSubmit = useCallback((params: TtsCreateParams) => {
    startedAtRef.current = Date.now();
    prevAudioUrlRef.current = data.audioUrl || null;
    lastSubmitParamsRef.current = params;
    ttsTask.submit({ ...params, node_id: id });
  }, [data.audioUrl, ttsTask, id]);

  const handleApplyToNode = useCallback(() => {
    ttsTask.reset();
  }, [ttsTask]);

  const handleApplyToNextNode = useCallback(() => {
    const generatedUrl = ttsTask.status?.audio_url;
    generatedUrl || ttsTask.reset();

    // 回滚本节点音频
    const prevUrl = prevAudioUrlRef.current;
    prevUrl && updateNodeData(id, { audioUrl: prevUrl } as Partial<TtsNodeData>);

    generatedUrl && (() => {
      const edges = getEdges();
      const outEdge = edges.find((e) => e.source === id);
      const targetNode = outEdge ? getNode(outEdge.target) : null;
      const isTtsTarget = targetNode?.type === 'tts';
      const targetId = isTtsTarget ? targetNode!.id : uuidv4();

      isTtsTarget
        ? updateNodeData(targetId, { audioUrl: generatedUrl } as Partial<TtsNodeData>)
        : (() => {
            const currentNode = getNode(id);
            const posX = (currentNode?.position.x ?? 0) + (currentNode?.measured?.width ?? 300) + 80;
            const posY = currentNode?.position.y ?? 0;
            const newNode: CanvasNode = {
              id: targetId,
              type: 'tts',
              position: { x: posX, y: posY },
              width: 360,
              height: 220,
              data: {
                name: t('canvas.node.tts.aiGenerated', 'AI 语音'),
                description: '',
                audioUrl: generatedUrl,
              } as TtsNodeData,
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

    ttsTask.reset();
  }, [ttsTask, id, getEdges, getNode, updateNodeData, addNode, onConnect, t]);

  // ── 历史侧栏：点击应用 / 拖拽克隆 ──
  const handleHistoryClick = useCallback((entry: TtsGenHistoryEntry) => {
    updateNodeData(id, {
      audioUrl: entry.url,
      ...(entry.text && { text: entry.text }),
      ...(entry.voice && { voice: entry.voice }),
      ...(entry.style !== undefined && { style: entry.style }),
      ...(entry.speakers && { speakers: entry.speakers }),
    } as Partial<TtsNodeData>);
  }, [id, updateNodeData]);

  const handleHistoryDragStart = (e: React.DragEvent<HTMLDivElement>, entry: TtsGenHistoryEntry) => {
    e.dataTransfer.setData('application/x-tts-history', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleHistoryDragEnd = useCallback(
    (e: React.DragEvent<HTMLDivElement>, entry: TtsGenHistoryEntry) => {
      // 拖回本节点身上 → 不克隆
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const droppedOnSelf = nodeRef.current?.contains(el);
      droppedOnSelf || (() => {
        // 跟随光标位置创建新节点（尺寸对齐 handleApplyToNextNode 的 360×220）
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const newNode: CanvasNode = {
          id: uuidv4(),
          type: 'tts',
          position: { x: pos.x - 180, y: pos.y - 110 },
          width: 360,
          height: 220,
          data: {
            name: entry.text ? entry.text.slice(0, 30) : t('canvas.node.tts.aiGenerated', 'AI 语音'),
            description: '',
            audioUrl: entry.url,
            initialGenConfig: entry,
          } as TtsNodeData,
        };
        addNode(newNode);
      })();
    },
    [addNode, screenToFlowPosition, t],
  );

  // ── 工具栏操作 ──
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    confirm(t('canvas.node.deleteConfirm.tts', '确定删除该 TTS 节点吗？')) && deleteNode(id);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (!node) return;
    const currentData = node.data as TtsNodeData;
    const currentName = currentData.name || t('canvas.node.unnamedTtsCard', '未命名 TTS');
    addNode({
      ...(node as CanvasNode),
      id: uuidv4(),
      position: { x: node.position.x + 50, y: node.position.y + 50 },
      selected: false,
      data: {
        ...currentData,
        name: t('canvas.node.copySuffix', { name: currentName }),
      },
    });
  };

  // ── 引用到 AI Assistant ──
  const isReferenced = useAIAssistantStore((s) => s.nodeAttachments.some((a) => a.nodeId === id));
  const handleReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audioUrl = normalizeAudioUrl(data.audioUrl || '');
    const store = useAIAssistantStore.getState();
    const alreadyRef = store.nodeAttachments.some((a) => a.nodeId === id);
    alreadyRef
      ? store.removeNodeAttachment(id)
      : (() => {
          store.addNodeAttachment({
            nodeId: id,
            nodeType: 'tts',
            label: data.name || t('canvas.node.unnamedTtsCard', '未命名 TTS'),
            excerpt: data.text || data.description || '',
            thumbnailUrl: audioUrl,
            meta: {},
          });
          store.setIsOpen(true);
        })();
  };

  // ── 面板 Pin ──
  const handleTogglePinPanel = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateNodeData(id, { pinPanel: !data.pinPanel } as Partial<TtsNodeData>);
  };

  const toolbarActions: ToolbarAction[] = [
    {
      icon: <Quote className="h-3.5 w-3.5" />,
      onClick: handleReference,
      title: isReferenced ? t('canvas.node.toolbar.unreference') : t('canvas.node.toolbar.reference'),
      variant: isReferenced ? 'primary' : undefined,
    },
    {
      icon: <Copy className="h-3.5 w-3.5" />,
      onClick: handleDuplicate,
      title: t('canvas.node.toolbar.duplicate'),
    },
    {
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: handleDelete,
      title: t('canvas.node.toolbar.delete'),
      variant: 'danger',
    },
  ];

  // ── 计算状态 ──
  const audioUrl = data.audioUrl ? normalizeAudioUrl(data.audioUrl) : null;
  const hasExistingAudio = !!audioUrl;
  const historyAudios = data.generatedAudios || [];
  const panelVisible = !!selected || !!data.pinPanel || taskActive || taskDone || taskFailed;
  const showOverlay = taskActive || !!data._generating;

  return (
    <>
      <NodeResizer
        color="#6d6d6d"
        isVisible={selected}
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        lineStyle={{ display: 'none' }}
        handleStyle={{
          width: '8px',
          height: '8px',
          borderRadius: '4px',
          border: '1px solid #6d6d6d',
          background: '#fff',
          opacity: selected ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      />

      <div ref={nodeRef} className="tts-node-wrapper w-full h-full flex flex-col group relative">
        <NodeEffectOverlay nodeId={id} />

        {/* 标题 */}
        <div className="absolute bottom-full left-0 right-0 mb-1 px-1 flex items-center justify-between gap-2 min-h-[28px] nodrag">
          <div className="flex-1 min-w-0 flex items-center">
            {isEditingTitle ? (
              <Input
                ref={titleInputRef}
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  updateNodeData(id, { name: e.target.value });
                }}
                className="font-bold text-sm h-7 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 focus:outline-none px-0 cursor-text select-text rounded-none leading-none"
                placeholder={t('canvas.node.unnamedTtsCard', '未命名 TTS')}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={handleTitleKeyDown}
                autoFocus
              />
            ) : (
              <h3
                className="font-bold text-sm h-7 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none"
                title={data.name}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={handleEnterTitleEdit}
              >
                <Mic className="w-4 h-4 text-rose-400 mr-2 shrink-0" />
                {data.name || t('canvas.node.unnamedTtsCard', '未命名 TTS')}
              </h3>
            )}
          </div>
        </div>

        <NodeToolbar
          className={cn('!bottom-auto !-top-[64px] !-translate-y-1 group-hover:!translate-y-0')}
          actions={toolbarActions}
        />

        <Card
          className={`w-full h-full flex flex-col bg-muted ${selected ? 'ring-2 ring-primary' : ''} overflow-hidden relative z-[2]`}
        >
          <CardContent className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 overflow-hidden p-0">
            {!audioUrl && !showOverlay && (
              <div className="flex flex-col items-center justify-center gap-1 py-8">
                <Mic className="w-12 h-12 text-muted-foreground/10" />
                <span className="text-[10px] text-muted-foreground/40">
                  {t('canvas.node.tts.emptyHint', '输入文本生成语音')}
                </span>
              </div>
            )}

            {audioUrl && !showOverlay && (
              <AudioDisplay audioUrl={audioUrl} selected={!!selected} />
            )}

            {/* 生成中覆盖层 */}
            {showOverlay && (
              <div className="absolute inset-0 z-[19] flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-rose-500/10 via-background/80 to-cyan-500/10 rounded-sm">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
                  <Mic className="absolute inset-0 m-auto w-4 h-4 text-primary/70" />
                </div>
                <span className="text-xs font-medium text-foreground/80">
                  {t('canvas.node.tts.generatingHint', '语音合成中…')}
                </span>
                {elapsedMs > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                    {(elapsedMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <EdgeHandles />

        <HistorySidebar
          historyAudios={historyAudios}
          showHistory={showHistory}
          currentAudioUrl={audioUrl}
          onToggle={() => setShowHistory((v) => !v)}
          onClick={handleHistoryClick}
          onDragStart={handleHistoryDragStart}
          onDragEnd={handleHistoryDragEnd}
        />

        {/* 下挂生成面板 + Pin */}
        <div
          className={cn(
            'absolute top-full left-0 right-0 mt-1.5 nodrag z-20 transition-opacity duration-150',
            panelVisible ? 'opacity-100' : 'opacity-0 pointer-events-none invisible',
          )}
        >
          <button
            type="button"
            onClick={handleTogglePinPanel}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'absolute -top-1 right-1 z-30 h-6 w-6 rounded-md flex items-center justify-center transition-all duration-200',
              data.pinPanel ? 'text-primary hover:text-primary/80' : 'text-muted-foreground/40 hover:text-muted-foreground/70',
            )}
            title={data.pinPanel ? t('canvas.node.audio.unpinPanel', '取消固定') : t('canvas.node.audio.pinPanel', '固定面板')}
          >
            {data.pinPanel ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
          </button>
          <TtsGeneratePanel
            nodeId={id}
            onSubmit={handleSubmit}
            isSubmitting={ttsTask.isSubmitting}
            taskActive={taskActive}
            taskDone={taskDone}
            taskFailed={taskFailed}
            taskError={ttsTask.status?.error_message || null}
            submitError={ttsTask.error}
            hasExistingAudio={hasExistingAudio}
            initialConfig={data.initialGenConfig || null}
            onApplyToNode={handleApplyToNode}
            onApplyToNextNode={handleApplyToNextNode}
          />
        </div>
      </div>
    </>
  );
};

export default memo(TTSNode);
