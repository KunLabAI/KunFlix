import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState, useRef, useCallback, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Strikethrough, List, ListOrdered, Loader2, CheckCircle2, AlertCircle, Heading1, Heading2, Heading3, Quote, Code } from 'lucide-react';
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
        /* 1. 拖入画板时的默认形态: 初始尺寸 420x520 */
        /* 移除 !important 允许 NodeResizer 调整大小 */
        .react-flow__node:has(#editor-${editorId}) {
          width: 420px;
          height: 520px;
        }
        
        /* 强制 ScriptNode 根容器充满 */
        .react-flow__node:has(#editor-${editorId}) > .script-node-wrapper {
          width: 100%;
          height: 100%;
          transition: all 0.2s ease-in-out;
        }
        
        /* 强制 Card 组件充满 */
        .react-flow__node:has(#editor-${editorId}) .bg-card {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        ${!isActuallyEditable ? `
          /* 非编辑模式: 隐藏标题和 Footer，内容居中 */
          .react-flow__node:has(#editor-${editorId}) .mb-2 {
            display: none;
          }
          .react-flow__node:has(#editor-${editorId}) .border-t {
            display: none;
          }
          .react-flow__node:has(#editor-${editorId}) .p-4 {
            padding: 24px;
            flex: 1;
            height: auto;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .react-flow__node:has(#editor-${editorId}) .p-4 > div {
            flex: 1;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
        ` : `
          {/* 编辑模式: 隐藏 Footer (实时保存)，调整内容区域布局 */}
          .react-flow__node:has(#editor-${editorId}) .border-t {
            display: none;
          }
          .react-flow__node:has(#editor-${editorId}) .p-0 {
            flex: 1;
            height: auto;
            display: flex;
            flex-direction: column;
            overflow: hidden; /* 防止撑开 */
          }
          .react-flow__node:has(#editor-${editorId}) .p-0 > div {
            flex: 1;
            display: flex;
            flex-direction: column;
            height: 100%;
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
        <div className="flex flex-col animate-in fade-in duration-200 h-full relative">
          {/* 工具栏紧贴在内容上方，也就是标题下方 */}
          <div className="flex flex-wrap gap-1 py-1 px-2 border-b border-border/50 items-center justify-between shrink-0 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex gap-0.5">
              <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 hover:bg-secondary ${editor.isActive('bold') ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleBold().run(); }} title="加粗">
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 hover:bg-secondary ${editor.isActive('italic') ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleItalic().run(); }} title="斜体">
                <Italic className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 hover:bg-secondary ${editor.isActive('strike') ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleStrike().run(); }} title="删除线">
                <Strikethrough className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-4 bg-border mx-1 self-center" />
              <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 hover:bg-secondary ${editor.isActive('heading', { level: 1 }) ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleHeading({ level: 1 }).run(); }} title="大标题">
                <Heading1 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 hover:bg-secondary ${editor.isActive('heading', { level: 2 }) ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }} title="中标题">
                <Heading2 className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-4 bg-border mx-1 self-center" />
              <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 hover:bg-secondary ${editor.isActive('bulletList') ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleBulletList().run(); }} title="无序列表">
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 hover:bg-secondary ${editor.isActive('orderedList') ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} onClick={(e) => { e.stopPropagation(); editor.chain().focus().toggleOrderedList().run(); }} title="有序列表">
                <ListOrdered className="h-3.5 w-3.5" />
              </Button>
            </div>
            
            <div className="flex items-center text-[10px] h-7 min-w-[60px] justify-end">
              {saveStatus === 'saving' && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 保存...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-green-500/80 flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 className="w-3 h-3" /> 已存
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-destructive/80 flex items-center gap-1" title="保存失败(已缓存)">
                  <AlertCircle className="w-3 h-3" /> 失败
                </span>
              )}
            </div>
          </div>

          <div 
            className="py-2 px-4 transition-colors overflow-y-auto flex-1 nodrag cursor-text outline-none"
            onPointerDownCapture={(e) => { e.stopPropagation(); }}
            onKeyDown={(e) => { e.stopPropagation(); }}
          >
            <EditorContent editor={editor} className="h-full [&>.ProseMirror]:min-h-full [&>.ProseMirror]:outline-none [&>.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/50 [&>.ProseMirror_p.is-empty::before]:text-muted-foreground/50" />
          </div>
        </div>
      )}
    </div>
  );
}
