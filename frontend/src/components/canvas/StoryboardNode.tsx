
import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow, NodeResizer } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clapperboard, Database, Trash2, Copy, Maximize2 } from 'lucide-react';
import { useCanvasStore, StoryboardNodeData, CanvasNode } from '@/store/useCanvasStore';
import { PivotEditor } from './pivot/PivotEditor';
import { v4 as uuidv4 } from 'uuid';

const StoryboardNode = ({ id, data, selected }: NodeProps<Node<StoryboardNodeData>>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const { getNode } = useReactFlow();
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditorOpen(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除这张多维表格卡吗？")) {
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

  const rowCount = data.pivotConfig?.rows?.length || 0;
  const colCount = data.pivotConfig?.cols?.length || 0;
  const valCount = data.pivotConfig?.values?.length || 0;

  return (
    <>
      <NodeResizer 
        color="#251d38ff" 
        isVisible={selected} 
        minWidth={398} 
        minHeight={256}
        lineStyle={{ display: 'none' }}
        handleStyle={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '4px',
          border: '1px solid #251d38ff',
          background: '#fff',
          opacity: selected ? 1 : 0,
          transition: 'opacity 0.2s'
        }}
      />
      <div 
        className={`w-full h-full flex flex-col group relative storyboard-node-wrapper`}
        style={{ minWidth: 398, minHeight: 256 }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditorOpen(true);
        }}
      >
        <div className="mb-1 px-1 flex items-center justify-between gap-2 flex-shrink-0 min-h-[32px]">
          <div className="flex-1 min-w-0 nodrag flex items-center">
            <h3 
              className="font-bold text-lg h-8 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none gap-2" 
              title="多维表格卡" 
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Clapperboard className="w-5 h-5 text-amber-600" />
              多维表格卡
            </h3>
          </div>
        </div>

        <Card className={`flex-1 flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : 'border border-border/50'} overflow-hidden relative z-[2] shadow-sm hover:shadow-md transition-all`}>
          <CardContent className="p-0 flex-1 flex flex-col bg-background/50">
              {rowCount > 0 || colCount > 0 || valCount > 0 ? (
                <div className="flex-1 flex flex-col w-full h-full p-4 relative overflow-hidden">
                  {/* 已配置的简化表格骨架表示 */}
                  <div className="w-full h-8 bg-primary/10 rounded-md mb-4 flex items-center px-3 border border-primary/20">
                    <div className="h-3 w-16 bg-primary/30 rounded mr-4"></div>
                    <div className="h-3 w-24 bg-primary/30 rounded mr-4"></div>
                    <div className="h-3 w-20 bg-primary/30 rounded"></div>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="w-full flex items-center gap-4 py-2 border-b border-border/30 last:border-0">
                        <div className="h-2 w-12 bg-primary/10 rounded"></div>
                        <div className="h-2 w-32 bg-primary/10 rounded"></div>
                        <div className="h-2 w-full bg-primary/10 rounded"></div>
                      </div>
                    ))}
                  </div>
                  
                  {/* 数据透视结果提示蒙层 */}
                  <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-none">
                    <div className="bg-background/95 px-6 py-4 rounded-xl shadow-md border border-primary/20 flex flex-col items-center gap-3">
                      <Database className="w-8 h-8 text-primary/80" />
                      <div className="text-sm flex flex-col items-center gap-1 text-center">
                         <span className="font-semibold text-foreground">已配置数据透视</span>
                         <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded-full">
                           {rowCount} 行 / {colCount} 列 / {valCount} 值
                         </span>
                         <span className="text-[10px] text-muted-foreground/60 mt-1">双击重新编辑</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col w-full h-full p-4 relative overflow-hidden">
                  {/* 表格骨架屏样式 */}
                  <div className="w-full h-8 bg-muted/50 rounded-md mb-4 flex items-center px-3 border border-border/40">
                    <div className="h-3 w-16 bg-muted-foreground/20 rounded mr-4"></div>
                    <div className="h-3 w-24 bg-muted-foreground/20 rounded mr-4"></div>
                    <div className="h-3 w-20 bg-muted-foreground/20 rounded"></div>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="w-full flex items-center gap-4 py-2 border-b border-border/30 last:border-0">
                        <div className="h-2 w-12 bg-muted/40 rounded"></div>
                        <div className="h-2 w-32 bg-muted/40 rounded"></div>
                        <div className="h-2 w-full bg-muted/40 rounded"></div>
                      </div>
                    ))}
                  </div>
                  
                  {/* 引导提示蒙层 */}
                  <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none">
                    <div className="px-4 py-3 flex flex-col items-center gap-2">
                      <span className="text-sm font-medium text-foreground/80">双击进入多维表格</span>
                    </div>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>

        {/* 悬浮操作按钮，底部外侧 */}
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-full flex justify-center pt-4 gap-2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-30 pb-4">
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-8 w-8 rounded-full shadow-md hover:bg-secondary shrink-0 pointer-events-auto relative z-40" 
            onClick={handleEdit} 
            title="全屏编辑" 
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-8 w-8 rounded-full shadow-md hover:bg-secondary shrink-0 pointer-events-auto relative z-40" 
            onClick={handleDuplicate} 
            title="创建副本" 
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-8 w-8 rounded-full shadow-md text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 pointer-events-auto relative z-40" 
            onClick={handleDelete} 
            title="删除" 
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="edge-handle-wrapper left">
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
          <Handle type="target" position={Position.Left} id="left-target" />
          <Handle type="source" position={Position.Left} id="left-source" />
        </div>
        
        <div className="edge-handle-wrapper right">
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
          <Handle type="target" position={Position.Right} id="right-target" />
          <Handle type="source" position={Position.Right} id="right-source" />
        </div>
      </div>

      {/* 优化后的节点边缘拖拽热区 */}
      <style>{`
        .edge-handle-wrapper {
          position: absolute;
          z-index: 60;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        
        .edge-handle-wrapper.left {
          left: -10px; top: 10%; bottom: 10%; width: 20px;
        }
        .edge-handle-wrapper.right {
          right: -10px; top: 10%; bottom: 10%; width: 20px;
          z-index: 50;
        }

        .edge-handle-inner {
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 10;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .edge-handle-wrapper.left .edge-handle-inner,
        .edge-handle-wrapper.right .edge-handle-inner {
          width: 6px; height: 24px;
        }

        .edge-handle-line {
          position: absolute;
          background: #1890FF;
          border-radius: 2px;
        }

        .edge-handle-wrapper.left .edge-handle-line,
        .edge-handle-wrapper.right .edge-handle-line {
          width: 2px; height: 100%;
          background: #1890FF;
        }

        .edge-handle-dot {
          width: 8px;
          height: 8px;
          background: #1890FF;
          border-radius: 50%;
          box-shadow: 0 0 4px #1890FF40;
          position: absolute;
          z-index: 25;
        }

        .storyboard-node-wrapper:hover .edge-handle-inner,
        .edge-handle-wrapper:hover .edge-handle-inner {
          opacity: 1 !important;
        }

        .edge-handle-wrapper .react-flow__handle {
          width: 100% !important;
          height: 100% !important;
          background: transparent !important;
          border: none !important;
          min-width: unset !important;
          min-height: unset !important;
          border-radius: 0 !important;
          transform: none !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          pointer-events: auto !important;
          z-index: 30 !important;
          cursor: crosshair !important;
        }
      `}</style>

      {isEditorOpen && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm p-6 flex" onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setIsEditorOpen(false);
          }
        }}>
          <div className="w-full h-full bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b bg-muted/30">
               <div className="font-semibold flex items-center gap-2 text-lg">
                 <Clapperboard className="w-6 h-6 text-amber-600" /> 多维表格编辑器
               </div>
               <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
                 完成并关闭
               </Button>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <PivotEditor nodeId={id} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default memo(StoryboardNode);
