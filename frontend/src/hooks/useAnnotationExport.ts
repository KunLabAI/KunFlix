'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCanvasStore,
  type CharacterNodeData,
  type ImageGenHistoryEntry,
} from '@/store/useCanvasStore';

const MAX_IMAGES = 9;

interface SaveResult {
  url: string;
}

/**
 * 标注合成保存：dataURL → 上传 /api/media/upload → 追加到节点 images 与 generatedImages。
 * - 不替换原图；满 9 张时拒绝并返回错误
 * - 借鉴 useImageGridExport 的 XHR + token 注入范式
 */
export function useAnnotationExport(id: string, data: CharacterNodeData) {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentImages = data.images || (data.imageUrl ? [data.imageUrl] : []);
  const isFull = currentImages.length >= MAX_IMAGES;

  const uploadDataUrl = useCallback(async (dataUrl: string): Promise<SaveResult> => {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const file = new File([blob], `annotated-${Date.now()}.png`, { type: 'image/png' });

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');
    const token = localStorage.getItem('access_token');
    token && xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    return new Promise<SaveResult>((resolve, reject) => {
      xhr.onload = () => {
        try {
          const res = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          xhr.status >= 200 && xhr.status < 300
            ? (res.url ? resolve({ url: res.url }) : reject(new Error('Server returned no url')))
            : reject(new Error(res?.error || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`Parse response failed: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(formData);
    });
  }, []);

  /**
   * 保存标注合成图。
   * @returns 新增图片的 URL；失败时返回 null（错误存入 state）。
   */
  const saveAnnotation = useCallback(async (dataUrl: string | null): Promise<string | null> => {
    if (!dataUrl) {
      setError(t('canvas.node.annotation.exportFailed'));
      return null;
    }
    if (isFull) {
      setError(t('canvas.node.upload.maxReached', { max: MAX_IMAGES }));
      return null;
    }

    setIsSaving(true);
    setError(null);
    try {
      const { url } = await uploadDataUrl(dataUrl);

      // 取最新的 store 数据，避免 stale closure
      const latestNode = useCanvasStore.getState().nodes.find((n) => n.id === id);
      const latestData = (latestNode?.data as CharacterNodeData) || data;
      const latestImages = latestData.images || (latestData.imageUrl ? [latestData.imageUrl] : []);
      const nextImages = [...latestImages, url].slice(0, MAX_IMAGES);

      const entry: ImageGenHistoryEntry = {
        url,
        prompt: t('canvas.node.annotation.exportName', { name: latestData.name || '' }),
        createdAt: new Date().toISOString(),
        source: 'annotation',
      };
      const prevHist = latestData.generatedImages || [];
      const merged = [entry, ...prevHist.filter((e) => e.url !== url)];

      updateNodeData(id, {
        images: nextImages,
        imageUrl: nextImages[0] || url,
        generatedImages: merged,
        uploading: false,
      } as Partial<CharacterNodeData>);

      return url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('Save annotation error:', e);
      setError(msg);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [id, data, isFull, t, updateNodeData, uploadDataUrl]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isSaving,
    error,
    isFull,
    saveAnnotation,
    clearError,
  };
}
