import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CharacterNode from '../ImageNode';
import { useCanvasStore } from '@/store/useCanvasStore';

// Mock zustand store
jest.mock('@/store/useCanvasStore', () => ({
  useCanvasStore: jest.fn(),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

// Mock @xyflow/react
jest.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="mock-handle" className="react-flow__handle" />,
  Position: { Left: 'left', Right: 'right' },
  NodeResizer: () => <div data-testid="mock-resizer" />,
  useReactFlow: () => ({
    getNode: jest.fn((id) => ({
      id,
      position: { x: 100, y: 100 },
      data: { name: '测试图片卡' }
    }))
  })
}));

describe('CharacterNode Component', () => {
  const mockUpdateNodeData = jest.fn();
  const mockDeleteNode = jest.fn();
  const mockAddNode = jest.fn();

  beforeEach(() => {
    (useCanvasStore as unknown as jest.Mock).mockImplementation((selector) => {
      if (selector.toString().includes('updateNodeData')) return mockUpdateNodeData;
      if (selector.toString().includes('deleteNode')) return mockDeleteNode;
      if (selector.toString().includes('addNode')) return mockAddNode;
      return null;
    });
    
    mockUpdateNodeData.mockClear();
    mockDeleteNode.mockClear();
    mockAddNode.mockClear();
    
    window.confirm = jest.fn(() => true);
    
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = jest.fn(() => 'mock-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  const defaultProps = {
    id: 'node-1',
    data: {
      name: '测试图片卡',
      description: '描述',
    },
    selected: false,
    type: 'character',
    zIndex: 1,
    isConnectable: true,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };

  it('1. renders empty state correctly', () => {
    render(<CharacterNode {...defaultProps} />);
    expect(screen.getByText('测试图片卡')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传图片' })).toBeInTheDocument();
  });

  it('2. handles successful image upload', async () => {
    // Mock XMLHttpRequest
    const mockXhr = {
      open: jest.fn(),
      send: jest.fn(),
      upload: { onprogress: null },
      onload: null as any,
      onerror: null as any,
      status: 200,
      responseText: JSON.stringify({ url: 'https://example.com/image.jpg' }),
    };
    global.XMLHttpRequest = jest.fn(() => mockXhr) as any;

    render(<CharacterNode {...defaultProps} />);
    
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    const input = screen.getByTestId('file-upload-input');
    
    fireEvent.change(input, { target: { files: [file] } });
    
    // Test if updateNodeData was called to set uploading state
    expect(mockUpdateNodeData).toHaveBeenCalledWith('node-1', { imageUrl: 'mock-url', uploading: true });
    
    // Trigger onload to simulate success
    mockXhr.onload();
    
    await waitFor(() => {
      expect(mockUpdateNodeData).toHaveBeenCalledWith('node-1', { imageUrl: 'https://example.com/image.jpg', uploading: false });
    });
  });

  it('3. handles image upload failure', async () => {
    const mockXhr = {
      open: jest.fn(),
      send: jest.fn(),
      upload: { onprogress: null },
      onload: null as any,
      onerror: null as any,
      status: 500,
      responseText: JSON.stringify({ error: 'Server error' }),
    };
    global.XMLHttpRequest = jest.fn(() => mockXhr) as any;

    render(<CharacterNode {...defaultProps} />);
    
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    const input = screen.getByTestId('file-upload-input');
    
    fireEvent.change(input, { target: { files: [file] } });
    
    mockXhr.onload();
    
    await waitFor(() => {
      expect(mockUpdateNodeData).toHaveBeenCalledWith('node-1', { uploading: false });
      expect(screen.getByText('Server error')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '重试上传' })).toBeInTheDocument();
    });
  });

  it('4. deletes node', () => {
    render(<CharacterNode {...defaultProps} />);
    
    const deleteBtn = screen.getByRole('button', { name: '删除' });
    fireEvent.click(deleteBtn);
    
    expect(window.confirm).toHaveBeenCalledWith('确定要删除这张图片卡吗？');
    expect(mockDeleteNode).toHaveBeenCalledWith('node-1');
  });

  it('5. duplicates node', () => {
    render(<CharacterNode {...defaultProps} />);
    
    const duplicateBtn = screen.getByRole('button', { name: '创建副本' });
    fireEvent.click(duplicateBtn);
    
    expect(mockAddNode).toHaveBeenCalledWith(expect.objectContaining({
      id: 'character-mock-uuid',
      position: { x: 150, y: 150 },
      data: expect.objectContaining({
        name: '测试图片卡 (副本)',
      })
    }));
  });

  it('6. renders edge handles and trigger areas correctly', () => {
    const { container } = render(<CharacterNode {...defaultProps} />);
    
    const rightHandle = container.querySelector('.edge-handle-wrapper.right');
    const leftHandle = container.querySelector('.edge-handle-wrapper.left');

    expect(rightHandle).toBeInTheDocument();
    expect(leftHandle).toBeInTheDocument();

    const innerHandle = rightHandle?.querySelector('.edge-handle-inner');
    expect(innerHandle).toBeInTheDocument();
    
    const dot = rightHandle?.querySelector('.edge-handle-dot');
    expect(dot).toBeInTheDocument();
    
    const line = rightHandle?.querySelector('.edge-handle-line');
    expect(line).toBeInTheDocument();
  });
});
