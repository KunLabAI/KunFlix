
import { Edge } from '@xyflow/react';

export const hasCycle = (edges: Edge[], source: string, target: string): boolean => {
  // If we are connecting a node to itself, it's a cycle (unless we explicitly allow self-loops, but requirement says no loops)
  if (source === target) return true;

  // Build an adjacency list for the graph
  const adj = new Map<string, string[]>();
  
  for (const edge of edges) {
    if (!adj.has(edge.source)) {
      adj.set(edge.source, []);
    }
    adj.get(edge.source)?.push(edge.target);
  }

  // Use DFS to check if there is a path from target to source
  // If we can reach source from target, then adding source->target would close the loop
  const visited = new Set<string>();
  const stack = [target];

  while (stack.length > 0) {
    const current = stack.pop()!;
    
    if (current === source) return true;
    
    if (!visited.has(current)) {
      visited.add(current);
      const neighbors = adj.get(current) || [];
      for (const neighbor of neighbors) {
        stack.push(neighbor);
      }
    }
  }

  return false;
};
