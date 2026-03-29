'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface LazyImageProps {
  src: string;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export function LazyImage({
  src,
  alt = '',
  className,
  placeholderClassName,
  onLoad,
  onError,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

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

  // 过滤空 src 的图片
  const isValidSrc = typeof src === 'string' && src.trim() !== '';
  
  if (!isValidSrc) {
    return null;
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* 占位符 */}
      {!isLoaded && !hasError && (
        <div
          className={cn(
            'absolute inset-0 bg-muted animate-pulse rounded-lg',
            placeholderClassName
          )}
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
          'max-w-full h-auto rounded-lg transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0',
          className
        )}
      />
      
      {/* 错误状态 */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg text-muted-foreground text-xs">
          图片加载失败
        </div>
      )}
    </div>
  );
}

export default LazyImage;
