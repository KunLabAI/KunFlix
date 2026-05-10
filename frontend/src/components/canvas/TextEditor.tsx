import { useEditor, EditorContent, EditorContext, JSONContent, useCurrentEditor } from '@tiptap/react';
import { Fragment, Slice, Node as PMNode } from '@tiptap/pm/model';
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
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table/kit';
import { Minus, Table as TableIcon, Rows2, Columns2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Parse inline Markdown tokens (bold / italic / strike / code / link)
 * into a list of Tiptap text nodes with marks.
 */
function parseInlineMarkdown(raw: string): JSONContent[] {
  type Token = { text: string; marks: { type: string; attrs?: Record<string, unknown> }[] };
  // Order matters: code > bold > strike > italic > link (code swallows inner marks)
  const patterns: { re: RegExp; mark: string; withAttrs?: (m: RegExpExecArray) => Record<string, unknown> }[] = [
    { re: /`([^`]+)`/, mark: 'code' },
    { re: /\*\*(.+?)\*\*/, mark: 'bold' },
    { re: /~~(.+?)~~/, mark: 'strike' },
    { re: /\*(.+?)\*/, mark: 'italic' },
    { re: /\[([^\]]+)\]\(([^)]+)\)/, mark: 'link', withAttrs: (m) => ({ href: m[2] }) },
  ];

  const walk = (text: string, marks: Token['marks']): Token[] => {
    const hit = patterns
      .map((p) => ({ p, m: p.re.exec(text) }))
      .filter((x) => x.m)
      .sort((a, b) => (a.m!.index - b.m!.index))[0];
    if (!hit) {
      return text ? [{ text, marks }] : [];
    }
    const { p, m } = hit;
    const before = text.slice(0, m!.index);
    const inner = m![1];
    const after = text.slice(m!.index + m![0].length);
    const innerMark = { type: p.mark, attrs: p.withAttrs ? p.withAttrs(m!) : undefined };
    return [
      ...(before ? walk(before, marks) : []),
      ...walk(inner, [...marks, innerMark]),
      ...walk(after, marks),
    ];
  };

  return walk(raw, []).map((t) => ({
    type: 'text',
    text: t.text,
    ...(t.marks.length ? { marks: t.marks.map((m) => ({ type: m.type, ...(m.attrs ? { attrs: m.attrs } : {}) })) } : {}),
  }));
}

/**
 * Convert Markdown string to Tiptap JSON content.
 * Supports: headings, horizontal rules, fenced code blocks, blockquotes,
 * bullet/ordered lists, paragraphs, and inline marks (bold/italic/strike/code/link).
 */
function markdownToTiptapJson(markdown: string): JSONContent {
  const lines = markdown.split('\n');
  const content: NonNullable<JSONContent['content']> = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    buf.length && content.push({ type: 'paragraph', content: parseInlineMarkdown(buf.join(' ')) });
  };

  const paraBuf: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Horizontal rule
    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
      flushParagraph(paraBuf); paraBuf.length = 0;
      content.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }

    // Fenced code block
    const fenceMatch = trimmed.match(/^```(\w*)$/);
    if (fenceMatch) {
      flushParagraph(paraBuf); paraBuf.length = 0;
      const language = fenceMatch[1] || null;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      content.push({
        type: 'codeBlock',
        ...(language ? { attrs: { language } } : {}),
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // Heading (1-6)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph(paraBuf); paraBuf.length = 0;
      content.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: parseInlineMarkdown(headingMatch[2]),
      });
      i += 1;
      continue;
    }

    // Blockquote (merge consecutive lines)
    if (/^>\s?/.test(line)) {
      flushParagraph(paraBuf); paraBuf.length = 0;
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      content.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: parseInlineMarkdown(quoteLines.join(' ')) }],
      });
      continue;
    }

    // Bullet list
    if (/^[-*+]\s+/.test(line)) {
      flushParagraph(paraBuf); paraBuf.length = 0;
      const items: JSONContent[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*+]\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineMarkdown(itemText) }],
        });
        i += 1;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph(paraBuf); paraBuf.length = 0;
      const items: JSONContent[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineMarkdown(itemText) }],
        });
        i += 1;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // Empty line - flush paragraph buffer
    if (!trimmed) {
      flushParagraph(paraBuf); paraBuf.length = 0;
      i += 1;
      continue;
    }

    // Paragraph line - accumulate
    paraBuf.push(trimmed);
    i += 1;
  }

  flushParagraph(paraBuf); paraBuf.length = 0;

  content.length === 0 && content.push({ type: 'paragraph' });

  return { type: 'doc', content };
}

