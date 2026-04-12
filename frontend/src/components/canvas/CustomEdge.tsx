import React from 'react';
import { EdgeProps, getBezierPath } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation();
    deleteEdge(id);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // 从传入的 style 中获取颜色，或使用默认值
  const baseStroke = (style?.stroke as string) || '#868686';
  const baseStrokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : 2;
  const isActive = selected || isHovered;
  const activeColor = '#ff6b6b';


  return (
    <g className="react-flow__edge-path-group">
      {/* 隐形的宽轨道，用于增加鼠标 hover 的感应面积 */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
      
      {/* 实际可见的连线 */}
      <path
        d={edgePath}
        fill="none"
        stroke={isActive ? activeColor : baseStroke}
        strokeWidth={isActive ? baseStrokeWidth + 1 : baseStrokeWidth}
        strokeLinecap="round"
        markerEnd={markerEnd}
        style={{ pointerEvents: 'none' }}
      />
      
      {/* 删除按钮 - 使用 foreignObject 直接在 SVG 中渲染 */}
      {isActive && (
        <foreignObject
          x={labelX - 12}
          y={labelY - 12}
          width={24}
          height={24}
          requiredExtensions="http://www.w3.org/1999/xhtml"
        >
          <button
            onClick={onEdgeClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="w-6 h-6 bg-white dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-500 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:scale-125 transition-all duration-150 cursor-pointer shadow-lg"
            style={{ pointerEvents: 'auto' }}
            title={t('canvas.edge.deleteTitle')}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </foreignObject>
      )}
    </g>
  );
}
