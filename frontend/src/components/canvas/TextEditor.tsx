import { useEditor, EditorContent, EditorContext, JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';

import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Convert Markdown string to Tiptap JSON content
 * Simple conversion for basic Markdown syntax
 */
function markdownToTiptapJson(markdown: string): JSONContent {
  const lines = markdown.split('\n');
  const content: JSONContent['content'] = [];

  for (const line of lines) {
    // Heading: ## Title
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      content.push({
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: headingMatch[2] }],
      });
      continue;
    }

    // Empty line - skip
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // Regular paragraph - strip markdown formatting
    const processed = trimmed
      .replace(/\*\*(.+?)\*\*/g, '$1')  // bold
      .replace(/\*(.+?)\*/g, '$1')       // italic
      .replace(/`(.+?)`/g, '$1');        // code

    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: processed }],
    });
  }

  // Ensure at least empty paragraph
  content.length === 0 && content.push({ type: 'paragraph' });

  return { type: 'doc', content };
}

/**
 * Validate Tiptap JSON content structure
 */
function isValidTiptapJson(content: unknown): content is JSONContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    content.type === 'doc' &&
    'content' in content &&
    Array.isArray(content.content)
  );
}

/**
 * Normalize content to Tiptap JSON format
 */
function normalizeContent(content: JSONContent | string | undefined): JSONContent {
  // Already valid Tiptap JSON
  if (isValidTiptapJson(content)) {
    return content;
  }

  // String content - convert from Markdown
  if (typeof content === 'string' && content.trim()) {
    return markdownToTiptapJson(content);
  }

  // Default empty document
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

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
  onUpdate: (content: JSONContent, charCount: number) => void;
  onCharCountChange?: (charCount: number) => void;
}

export function ScriptEditor({ initialContent, isEditable, onUpdate, onCharCountChange }: ScriptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // Memoize normalized content to prevent unnecessary re-parsing
  const normalizedContent = useMemo(() => {
    try {
      return normalizeContent(initialContent);
    } catch (error) {
      console.error('Failed to normalize content:', error);
      return { type: 'doc' as const, content: [{ type: 'paragraph' as const }] };
    }
  }, [initialContent]);

  // Ref to suppress onUpdate during programmatic content sync (e.g., Agent update)
  const isSyncingRef = useRef(false);
  // Ref to always access latest onUpdate callback (avoid stale closure in tiptap handler)
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

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
        showOnlyWhenEditable: false,
        placeholder: ({ editor }) => {
          return editor.isEditable ? t('canvas.editor.placeholder') : t('canvas.editor.placeholderReadonly');
        },
      }),
      CharacterCount,
    ],
    content: normalizedContent,
    editable: isEditable,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      // Skip callback during programmatic sync to avoid circular updates
      if (isSyncingRef.current) return;
      const content = ed.getJSON();
      const chars = ed.storage.characterCount.characters();
      onUpdateRef.current(content, chars);
    },
    onCreate: ({ editor: ed }) => {
      // Calculate initial char count when editor is created
      const chars = ed.storage.characterCount.characters();
      onUpdateRef.current(ed.getJSON(), chars);
    },
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
  });

  // Sync editable state
  useEffect(() => {
    if (editor && editor.isEditable !== isEditable) {
      editor.setEditable(isEditable);
    }
  }, [isEditable, editor]);

  // Sync content when initialContent changes from outside (e.g., Agent update)
  // Only sync when NOT in edit mode to avoid interfering with user input
  const contentRef = useRef<string>('');
  useEffect(() => {
    if (!editor || isEditable) return;

    try {
      // Serialize incoming content for comparison
      const incomingStr = JSON.stringify(normalizedContent);
      const currentStr = JSON.stringify(editor.getJSON());

      // Only update if content actually changed
      if (incomingStr !== currentStr && incomingStr !== contentRef.current) {
        contentRef.current = incomingStr;
        isSyncingRef.current = true;
        editor.commands.setContent(normalizedContent);
        isSyncingRef.current = false;
        // Only update char count display — do NOT call onUpdate here
        // because syncTheater already placed correct data in the store.
        // Calling onUpdate would trigger updateNodeData → isDirty → auto-save race.
        const chars = editor.storage.characterCount.characters();
        onCharCountChange?.(chars);
      }
    } catch (error) {
      console.error('Failed to sync editor content:', error);
    }
  }, [normalizedContent, editor, isEditable]);

  const stopPointerPropagation = useCallback((e: React.SyntheticEvent) => {
    isEditable && e.stopPropagation();
  }, [isEditable]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isEditable) return;
    // Don't stop propagation for ESC so the parent can handle exiting edit mode
    if (e.key !== 'Escape') {
      e.stopPropagation();
    }
  }, [isEditable]);

  return editor ? (
    <div
      ref={containerRef}
      className="script-editor-root"
      data-editing={isEditable}
    >
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          variant="floating"
          className="nodrag nowheel"
          onPointerDown={stopPointerPropagation}
          onKeyDown={handleKeyDown}
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
        </Toolbar>

        <div
          className={`script-editor-content ${isEditable ? 'nodrag' : ''} nowheel`}
          onPointerDownCapture={stopPointerPropagation}
          onKeyDown={handleKeyDown}
        >
          <EditorContent editor={editor} />
        </div>
      </EditorContext.Provider>
    </div>
  ) : null;
}
