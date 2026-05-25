/**
 * Panorama 节点常量。与 ImageNode/VideoNode 的 constants 模块保持一致风格。
 */
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 200;
export const MAX_DIMENSION = 1600;

/** 节点拖拽至画布时的默认尺寸（参考 Sidebar.NODE_TYPES.dimensions） */
export const DEFAULT_DIMENSIONS = { width: 512, height: 320 } as const;

/** 上传文件类型限制 —— 全景图通常较大，仅接受常见栅格图像 */
export const PANORAMA_ACCEPT = '.jpg,.jpeg,.png,.webp';
export const PANORAMA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** 单文件大小上限（字节）—— 全景图分辨率高，放宽到 30 MB */
export const PANORAMA_MAX_BYTES = 30 * 1024 * 1024;

/** Photo Sphere Viewer 默认视角/FOV */
export const DEFAULT_YAW = 0;
export const DEFAULT_PITCH = 0;
export const DEFAULT_FOV = 60;
