'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasStore, type VideoNodeData } from '@/store/useCanvasStore';
import { useResourceStore } from '@/store/useResourceStore';
import {
  MAX_VIDEO_SIZE_BYTES,
  VALID_VIDEO_TYPES,
} from '@/components/canvas/VideoNode/constants';

/**
 * 封装视频节点上传：XHR + 进度 + 错误；同时暴露资产库选择。
 */
export function useVideoNodeUpload(id: string) {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const clearError = useCallback(() => setUploadError(null), []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 校验类型与大小
    const invalidType = !VALID_VIDEO_TYPES.includes(file.type);
    if (invalidType) {
      setUploadError(t('canvas.node.upload.videoFormatError'));
      return;
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      setUploadError(t('canvas.node.upload.videoSizeError'));
      return;
    }

    setUploadError(null);
    setUploadProgress(0);

    const objectUrl = URL.createObjectURL(file);
    updateNodeData(id, { videoUrl: objectUrl, uploading: true } as Partial<VideoNodeData>);

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

      const response = await new Promise<{ url?: string; error?: string; asset?: Record<string, unknown> }>((resolve, reject) => {
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

      updateNodeData(id, { videoUrl: response.url, uploading: false } as Partial<VideoNodeData>);
      // 同步新资源到 resourceStore
      response.asset && useResourceStore.getState().syncAssetFromUpload(response.asset);
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.message || t('canvas.node.upload.uploadFailed'));
      updateNodeData(id, { uploading: false } as Partial<VideoNodeData>);
    } finally {
      URL.revokeObjectURL(objectUrl);
      fileInputRef.current && (fileInputRef.current.value = '');
    }
  }, [id, updateNodeData, t]);

  const selectAsset = useCallback((assetUrl: string) => {
    updateNodeData(id, { videoUrl: assetUrl, uploading: false } as Partial<VideoNodeData>);
  }, [id, updateNodeData]);

  return {
    fileInputRef,
    uploadProgress,
    uploadError,
    clearError,
    openFileDialog,
    handleFileChange,
    selectAsset,
  };
}
