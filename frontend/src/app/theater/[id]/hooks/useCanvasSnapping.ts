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

    const SNAP_THRESHOLD = 15;
    let newVertical: number | null = null;
    let newHorizontal: number | null = null;

    const currentX = node.position.x;
    const currentY = node.position.y;
    const currentWidth = node.measured?.width ?? node.width ?? 0;
    const currentHeight = node.measured?.height ?? node.height ?? 0;

    const currentCenterX = currentX + currentWidth / 2;
    const currentCenterY = currentY + currentHeight / 2;

    const otherNodes = nodes.filter((n) => n.id !== node.id);

    let minDiffX = SNAP_THRESHOLD;
    let minDiffY = SNAP_THRESHOLD;

    for (const otherNode of otherNodes) {
      const otherX = otherNode.position.x;
      const otherY = otherNode.position.y;
      const otherWidth = otherNode.measured?.width ?? otherNode.width ?? 0;
      const otherHeight = otherNode.measured?.height ?? otherNode.height ?? 0;

      const otherCenterX = otherX + otherWidth / 2;
      const otherCenterY = otherY + otherHeight / 2;

      // Vertical alignment
      if (Math.abs(currentX - otherX) < minDiffX) {
        minDiffX = Math.abs(currentX - otherX);
        newVertical = otherX;
        node.position.x = otherX;
      } else if (Math.abs((currentX + currentWidth) - (otherX + otherWidth)) < minDiffX) {
        minDiffX = Math.abs((currentX + currentWidth) - (otherX + otherWidth));
        newVertical = otherX + otherWidth;
        node.position.x = otherX + otherWidth - currentWidth;
      } else if (Math.abs(currentCenterX - otherCenterX) < minDiffX) {
        minDiffX = Math.abs(currentCenterX - otherCenterX);
        newVertical = otherCenterX;
        node.position.x = otherCenterX - currentWidth / 2;
      } else if (Math.abs(currentX - (otherX + otherWidth)) < minDiffX) {
        minDiffX = Math.abs(currentX - (otherX + otherWidth));
        newVertical = otherX + otherWidth;
        node.position.x = otherX + otherWidth;
      } else if (Math.abs((currentX + currentWidth) - otherX) < minDiffX) {
        minDiffX = Math.abs((currentX + currentWidth) - otherX);
        newVertical = otherX;
        node.position.x = otherX - currentWidth;
      }

      // Horizontal alignment
      if (Math.abs(currentY - otherY) < minDiffY) {
        minDiffY = Math.abs(currentY - otherY);
        newHorizontal = otherY;
        node.position.y = otherY;
      } else if (Math.abs((currentY + currentHeight) - (otherY + otherHeight)) < minDiffY) {
        minDiffY = Math.abs((currentY + currentHeight) - (otherY + otherHeight));
        newHorizontal = otherY + otherHeight;
        node.position.y = otherY + otherHeight - currentHeight;
      } else if (Math.abs(currentCenterY - otherCenterY) < minDiffY) {
        minDiffY = Math.abs(currentCenterY - otherCenterY);
        newHorizontal = otherCenterY;
        node.position.y = otherCenterY - currentHeight / 2;
      } else if (Math.abs(currentY - (otherY + otherHeight)) < minDiffY) {
        minDiffY = Math.abs(currentY - (otherY + otherHeight));
        newHorizontal = otherY + otherHeight;
        node.position.y = otherY + otherHeight;
      } else if (Math.abs((currentY + currentHeight) - otherY) < minDiffY) {
        minDiffY = Math.abs((currentY + currentHeight) - otherY);
        newHorizontal = otherY;
        node.position.y = otherY - currentHeight;
      }
    }

    setAlignmentLines({ vertical: newVertical, horizontal: newHorizontal });
  }, [nodes, snapToGuides]);

  const onNodeDragStop = useCallback(() => {
    setAlignmentLines({ vertical: null, horizontal: null });
  }, []);

  return { alignmentLines, onNodeDrag, onNodeDragStop };
}
