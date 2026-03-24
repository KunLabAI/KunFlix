import { renderHook, act } from '@testing-library/react';
import { useCanvasStore } from '../useCanvasStore';
import { theaterApi } from '@/lib/theaterApi';

jest.mock('@/lib/theaterApi', () => ({
  theaterApi: {
    getTheater: jest.fn(),
    updateTheater: jest.fn(),
    saveCanvas: jest.fn(),
  },
}));

describe('useCanvasStore Auto-Save', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      theaterId: 'test-theater-1',
      isDirty: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should debounce save requests to backend (300ms±50ms)', async () => {
    const { result } = renderHook(() => useCanvasStore());
    
    (theaterApi.saveCanvas as jest.Mock).mockResolvedValue({});

    act(() => {
      result.current.addNode({
        id: 'node-1',
        type: 'script',
        position: { x: 0, y: 0 },
        data: { title: 'Node 1', tags: [] },
      });
      result.current.addNode({
        id: 'node-2',
        type: 'script',
        position: { x: 100, y: 100 },
        data: { title: 'Node 2', tags: [] },
      });
    });

    expect(result.current.isDirty).toBe(true);
    expect(theaterApi.saveCanvas).not.toHaveBeenCalled();

    // Advance time by 200ms
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(theaterApi.saveCanvas).not.toHaveBeenCalled();

    // Advance remaining time to pass 300ms debounce
    await act(async () => {
      jest.advanceTimersByTime(150);
      await Promise.resolve(); // flush promises
    });

    expect(theaterApi.saveCanvas).toHaveBeenCalledTimes(1);
  });

  it('should save after a single change when time passes', async () => {
    const { result } = renderHook(() => useCanvasStore());
    (theaterApi.saveCanvas as jest.Mock).mockResolvedValue({});

    act(() => {
      result.current.markDirty();
    });

    expect(theaterApi.saveCanvas).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve(); // flush promises
    });
    
    expect(theaterApi.saveCanvas).toHaveBeenCalledTimes(1);
  });

  it('should not clear isDirty on save failure (offline retry queue logic)', async () => {
    const { result } = renderHook(() => useCanvasStore());
    
    // Mock save failure
    (theaterApi.saveCanvas as jest.Mock).mockRejectedValue(new Error('Network Error'));

    act(() => {
      result.current.markDirty();
      jest.advanceTimersByTime(350);
    });

    // Wait for promise rejection
    await act(async () => {
      await Promise.resolve();
    });

    // isDirty should remain true
    expect(result.current.isDirty).toBe(true);
    expect(result.current.isSaving).toBe(false);
  });

  it('should support continuous editing of 200 nodes without data loss', () => {
    const { result } = renderHook(() => useCanvasStore());
    
    act(() => {
      for (let i = 0; i < 200; i++) {
        result.current.addNode({
          id: `node-${i}`,
          type: 'script',
          position: { x: i * 10, y: i * 10 },
          data: { title: `Node ${i}`, tags: [] },
        });
      }
    });

    expect(result.current.nodes.length).toBe(200);
    expect(result.current.isDirty).toBe(true);
  });
});
