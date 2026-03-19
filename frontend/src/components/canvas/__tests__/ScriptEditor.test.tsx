import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Tiptap editor
const mockEditor = {
  getJSON: jest.fn(() => ({ type: 'doc', content: [] })),
  getText: jest.fn(() => ''),
  getHTML: jest.fn(() => ''),
  isEditable: false,
  setEditable: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  destroy: jest.fn(),
  state: {},
  can: jest.fn(),
};

jest.mock('@tiptap/react', () => ({
  ...jest.requireActual('@tiptap/react'),
  useEditor: jest.fn(() => mockEditor),
  useCurrentEditor: jest.fn(() => ({ editor: mockEditor })),
  useEditorState: jest.fn(() => ({ editor: mockEditor, editorState: {}, canCommand: undefined })),
  EditorContent: ({ editor }: { editor: unknown }) => {
    return editor ? <div data-testid="editor-content" /> : null;
  },
  EditorContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}));

// Mock tiptap-ui components
jest.mock('@/components/tiptap-ui-primitive/toolbar', () => ({
  Toolbar: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div data-testid="toolbar" {...props}>{children}</div>,
  ToolbarGroup: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ToolbarSeparator: () => <div />,
}));

jest.mock('@/components/tiptap-ui/heading-dropdown-menu', () => ({
  HeadingDropdownMenu: () => <button data-testid="heading-dropdown">Heading</button>,
}));

jest.mock('@/components/tiptap-ui/list-dropdown-menu', () => ({
  ListDropdownMenu: () => <button data-testid="list-dropdown">List</button>,
}));

jest.mock('@/components/tiptap-ui/blockquote-button', () => ({
  BlockquoteButton: () => <button data-testid="blockquote-btn">Blockquote</button>,
}));

jest.mock('@/components/tiptap-ui/code-block-button', () => ({
  CodeBlockButton: () => <button data-testid="code-block-btn">CodeBlock</button>,
}));

jest.mock('@/components/tiptap-ui/mark-button', () => ({
  MarkButton: ({ type }: { type: string }) => <button data-testid={`mark-${type}`}>{type}</button>,
}));

jest.mock('@/components/tiptap-ui/color-highlight-popover', () => ({
  ColorHighlightPopover: () => <button data-testid="color-highlight">Color</button>,
}));

jest.mock('@/components/tiptap-ui/link-popover', () => ({
  LinkPopover: () => <button data-testid="link-popover">Link</button>,
}));

jest.mock('@/components/tiptap-ui/text-align-button', () => ({
  TextAlignButton: ({ align }: { align: string }) => <button data-testid={`align-${align}`}>{align}</button>,
}));

jest.mock('@/components/tiptap-ui/undo-redo-button', () => ({
  UndoRedoButton: ({ action }: { action: string }) => <button data-testid={`${action}-btn`}>{action}</button>,
}));

// Mock store
jest.mock('@/store/useCanvasStore', () => ({
  useCanvasStore: {
    getState: jest.fn(() => ({
      updateNodeData: jest.fn(),
    })),
  },
}));

// Import after mocks
import { ScriptEditor } from '../ScriptEditor';

describe('ScriptEditor WYSIWYG', () => {
  const mockOnUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockEditor.isEditable = false;
  });

  it('should render with data-editing="false" in view mode', () => {
    const { container } = render(
      <ScriptEditor isEditable={false} onUpdate={mockOnUpdate} />
    );

    const root = container.querySelector('.script-editor-root');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-editing', 'false');
  });

  it('should render EditorContent in both view and edit modes', () => {
    render(<ScriptEditor isEditable={false} onUpdate={mockOnUpdate} />);
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('should render toolbar', () => {
    render(<ScriptEditor isEditable={true} onUpdate={mockOnUpdate} />);
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
  });

  it('should render all toolbar buttons', () => {
    render(<ScriptEditor isEditable={true} onUpdate={mockOnUpdate} />);

    expect(screen.getByTestId('undo-btn')).toBeInTheDocument();
    expect(screen.getByTestId('redo-btn')).toBeInTheDocument();
    expect(screen.getByTestId('heading-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('list-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('blockquote-btn')).toBeInTheDocument();
    expect(screen.getByTestId('code-block-btn')).toBeInTheDocument();
    expect(screen.getByTestId('mark-bold')).toBeInTheDocument();
    expect(screen.getByTestId('mark-italic')).toBeInTheDocument();
    expect(screen.getByTestId('mark-strike')).toBeInTheDocument();
    expect(screen.getByTestId('mark-underline')).toBeInTheDocument();
    expect(screen.getByTestId('mark-code')).toBeInTheDocument();
    expect(screen.getByTestId('color-highlight')).toBeInTheDocument();
    expect(screen.getByTestId('link-popover')).toBeInTheDocument();
    expect(screen.getByTestId('align-left')).toBeInTheDocument();
    expect(screen.getByTestId('align-center')).toBeInTheDocument();
    expect(screen.getByTestId('align-right')).toBeInTheDocument();
  });

  it('should switch to edit mode on double-click', () => {
    const { container } = render(
      <ScriptEditor isEditable={false} onUpdate={mockOnUpdate} />
    );

    const root = container.querySelector('.script-editor-root')!;
    expect(root).toHaveAttribute('data-editing', 'false');

    fireEvent.doubleClick(root);
    expect(root).toHaveAttribute('data-editing', 'true');
  });

  it('should have data-editing="true" when isEditable prop is true', () => {
    const { container } = render(
      <ScriptEditor isEditable={true} onUpdate={mockOnUpdate} />
    );

    const root = container.querySelector('.script-editor-root');
    expect(root).toHaveAttribute('data-editing', 'true');
  });

  it('should call setEditable on editor when editable state changes', () => {
    const { rerender } = render(
      <ScriptEditor isEditable={false} onUpdate={mockOnUpdate} />
    );

    mockEditor.isEditable = false;
    rerender(<ScriptEditor isEditable={true} onUpdate={mockOnUpdate} />);

    expect(mockEditor.setEditable).toHaveBeenCalledWith(true);
  });
});
