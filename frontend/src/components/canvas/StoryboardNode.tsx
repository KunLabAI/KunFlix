
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow, NodeResizer } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Clapperboard, Trash2, Copy, Image, Film, Music, Play, X, Pencil, FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCanvasStore, StoryboardNodeData, CanvasNode } from '@/store/useCanvasStore';
import { NodeToolbar, ToolbarAction } from './NodeToolbar';
import NodeEffectOverlay from './NodeEffectOverlay';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';

/** Ensure media URL has /api/media/ prefix */
const normalizeMediaUrl = (url: string | null | undefined): string | null => {
  const u = url?.toString().trim();
  return !u ? null
    : (u.startsWith('http') || u.startsWith('/api/media/') || u.startsWith('data:') || u.startsWith('blob:'))
      ? u : `/api/media/${u}`;
};

type ColType = 'text' | 'number' | 'image' | 'video' | 'audio';
const MEDIA_TYPES = new Set<ColType>(['image', 'video', 'audio']);

/** Progressive row rendering: avoids blocking the main thread when many rows arrive at once */
const INITIAL_BATCH = 10;
const BATCH_SIZE = 8;

function useProgressiveRows<T>(allRows: T[], isStreaming: boolean): T[] {
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const prevLengthRef = useRef(allRows.length);

  // Reset visible count when rows shrink (new node) or streaming starts
  useEffect(() => {
    (allRows.length < prevLengthRef.current) && setVisibleCount(INITIAL_BATCH);
    prevLengthRef.current = allRows.length;
  }, [allRows.length]);

  // Progressively reveal more rows
  useEffect(() => {
    const remaining = allRows.length - visibleCount;
    (remaining <= 0) && void 0;
    // Use rAF chain for smooth progressive rendering
    const frame = remaining > 0 ? requestAnimationFrame(() => {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, allRows.length));
    }) : 0;
    return () => { frame && cancelAnimationFrame(frame); };
  }, [visibleCount, allRows.length]);

  return allRows.slice(0, visibleCount);
}

