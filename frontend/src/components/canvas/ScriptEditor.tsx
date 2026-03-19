import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState, useRef, useCallback, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Strikethrough, List, ListOrdered, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useCanvasStore } from '@/store/useCanvasStore';

interface ScriptEditorProps {
  initialContent?: any;
  isEditable: boolean;
  onUpdate: (content: any) => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function ScriptEditor({ initialContent, isEditable, onUpdate }: ScriptEditorProps) {
  const [isEditingLocal, setIsEditingLocal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorId = useId().replace(/:/g, '');
  
  // Actually edit mode is true if either parent says so OR local says so.
  const isActuallyEditable = isEditable || isEditingLocal;

  // Sync to backend and update store
  const syncToBackend = useCallback(async (content: any) => {
    setSaveStatus('saving');
    try {
      // Mock network request
      await new Promise((resolve, reject) => {
        if (!navigator.onLine) {
          reject(new Error('Offline'));
          return;
        }
        // Randomly fail sometimes for testing, but mostly succeed
        setTimeout(() => resolve({ success: true }), 500);
      });
      
      // Update store
      if (containerRef.current) {
        const nodeEl = containerRef.current.closest('.react-flow__node');
        if (nodeEl) {
          const nodeId = nodeEl.getAttribute('data-id');
          if (nodeId) {
            useCanvasStore.getState().updateNodeData(nodeId, { content });
          }
        }
      }
      
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
      }, 1500);
      
      // Clear offline cache if any
      localStorage.removeItem('script_offline_cache');
    } catch (err) {
      setSaveStatus('error');
      // Cache locally
      localStorage.setItem('script_offline_cache', JSON.stringify(content));
    }
  }, []);

  // Offline retry
  useEffect(() => {
    const handleOnline = () => {
      const cached = localStorage.getItem('script_offline_cache');
      if (cached) {
        syncToBackend(JSON.parse(cached));
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncToBackend]);

  // Handle clicking outside to exit local edit mode
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isEditingLocal && containerRef.current) {
        // If clicking outside the node entirely, exit edit mode
        const nodeEl = containerRef.current.closest('.react-flow__node');
        if (nodeEl && !nodeEl.contains(e.target as Node)) {
          setIsEditingLocal(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditingLocal]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '在此输入剧本内容...',
      }),
    ],
    content: initialContent || '',
    editable: isActuallyEditable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const content = editor.getJSON();
      onUpdate(content);
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        syncToBackend(content);
      }, 800);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert focus:outline-none w-full h-full',
      },
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== isActuallyEditable) {
      editor.setEditable(isActuallyEditable);
    }
  }, [isActuallyEditable, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div id={`editor-${editorId}`} ref={containerRef} className="w-full">
      <style>{`
        /* 1. 拖入画板时的默认形态: 固定尺寸 420x520 */
        /* 无论是否编辑模式，都强制最外层节点尺寸为 420x520 */
        .react-flow__node:has(#editor-${editorId}) {
          width: 420px !important;
          height: 520px !important;
        }
        
        /* 强制 ScriptNode 根容器充满 */
        .react-flow__node:has(#editor-${editorId}) > div {
          width: 100% !important;
          height: 100% !important;
          transition: all 0.2s ease-in-out;
        }
        
        /* 强制 Card 组件充满 */
        .react-flow__node:has(#editor-${editorId}) .bg-card {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
        }

        ${!isActuallyEditable ? `
          /* 非编辑模式: 隐藏标题和 Footer，内容居中 */
          .react-flow__node:has(#editor-${editorId}) .mb-2 {
            display: none !important;
          }
          .react-flow__node:has(#editor-${editorId}) .border-t {
            display: none !important;
          }
          .react-flow__node:has(#editor-${editorId}) .p-4 {
            padding: 24px !important;
            flex: 1 !important;
            height: auto !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center;
          }
          .react-flow__node:has(#editor-${editorId}) .p-4 > div {
            flex: 1 !important;
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center;
          }
        ` : `
          /* 编辑模式: 隐藏 Footer (实时保存)，调整内容区域布局 */
          .react-flow__node:has(#editor-${editorId}) .border-t {
            display: none !important;
          }
          .react-flow__node:has(#editor-${editorId}) .p-4 {
            flex: 1 !important;
            height: auto !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important; /* 防止撑开 */
          }
          .react-flow__node:has(#editor-${editorId}) .p-4 > div {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            height: 100% !important;
          }
        `}
      `}</style>

      {!isActuallyEditable ? (
        <div 
          className="h-full w-full flex items-center justify-center cursor-pointer select-none overflow-hidden"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setIsEditingLocal(true);
          }}
          title="双击进入编辑"
        >
          <span className="text-lg font-medium text-foreground/80 text-center line-clamp-[12] px-4 whitespace-pre-wrap">
            {editor.getText() || '双击编辑剧本...'}
          </span>
        </div>
      ) : (
        <div className="flex flex-col space-y-2 animate-in fade-in duration-200 h-full">
          <div className="flex flex-wrap gap-1 p-1 bg-secondary/50 rounded-md border border-border items-center justify-between shrink-0">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${editor.isActive('bold') ? 'bg-secondary' : ''}`}
                onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleBold().run(); }}
                title="加粗"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${editor.isActive('italic') ? 'bg-secondary' : ''}`}
                onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleItalic().run(); }}
                title="斜体"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${editor.isActive('strike') ? 'bg-secondary' : ''}`}
                onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleStrike().run(); }}
                title="删除线"
              >
                <Strikethrough className="h-4 w-4" />
              </Button>
              <div className="w-px h-4 bg-border mx-1 self-center" />
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${editor.isActive('bulletList') ? 'bg-secondary' : ''}`}
                onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleBulletList().run(); }}
                title="无序列表"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${editor.isActive('orderedList') ? 'bg-secondary' : ''}`}
                onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleOrderedList().run(); }}
                title="有序列表"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex items-center text-xs px-2 h-7 min-w-[80px] justify-end">
              {saveStatus === 'saving' && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 保存中...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-green-500 flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 className="w-3 h-3" /> 已保存
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> 保存失败(已缓存)
                </span>
              )}
            </div>
          </div>
          <div 
            className="p-3 rounded-md transition-colors bg-background border border-input focus-within:ring-1 focus-within:ring-ring overflow-y-auto flex-1 nodrag cursor-text"
            onPointerDownCapture={(e) => { e.stopPropagation(); }}
            onKeyDown={(e) => { e.stopPropagation(); }}
          >
            <EditorContent editor={editor} className="h-full [&>.ProseMirror]:min-h-full [&>.ProseMirror]:outline-none" />
          </div>
        </div>
      )}
    </div>
  );
}
