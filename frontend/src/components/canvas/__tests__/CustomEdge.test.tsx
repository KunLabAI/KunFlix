import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CustomEdge } from '../CustomEdge';
import { useCanvasStore } from '@/store/useCanvasStore';

// Mock zustand store
jest.mock('@/store/useCanvasStore', () => ({
  useCanvasStore: jest.fn(),
}));

// Mock @xyflow/react
jest.mock('@xyflow/react', () => ({
  BaseEdge: (props: React.SVGProps<SVGPathElement>) => <path data-testid="mock-base-edge" {...props} />,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-edge-label-renderer">{children}</div>,
  getBezierPath: () => ['M0,0 C100,0 100,100 200,100', 100, 50],
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' }
}));

import { Position } from '@xyflow/react';

describe('CustomEdge Component', () => {
  const mockDeleteEdge = jest.fn();

  beforeEach(() => {
    (useCanvasStore as unknown as jest.Mock).mockImplementation((selector) => {
      if (selector.toString().includes('deleteEdge')) return mockDeleteEdge;
      return null;
    });
    mockDeleteEdge.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const defaultProps = {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    sourceX: 0,
    sourceY: 0,
    targetX: 200,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: false,
    animated: false,
  };

  it('shows delete icon on hover and calls deleteEdge on click', () => {
    render(<svg><CustomEdge {...defaultProps} /></svg>);
    
    // Find the invisible hover path
    const hoverPath = screen.getByTestId('mock-base-edge').nextElementSibling;
    expect(hoverPath).toBeInTheDocument();

    // The button container should have opacity 0 initially
    const buttonContainer = screen.getByRole('button', { name: '删除连线' }).parentElement?.parentElement;
    expect(buttonContainer).toHaveStyle({ opacity: 0 });

    // Hover the path
    fireEvent.mouseEnter(hoverPath!);
    
    // Now it should have opacity 1
    expect(buttonContainer).toHaveStyle({ opacity: 1 });

    // Click the delete button
    const deleteButton = screen.getByRole('button', { name: '删除连线' });
    fireEvent.click(deleteButton);

    expect(mockDeleteEdge).toHaveBeenCalledWith('edge-1');
  });

  it('handles touch events for mobile', () => {
    render(<svg><CustomEdge {...defaultProps} /></svg>);
    
    const hoverPath = screen.getByTestId('mock-base-edge').nextElementSibling;
    const buttonContainer = screen.getByRole('button', { name: '删除连线' }).parentElement?.parentElement;

    // Touch start should show the button
    fireEvent.touchStart(hoverPath!);
    expect(buttonContainer).toHaveStyle({ opacity: 1 });

    // Touch end should start a timer to hide the button
    fireEvent.touchEnd(hoverPath!);
    
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    
    expect(buttonContainer).toHaveStyle({ opacity: 0 });
  });

  it('hides delete icon on mouse leave', () => {
    render(<svg><CustomEdge {...defaultProps} /></svg>);
    
    const hoverPath = screen.getByTestId('mock-base-edge').nextElementSibling;
    const buttonContainer = screen.getByRole('button', { name: '删除连线' }).parentElement?.parentElement;

    fireEvent.mouseEnter(hoverPath!);
    expect(buttonContainer).toHaveStyle({ opacity: 1 });

    fireEvent.mouseLeave(hoverPath!);
    expect(buttonContainer).toHaveStyle({ opacity: 0 });
  });
});
