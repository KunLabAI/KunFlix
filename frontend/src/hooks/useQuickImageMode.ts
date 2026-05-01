import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { CharacterNodeData } from '@/store/useCanvasStore';
import type { ImageMode } from '@/hooks/useImageGeneration';
import type {
  ImagePanelModeRequest,
  ImageRef,
} from '@/components/canvas/ImageGeneratePanel';

/**
 * 工具条「快捷模式」：一键把当前节点的图作为参考/编辑目标，自动切换生成面板模式。
 * - reference_images：把所有图作为参考
 * - edit：单图直接应用；多图时弹出缩略图选择器让用户选一张
 */
export function useQuickImageMode(
  id: string,
  data: CharacterNodeData,
  imageList: string[],
  normalizeImageUrl: (raw: string) => string,
) {
  const { t } = useTranslation();
  const { updateNodeData } = useCanvasStore();

  const [panelModeRequest, setPanelModeRequest] = useState<ImagePanelModeRequest | null>(null);
  const modeTokenRef = useRef(0);
  const [showEditPicker, setShowEditPicker] = useState(false);
  const editPickerRef = useRef<HTMLDivElement | null>(null);

  const submitModeRequest = useCallback((mode: ImageMode, urls: string[]) => {
    const total = urls.length;
    const baseName = data.name || t('canvas.node.image.currentImage', '当前图像');
    const refs: ImageRef[] = urls.map((u, i) => ({
      url: normalizeImageUrl(u),
      name: total > 1 ? `${baseName} #${i + 1}` : baseName,
      sourceNodeId: id,
    }));
    modeTokenRef.current += 1;
    setPanelModeRequest({ mode, token: modeTokenRef.current, preselectImages: refs });
    data.pinPanel || updateNodeData(id, { pinPanel: true } as Partial<CharacterNodeData>);
  }, [data.name, data.pinPanel, id, normalizeImageUrl, t, updateNodeData]);

  const handleQuickMode = useCallback((nextMode: ImageMode, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const total = imageList.length;
    total > 0 && (() => {
      nextMode === 'reference_images' && submitModeRequest('reference_images', imageList);
      nextMode === 'edit' && total === 1 && submitModeRequest('edit', [imageList[0]]);
      nextMode === 'edit' && total > 1 && setShowEditPicker((v) => !v);
    })();
  }, [imageList, submitModeRequest]);

  const handlePickEditImage = useCallback((url: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    submitModeRequest('edit', [url]);
    setShowEditPicker(false);
  }, [submitModeRequest]);

  // 外部点击关闭选择器
  useEffect(() => {
    const active = showEditPicker;
    const handler = (e: MouseEvent) => {
      const target = e.target as globalThis.Node | null;
      const inside = !!target && !!editPickerRef.current?.contains(target);
      !inside && setShowEditPicker(false);
    };
    active && document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEditPicker]);

  // 有图变动时关闭已打开的选择器（防止图索引失效）
  useEffect(() => {
    imageList.length < 2 && showEditPicker && setShowEditPicker(false);
  }, [imageList.length, showEditPicker]);

  return {
    panelModeRequest,
    showEditPicker,
    editPickerRef,
    submitModeRequest,
    handleQuickMode,
    handlePickEditImage,
    setShowEditPicker,
  };
}
