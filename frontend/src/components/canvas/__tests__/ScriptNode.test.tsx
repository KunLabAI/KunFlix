import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScriptNode from '../ScriptNode';
import { useCanvasStore } from '@/store/useCanvasStore';

// Mock zustand store
jest.mock('@/store/useCanvasStore', () => ({
  useCanvasStore: jest.fn(),
}));

// Mock @xyflow/react
jest.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="mock-handle" />,
  Position: { Left: 'left', Right: 'right' },
}));

describe('ScriptNode Component', () => {
  const mockUpdateNodeData = jest.fn();
  const mockDeleteNode = jest.fn();

  beforeEach(() => {
    (useCanvasStore as unknown as jest.Mock).mockImplementation((selector) => {
      if (selector.toString().includes('updateNodeData')) return mockUpdateNodeData;
      if (selector.toString().includes('deleteNode')) return mockDeleteNode;
      return null;
    });
    
    // Clear mocks
    mockUpdateNodeData.mockClear();
    mockDeleteNode.mockClear();
    
    // Mock window.confirm
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
  });

  const defaultProps = {
    id: 'node-1',
    data: {
      title: '测试剧本',
      description: '这是测试描述',
      tags: ['科幻', '悬疑'],
      characters: ['主角A', '配角B'],
    },
    selected: false,
    type: 'script',
    zIndex: 1,
    isConnectable: true,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };

  it('renders script node with initial data', () => {
    render(<ScriptNode {...defaultProps} />);
    
    expect(screen.getByText('测试剧本')).toBeInTheDocument();
  });

  it('enters edit mode when edit button is clicked', () => {
    render(<ScriptNode {...defaultProps} />);
    
    const editButton = screen.getByTitle('编辑');
    fireEvent.click(editButton);
    
    // Check if input fields appear
    expect(screen.getByDisplayValue('测试剧本')).toBeInTheDocument();
  });

  it('saves changes and exits edit mode', () => {
    render(<ScriptNode {...defaultProps} />);
    
    // Enter edit mode
    fireEvent.click(screen.getByTitle('编辑'));
    
    // Change title
    const titleInput = screen.getByDisplayValue('测试剧本');
    fireEvent.change(titleInput, { target: { value: '修改后的剧本' } });
    
    // Save
    fireEvent.click(screen.getByText('保存'));
    
    // Should call updateNodeData
    expect(mockUpdateNodeData).toHaveBeenCalledWith('node-1', expect.objectContaining({
      title: '修改后的剧本',
    }));
  });

  it('cancels changes and reverts data', () => {
    render(<ScriptNode {...defaultProps} />);
    
    // Enter edit mode
    fireEvent.click(screen.getByTitle('编辑'));
    
    // Change title
    const titleInput = screen.getByDisplayValue('测试剧本');
    fireEvent.change(titleInput, { target: { value: '放弃修改的剧本' } });
    
    // Cancel
    fireEvent.click(screen.getByText('取消'));
    
    // Should NOT call updateNodeData
    expect(mockUpdateNodeData).not.toHaveBeenCalled();
    
    // Reverts to original
    expect(screen.getByText('测试剧本')).toBeInTheDocument();
  });

  it('calls deleteNode when delete button is clicked and confirmed', () => {
    render(<ScriptNode {...defaultProps} />);
    
    fireEvent.click(screen.getByTitle('删除'));
    
    expect(window.confirm).toHaveBeenCalled();
    expect(mockDeleteNode).toHaveBeenCalledWith('node-1');
  });
});
