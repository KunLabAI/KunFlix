import { useEditor, EditorContent, EditorContext, JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useCanvasStore } from '@/store/useCanvasStore';

// --- Tiptap UI Primitives ---
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar';

// --- Tiptap UI Components ---
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu';
import { ListDropdownMenu } from '@/components/tiptap-ui/list-dropdown-menu';
import { BlockquoteButton } from '@/components/tiptap-ui/blockquote-button';
import { CodeBlockButton } from '@/components/tiptap-ui/code-block-button';
import { MarkButton } from '@/components/tiptap-ui/mark-button';
import { ColorHighlightPopover } from '@/components/tiptap-ui/color-highlight-popover';
import { LinkPopover } from '@/components/tiptap-ui/link-popover';
import { TextAlignButton } from '@/components/tiptap-ui/text-align-button';
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button';

// --- Styles ---
import './script-editor.scss';

interface ScriptEditorProps {
  initialContent?: JSONContent;
  isEditable: boolean;
  onUpdate: (content: JSONContent) => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_STATUS_CONFIG: Record<Exclude<SaveStatus, 'idle'>, { icon: React.ElementType; className: string; label: string }> = {
  saving: { icon: Loader2, className: 'text-muted-foreground animate-spin', label: '保存...' },
  saved: { icon: CheckCircle2, className: 'text-green-500/80', label: '已存' },
  error: { icon: AlertCircle, className: 'text-destructive/80', label: '失败' },
};

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  const config = SAVE_STATUS_CONFIG[status as keyof typeof SAVE_STATUS_CONFIG];
  return config ? (
    <span className={`script-editor-save-status ${config.className}`} title={status === 'error' ? '保存失败(已缓存)' : undefined}>
      <config.icon className="w-3 h-3" /> {config.label}
    </span>
  ) : null;
}

export function ScriptEditor({ initialContent, isEditable, onUpdate }: ScriptEditorProps) {
  const [isEditingLocal, setIsEditingLocal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isActuallyEditable = isEditable || isEditingLocal;

  // Sync to backend and update store
  const syncToBackend = useCallback(async (content: JSONContent) => {
    setSaveStatus('saving');
    try {
      await new Promise((resolve, reject) => {
        navigator.onLine ? setTimeout(() => resolve({ success: true }), 500) : reject(new Error('Offline'));
      });

      const nodeEl = containerRef.current?.closest('.react-flow__node');
      const nodeId = nodeEl?.getAttribute('data-id');
      nodeId && useCanvasStore.getState().updateNodeData(nodeId, { content });

      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
      }, 1500);

      localStorage.removeItem('script_offline_cache');
    } catch {
      setSaveStatus('error');
      localStorage.setItem('script_offline_cache', JSON.stringify(content));
    }
  }, []);

  // Offline retry
  useEffect(() => {
    const handleOnline = () => {
      const cached = localStorage.getItem('script_offline_cache');
      cached && syncToBackend(JSON.parse(cached));
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncToBackend]);

  // Click outside to exit local edit mode
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const nodeEl = containerRef.current?.closest('.react-flow__node');
      const isInsideNode = nodeEl?.contains(target);
      const isInsidePortal = target.closest('[data-radix-popper-content-wrapper], [data-radix-portal]');
      const isOutside = isEditingLocal && nodeEl && !isInsideNode && !isInsidePortal;
      isOutside && setIsEditingLocal(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditingLocal]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
        codeBlock: { languageClassPrefix: 'language-' },
        blockquote: {},
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: '双击编辑剧本内容...',
      }),
    ],
    content: initialContent || { type: 'doc', content: [] },
    editable: isActuallyEditable,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      const content = ed.getJSON();
      onUpdate(content);

      saveTimeoutRef.current && clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        syncToBackend(content);
      }, 800);
    },
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
  });

  // Sync editable state
  useEffect(() => {
    editor && editor.isEditable !== isActuallyEditable && editor.setEditable(isActuallyEditable);
  }, [isActuallyEditable, editor]);

  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    isActuallyEditable && e.stopPropagation();
  }, [isActuallyEditable]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingLocal(true);
  }, []);

  return editor ? (
    <div
      ref={containerRef}
      className="script-editor-root"
      data-editing={isActuallyEditable}
      onDoubleClick={handleDoubleClick}
    >
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          variant="floating"
          className="nodrag nowheel"
          onPointerDown={stopPropagation}
          onKeyDown={stopPropagation}
        >
          <ToolbarGroup>
            <UndoRedoButton action="undo" />
            <UndoRedoButton action="redo" />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <HeadingDropdownMenu modal={false} levels={[1, 2, 3]} />
            <ListDropdownMenu modal={false} types={['bulletList', 'orderedList', 'taskList']} />
            <BlockquoteButton />
            <CodeBlockButton />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <MarkButton type="bold" />
            <MarkButton type="italic" />
            <MarkButton type="strike" />
            <MarkButton type="underline" />
            <MarkButton type="code" />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <ColorHighlightPopover />
            <LinkPopover />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <TextAlignButton align="left" />
            <TextAlignButton align="center" />
            <TextAlignButton align="right" />
          </ToolbarGroup>

          <SaveStatusIndicator status={saveStatus} />
        </Toolbar>

        <div
          className={`script-editor-content ${isActuallyEditable ? 'nodrag nowheel' : ''}`}
          onPointerDownCapture={stopPropagation}
          onKeyDown={stopPropagation}
        >
          <EditorContent editor={editor} />
        </div>
      </EditorContext.Provider>
    </div>
  ) : null;
}
