import { useState, useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { useCanvasStore, CanvasNode, ScriptNodeData, CharacterNodeData, VideoNodeData, AudioNodeData, StoryboardNodeData } from '@/store/useCanvasStore';
import * as XLSX from 'xlsx';
import { useResourceStore } from '@/store/useResourceStore';
import api from '@/lib/api';

// File type detection matchers
const FILE_TYPE_MATCHERS: Array<{ type: FileType; mimes: string[]; exts: string[] }> = [
  { type: 'spreadsheet', mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'], exts: ['.xlsx', '.xls', '.csv'] },
  { type: 'text', mimes: ['text/plain', 'text/markdown', 'application/pdf'], exts: ['.txt', '.md', '.markdown', '.pdf'] },
  { type: 'image', mimes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'], exts: ['.png', '.jpg', '.jpeg', '.webp', '.gif'] },
  { type: 'video', mimes: ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/quicktime', 'video/x-ms-wmv', 'video/x-flv'], exts: ['.mp4', '.webm', '.avi', '.mov', '.wmv', '.flv', '.mkv'] },
  { type: 'audio', mimes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/flac', 'audio/aac', 'audio/x-m4a'], exts: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'] },
];

// Size limits per file type (bytes)
const SIZE_LIMITS: Record<string, number> = {
  text: 10 * 1024 * 1024,
  image: 50 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  spreadsheet: 20 * 1024 * 1024,
};

// Batch limits per file type
const BATCH_LIMITS: Record<string, number> = { video: 5, image: 20, audio: 20, text: 20, spreadsheet: 10 };

// Node default dimensions
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  text: { width: 400, height: 300 },
  image: { width: 512, height: 384 },
  video: { width: 512, height: 384 },
  audio: { width: 360, height: 200 },
  spreadsheet: { width: 500, height: 350 },
};

export type FileType = 'text' | 'image' | 'video' | 'audio' | 'spreadsheet';

function getFileType(file: File): FileType | null {
  const mime = file.type;
  const name = file.name.toLowerCase();
  return (
    FILE_TYPE_MATCHERS.find(
      (m) => m.mimes.some((t) => mime.includes(t)) || m.exts.some((ext) => name.endsWith(ext))
    )?.type ?? null
  );
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string || '');
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

async function uploadFile(
  file: File,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Promise<{ url?: string; error?: string; asset?: Record<string, unknown> }> {
  // 走 axios 实例以复用 401 自动刷新 token 的拦截器；
  // 传入 FormData 时显式指定 multipart，axios 会自动补充 boundary。
  const formData = new FormData();
  formData.append('file', file);
  try {
    const { data } = await api.post<{ url?: string; asset?: Record<string, unknown> }>(
      '/media/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data || {};
  } catch (e: any) {
    const status = e?.response?.status;
    const detail = e?.response?.data?.detail || e?.response?.data?.error;
    // 网络层错误（无 response）：抛出统一的网络错误，让上层 handleMediaUpload 的 catch 捕获
    !e?.response && (() => { throw new Error(t('canvas.networkError')); })();
    return { error: detail || t('canvas.uploadFailedHttp', { status: status ?? 'unknown' }) };
  }
}

// Media upload handler (shared by image/video/audio)
async function handleMediaUpload(
  file: File,
  nodeId: string,
  objectUrl: string,
  urlField: string,
  t: (key: string, opts?: Record<string, unknown>) => string
) {
  try {
    const response = await uploadFile(file, t);
    response.error && (() => { throw new Error(response.error); })();
    const { updateNodeData, nodes } = useCanvasStore.getState();
    URL.revokeObjectURL(objectUrl);
    // 构建更新载荷：替换 urlField + images 数组中的 blob URL
    const updatePayload: Record<string, unknown> = { [urlField]: response.url, uploading: false };
    const currentImages: string[] = (nodes.find(n => n.id === nodeId)?.data as any)?.images || [];
    currentImages.includes(objectUrl) && (updatePayload.images = currentImages.map((u: string) => u === objectUrl ? response.url : u));
    updateNodeData(nodeId, updatePayload as any);
    response.asset && useResourceStore.getState().syncAssetFromUpload(response.asset);
  } catch (error: any) {
    console.error('Upload error:', error);
    const { updateNodeData } = useCanvasStore.getState();
    updateNodeData(nodeId, { uploading: false } as any);
    alert(t('canvas.uploadFailed', { message: error.message || t('canvas.retryHint') }));
  }
}

// Node creators per file type (avoids switch/case)
const NODE_CREATORS: Record<string, (file: File, position: { x: number; y: number }, t: (key: string, opts?: Record<string, unknown>) => string) => Promise<void>> = {
  text: async (file, position, t) => {
    const MAX_CHARACTERS = 100000;

    if (file.size > SIZE_LIMITS.text) {
      alert(t('canvas.fileSizeError.text'));
      return;
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    let content: string;

    try {
      content = isPdf
        ? t('canvas.pdfPlaceholder', { name: file.name })
        : await readTextFile(file);
    } catch {
      content = t('canvas.readFileFailed', { name: file.name });
    }

    const originalLength = content.length;
    content = content.length > MAX_CHARACTERS
      ? content.substring(0, MAX_CHARACTERS) + t('canvas.contentTruncated', { original: originalLength.toLocaleString(), max: MAX_CHARACTERS.toLocaleString() })
      : content;

    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const dims = NODE_DIMENSIONS.text;
    const newNode: CanvasNode = {
      id: `text-${uuidv4()}`,
      type: 'text',
      position,
      width: dims.width,
      height: dims.height,
      data: {
        title: fileName,
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }],
        },
        tags: isPdf ? ['pdf'] : ['imported'],
      } as ScriptNodeData,
    };
    useCanvasStore.getState().addNode(newNode);
  },

  image: async (file, position, t) => {
    if (file.size > SIZE_LIMITS.image) {
      alert(t('canvas.fileSizeError.image'));
      return;
    }
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const objectUrl = URL.createObjectURL(file);
    const dims = NODE_DIMENSIONS.image;
    const newNode: CanvasNode = {
      id: `image-${uuidv4()}`,
      type: 'image',
      position,
      width: dims.width,
      height: dims.height,
      data: { name: fileName, description: '', imageUrl: objectUrl, images: [objectUrl], uploading: true } as CharacterNodeData,
    };
    useCanvasStore.getState().addNode(newNode);
    await handleMediaUpload(file, newNode.id, objectUrl, 'imageUrl', t);
  },

  video: async (file, position, t) => {
    if (file.size > SIZE_LIMITS.video) {
      alert(t('canvas.fileSizeError.video'));
      return;
    }
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const objectUrl = URL.createObjectURL(file);
    const dims = NODE_DIMENSIONS.video;
    const newNode: CanvasNode = {
      id: `video-${uuidv4()}`,
      type: 'video',
      position,
      width: dims.width,
      height: dims.height,
      data: { name: fileName, description: '', videoUrl: objectUrl, uploading: true, fitMode: 'cover' } as VideoNodeData,
    };
    useCanvasStore.getState().addNode(newNode);
    await handleMediaUpload(file, newNode.id, objectUrl, 'videoUrl', t);
  },

  audio: async (file, position, t) => {
    if (file.size > SIZE_LIMITS.audio) {
      alert(t('canvas.fileSizeError.audio'));
      return;
    }
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const objectUrl = URL.createObjectURL(file);
    const dims = NODE_DIMENSIONS.audio;
    const newNode: CanvasNode = {
      id: `audio-${uuidv4()}`,
      type: 'audio',
      position,
      width: dims.width,
      height: dims.height,
      data: { name: fileName, description: '', audioUrl: objectUrl, uploading: true } as AudioNodeData,
    };
    useCanvasStore.getState().addNode(newNode);
    await handleMediaUpload(file, newNode.id, objectUrl, 'audioUrl', t);
  },

  spreadsheet: async (file, position, t) => {
    if (file.size > SIZE_LIMITS.spreadsheet) {
      alert(t('canvas.fileSizeError.spreadsheet'));
      return;
    }
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const headerRow: string[] = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })[0] ?? [];
    const tableColumns = headerRow.map((label) => {
      const key = String(label).trim();
      return { key, label: key, type: 'text' as const };
    });
    const tableData = jsonRows.map((row, i) => ({
      key: String(i),
      ...tableColumns.reduce<Record<string, unknown>>((acc, col) => {
        acc[col.key] = row[col.key] ?? '';
        return acc;
      }, {}),
    }));
    const dims = NODE_DIMENSIONS.spreadsheet;
    const newNode: CanvasNode = {
      id: `storyboard-${uuidv4()}`,
      type: 'storyboard',
      position,
      width: dims.width,
      height: dims.height,
      data: {
        title: fileName,
        shotNumber: '',
        description: '',
        duration: 0,
        tableColumns,
        tableData,
      } as StoryboardNodeData,
    };
    useCanvasStore.getState().addNode(newNode);
  },
};

