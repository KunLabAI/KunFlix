'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import { DEFAULT_FOV, DEFAULT_PITCH, DEFAULT_YAW } from './constants';

export interface PanoramaViewerHandle {
  /** 截取当前 WebGL canvas 像素 → dataURL（image/png） */
  takeScreenshot: () => string | null;
  /** 旋转到指定视角（弧度） */
  rotate: (yaw: number, pitch: number) => void;
  /** 设置 FOV（度） */
  zoom: (fov: number) => void;
  /** 复位到初始默认视角 */
  resetView: () => void;
}

interface PanoramaViewerProps {
  panoramaUrl: string;
  className?: string;
  defaultYaw?: number;
  defaultPitch?: number;
  defaultFov?: number;
  /** Viewer ready 事件回调（PSV 第一次加载完成） */
  onReady?: () => void;
  /** 加载/初始化失败回调；msg 为可读错误描述 */
  onError?: (msg: string) => void;
}

/** 加载超时毫秒数 - 超过此时间视为失败 */
const LOAD_TIMEOUT_MS = 20_000;

/**
 * Photo Sphere Viewer 的轻量 React 封装。
 * 
 * 关键设计：在构造函数中直接传入 panorama URL（PSV 5.x 需要在构造时传入
 * panorama 来触发完整的 Three.js renderer 初始化流程，否则 setPanorama 
 * 可能永远处于 pending）。通过 ready 事件 + 超时检测驱动外层状态。
 */
export const PanoramaViewer = forwardRef<PanoramaViewerHandle, PanoramaViewerProps>(
  function PanoramaViewer(
    {
      panoramaUrl,
      className,
      defaultYaw = DEFAULT_YAW,
      defaultPitch = DEFAULT_PITCH,
      defaultFov = DEFAULT_FOV,
      onReady,
      onError,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<Viewer | null>(null);
    const initialRef = useRef({ yaw: defaultYaw, pitch: defaultPitch, fov: defaultFov });

    useEffect(() => {
      const wrapper = containerRef.current;
      if (!wrapper || !panoramaUrl) return;



      let cancelled = false;
      let viewer: Viewer | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const psvContainer = document.createElement('div');
      psvContainer.style.width = '100%';
      psvContainer.style.height = '100%';
      wrapper.appendChild(psvContainer);

      const done = (success: boolean, msg?: string) => {
        if (cancelled) return;
        cancelled = true;
        timeoutId && clearTimeout(timeoutId);
        success ? onReady?.() : onError?.(msg || '加载失败');
      };

      // 策略：先用原生 Image 预加载图片并创建 blob URL，
      // 再拿 blob URL 传给 PSV。如此绕开 Three.js TextureLoader 通过 Next.js 代理加载时可能遇到的
      // crossOrigin / 响应头兼容性问题。
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        if (cancelled) return;


        // 等距柱状投影必须是 2:1 宽高比，否则 PSV 渲染时球体顶/底部会出现黑色极冠（黑圈）
        // 强制把任意比例图片绘制到 2:1 画布：以 max(原宽, 原高×2) 为目标宽度，既保留
        // 标准 2:1 全景图（如 4096×2048）的原始分辨率，也能让非标准图（1:1、16:9 等）
        // 横向拉伸覆盖整个球面，消除顶部/底部黑圈。
        const TARGET_ASPECT = 2;
        const targetW = Math.max(img.naturalWidth, Math.round(img.naturalHeight * TARGET_ASPECT));
        const targetH = Math.round(targetW / TARGET_ASPECT);

        // 绘制到 canvas 再转 blob URL，确保 PSV 可以以 blob: 协议加载（无网络请求）
        const cvs = document.createElement('canvas');
        cvs.width = targetW;
        cvs.height = targetH;
        const ctx = cvs.getContext('2d');
        ctx?.drawImage(img, 0, 0, targetW, targetH);
        cvs.toBlob((blob) => {
          if (cancelled || !blob) {
            !cancelled && done(false, '图片转码失败');
            return;
          }
          const blobUrl = URL.createObjectURL(blob);


          try {
            viewer = new Viewer({
              container: psvContainer,
              panorama: blobUrl,
              navbar: false,
              mousewheel: true,
              mousemove: true,
              keyboard: 'always',
              defaultYaw,
              defaultPitch,
              defaultZoomLvl: fovToZoomLevel(defaultFov),
              // preserveDrawingBuffer 必须为 true，否则 canvas.toDataURL 截图为全黑
              rendererParameters: { preserveDrawingBuffer: true, alpha: true },
            });


            viewerRef.current = viewer;

            viewer.addEventListener('ready', () => done(true), { once: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Viewer 初始化失败';
            done(false, msg);
          } finally {
            // blob URL 在 PSV 内部加载完后即可释放（texture 已拷贝到 GPU）
            // 但为了安全，延迟 5s 后释放
            setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
          }
        }, 'image/jpeg', 0.95);
      };

      img.onerror = () => {
        if (cancelled) return;
        done(false, '图片加载失败，请检查 URL 是否可访问');
      };

      img.src = panoramaUrl;

      timeoutId = setTimeout(() => {
        done(false, `加载超时（${LOAD_TIMEOUT_MS / 1000}s），请检查图片是否可访问`);
      }, LOAD_TIMEOUT_MS);

      return () => {
        cancelled = true;
        timeoutId && clearTimeout(timeoutId);
        img.onload = null;
        img.onerror = null;
        viewer?.destroy();
        viewerRef.current = null;
        wrapper.contains(psvContainer) && wrapper.removeChild(psvContainer);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      takeScreenshot: () => {
        const canvas = containerRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
        return canvas ? canvas.toDataURL('image/png') : null;
      },
      rotate: (yaw, pitch) => {
        viewerRef.current?.rotate({ yaw, pitch });
      },
      zoom: (fov) => {
        viewerRef.current?.zoom(fovToZoomLevel(fov));
      },
      resetView: () => {
        const v = viewerRef.current;
        if (!v) return;
        v.rotate({ yaw: initialRef.current.yaw, pitch: initialRef.current.pitch });
        v.zoom(fovToZoomLevel(initialRef.current.fov));
      },
    }), []);

    return <div ref={containerRef} className={className} />;
  },
);

/** PSV 的 zoomLvl 取值 0~100；FOV 在 30~90 之间近似线性映射。 */
function fovToZoomLevel(fov: number): number {
  const clamped = Math.max(30, Math.min(90, fov));
  return Math.round((90 - clamped) / 60 * 100);
}
