import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Wand2, Check, Copy, ScrollText, Quote } from 'lucide-react';
import { useCanvasStore, ScriptNodeData, CanvasNode } from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import NodeEffectOverlay from './NodeEffectOverlay';
import { ScriptEditor } from './TextEditor';
import { NodeToolbar, ToolbarAction } from './NodeToolbar';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';

const ScriptNode = ({ id, data, selected }: NodeProps<Node<ScriptNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const { getNode } = useReactFlow();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<ScriptNodeData>(data);
  const [charCount, setCharCount] = useState(0);
  const nodeRef = useRef<HTMLDivElement>(null);
  // Keep a ref to the latest editData so callbacks always see fresh values
  const editDataRef = useRef<ScriptNodeData>(data);
  editDataRef.current = editData;

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

  // ESC to exit edit mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing && e.key === 'Escape') {
        setIsEditing(false);
      }
    };

    if (isEditing) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditData(data);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('canvas.node.deleteConfirm.text'))) {
      deleteNode(id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (node) {
      const currentData = isEditing ? editData : node.data as ScriptNodeData;
      const currentTitle = currentData.title || t('canvas.node.unnamedTextCard');
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
          title: t('canvas.node.copySuffix', { name: currentTitle }),
        },
      };
      addNode(newNode);
    }
  };

  const handleAIAssist = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: Implement AI assist functionality
    alert('AI Assist is under development...');
  };

  const handleReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 获取文本内容
    const content = data.content;
    let fullText = '';
    if (typeof content === 'string') {
      fullText = content;
    } else if (content && typeof content === 'object' && 'content' in content) {
      // 从 Tiptap JSON 中提取文本
      const extractText = (node: any): string => {
        if (!node) return '';
        if (node.type === 'text' && node.text) return node.text;
        if (node.content && Array.isArray(node.content)) {
          return node.content.map(extractText).join(' ');
        }
        return '';
      };
      fullText = extractText(content);
    }
    const MAX_TEXT_LENGTH = 50000;
    const clampedText = fullText.length > MAX_TEXT_LENGTH ? fullText.slice(0, MAX_TEXT_LENGTH) + '...' : fullText;
    const excerpt = fullText.length > 150 ? fullText.slice(0, 150) + '...' : fullText;
    
    // 检查节点是否已在附件中
    const store = useAIAssistantStore.getState();
    const isReferenced = store.nodeAttachments.some(a => a.nodeId === id);
    
    if (isReferenced) {
      // 已引用则撤销引用
      store.removeNodeAttachment(id);
    } else {
      // 未引用则添加引用
      store.addNodeAttachment({
        nodeId: id,
        nodeType: 'text',
        label: data.title || t('canvas.node.unnamedTextCard'),
        excerpt,
        thumbnailUrl: '',
        meta: { fullText: clampedText },
      });
      store.setIsOpen(true);
    }
  };

  // 检查节点是否已被引用
  const isReferenced = useAIAssistantStore((state) => state.nodeAttachments.some(a => a.nodeId === id));

  const handleFinishEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsEditing(false);
  };

  return (
    <>
      <NodeResizer 
        color="#6d6d6d" 
        isVisible={selected} 
        minWidth={300} 
        minHeight={200}
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
        ref={nodeRef}
        className={`script-node-wrapper w-full h-full flex flex-col group relative`} 
        data-editing={isEditing}
        onDoubleClick={!isEditing ? handleEdit : undefined}
      >
        <NodeEffectOverlay nodeId={id} />
        {/* 标题悬浮在卡片上方，不占节点布局空间 */}
        <div className="script-node__title absolute bottom-full left-0 right-0 mb-1 px-1 flex items-center justify-between gap-2 min-h-[28px] nodrag">
          <div className="flex-1 min-w-0 flex items-center">
            {isEditing ? (
              <Input
                value={editData.title}
                onChange={(e) => {
                  const newData = { ...editData, title: e.target.value };
                  setEditData(newData);
                  updateNodeData(id, newData);
                }}
                className="font-bold text-sm h-7 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 focus:outline-none px-0 shadow-none cursor-text select-text rounded-none leading-none"
                placeholder={t('canvas.node.unnamedTextCard')}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    handleFinishEdit(e as unknown as React.MouseEvent);
                  }
                }}
                autoFocus
              />
            ) : (
              <h3 
                className="font-bold text-sm h-7 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none" 
                title={data.title} 
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={handleEdit}
              >
                <ScrollText className="w-4 h-4 text-node-blue mr-2 shrink-0" />
                {data.title || t('canvas.node.unnamedTextCard')}
              </h3>
            )}
          </div>
          {/* 字数统计 */}
          <div className="text-xs font-medium text-muted-foreground/60 flex-shrink-0 select-none">
            {t('canvas.node.charCount', { count: charCount })}
          </div>
        </div>

      <Card className={`w-full h-full flex flex-col bg-card ${selected && !isEditing ? 'ring-2 ring-primary' : ''} overflow-hidden relative z-[2]`}>
        <CardContent className="script-node__content p-0 flex-1 flex flex-col">
          <div className="text-sm text-foreground flex-1 min-h-[40px] flex flex-col">
            <ScriptEditor
              initialContent={editData.content || undefined}
              isEditable={isEditing}
              onUpdate={(content, chars) => {
                const newData = { ...editDataRef.current, content };
                setEditData(newData);
                updateNodeData(id, newData);
                setCharCount(chars);
              }}
              onCharCountChange={setCharCount}
            />
          </div>
        </CardContent>
        <CardFooter className="script-node__footer p-2 bg-secondary/10 flex justify-end gap-2 border-t">
          {isEditing ? (
            <Button variant="default" size="sm" className="h-8" onClick={handleFinishEdit}>
              <Check className="h-4 w-4 mr-1" /> {t('canvas.node.toolbar.finishEdit')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="icon" className={`h-8 w-8 hover:bg-background ${isReferenced ? 'text-primary bg-primary/10' : ''}`} onClick={handleReference} title={isReferenced ? t('canvas.node.toolbar.unreference') : t('canvas.node.toolbar.reference')}>
                <Quote className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={handleEdit} title={t('canvas.node.toolbar.edit')}>
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
        </CardFooter>
      </Card>

      {/* 工具条 */}
      <NodeToolbar
        actions={[
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
        ] as ToolbarAction[]}
      />

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