export function useFileDragDrop(wrapperRef: React.RefObject<HTMLDivElement | null>) {
  const { t } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dragFileType, setDragFileType] = useState<FileType | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  const onFileDragOver = useCallback((event: React.DragEvent) => {
    setIsDraggingFile(true);
    setDragPosition({ x: event.clientX, y: event.clientY });

    // Detect file type from the first file
    const files = event.dataTransfer.items;
    if (files.length > 0) {
      const file = files[0].getAsFile();
      file && setDragFileType(getFileType(file));
    }
  }, []);

  const onFileDragLeave = useCallback((event: React.DragEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { clientX, clientY } = event;
    const isOutside = clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom;
    isOutside && (setIsDraggingFile(false), setDragFileType(null));
  }, [wrapperRef]);

  const resetDragState = useCallback(() => {
    setIsDraggingFile(false);
    setDragFileType(null);
  }, []);

  const handleFileDrop = useCallback((files: FileList, clientX: number, clientY: number) => {
    const position = screenToFlowPosition({ x: clientX, y: clientY });

    // Group files by type and apply batch limits
    const TYPE_NAMES: Record<string, string> = {
      video: t('canvas.fileNames.video'),
      image: t('canvas.fileNames.image'),
      audio: t('canvas.fileNames.audio'),
      text: t('canvas.fileNames.text'),
      spreadsheet: t('canvas.fileNames.spreadsheet'),
    };
    const grouped: Record<string, File[]> = {};
    Array.from(files).forEach((file) => {
      const fType = getFileType(file) ?? 'unknown';
      (grouped[fType] = grouped[fType] || []).push(file);
    });

    const allowed: File[] = [];
    const rejected: string[] = [];
    Object.entries(grouped).forEach(([fType, list]) => {
      const limit = BATCH_LIMITS[fType] ?? 20;
      allowed.push(...list.slice(0, limit));
      list.length > limit && rejected.push(
        t('canvas.batchLimit', { type: TYPE_NAMES[fType] ?? t('canvas.fileNames.default'), limit, skipped: list.length - limit })
      );
    });
    rejected.length > 0 && alert(rejected.join('\n'));

    // Sequential upload to avoid concurrent SQLite conflicts
    (async () => {
      for (let i = 0; i < allowed.length; i++) {
        const filePosition = { x: position.x + i * 50, y: position.y + i * 50 };
        const fileType = getFileType(allowed[i]);
        const creator = fileType ? NODE_CREATORS[fileType] : null;
        creator
          ? await creator(allowed[i], filePosition, t)
          : alert(t('canvas.unsupportedFile', { name: allowed[i].name }));
      }
    })();
  }, [screenToFlowPosition, t]);

  return { isDraggingFile, dragFileType, dragPosition, onFileDragOver, onFileDragLeave, resetDragState, handleFileDrop };
}
