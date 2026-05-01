'use client';

import { useCallback, useState } from 'react';
import { toPng } from 'html-to-image';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore, type CanvasNode, type CharacterNodeData } from '@/store/useCanvasStore';

interface Options {
  id: string;
  gridContainerRef: React.RefObject<HTMLDivElement | null>;
  imageList: string[];
  data: CharacterNodeData;
  setUploadError: (err: string | null) => void;
}

/**
 * 多宫格导出：截图 gridContainer → 上传 → 新建图像节点并自动连线。
 */
export function useImageGridExport({ id, gridContainerRef, imageList, data, setUploadError }: Options) {
  const { t } = useTranslation();
  const { getNode } = useReactFlow();
  const addNode = useCanvasStore((s) => s.addNode);
  const onConnect = useCanvasStore((s) => s.onConnect);

  const [isExporting, setIsExporting] = useState(false);

  const exportGrid = useCallback(async (pixelRatio: number = 2) => {
    const canExport = gridContainerRef.current && imageList.length >= 2 && !isExporting;
    if (!canExport) return;

    setIsExporting(true);
    try {
      const dataUrl = await toPng(gridContainerRef.current!, { cacheBust: true, pixelRatio });
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const file = new File([blob], `grid-export-${Date.now()}.png`, { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/upload');
      const token = localStorage.getItem('access_token');
      token && xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      const uploadResult = await new Promise<{ url?: string; error?: string }>((resolve, reject) => {
        xhr.onload = () => {
          try {
            const res = JSON.parse(xhr.responseText);
            xhr.status >= 200 && xhr.status < 300
              ? resolve(res)
              : resolve({ error: res?.error || `HTTP ${xhr.status}` });
          } catch {
            resolve({ error: `解析响应失败` });
          }
        };
        xhr.onerror = () => reject(new Error('网络错误'));
        xhr.send(formData);
      });

      if (uploadResult.error) throw new Error(uploadResult.error);

      const currentNode = getNode(id);
      const nodeWidth = currentNode?.width ?? 512;
      const newNodeId = `image-${uuidv4()}`;
      const exportName = t('canvas.node.upload.exportName', {
        name: data.name || t('canvas.node.unnamedImageCard'),
      });

      const newNode: CanvasNode = {
        id: newNodeId,
        type: 'image',
        position: {
          x: (currentNode?.position.x ?? 0) + nodeWidth + 80,
          y: currentNode?.position.y ?? 0,
        },
        width: 512,
        height: 384,
        data: {
          name: exportName,
          description: '',
          imageUrl: uploadResult.url,
          images: [uploadResult.url!],
          uploading: false,
        } as CharacterNodeData,
      };

      addNode(newNode);
      onConnect({
        source: id,
        sourceHandle: 'right-source',
        target: newNodeId,
        targetHandle: 'left-target',
      });
    } catch (err: any) {
      console.error('Export grid error:', err);
      setUploadError(err.message || t('canvas.node.upload.uploadFailed'));
    } finally {
      setIsExporting(false);
    }
  }, [id, gridContainerRef, imageList.length, isExporting, data.name, getNode, addNode, onConnect, t, setUploadError]);

  return { isExporting, exportGrid };
}