const StoryboardNode = ({ id, data, selected }: NodeProps<Node<StoryboardNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(data.title || '');
  const [previewMedia, setPreviewMedia] = useState<{ type: ColType; url: string } | null>(null);
  const { getNode } = useReactFlow();

  const handleDelete = (e: React.MouseEvent) => {
    if (confirm(t('canvas.node.deleteConfirm.storyboard'))) {
      deleteNode(id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (node) {
      const newNode = {
        ...(node as CanvasNode),
        id: `storyboard-${uuidv4()}`,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: false,
        data: {
          ...node.data,
        },
      } as CanvasNode;
      addNode(newNode);
    }
  };

  // Extract table data (preserve column type for media rendering)
  const tableInfo = useMemo(() => {
    const td = data.tableData;
    const tc = data.tableColumns;
    const hasTableData = Array.isArray(td) && td.length > 0;
    const hasTableCols = Array.isArray(tc) && tc.length > 0;
    const columns: { key: string; label: string; type: ColType }[] = hasTableCols
      ? tc.map((c: any) => ({ key: c.key, label: c.label || c.key, type: (c.type as ColType) || 'text' }))
      : hasTableData
        ? Object.keys(td[0]).filter(k => k !== 'key').map(k => ({ key: k, label: k, type: 'text' as ColType }))
        : [];
    return { columns, rows: hasTableData ? td : [], total: hasTableData ? td.length : 0 };
  }, [data.tableData, data.tableColumns]);

  const hasData = tableInfo.total > 0;
  const isStreaming = !!data._streaming;
  const visibleRows = useProgressiveRows(tableInfo.rows, isStreaming);
  const hasMoreRows = visibleRows.length < tableInfo.total;

  const handleExportExcel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const { columns, rows } = tableInfo;
    const exportRows = rows.map((row: any) =>
      columns.reduce<Record<string, unknown>>((acc, col) => {
        acc[col.label] = MEDIA_TYPES.has(col.type) ? normalizeMediaUrl(row[col.key] as string) ?? '' : (row[col.key] ?? '');
        return acc;
      }, {})
    );
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${data.title || 'storyboard'}.xlsx`);
  }, [tableInfo, data.title]);

  const handleCellBlur = useCallback((rowIndex: number, colKey: string, value: string) => {
    const td = data.tableData;
    if (!Array.isArray(td)) return;
    const updated = td.map((row, i) => (i === rowIndex ? { ...row, [colKey]: value } : row));
    updateNodeData(id, { tableData: updated });
  }, [data.tableData, id, updateNodeData]);

  return (
    <>
      <NodeResizer 
        color="#6d6d6d" 
        isVisible={selected} 
        minWidth={398} 
        minHeight={256}
        lineStyle={{ display: 'none' }}
        handleStyle={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '4px',
          border: '1px solid #6d6d6d',
          background: '#fff',
          opacity: selected ? 1 : 0,
          transition: 'opacity 0.2s'
        }}
      />
      <div 
        className={`w-full h-full flex flex-col group relative storyboard-node-wrapper ${isEditing ? 'nodrag' : ''}`}
        style={{ minWidth: 398, minHeight: 256 }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        onBlur={(e) => {
          // Exit editing when focus leaves the entire node
          if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) {
            setIsEditing(false);
          }
        }}
      >
        <NodeEffectOverlay nodeId={id} />
        {/* 标题悬浮在卡片上方，不占节点布局空间 */}
        <div className="absolute bottom-full left-0 right-0 mb-1 px-1 flex items-center justify-between gap-2 min-h-[28px] nodrag">
          <div className="flex-1 min-w-0 flex items-center">
            {isEditingTitle ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => {
                  setIsEditingTitle(false);
                  updateNodeData(id, { title: editTitle });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingTitle(false);
                    updateNodeData(id, { title: editTitle });
                  }
                }}
                className="h-7 text-sm font-bold px-2 py-0"
                autoFocus
              />
            ) : (
              <h3 
                className="font-bold text-sm h-7 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none gap-2" 
                title={data.title || t('canvas.node.storyboardCard')} 
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={() => {
                  setEditTitle(data.title || '');
                  setIsEditingTitle(true);
                }}
              >
                <Clapperboard className="w-4 h-4 text-amber-600" />
                {data.title || t('canvas.node.storyboardCard')}
              </h3>
            )}
          </div>
        </div>

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : 'border border-border/50'} overflow-hidden relative z-[2] shadow-sm hover:shadow-md transition-all`}>
          <CardContent className={`p-0 flex-1 flex flex-col bg-background/50 overflow-hidden ${isEditing ? 'nowheel' : ''}`}>
              {hasData ? (
                <div
                  className="flex-1 flex flex-col w-full h-full overflow-auto"
                  onPointerDown={(e) => {
                    // In edit mode, block drag for scrollbar clicks
                    const el = e.currentTarget;
                    const rect = el.getBoundingClientRect();
                    const onVScrollbar = el.scrollHeight > el.clientHeight && e.clientX >= rect.right - 14;
                    const onHScrollbar = el.scrollWidth > el.clientWidth && e.clientY >= rect.bottom - 14;
                    if (isEditing && (onVScrollbar || onHScrollbar)) e.stopPropagation();
                  }}
                >
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/60 border-b border-border sticky top-0 z-[1]">
                        {tableInfo.columns.map(col => (
                          <th key={col.key} className={`px-3 py-2 text-left font-medium text-muted-foreground bg-muted/60 ${MEDIA_TYPES.has(col.type) ? 'w-[120px] min-w-[120px]' : 'max-w-[180px]'}`}>
                            <span className="flex items-center gap-1">
                              {col.type === 'image' && <Image className="w-3 h-3 shrink-0" />}
                              {col.type === 'video' && <Film className="w-3 h-3 shrink-0" />}
                              {col.type === 'audio' && <Music className="w-3 h-3 shrink-0" />}
                              <span className="truncate">{col.label}</span>
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row: any, i: number) => (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                          {tableInfo.columns.map(col => {
                            const isMedia = MEDIA_TYPES.has(col.type);
                            const rawValue = row[col.key];
                            const mediaUrl = isMedia ? normalizeMediaUrl(rawValue as string) : null;

                            // --- Media cell: image ---
                            return col.type === 'image' ? (
                              <td key={col.key} className="px-2 py-1.5 w-[120px] min-w-[120px]">
                                {mediaUrl ? (
                                  <button
                                    className="block w-32 h-32 rounded-md overflow-hidden border border-border/40 bg-muted/30 cursor-pointer hover:ring-2 hover:ring-primary/40 hover:shadow-md transition-all"
                                    onClick={() => setPreviewMedia({ type: 'image', url: mediaUrl })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <img src={mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                  </button>
                                ) : (
                                  <div className="w-32 h-16 rounded-md border border-dashed border-border/40 bg-muted/20 flex items-center justify-center">
                                    <Image className="w-5 h-5 text-muted-foreground/30" />
                                  </div>
                                )}
                              </td>
                            ) : col.type === 'video' ? (
                              <td key={col.key} className="px-2 py-1.5 w-[120px] min-w-[120px]">
                                {mediaUrl ? (
                                  <button
                                    className="relative block w-32 h-32 rounded-md overflow-hidden border border-border/40 bg-black cursor-pointer hover:ring-2 hover:ring-primary/40 hover:shadow-md transition-all group/vid"
                                    onClick={() => setPreviewMedia({ type: 'video', url: mediaUrl })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <video src={mediaUrl} className="w-full h-full object-cover" muted preload="metadata" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover/vid:bg-black/15 transition-colors">
                                      <Play className="w-5 h-5 text-white/90 fill-white/90" />
                                    </div>
                                  </button>
                                ) : (
                                  <div className="w-32 h-32 rounded-md border border-dashed border-border/40 bg-muted/20 flex items-center justify-center">
                                    <Film className="w-5 h-5 text-muted-foreground/30" />
                                  </div>
                                )}
                              </td>
                            ) : col.type === 'audio' ? (
                              <td key={col.key} className="px-2 py-1.5 w-[120px] min-w-[120px]">
                                {mediaUrl ? (
                                  <button
                                    className="flex items-center gap-2 w-32 h-32 rounded-md border border-border/40 bg-amber-500/5 cursor-pointer hover:ring-2 hover:ring-primary/40 hover:shadow-md transition-all px-2"
                                    onClick={() => setPreviewMedia({ type: 'audio', url: mediaUrl })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                                      <Play className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                    </div>
                                    <span className="text-[10px] text-muted-foreground leading-tight truncate">{t('canvas.node.storyboard.play')}</span>
                                  </button>
                                ) : (
                                  <div className="w-24 h-16 rounded-md border border-dashed border-border/40 bg-muted/20 flex items-center justify-center">
                                    <Music className="w-5 h-5 text-muted-foreground/30" />
                                  </div>
                                )}
                              </td>
                            ) : (
                              /* --- Text / Number cell --- */
                              <td
                                key={col.key}
                                className={`px-3 py-1.5 max-w-[180px] text-foreground/80 ${isEditing ? 'cursor-text' : 'cursor-default select-none'}`}
                                contentEditable={isEditing}
                                suppressContentEditableWarning
                                onBlur={(e) => handleCellBlur(i, col.key, e.currentTarget.textContent || '')}
                              >
                                {rawValue != null ? String(rawValue) : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Streaming / progressive loading indicator */}
                  {(isStreaming || hasMoreRows) && (
                    <div className="flex items-center justify-center gap-2 py-2 border-t border-border/20 bg-muted/30">
                      <Loader2 className="w-3 h-3 animate-spin text-primary/60" />
                      <span className="text-[10px] text-muted-foreground">
                        {isStreaming
                          ? `AI 正在生成数据... (${tableInfo.total} 行)`
                          : `加载中... (${visibleRows.length}/${tableInfo.total})`
                        }
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <span className="text-sm font-medium text-foreground/60">{t('canvas.node.storyboard.noData')}</span>
                  <span className="text-[10px] text-muted-foreground/50">{t('canvas.node.storyboard.waitingForAgent')}</span>
                </div>
              )}
          </CardContent>
        </Card>

        {/* 媒体全屏预览弹窗 */}
        {previewMedia && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm nodrag"
            onClick={() => setPreviewMedia(null)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer z-10"
              onClick={() => setPreviewMedia(null)}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="max-w-[85vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              {previewMedia.type === 'image' && (
                <img src={previewMedia.url} alt="" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain" />
              )}
              {previewMedia.type === 'video' && (
                <video src={previewMedia.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" />
              )}
              {previewMedia.type === 'audio' && (
                <div className="flex flex-col items-center gap-6 p-10 rounded-2xl bg-card/95 shadow-2xl border border-border/30">
                  <div className="w-20 h-20 rounded-full bg-amber-500/15 flex items-center justify-center">
                    <Music className="w-10 h-10 text-amber-500" />
                  </div>
                  <audio
                    src={previewMedia.url}
                    controls
                    autoPlay
                    className="w-80 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 工具条 */}
        <NodeToolbar
          actions={[
            ...(hasData ? [{
              icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
              onClick: handleExportExcel,
              title: t('canvas.node.storyboard.exportExcel'),
            }] : []),
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
          ] as ToolbarAction[]}
        />

        {/* Left Edge */}
        <div className="edge-handle-wrapper left group/handle pointer-events-auto">
          <Handle type="target" position={Position.Left} id="left-target" />
          <Handle type="source" position={Position.Left} id="left-source" />
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
        </div>

        {/* Right Edge */}
        <div className="edge-handle-wrapper right group/handle pointer-events-auto">
          <Handle type="target" position={Position.Right} id="right-target" />
          <Handle type="source" position={Position.Right} id="right-source" />
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
        </div>
      </div>


    </>
  );
};

export default memo(StoryboardNode);
