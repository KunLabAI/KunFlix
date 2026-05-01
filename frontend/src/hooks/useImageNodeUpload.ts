'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasStore, type CharacterNodeData } from '@/store/useCanvasStore';

const MAX_IMAGES = 9;

/**
 * 封装图像节点上传：XHR + 进度 + 错误；同时暴露资产库选择、单图删除。
 */
export function useImageNodeUpload(id: string, imageList: string[]) {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFull = imageList.length >= MAX_IMAGES;

  const openFileDialog = useCallback(() => {
    !isFull && fileInputRef.current?.click();
  }, [isFull]);

  const clearError = useCallback(() => setUploadError(null), []);

  const readLatestImages = () =>
    ((useCanvasStore.getState().nodes.find(n => n.id === id)?.data as CharacterNodeData)?.images) || imageList;

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const slotsAvailable = MAX_IMAGES - imageList.length;
    const filesToUpload = files.slice(0, slotsAvailable);
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];

    for (const file of filesToUpload) {
      if (!validTypes.includes(file.type)) {
        setUploadError(t('canvas.node.upload.imageFormatError'));
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setUploadError(t('canvas.node.upload.imageSizeError'));
        continue;
      }

      setUploadError(null);
      setUploadProgress(0);

      const objectUrl = URL.createObjectURL(file);
      const currentImages = [...readLatestImages()];
      const previewImages = [...currentImages, objectUrl];
      updateNodeData(id, { images: previewImages, imageUrl: previewImages[0], uploading: true });

      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/media/upload');

        const token = localStorage.getItem('access_token');
        token && xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (ev) => {
          ev.lengthComputable && setUploadProgress((ev.loaded / ev.total) * 100);
        };

        const formData = new FormData();
        formData.append('file', file);

        const response = await new Promise<{ url?: string; error?: string }>((resolve, reject) => {
          xhr.onload = () => {
            try {
              const res = xhr.responseText ? JSON.parse(xhr.responseText) : {};
              xhr.status >= 200 && xhr.status < 300
                ? resolve(res || {})
                : resolve({ error: res?.error || `上传失败 (HTTP ${xhr.status})` });
            } catch {
              resolve({ error: `解析响应失败: ${xhr.status} ${xhr.statusText}` });
            }
          };
          xhr.onerror = () => reject(new Error('网络请求失败或跨域错误'));
          xhr.send(formData);
        });

        if (response.error) throw new Error(response.error);

        const latest = readLatestImages();
        const updated = latest.map(url => (url === objectUrl ? (response.url || url) : url));
        updateNodeData(id, { images: updated, imageUrl: updated[0], uploading: false });
      } catch (err: any) {
        console.error('Upload error:', err);
        setUploadError(err.message || t('canvas.node.upload.uploadFailed'));
        const latest = readLatestImages().filter(url => url !== objectUrl);
        updateNodeData(id, { images: latest, imageUrl: latest[0] || null, uploading: false });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    fileInputRef.current && (fileInputRef.current.value = '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, imageList, updateNodeData, t]);

  const selectAsset = useCallback((assetUrl: string) => {
    const latest = readLatestImages();
    latest.length < MAX_IMAGES && (() => {
      const next = [...latest, assetUrl];
      updateNodeData(id, { images: next, imageUrl: next[0] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, updateNodeData]);

  const removeImage = useCallback((index: number) => {
    const next = [...imageList];
    next.splice(index, 1);
    updateNodeData(id, { images: next, imageUrl: next[0] || null });
  }, [id, imageList, updateNodeData]);

  return {
    fileInputRef,
    isFull,
    uploadProgress,
    uploadError,
    clearError,
    openFileDialog,
    handleFileChange,
    selectAsset,
    removeImage,
  };
}
