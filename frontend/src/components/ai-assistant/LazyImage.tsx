'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { handleImageDragStart, cleanupDragPreview } from '@/lib/dragToCanvas';
import { useImagePreview } from '@/hooks/useImagePreview';
import { ImagePreviewPortal } from '@/components/canvas/ImageNode/ImagePreviewPortal';

interface LazyImageProps {
  src: string;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
  onLoad?: () => void;
  onError?: () => void;
  /** 最大高度限制（默认 320px） */
  maxHeight?: number | string;
}

export function LazyImage({
  src,
  alt = '',
  className,
  placeholderClassName,
  onLoad,
  onError,
  maxHeight = 320,
}: LazyImageProps) {
  const { t } = useTranslation();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewHovered, setIsPreviewHovered] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const preview = useImagePreview();

  // 使用 IntersectionObserver 检测图片是否进入视口
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observerRef.current?.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // 提前 50px 开始加载
        threshold: 0.1,
      }
    );

    observerRef.current.observe(img);

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    dragPreviewRef.current = handleImageDragStart(e, src, alt || '图片');
  };

  // 拖拽结束
  const handleDragEnd = () => {
    setIsDragging(false);
    cleanupDragPreview(dragPreviewRef.current);
    dragPreviewRef.current = null;
  };

  // 双击打开全屏预览（复用画布 ImagePreviewPortal）
  const handleDoubleClick = () => {
    isLoaded && !hasError && preview.openPreview(src);
  };

  const maxHeightStyle = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

  // 过滤空 src 的图片
  const isValidSrc = typeof src === 'string' && src.trim() !== '';
  
  if (!isValidSrc) {
    return null;
  }

  return (
    <>
      {/* 图片容器 - 使用 inline-block 让尺寸紧贴图片 */}
      <span
        className={cn(
          'relative inline-block rounded-lg group',
          isDragging && 'opacity-50',
          className
        )}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsPreviewHovered(true)}
        onMouseLeave={() => setIsPreviewHovered(false)}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* 占位符 */}
        {!isLoaded && !hasError && (
          <span
            className={cn(
              'block bg-muted animate-pulse rounded-lg',
              placeholderClassName
            )}
            style={{ minWidth: 200, minHeight: 150, maxHeight: maxHeightStyle }}
          />
        )}
        
        {/* 实际图片 */}
        <img
          ref={imgRef}
          src={isInView ? src : undefined}
          alt={alt}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'max-w-full h-auto rounded-lg transition-opacity duration-300 object-contain block',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          style={{ maxHeight: maxHeightStyle }}
          draggable={false}
        />
        
        {/* 悬停工具栏 - 显示在图片上方 */}
        {isLoaded && !hasError && isPreviewHovered && !isDragging && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/60 backdrop-blur-sm">
              <GripVertical className="w-3.5 h-3.5 text-white/70" />
              <span className="text-[10px] text-white/90 font-medium">{t('ai.image.dragToCanvas')}</span>
              <span className="w-px h-3 bg-white/30" />
              <ZoomIn className="w-3.5 h-3.5 text-white/70" />
              <span className="text-[10px] text-white/90 font-medium">{t('ai.image.doubleClickZoom')}</span>
            </span>
          </span>
        )}
        
        {/* 错误状态 */}
        {hasError && (
          <span className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg text-muted-foreground text-xs">
            图片加载失败
          </span>
        )}
      </span>

      {/* 全屏预览 - 复用画布 ImagePreviewPortal（支持缩放/拖拽/下载） */}
      <ImagePreviewPortal
        open={preview.open}
        url={preview.url}
        name={alt || ''}
        scale={preview.scale}
        position={preview.position}
        isDragging={preview.isDragging}
        mode={preview.mode}
        onClose={preview.closePreview}
        onZoomIn={preview.zoomIn}
        onZoomOut={preview.zoomOut}
        onPointerDown={preview.handlePointerDown}
        onPointerMove={preview.handlePointerMove}
        onPointerUp={preview.handlePointerUp}
        annotationEnabled={false}
        onEnterAnnotate={preview.enterAnnotate}
        onExitAnnotate={preview.exitAnnotate}
        onSaveAnnotation={async () => null}
      />
    </>
  );
}

export default LazyImage;
