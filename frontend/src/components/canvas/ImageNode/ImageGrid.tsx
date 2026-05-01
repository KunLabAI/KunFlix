'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getGridLayout } from './utils';

interface Props {
  imageList: string[];
  name: string;
  onRemove: (index: number, e: React.MouseEvent) => void;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onOpenPreview: (url: string) => void;
}

/**
 * 多宫格图片渲染：
 * - 1 张：自适应缩放 + 双击预览 + hover 删除
 * - 3 张：上 1 下 2 特殊布局
 * - 其余：通用网格
 */
export function ImageGrid({ imageList, name, onRemove, onImageLoad, onOpenPreview }: Props) {
  const { t } = useTranslation();
  const count = imageList.length;
  const layout = getGridLayout(count);

  // 单图模式
  if (count === 1) {
    return (
      <div className="w-full h-full flex items-center justify-center relative group/img">
        <img
          src={imageList[0]}
          alt={name}
          className="w-full h-full object-contain"
          onLoad={onImageLoad}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <div
          className="absolute inset-0 cursor-grab active:cursor-grabbing z-10"
          title={t('canvas.node.preview.dragOrFullscreen')}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onOpenPreview(imageList[0]);
          }}
        />
        <button
          className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive"
          onClick={(e) => onRemove(0, e)}
          title={t('canvas.node.toolbar.delete')}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // 3 张特殊
  if (count === 3) {
    return (
      <div className="w-full h-full grid grid-rows-2 gap-0.5">
        <div className="relative group/img overflow-hidden">
          <img
            src={imageList[0]}
            alt={`${name}-1`}
            className="w-full h-full object-cover"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); onOpenPreview(imageList[0]); }}
          />
          <button
            className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive"
            onClick={(e) => onRemove(0, e)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-0.5">
          {imageList.slice(1).map((url, i) => (
            <div key={i + 1} className="relative group/img overflow-hidden">
              <img
                src={url}
                alt={`${name}-${i + 2}`}
                className="w-full h-full object-cover"
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => { e.stopPropagation(); onOpenPreview(url); }}
              />
              <button
                className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive"
                onClick={(e) => onRemove(i + 1, e)}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 通用网格
  const style: React.CSSProperties = {
    gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
    gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
  };

  return (
    <div className="grid gap-0.5 w-full h-full" style={style}>
      {imageList.map((url, i) => (
        <div key={i} className="relative group/img overflow-hidden">
          <img
            src={url}
            alt={`${name}-${i + 1}`}
            className="w-full h-full object-cover"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); onOpenPreview(url); }}
          />
          <button
            className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive"
            onClick={(e) => onRemove(i, e)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
