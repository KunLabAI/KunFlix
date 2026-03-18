import { act } from '@testing-library/react';
import { useCanvasStore } from './useCanvasStore';

describe('useCanvasStore', () => {
  beforeEach(() => {
    // Reset store before each test
    act(() => {
      useCanvasStore.getState().reset();
    });
  });

  it('should reset to initial state', () => {
    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].type).toBe('script');
    expect(state.nodes[0].id).toBe('script-root');
  });

  it('should add a node', () => {
    act(() => {
      useCanvasStore.getState().addNode({
        id: 'node-2',
        type: 'character',
        position: { x: 200, y: 200 },
        data: { name: 'Char 1', description: '' },
      });
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(2);
  });

  it('should delete a node', () => {
    // Add a node first
    act(() => {
      useCanvasStore.getState().addNode({
        id: 'node-to-delete',
        type: 'character',
        position: { x: 200, y: 200 },
        data: { name: 'Delete Me', description: '' },
      });
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(2);

    // Delete it
    act(() => {
      useCanvasStore.getState().deleteNode('node-to-delete');
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().nodes[0].id).toBe('script-root');
  });
});
