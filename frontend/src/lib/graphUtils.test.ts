
import { hasCycle } from './graphUtils';
import { Edge } from '@xyflow/react';

describe('hasCycle', () => {
  it('should return true for self-loop', () => {
    const edges: Edge[] = [];
    expect(hasCycle(edges, 'A', 'A')).toBe(true);
  });

  it('should return false for new disconnected edge', () => {
    const edges: Edge[] = [];
    expect(hasCycle(edges, 'A', 'B')).toBe(false);
  });

  it('should return false for valid chain', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'A', target: 'B' } as Edge,
    ];
    expect(hasCycle(edges, 'B', 'C')).toBe(false);
  });

  it('should return true for simple cycle A->B, B->A', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'A', target: 'B' } as Edge,
    ];
    expect(hasCycle(edges, 'B', 'A')).toBe(true);
  });

  it('should return true for larger cycle A->B->C, C->A', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'A', target: 'B' } as Edge,
      { id: 'e2', source: 'B', target: 'C' } as Edge,
    ];
    expect(hasCycle(edges, 'C', 'A')).toBe(true);
  });

  it('should return true for cycle involving multiple paths', () => {
    // A -> B -> C
    // A -> D -> C
    // C -> A (Cycle)
    const edges: Edge[] = [
      { id: 'e1', source: 'A', target: 'B' } as Edge,
      { id: 'e2', source: 'B', target: 'C' } as Edge,
      { id: 'e3', source: 'A', target: 'D' } as Edge,
      { id: 'e4', source: 'D', target: 'C' } as Edge,
    ];
    expect(hasCycle(edges, 'C', 'A')).toBe(true);
  });

  it('should return false for diamond shape without cycle', () => {
    // A -> B -> D
    // A -> C -> D
    const edges: Edge[] = [
      { id: 'e1', source: 'A', target: 'B' } as Edge,
      { id: 'e2', source: 'B', target: 'D' } as Edge,
      { id: 'e3', source: 'A', target: 'C' } as Edge,
    ];
    expect(hasCycle(edges, 'C', 'D')).toBe(false);
  });
});