/**
 * Marks to strip from pasted content.
 * Keeps semantic structure (headings/lists/links/bold...) while removing
 * color/background color pollution brought by external sources (Word, web pages, Notion...).
 */
const PASTE_STRIP_MARKS = new Set(['textStyle', 'highlight', 'color']);

/**
 * Recursively walk pasted Fragment and drop color-related marks on every node.
 */
function sanitizePastedFragment(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    const filteredMarks = node.marks.filter((m) => !PASTE_STRIP_MARKS.has(m.type.name));
    const sanitizedChildren = node.content.size > 0 ? sanitizePastedFragment(node.content) : node.content;
    nodes.push(node.copy(sanitizedChildren).mark(filteredMarks));
  });
  return Fragment.fromArray(nodes);
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

/**
 * Inline toolbar button for inserting a horizontal rule.
 * Uses the current EditorContext provided by ScriptEditor.
 */
function HorizontalRuleButton() {
  const { editor } = useCurrentEditor();
  const disabled = !editor?.isEditable;
  const handleClick = () => {
    editor?.chain().focus().setHorizontalRule().run();
  };
  return (
    <button
      type="button"
      className="tiptap-button"
      data-style="ghost"
      aria-label="Horizontal rule"
      title="Horizontal rule"
      tabIndex={-1}
      disabled={disabled}
      data-disabled={disabled}
      onClick={handleClick}
    >
      <Minus className="tiptap-button-icon" />
    </button>
  );
}

/**
 * Table menu button — inserts a 3x3 table with a header row by default,
 * and exposes common table operations when cursor is inside a table.
 */
function TableMenuButton() {
  const { editor } = useCurrentEditor();
  const disabled = !editor?.isEditable;
  const inTable = !!editor?.isActive('table');

  // Ordered action list — avoids branching blocks.
  const actions: { key: string; title: string; Icon: React.ComponentType<{ className?: string }>; run: () => void; visible: boolean }[] = [
    {
      key: 'insert',
      title: 'Insert table',
      Icon: TableIcon,
      run: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      visible: !inTable,
    },
    {
      key: 'add-row',
      title: 'Add row below',
      Icon: Rows2,
      run: () => editor?.chain().focus().addRowAfter().run(),
      visible: inTable,
    },
    {
      key: 'add-col',
      title: 'Add column after',
      Icon: Columns2,
      run: () => editor?.chain().focus().addColumnAfter().run(),
      visible: inTable,
    },
    {
      key: 'del-table',
      title: 'Delete table',
      Icon: Trash2,
      run: () => editor?.chain().focus().deleteTable().run(),
      visible: inTable,
    },
  ];

  return (
    <>
      {actions.filter((a) => a.visible).map(({ key, title, Icon, run }) => (
        <button
          key={key}
          type="button"
          className="tiptap-button"
          data-style="ghost"
          aria-label={title}
          title={title}
          tabIndex={-1}
          disabled={disabled}
          data-disabled={disabled}
          onClick={run}
        >
          <Icon className="tiptap-button-icon" />
        </button>
      ))}
    </>
  );
}

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
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
        codeBlock: { languageClassPrefix: 'language-' },
        blockquote: {},
        // tiptap v3 的 StarterKit 已内置 link/underline，禁用后由下方显式版本接管，避免重复注册
        link: false,
        underline: false,
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
      Subscript,
      Superscript,
      TableKit.configure({
        table: { resizable: true, HTMLAttributes: { class: 'tiptap-table' } },
      }),
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
      // Strip color/highlight marks from pasted content while preserving structure.
      transformPasted: (slice) =>
        new Slice(sanitizePastedFragment(slice.content), slice.openStart, slice.openEnd),
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
            <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4, 5, 6]} />
            <ListDropdownMenu modal={false} types={['bulletList', 'orderedList', 'taskList']} />
            <BlockquoteButton />
            <CodeBlockButton />
            <HorizontalRuleButton />
            <TableMenuButton />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <MarkButton type="bold" />
            <MarkButton type="italic" />
            <MarkButton type="strike" />
            <MarkButton type="underline" />
            <MarkButton type="code" />
            <MarkButton type="superscript" />
            <MarkButton type="subscript" />
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
