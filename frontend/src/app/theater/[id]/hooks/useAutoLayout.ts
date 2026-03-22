import { useCallback, useRef, useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';
import { getLayoutedElements } from '@/lib/layoutUtils';

export function useAutoLayout() {
  const [isLayouting, setIsLayouting] = useState(false);
  const { fitView } = useReactFlow();
  const { nodes, edges, onNodesChange } = useCanvasStore();
  const layoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current);
      }
    };
  }, []);

  const handleAutoLayout = useCallback(() => {
    setIsLayouting(true);
    const { nodes: layoutedNodes } = getLayoutedElements(
      nodes,
      edges,
      'LR' // Left to Right direction
    );
    
    // Add brief animation transition to nodes by overriding their style momentarily
    onNodesChange(
      layoutedNodes.map((n) => ({
        type: 'position',
        id: n.id,
        position: n.position,
      })) as any
    );
    
    // Fit view after a small delay to let positions update
    if (layoutTimeoutRef.current) {
      clearTimeout(layoutTimeoutRef.current);
    }
    
    layoutTimeoutRef.current = setTimeout(() => {
      fitView({ duration: 800, padding: 0.2 });
      setIsLayouting(false);
    }, 100);
  }, [nodes, edges, onNodesChange, fitView]);

  return { isLayouting, handleAutoLayout };
}
