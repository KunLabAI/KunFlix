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
import { useEffect, useRef, useCallback } from 'react';

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
}

export function ScriptEditor({ initialContent, isEditable, onUpdate }: ScriptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
          return editor.isEditable ? '请输入内容...' : '双击进入编辑模式...';
        },
      }),
      CharacterCount,
    ],
    content: initialContent || { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: isEditable,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      const content = ed.getJSON();
      const chars = ed.storage.characterCount.characters();
      onUpdate(content, chars);
    },
    onCreate: ({ editor: ed }) => {
      // Calculate initial char count when editor is created
      const chars = ed.storage.characterCount.characters();
      onUpdate(ed.getJSON(), chars);
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
      // Ensure character count stays synced when toggling modes
      const chars = editor.storage.characterCount.characters();
      onUpdate(editor.getJSON(), chars);
    }
  }, [isEditable, editor, onUpdate]);

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
