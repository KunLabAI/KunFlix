'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RotateCcw, X, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PanoramaViewer, type PanoramaViewerHandle } from './PanoramaViewer';

interface Props {
  open: boolean;
  panoramaUrl: string | null | undefined;
  nodeName: string;
  defaultYaw?: number;
  defaultPitch?: number;
  defaultFov?: number;
  onClose: () => void;
  /** 截图回调：传入 dataURL，由外层决定是下载还是导出到画布 */
  onScreenshot: (dataUrl: string) => void;
}

type ViewerStatus = 'loading' | 'ready' | 'error';

/**
 * 全屏全景浏览门户：
 * - createPortal 到 document.body，覆盖整个视口
 * - 内嵌 PanoramaViewer 占满（用 panoramaUrl 作为 key 在换图时强制重建）
 * - 顶部右侧浮动工具栏：截图 / 复位视角 / 退出
 * - ESC 键退出
 * - 打开时锁定 body 滚动
 * - 通过 PSV 事件回调维护 status（loading/ready/error），事件回调里 setState 合法
 */
export function FullscreenPortal({
  open,
  panoramaUrl,
  nodeName,
  defaultYaw,
  defaultPitch,
  defaultFov,
  onClose,
  onScreenshot,
}: Props) {
  const { t } = useTranslation();
  const viewerRef = useRef<PanoramaViewerHandle>(null);
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleReady = useCallback(() => {
    setStatus('ready');
    setErrorMsg(null);
  }, []);

  const handleError = useCallback((msg: string) => {
    setStatus('error');
    setErrorMsg(msg);
  }, []);

  // ESC 退出
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { e.key === 'Escape' && onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // 锁定 body 滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const handleScreenshot = useCallback(() => {
    const dataUrl = viewerRef.current?.takeScreenshot();
    dataUrl && onScreenshot(dataUrl);
  }, [onScreenshot]);

  const handleReset = useCallback(() => {
    viewerRef.current?.resetView();
  }, []);

  if (!open || typeof document === 'undefined') return null;

  // 使用 panoramaUrl 作为 key 让 PanoramaViewer 在换图时强制卸载重建。
  // 状态由 PanoramaViewer 通过 onReady/onError 事件回调向外驱动（事件回调内 setState 合法）。
  const viewerKey = panoramaUrl || 'empty';
  const hasUrl = !!panoramaUrl;
  const ready = status === 'ready';

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black animate-in fade-in duration-200">
      {/* Viewer 容器 */}
      {hasUrl ? (
        <PanoramaViewer
          key={viewerKey}
          ref={viewerRef}
          panoramaUrl={panoramaUrl as string}
          className="w-full h-full"
          defaultYaw={defaultYaw}
          defaultPitch={defaultPitch}
          defaultFov={defaultFov}
          onReady={handleReady}
          onError={handleError}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/60 text-sm">
          {t('canvas.node.panorama.noPanorama', '未上传全景图')}
        </div>
      )}

      {/* 加载中指示 */}
      {hasUrl && status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
          <Loader2 className="w-8 h-8 text-white/80 animate-spin" />
          <span className="text-white/70 text-sm">{t('canvas.node.panorama.loading', '正在加载全景图…')}</span>
        </div>
      )}

      {/* 加载错误 */}
      {hasUrl && status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 pointer-events-none">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <div className="text-white/90 text-sm font-medium">
            {t('canvas.node.panorama.loadError', '全景图加载失败')}
          </div>
          {errorMsg && (
            <div className="text-white/50 text-xs max-w-md text-center break-all">{errorMsg}</div>
          )}
          <div className="text-white/40 text-[11px] mt-2 text-center max-w-md">
            {t('canvas.node.panorama.loadErrorHint', '请确认图像可访问且为等距柱状投影（推荐 2:1 长宽比，例如 4096×2048）')}
          </div>
        </div>
      )}

      {/* 顶部工具栏 */}
      <div className="absolute top-4 right-4 flex items-center gap-1 bg-black/50 backdrop-blur-md border border-white/10 rounded-full px-1.5 py-1.5 pointer-events-auto">
        <button
          type="button"
          onClick={handleScreenshot}
          disabled={!ready}
          title={t('canvas.node.panorama.screenshot', '截图保存')}
          aria-label={t('canvas.node.panorama.screenshot', '截图保存')}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Camera className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!ready}
          title={t('canvas.node.panorama.resetView', '复位视角')}
          aria-label={t('canvas.node.panorama.resetView', '复位视角')}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-white/15 mx-0.5" />
        <button
          type="button"
          onClick={onClose}
          title={t('canvas.node.panorama.exit', '退出全屏 (ESC)')}
          aria-label={t('canvas.node.panorama.exit', '退出全屏')}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 节点名 + 操作提示 */}
      <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none">
        <div className="text-white/90 text-sm font-medium px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 truncate max-w-md">
          {nodeName || t('canvas.node.unnamedPanoramaCard', '未命名全景图')}
        </div>
        <div className="text-white/50 text-[11px] px-3">
          {t('canvas.node.panorama.hint', '拖拽改视角 · 滚轮缩放 · ESC 退出')}
        </div>
      </div>
    </div>,
    document.body,
  );
}
