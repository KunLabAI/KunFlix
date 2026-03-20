import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const deleteEdge = useCanvasStore((state) => state.deleteEdge);
  const [isHovered, setIsHovered] = React.useState(false);

  const onEdgeClick = (evt: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    evt.stopPropagation();
    deleteEdge(id);
  };

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          strokeWidth: selected || isHovered ? 3 : 2,
          stroke: selected || isHovered ? '#8b5cf6' : '#6366F1', // Primary color with selected state
        }} 
      />
      {/* 隐形的宽轨道，用于增加鼠标 hover 的感应面积，8px 范围 */}
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={16}
        className="cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => setIsHovered(true)}
        onTouchEnd={() => {
          setTimeout(() => setIsHovered(false), 2000);
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute pointer-events-auto flex items-center justify-center transition-opacity duration-200 ease-out z-[5]"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 12}px)`,
            opacity: isHovered || selected ? 1 : 0,
            pointerEvents: isHovered || selected ? 'all' : 'none',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="w-4 h-4 flex items-center justify-center">
            <button
              className="w-4 h-4 bg-transparent border-0 flex items-center justify-center text-[#FF4D4F] hover:scale-110 transition-transform duration-200 ease-out cursor-pointer"
              onClick={onEdgeClick}
              onTouchEnd={(e) => {
                e.preventDefault();
                onEdgeClick(e as unknown as React.MouseEvent<HTMLButtonElement, MouseEvent>);
              }}
              title="删除连线"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
