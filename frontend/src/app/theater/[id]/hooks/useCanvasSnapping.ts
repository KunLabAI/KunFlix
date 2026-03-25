import { useState, useCallback } from 'react';
import { Node } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';

export function useCanvasSnapping(snapToGuides: boolean) {
  const { nodes } = useCanvasStore();
  const [alignmentLines, setAlignmentLines] = useState<{
    vertical: number | null;
    horizontal: number | null;
  }>({ vertical: null, horizontal: null });

  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node) => {
    if (!snapToGuides) {
      setAlignmentLines({ vertical: null, horizontal: null });
      return;
    }

    const SNAP_THRESHOLD = 8;
    let newVertical: number | null = null;
    let newHorizontal: number | null = null;
    let snappedX: number | null = null;
    let snappedY: number | null = null;

    // Use node's current dimensions (measured during drag)
    const currentWidth = node.measured?.width ?? node.width ?? 0;
    const currentHeight = node.measured?.height ?? node.height ?? 0;

    // Get other nodes from store (they have stable positions)
    const otherNodes = nodes.filter((n) => n.id !== node.id);

    let minDiffX = SNAP_THRESHOLD;
    let minDiffY = SNAP_THRESHOLD;

    for (const otherNode of otherNodes) {
      const otherLeft = otherNode.position.x;
      const otherTop = otherNode.position.y;
      const otherWidth = otherNode.measured?.width ?? otherNode.width ?? 0;
      const otherHeight = otherNode.measured?.height ?? otherNode.height ?? 0;
      const otherRight = otherLeft + otherWidth;
      const otherBottom = otherTop + otherHeight;

      // Current node edges (use live position from drag event)
      const currentLeft = node.position.x;
      const currentTop = node.position.y;
      const currentRight = currentLeft + currentWidth;
      const currentBottom = currentTop + currentHeight;

      // Edge alignment checks for X axis (left and right edges)
      const xAlignments = [
        { diff: Math.abs(currentLeft - otherLeft), line: otherLeft, pos: otherLeft },
        { diff: Math.abs(currentRight - otherRight), line: otherRight, pos: otherRight - currentWidth },
        { diff: Math.abs(currentLeft - otherRight), line: otherRight, pos: otherRight },
        { diff: Math.abs(currentRight - otherLeft), line: otherLeft, pos: otherLeft - currentWidth },
      ];

      for (const align of xAlignments) {
        if (align.diff < minDiffX) {
          minDiffX = align.diff;
          newVertical = align.line;
          snappedX = align.pos;
        }
      }

      // Edge alignment checks for Y axis (top and bottom edges)
      const yAlignments = [
        { diff: Math.abs(currentTop - otherTop), line: otherTop, pos: otherTop },
        { diff: Math.abs(currentBottom - otherBottom), line: otherBottom, pos: otherBottom - currentHeight },
        { diff: Math.abs(currentTop - otherBottom), line: otherBottom, pos: otherBottom },
        { diff: Math.abs(currentBottom - otherTop), line: otherTop, pos: otherTop - currentHeight },
      ];

      for (const align of yAlignments) {
        if (align.diff < minDiffY) {
          minDiffY = align.diff;
          newHorizontal = align.line;
          snappedY = align.pos;
        }
      }
    }

    // Apply snapped position if found
    if (snappedX !== null) {
      node.position.x = snappedX;
    }
    if (snappedY !== null) {
      node.position.y = snappedY;
    }

    setAlignmentLines({ vertical: newVertical, horizontal: newHorizontal });
  }, [nodes, snapToGuides]);

  const onNodeDragStop = useCallback(() => {
    setAlignmentLines({ vertical: null, horizontal: null });
  }, []);

  return { alignmentLines, onNodeDrag, onNodeDragStop };
}
