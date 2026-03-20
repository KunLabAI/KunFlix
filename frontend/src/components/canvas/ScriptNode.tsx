import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Wand2, Check, Copy } from 'lucide-react';
import { useCanvasStore, ScriptNodeData, CanvasNode } from '@/store/useCanvasStore';
import { ScriptEditor } from './ScriptEditor';
import { v4 as uuidv4 } from 'uuid';

const ScriptNode = ({ id, data, selected }: NodeProps<Node<ScriptNodeData>>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const { getNode } = useReactFlow();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<ScriptNodeData>(data);
  const [charCount, setCharCount] = useState(0);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Sync external data changes to local state if not editing
  useEffect(() => {
    if (!isEditing) {
      // eslint-disable-next-line
      setEditData(data);
    }
  }, [data, isEditing]);

  // Click outside to exit edit mode and save
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInsideNode = nodeRef.current?.contains(target);
      const isInsidePortal = target.closest('[data-radix-popper-content-wrapper], [data-radix-portal], .tiptap-color-picker');
      
      if (isEditing && !isInsideNode && !isInsidePortal) {
        updateNodeData(id, editData);
        setIsEditing(false);
      }
    };
    
    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, editData, id, updateNodeData]);

  // ESC to exit edit mode and save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing && e.key === 'Escape') {
        updateNodeData(id, editData);
        setIsEditing(false);
      }
    };

    if (isEditing) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing, editData, id, updateNodeData]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditData(data);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除这张文本卡吗？")) {
      deleteNode(id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (node) {
      const currentData = isEditing ? editData : node.data as ScriptNodeData;
      const newNode: CanvasNode = {
        ...(node as CanvasNode),
        id: `script-${uuidv4()}`,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: false,
        data: {
          ...currentData,
          title: currentData.title ? `${currentData.title} (副本)` : '无标题文本卡 (副本)',
        },
      };
      addNode(newNode);
    }
  };

  const handleAIAssist = (e: React.MouseEvent) => {
    e.stopPropagation();
    alert("AI 辅助功能正在开发中...");
  };

  const handleSave = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateNodeData(id, editData);
    setIsEditing(false);
  };

  return (
    <>
      <NodeResizer 
        color="#251d38ff" 
        isVisible={selected} 
        minWidth={300} 
        minHeight={300} 
      />
      <div 
        ref={nodeRef}
        className={`script-node-wrapper w-full h-full flex flex-col group relative`} 
        data-editing={isEditing}
        onDoubleClick={!isEditing ? handleEdit : undefined}
      >
        {/* 标题移到卡片外部 */}
        <div className="script-node__title mb-1 px-1 flex items-center justify-between gap-2 flex-shrink-0 min-h-[32px]">
          <div className="flex-1 min-w-0 nodrag flex items-center">
          {isEditing ? (
            <Input
            value={editData.title}
            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
            className="font-bold text-lg h-8 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 focus:outline-none px-0 shadow-none cursor-text select-text rounded-none leading-none"
            placeholder="无标题文本卡"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') {
                handleSave(e as unknown as React.MouseEvent);
              }
            }}
            autoFocus
          />
        ) : (
          <h3 
            className="font-bold text-lg h-8 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none" 
            title={data.title} 
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={handleEdit}
          >
            {data.title || '无标题文本卡'}
          </h3>
        )}
          </div>
          {/* 字数统计 */}
          <div className="text-xs font-medium text-muted-foreground/60 flex-shrink-0 select-none">
            {charCount} 字
          </div>
        </div>

      <Card className={`flex-1 flex flex-col bg-card ${selected && !isEditing ? 'ring-2 ring-primary' : 'border border-border/50'} overflow-hidden relative z-[2]`}>
        <CardContent className="script-node__content p-0 flex-1 overflow-hidden flex flex-col">
          <div className="text-sm text-foreground flex-1 min-h-[40px] flex flex-col">
            <ScriptEditor
              initialContent={editData.content || undefined}
              isEditable={isEditing}
              onUpdate={(content, chars) => {
                setEditData({ ...editData, content });
                setCharCount(chars);
              }}
            />
          </div>
        </CardContent>
        <CardFooter className="script-node__footer p-2 bg-secondary/10 flex justify-end gap-2 border-t">
          {isEditing ? (
            <Button variant="default" size="sm" className="h-8" onClick={handleSave}>
              <Check className="h-4 w-4 mr-1" /> 完成编辑
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={handleAIAssist} title="AI 辅助">
                <Wand2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={handleEdit} title="编辑">
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
        </CardFooter>
      </Card>

      {/* 悬浮操作按钮，底部外侧 */}
      <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 w-full flex justify-center pt-2 gap-2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-30">
        <Button 
          variant="secondary" 
          size="icon" 
          className="h-8 w-8 rounded-full shadow-md hover:bg-secondary shrink-0 pointer-events-auto relative z-40" 
          onClick={handleDuplicate} 
          title="创建副本" 
          aria-label="创建副本"
          role="button"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button 
          variant="secondary" 
          size="icon" 
          className="h-8 w-8 rounded-full shadow-md text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 pointer-events-auto relative z-40" 
          onClick={handleDelete} 
          title="删除" 
          aria-label="删除"
          role="button"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* 优化后的节点边缘拖拽热区 */}
      <style>{`
        .edge-handle-wrapper {
          position: absolute;
          z-index: 60;
          pointer-events: none; /* 让包装器本身不阻挡鼠标事件 */
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
          z-index: 50; /* 确保拖拽手柄在操作按钮上层 */
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

        .script-node-wrapper:hover .edge-handle-inner,
        .edge-handle-wrapper:hover .edge-handle-inner {
          opacity: 1 !important;
        }


        /* 隐藏原生的 handle，将事件代理给外部包装器 */
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
          pointer-events: auto !important; /* 确保原生的 handle 能够响应拖拽事件 */
          z-index: 30 !important;
        }

        .edge-handle-wrapper:hover .react-flow__handle,
        .edge-handle-wrapper .react-flow__handle:hover,
        .group:hover .react-flow__handle {
          background: transparent !important;
        }
      `}</style>

      {/* Right Edge */}
      <div className="edge-handle-wrapper right group/handle pointer-events-auto">
        <Handle type="target" position={Position.Right} id="right-target" />
        <Handle type="source" position={Position.Right} id="right-source" />
        <div className="edge-handle-inner">
          <div className="edge-handle-line" />
          <div className="edge-handle-dot" />
        </div>
      </div>

      {/* Left Edge */}
      <div className="edge-handle-wrapper left group/handle pointer-events-auto">
        <Handle type="target" position={Position.Left} id="left-target" />
        <Handle type="source" position={Position.Left} id="left-source" />
        <div className="edge-handle-inner">
          <div className="edge-handle-line" />
          <div className="edge-handle-dot" />
        </div>
      </div>

      </div>
    </>
  );
};

export default memo(ScriptNode);
