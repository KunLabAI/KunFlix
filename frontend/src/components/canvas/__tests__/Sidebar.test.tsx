import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Sidebar } from '../Sidebar';

// Mock document.createElement and document.body.appendChild for dragPreview
beforeAll(() => {
  const createElement = document.createElement.bind(document);
  document.createElement = (tagName: string) => {
    if (tagName === 'div') {
      const el = createElement(tagName);
      return el;
    }
    return createElement(tagName);
  };
});

describe('Sidebar Component', () => {
  it('renders correctly and matches modern mini design specs', () => {
    render(<Sidebar />);
    
    // Check main container floating styles
    const buttons = screen.getAllByRole('button');
    const container = buttons[0].closest('.fixed');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass('left-6', 'top-1/2', '-translate-y-1/2', 'z-50');

    // Check layer 1 buttons exist
    expect(buttons).toHaveLength(5); // Nodes, Assets, and 3 tabs
    
    // First two Buttons should have 32x32 size (w-8 h-8) and no shadow
    [buttons[0], buttons[1]].forEach(button => {
      expect(button).toHaveClass('w-8', 'h-8', 'shadow-none', 'rounded-[8px]');
    });
  });

  it('shows nodes menu on hover', async () => {
    render(<Sidebar />);
    const buttons = screen.getAllByRole('button');
    const nodesButton = buttons[0]; // Layers icon button

    // Initial state: menu is invisible (opacity-0)
    const nodesPanel = screen.getByText('添加节点').parentElement;
    expect(nodesPanel).toHaveClass('opacity-0');

    // Hover
    fireEvent.mouseEnter(nodesButton.parentElement!);

    // Check if it becomes visible
    await waitFor(() => {
      expect(nodesPanel).toHaveClass('opacity-100');
    });

    // Check if node items are present
    expect(screen.getByText('文本卡')).toBeInTheDocument();
    expect(screen.getByText('图片卡')).toBeInTheDocument();
    expect(screen.getByText('视频卡')).toBeInTheDocument();
    expect(screen.getByText('多维表格卡')).toBeInTheDocument();
  });

  it('shows assets menu on hover with tab navigation', async () => {
    render(<Sidebar />);
    const buttons = screen.getAllByRole('button');
    const assetsButton = buttons[1]; // Plus icon button

    // Hover
    fireEvent.mouseEnter(assetsButton.parentElement!);

    // Check if it becomes visible
    const tabsContainer = screen.getByText('图片').parentElement?.parentElement;
    await waitFor(() => {
      expect(tabsContainer).toHaveClass('opacity-100');
    });

    // Check tab buttons exist
    expect(screen.getByText('图片')).toBeInTheDocument();
    expect(screen.getByText('视频')).toBeInTheDocument();
    expect(screen.getByText('其他')).toBeInTheDocument();

    // Initial state: images tab is active, should show "暂无图片资产" since nodes is empty
    expect(screen.getByText('暂无图片资产')).toBeInTheDocument();

    // Click video tab
    fireEvent.click(screen.getByText('视频'));
    expect(screen.getByText('暂无视频资产')).toBeInTheDocument();

    // Click others tab
    fireEvent.click(screen.getByText('其他'));
    expect(screen.getByText('暂无其他资源')).toBeInTheDocument();
  });

  it('supports drag and drop with dragImage', () => {
    render(<Sidebar />);
    const buttons = screen.getAllByRole('button');
    fireEvent.mouseEnter(buttons[0].parentElement!);

    const scriptNode = screen.getByText('文本卡').closest('div[draggable="true"]');
    expect(scriptNode).toBeInTheDocument();

    const mockSetData = jest.fn();
    const mockSetDragImage = jest.fn();

    const mockEvent = {
      dataTransfer: {
        setData: mockSetData,
        setDragImage: mockSetDragImage,
        effectAllowed: 'none',
      },
    };

    fireEvent.dragStart(scriptNode!, mockEvent);

    expect(mockSetData).toHaveBeenCalledWith('application/reactflow', 'script');
    expect(mockSetData).toHaveBeenCalledWith('application/reactflow-data', expect.any(String));
    expect(mockEvent.dataTransfer.effectAllowed).toBe('move');
    expect(mockSetDragImage).toHaveBeenCalled();
  });

  it('hides menu on mouse leave', async () => {
    render(<Sidebar />);
    const buttons = screen.getAllByRole('button');
    const container = buttons[0].closest('.flex-col.gap-2.p-1\\.5');
    
    // Show nodes menu
    fireEvent.mouseEnter(buttons[0].parentElement!);
    
    const nodesPanel = screen.getByText('添加节点').parentElement;
    await waitFor(() => {
      expect(nodesPanel).toHaveClass('opacity-100');
    });

    // Mouse leave main container
    fireEvent.mouseLeave(container!);

    await waitFor(() => {
      expect(nodesPanel).toHaveClass('opacity-0');
    }, { timeout: 300 }); // Wait for 150ms timeout + transition
  });
});
