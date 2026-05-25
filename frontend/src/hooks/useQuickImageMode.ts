import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { CharacterNodeData } from '@/store/useCanvasStore';
import type { ImageMode } from '@/hooks/useImageGeneration';
import type {
  ImagePanelModeRequest,
  ImageRef,
} from '@/components/canvas/ImageGeneratePanel';

/** 全景图提示词模板（一键填充到生成面板） */
const PANORAMA_PROMPT =
  '360 degree equirectangular panorama, seamless spherical projection, 2:1 aspect ratio, ' +
  'expand and extend this image into a full 360-degree panoramic environment. ' +
  'The environment wraps fully 360 degrees with consistent lighting and no visible seams. ' +
  'Style: photorealistic, cinematic lighting, ultra detailed, 8K resolution';

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

  const submitModeRequest = useCallback((
    mode: ImageMode,
    urls: string[],
    overrides?: { promptOverride?: string; aspectRatioOverride?: string },
  ) => {
    const total = urls.length;
    const baseName = data.name || t('canvas.node.image.currentImage', '当前图像');
    const refs: ImageRef[] = urls.map((u, i) => ({
      url: normalizeImageUrl(u),
      name: total > 1 ? `${baseName} #${i + 1}` : baseName,
      sourceNodeId: id,
    }));
    modeTokenRef.current += 1;
    setPanelModeRequest({
      mode,
      token: modeTokenRef.current,
      preselectImages: refs,
      promptOverride: overrides?.promptOverride,
      aspectRatioOverride: overrides?.aspectRatioOverride,
    });
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

  /**
   * 一键生成全景图：以当前图像为参考 + edit 模式 + 21:9 比例 + 预填全景提示词。
   * 用户可手动调整后点击生成，生成后由 ImageNode 侧的 onCustomApply 路由到全景节点。
   */
  const handleGeneratePanorama = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    imageList.length > 0 && submitModeRequest('edit', [imageList[0]], {
      promptOverride: PANORAMA_PROMPT,
      aspectRatioOverride: '21:9',
    });
  }, [imageList, submitModeRequest]);

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
    handleGeneratePanorama,
    setShowEditPicker,
  };
}
