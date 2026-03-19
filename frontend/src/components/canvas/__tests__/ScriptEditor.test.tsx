import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ScriptEditor } from '../ScriptEditor';
import { useCanvasStore } from '@/store/useCanvasStore';

// Mock zustand store
jest.mock('@/store/useCanvasStore', () => ({
  useCanvasStore: {
    getState: jest.fn(() => ({
      updateNodeData: jest.fn(),
    })),
  },
}));

// Mock useId
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useId: () => 'mock-id',
  };
});

// Mock tiptap
let mockUpdateHandler: any = null;
let mockIsEditable = false;

jest.mock('@tiptap/react', () => {
  const originalModule = jest.requireActual('@tiptap/react');
  return {
    __esModule: true,
    ...originalModule,
    useEditor: jest.fn(({ onUpdate, editable }) => {
      mockUpdateHandler = onUpdate;
      mockIsEditable = editable;
      return {
        isActive: jest.fn(() => false),
        chain: jest.fn(() => ({
          focus: jest.fn(() => ({
            toggleBold: jest.fn(() => ({ run: jest.fn() })),
            toggleItalic: jest.fn(() => ({ run: jest.fn() })),
            toggleStrike: jest.fn(() => ({ run: jest.fn() })),
            toggleBulletList: jest.fn(() => ({ run: jest.fn() })),
            toggleOrderedList: jest.fn(() => ({ run: jest.fn() })),
          })),
        })),
        setEditable: jest.fn((val) => { mockIsEditable = val; }),
        isEditable: mockIsEditable,
        getJSON: jest.fn(() => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new text' }] }] })),
        getText: jest.fn(() => '双击编辑剧本...'),
      };
    }),
    EditorContent: () => <div data-testid="tiptap-editor" />,
  };
});

jest.mock('@tiptap/react/menus', () => {
  return {
    BubbleMenu: ({ children }: any) => <div data-testid="bubble-menu">{children}</div>,
    FloatingMenu: ({ children }: any) => <div data-testid="floating-menu">{children}</div>,
  };
});

describe('ScriptEditor Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('1. 渲染拖入画板时的默认形态 (固定尺寸 420x520)', () => {
    const { getByTitle, queryByTestId } = render(
      <ScriptEditor isEditable={false} onUpdate={() => {}} />
    );
    
    // Should render proportion card and not the editor content
    const defaultView = getByTitle('双击进入编辑');
    expect(defaultView).toBeInTheDocument();
    expect(queryByTestId('tiptap-editor')).not.toBeInTheDocument();
  });

  it('2. 双击卡片进入编辑模式', () => {
    const { getByTitle, getByTestId } = render(
      <ScriptEditor isEditable={false} onUpdate={() => {}} />
    );
    
    const defaultView = getByTitle('双击进入编辑');
    
    // Double click
    fireEvent.doubleClick(defaultView);
    
    // Editor should be rendered
    expect(getByTestId('tiptap-editor')).toBeInTheDocument();
    // Toolbar should be visible
    expect(getByTitle('加粗')).toBeInTheDocument();
  });

  it('3. 实时保存机制 - 成功保存', async () => {
    const { getByTitle, getByText } = render(
      <ScriptEditor isEditable={false} onUpdate={() => {}} />
    );
    
    // Enter edit mode
    fireEvent.doubleClick(getByTitle('双击进入编辑'));
    
    // Trigger update
    act(() => {
      mockUpdateHandler({ editor: { getJSON: () => ({ type: 'doc' }) } });
    });
    
    // Fast forward debounce 800ms
    act(() => {
      jest.advanceTimersByTime(800);
    });
    
    // Should show saving indicator
    expect(getByText('保存中...')).toBeInTheDocument();
    
    // Fast forward mock network delay 500ms
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve(); // flush microtasks
    });
    
    // Should show saved indicator
    await waitFor(() => {
      expect(getByText('已保存')).toBeInTheDocument();
    });
  });

  it('4. 实时保存机制 - 网络失败并本地缓存', async () => {
    // Set offline
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    
    const { getByTitle, getByText } = render(
      <ScriptEditor isEditable={false} onUpdate={() => {}} />
    );
    
    // Enter edit mode
    fireEvent.doubleClick(getByTitle('双击进入编辑'));
    
    // Trigger update
    act(() => {
      mockUpdateHandler({ editor: { getJSON: () => ({ type: 'doc', content: 'offline-data' }) } });
    });
    
    // Fast forward debounce 800ms
    act(() => {
      jest.advanceTimersByTime(800);
    });
    
    // Fast forward mock network delay 500ms
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve(); // flush microtasks
    });
    
    // Should show error indicator
    await waitFor(() => {
      expect(getByText('保存失败(已缓存)')).toBeInTheDocument();
    });
    
    // Should cache in localStorage
    expect(localStorage.getItem('script_offline_cache')).toContain('offline-data');
  });
});
