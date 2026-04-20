'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Loader2,
  ChevronDown,
  X,
  FileText,
  ImageIcon,
  Video,
  Music,
  Archive,
  AlertCircle,
  Copy,
  UploadCloud,
  ScrollText,
  Film,
  Clapperboard,
  Paperclip,
  Square,
  Toolbox
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import type { AgentInfo, NodeAttachment, UploadedFile, PastedContent } from '@/store/useAIAssistantStore';
import { NodePreviewCard } from './NodePreviewCard';
import type { CanvasNode } from '@/store/useCanvasStore';
import type { LucideIcon } from 'lucide-react';
import { extractNodeAttachment } from '@/lib/nodeAttachmentUtils';

// ─── Constants ───────────────────────────────────────────────────────────────
const MAX_FILES = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const PASTE_THRESHOLD = 10000; // characters
const UNDO_HISTORY_LIMIT = 50; // 撤销历史最大条数
const UNDO_DEBOUNCE_MS = 300; // 防抖保存间隔(ms)

// ─── File helpers ────────────────────────────────────────────────────────────
const FILE_ICON_MAP: [RegExp, React.ReactNode][] = [
  [/^image\//, <ImageIcon key="img" className="h-5 w-5 text-muted-foreground" />],
  [/^video\//, <Video key="vid" className="h-5 w-5 text-muted-foreground" />],
  [/^audio\//, <Music key="aud" className="h-5 w-5 text-muted-foreground" />],
  [/(zip|rar|tar)/, <Archive key="arc" className="h-5 w-5 text-muted-foreground" />],
];

const getFileIcon = (type: string) => {
  const match = FILE_ICON_MAP.find(([re]) => re.test(type));
  return match?.[1] ?? <FileText className="h-5 w-5 text-muted-foreground" />;
};

const formatFileSize = (bytes: number): string => {
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const getFileTypeLabel = (type: string): string => {
  const parts = type.split('/');
  let label = parts[parts.length - 1].toUpperCase();
  label.length > 7 && label.includes('-') && (label = label.substring(0, label.indexOf('-')));
  return label.length > 10 ? label.substring(0, 10) + '...' : label;
};

const getFileExtension = (filename: string): string => {
  const ext = filename.split('.').pop()?.toUpperCase() || 'FILE';
  return ext.length > 8 ? ext.substring(0, 8) + '...' : ext;
};

const TEXTUAL_TYPES = ['text/', 'application/json', 'application/xml', 'application/javascript', 'application/typescript'];
const TEXTUAL_EXTENSIONS = new Set([
  'txt','md','py','js','ts','jsx','tsx','html','htm','css','scss','sass','json','xml','yaml','yml',
  'csv','sql','sh','bash','php','rb','go','java','c','cpp','h','hpp','cs','rs','swift','kt','scala',
  'r','vue','svelte','astro','config','conf','ini','toml','log','gitignore','dockerfile','makefile','readme',
]);

const isTextualFile = (file: File): boolean => {
  const hasTextualMime = TEXTUAL_TYPES.some(t => file.type.toLowerCase().startsWith(t));
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const name = file.name.toLowerCase();
  return hasTextualMime || TEXTUAL_EXTENSIONS.has(ext) || name.includes('readme') || name.includes('dockerfile') || name.includes('makefile');
};

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });

// ─── Sub-components ──────────────────────────────────────────────────────────

/** 图片文件预览卡 */
const ImageFileCard: React.FC<{ file: UploadedFile; onRemove: (id: string) => void }> = ({ file, onRemove }) => (
  <div className="relative group bg-muted border border-border rounded-lg size-[100px] shadow-sm flex-shrink-0 overflow-hidden">
    <img
      src={file.preview || '/placeholder.svg'}
      alt={file.file.name}
      className="w-full h-full object-cover"
    />
    {file.uploadStatus === 'uploading' && (
      <div className="absolute inset-0 flex items-center justify-center bg-background/50">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    )}
    {file.uploadStatus === 'error' && (
      <div className="absolute top-1 left-1">
        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
      </div>
    )}
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-1.5">
      <p className="text-[10px] text-foreground truncate">{file.file.name}</p>
    </div>
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/80 border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
      onClick={() => onRemove(file.id)}
    >
      <X className="h-3 w-3" />
    </Button>
  </div>
);

/** 非图片文件预览卡 */
const GenericFileCard: React.FC<{ file: UploadedFile; onRemove: (id: string) => void }> = ({ file, onRemove }) => (
  <div className="relative group bg-muted border border-border rounded-lg size-[100px] shadow-sm flex-shrink-0 overflow-hidden p-2.5 flex flex-col justify-between">
    <div className="flex items-start gap-1.5">
      {getFileIcon(file.type)}
      {file.uploadStatus === 'uploading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
      {file.uploadStatus === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-foreground truncate" title={file.file.name}>
        {file.file.name}
      </p>
      <p className="text-[9px] text-muted-foreground mt-0.5">{formatFileSize(file.file.size)}</p>
    </div>
    <span className="absolute bottom-1.5 right-1.5 text-[9px] text-muted-foreground bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded">
      {getFileTypeLabel(file.type)}
    </span>
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/80 border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
      onClick={() => onRemove(file.id)}
    >
      <X className="h-3 w-3" />
    </Button>
  </div>
);

/** 文本文件预览卡 */
const TextualFileCard: React.FC<{ file: UploadedFile; onRemove: (id: string) => void }> = ({ file, onRemove }) => (
  <div className="relative group bg-muted border border-border rounded-lg size-[100px] shadow-sm flex-shrink-0 overflow-hidden">
    <div className="p-2 text-[7px] text-muted-foreground whitespace-pre-wrap break-words max-h-full overflow-hidden leading-tight">
      {file.textContent ?? ''}
    </div>
    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent pointer-events-none" />
    <span className="absolute bottom-1.5 left-1.5 text-[9px] text-foreground bg-muted/90 border border-border/50 px-1.5 py-0.5 rounded">
      {getFileExtension(file.file.name)}
    </span>
    <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {file.textContent && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-5 w-5 rounded-full bg-background/80 border border-border/50 hover:bg-accent"
          onClick={() => navigator.clipboard.writeText(file.textContent || '')}
          title="Copy"
        >
          <Copy className="h-2.5 w-2.5" />
        </Button>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-5 w-5 rounded-full bg-background/80 border border-border/50 hover:bg-destructive hover:text-destructive-foreground"
        onClick={() => onRemove(file.id)}
      >
        <X className="h-2.5 w-2.5" />
      </Button>
    </div>
    {file.uploadStatus === 'uploading' && (
      <div className="absolute inset-0 flex items-center justify-center bg-background/50">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    )}
  </div>
);

/** 粘贴内容预览卡 */
const PastedContentCard: React.FC<{ content: PastedContent; onRemove: (id: string) => void }> = ({ content, onRemove }) => {
  const previewText = content.content.slice(0, 150);
  const needsTruncation = content.content.length > 150;

  return (
    <div className="relative group bg-muted border border-border rounded-lg size-[100px] shadow-sm flex-shrink-0 overflow-hidden">
      <div className="p-2 text-[7px] text-muted-foreground whitespace-pre-wrap break-words max-h-full overflow-hidden leading-tight">
        {needsTruncation ? previewText + '...' : content.content}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent pointer-events-none" />
      <span className="absolute bottom-1.5 left-1.5 text-[9px] text-foreground bg-muted/90 border border-border/50 px-1.5 py-0.5 rounded uppercase">
        pasted
      </span>
      <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-5 w-5 rounded-full bg-background/80 border border-border/50 hover:bg-accent"
          onClick={() => navigator.clipboard.writeText(content.content)}
          title="Copy"
        >
          <Copy className="h-2.5 w-2.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-5 w-5 rounded-full bg-background/80 border border-border/50 hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => onRemove(content.id)}
        >
          <X className="h-2.5 w-2.5" />
        </Button>
      </div>
    </div>
  );
};

/** 文件预览路由组件 */
const FilePreviewCard: React.FC<{ file: UploadedFile; onRemove: (id: string) => void }> = ({ file, onRemove }) => {
  const isImage = file.type.startsWith('image/');
  const isTextual = isTextualFile(file.file);

  return isTextual
    ? <TextualFileCard file={file} onRemove={onRemove} />
    : isImage
      ? <ImageFileCard file={file} onRemove={onRemove} />
      : <GenericFileCard file={file} onRemove={onRemove} />;
};

// ─── Node type icons ─────────────────────────────────────────────────────────
const NODE_TYPE_ICONS: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  text:       { icon: ScrollText,   color: 'text-node-blue',   label: '文本' },
  image:      { icon: ImageIcon,    color: 'text-node-green',  label: '图片' },
  video:      { icon: Film,         color: 'text-node-yellow', label: '视频' },
  storyboard: { icon: Clapperboard, color: 'text-node-purple', label: '分镜' },
};

const DEFAULT_NODE_ICON = { icon: FileText, color: 'text-muted-foreground', label: '节点' };

// ─── Props ───────────────────────────────────────────────────────────────────
interface MessageInputProps {
  onSend: (content: string, files: UploadedFile[], pastedContents: PastedContent[]) => void;
  onStop?: () => void;
  isLoading: boolean;
  isDragOverPanel?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  // Agent selector
  agentName?: string;
  availableAgents?: AgentInfo[];
  isLoadingAgents?: boolean;
  onSwitchAgent?: (agent: AgentInfo) => void;
  // Node attachments (from canvas drag)
  nodeAttachments?: NodeAttachment[];
  onRemoveNodeAttachment?: (nodeId: string) => void;
  onClearNodeAttachments?: () => void;
  // Node picker: canvas nodes + add callback
  canvasNodes?: CanvasNode[];
  onAddNodeAttachment?: (attachment: NodeAttachment) => void;
  // Uploaded files
  uploadedFiles?: UploadedFile[];
  onAddUploadedFile?: (file: UploadedFile) => void;
  onUpdateUploadedFile?: (id: string, updates: Partial<UploadedFile>) => void;
  onRemoveUploadedFile?: (id: string) => void;
  onClearUploadedFiles?: () => void;
  // Pasted contents
  pastedContents?: PastedContent[];
  onAddPastedContent?: (content: PastedContent) => void;
  onRemovePastedContent?: (id: string) => void;
  onClearPastedContents?: () => void;
  // Config
  maxFiles?: number;
  maxFileSize?: number;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function MessageInput({
  onSend,
  onStop,
  isLoading,
  isDragOverPanel = false,
  disabled = false,
  placeholder,
  className,
  agentName,
  availableAgents = [],
  isLoadingAgents = false,
  onSwitchAgent,
  nodeAttachments = [],
  onRemoveNodeAttachment,
  onClearNodeAttachments,
  canvasNodes = [],
  onAddNodeAttachment,
  uploadedFiles = [],
  onAddUploadedFile,
  onUpdateUploadedFile,
  onRemoveUploadedFile,
  onClearUploadedFiles,
  pastedContents = [],
  onAddPastedContent,
  onRemovePastedContent,
  onClearPastedContents,
  maxFiles = MAX_FILES,
  maxFileSize = MAX_FILE_SIZE,
}: MessageInputProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('ai.inputPlaceholder');
  const resolvedAgentName = agentName ?? t('ai.title');
  const [inputValue, setInputValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 撤销历史栈 ──
  const [undoHistory, setUndoHistory] = useState<string[]>(['']);
  const [undoIndex, setUndoIndex] = useState(0);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isUndoRedoRef = useRef(false); // 标记是否为撤销/重做操作

  // 带撤销功能的值更新函数
  const updateInputValue = useCallback((value: string, skipHistory = false) => {
    setInputValue(value);
    // 撤销/重做操作或显式跳过时，不保存历史
    skipHistory || isUndoRedoRef.current || (() => {
      // 清除之前的防抖定时器
      undoTimerRef.current && clearTimeout(undoTimerRef.current);
      // 防抖保存到历史栈
      undoTimerRef.current = setTimeout(() => {
        setUndoHistory(prev => {
          // 截取当前位置之后的历史，添加新值
          const newHistory = [...prev.slice(0, undoIndex + 1), value].slice(-UNDO_HISTORY_LIMIT);
          return newHistory;
        });
        setUndoIndex(prev => Math.min(prev + 1, UNDO_HISTORY_LIMIT - 1));
      }, UNDO_DEBOUNCE_MS);
    })();
    // 重置标记
    isUndoRedoRef.current = false;
  }, [undoIndex]);

  // 撤销操作
  const handleUndo = useCallback(() => {
    undoIndex > 0 && (() => {
      isUndoRedoRef.current = true;
      const newIndex = undoIndex - 1;
      setUndoIndex(newIndex);
      setInputValue(undoHistory[newIndex] || '');
    })();
  }, [undoIndex, undoHistory]);

  // 重做操作
  const handleRedo = useCallback(() => {
    undoIndex < undoHistory.length - 1 && (() => {
      isUndoRedoRef.current = true;
      const newIndex = undoIndex + 1;
      setUndoIndex(newIndex);
      setInputValue(undoHistory[newIndex] || '');
    })();
  }, [undoIndex, undoHistory]);

  // 过滤已附加的节点，生成可选节点列表
  const attachedNodeIds = useMemo(() => new Set(nodeAttachments.map(a => a.nodeId)), [nodeAttachments]);
  const availableNodes = useMemo(() => canvasNodes.filter(n => !attachedNodeIds.has(n.id)), [canvasNodes, attachedNodeIds]);

  // 清理撤销历史定时器
  useEffect(() => {
    return () => {
      undoTimerRef.current && clearTimeout(undoTimerRef.current);
    };
  }, []);

  // 发送后重新聚焦
  useEffect(() => {
    !isLoading && textareaRef.current?.focus();
  }, [isLoading]);

  // 自动调整高度（最大10行，约240px）
  useEffect(() => {
    const textarea = textareaRef.current;
    textarea && (textarea.style.height = 'auto', textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`);
  }, [inputValue]);

  // ── File selection handler ──
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    const files = selectedFiles ? Array.from(selectedFiles) : [];
    const currentCount = uploadedFiles.length;
    const availableSlots = maxFiles - currentCount;

    // 已满则提示
    availableSlots <= 0 && files.length > 0 && alert(t('ai.maxFilesReached', { max: maxFiles }));
    const filesToAdd = files.slice(0, Math.max(0, availableSlots));

    filesToAdd.forEach((file) => {
      // 大小校验
      const tooLarge = file.size > maxFileSize;
      tooLarge && alert(t('ai.fileTooLarge', { name: file.name, limit: formatFileSize(maxFileSize) }));
      if (tooLarge) return;

      const id = crypto.randomUUID();
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      const newFile: UploadedFile = {
        id,
        file,
        preview,
        type: file.type || 'application/octet-stream',
        uploadStatus: 'pending',
        uploadProgress: 0,
      };

      onAddUploadedFile?.(newFile);

      // 读取文本文件内容
      isTextualFile(file) && readFileAsText(file)
        .then((textContent) => onUpdateUploadedFile?.(id, { textContent }))
        .catch(() => onUpdateUploadedFile?.(id, { textContent: 'Error reading file' }));

      // 模拟上传进度
      onUpdateUploadedFile?.(id, { uploadStatus: 'uploading' });
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 25 + 10;
        const done = progress >= 100;
        done && clearInterval(interval);
        onUpdateUploadedFile?.(id, {
          uploadStatus: done ? 'complete' : 'uploading',
          uploadProgress: done ? 100 : progress,
        });
      }, 120);
    });
  }, [uploadedFiles.length, maxFiles, maxFileSize, onAddUploadedFile, onUpdateUploadedFile, t]);

  // ── Paste handler ──
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = e.clipboardData;
    const fileItems = Array.from(clipboard.items).filter(item => item.kind === 'file');

    // 粘贴文件
    const hasFiles = fileItems.length > 0 && uploadedFiles.length < maxFiles;
    hasFiles && (() => {
      e.preventDefault();
      const pastedFiles = fileItems.map(item => item.getAsFile()).filter(Boolean) as File[];
      const dt = new DataTransfer();
      pastedFiles.forEach(f => dt.items.add(f));
      handleFileSelect(dt.files);
    })();
    if (hasFiles) return;

    // 粘贴长文本（超过阈值时作为附件卡片处理，避免输入框溢出）
    const textData = clipboard.getData('text');
    const isLongText = textData && textData.length > PASTE_THRESHOLD && pastedContents.length < 5;
    isLongText && (() => {
      e.preventDefault();
      onAddPastedContent?.({
        id: crypto.randomUUID(),
        content: textData,
        timestamp: new Date(),
        wordCount: textData.split(/\s+/).filter(Boolean).length,
      });
    })();
  }, [handleFileSelect, uploadedFiles.length, maxFiles, pastedContents.length, onAddPastedContent, inputValue, updateInputValue]);

  // ── Drag handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    e.dataTransfer.files && handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  // ── Submit ──
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const content = inputValue.trim();
    const hasContent = content || uploadedFiles.length > 0 || pastedContents.length > 0 || nodeAttachments.length > 0;
    !hasContent && (() => {})(); // noop
    if (!hasContent) return;

    // 检查是否还有上传中的文件
    const hasUploading = uploadedFiles.some(f => f.uploadStatus === 'uploading');
    hasUploading && alert(t('ai.waitForUpload'));
    if (hasUploading) return;

    onSend(content, uploadedFiles, pastedContents);
    updateInputValue('', true); // 清空输入框，跳过历史记录
    // 立即清除所有附件预览
    onClearNodeAttachments?.();
    onClearUploadedFiles?.();
    onClearPastedContents?.();
    textareaRef.current && (textareaRef.current.style.height = 'auto');
    textareaRef.current?.focus();
  }, [inputValue, uploadedFiles, pastedContents, nodeAttachments, onSend, onClearNodeAttachments, onClearUploadedFiles, onClearPastedContents, t, updateInputValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Z 撤销 / Ctrl+Shift+Z 重做
    const isUndo = (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey;
    const isRedo = (e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey;
    isUndo && (e.preventDefault(), handleUndo());
    isRedo && (e.preventDefault(), handleRedo());
    (isUndo || isRedo) && e.stopPropagation();

    // Enter发送，Shift+Enter换行；AI生成中禁止发送
    e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), !isLoading && handleSubmit(e));
  }, [handleSubmit, isLoading, handleUndo, handleRedo]);

  // ── Derived state ──
  const hasContent = inputValue.trim() || uploadedFiles.length > 0 || pastedContents.length > 0 || nodeAttachments.length > 0;
  const canSend = hasContent && !disabled && !isLoading && !uploadedFiles.some(f => f.uploadStatus === 'uploading');
  const isDisabled = disabled;
  const totalAttachments = nodeAttachments.length + uploadedFiles.length + pastedContents.length;
  const hasAttachments = totalAttachments > 0;

  return (
    <div
      className={cn('p-3 bg-background relative', className)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖拽覆盖层：文件拖拽 */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex flex-col items-center justify-center pointer-events-none"
          >
            <UploadCloud className="h-6 w-6 text-primary mb-1.5" />
            <p className="text-xs font-medium text-primary">{t('ai.dropFilesHere')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 拖拽覆盖层：画布节点拖入 */}
      <AnimatePresence>
        {isDragOverPanel && !isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-[2px] rounded-xl flex flex-col items-center justify-center pointer-events-none"
          >
            <Paperclip className="h-6 w-6 text-primary mb-1.5" />
            <p className="text-xs font-medium text-primary">{t('ai.dropToAttach')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit}>
        {/* 主输入容器 */}
        <div className="bg-muted/50 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200 flex flex-col">

          {/* 附件预览区（textarea 上方） */}
          <AnimatePresence>
            {hasAttachments && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="overflow-x-auto p-2.5 pb-0 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                  <div className="flex gap-2 items-start">
                    {/* 节点附件 */}
                    {nodeAttachments.map((attachment) => (
                      <NodePreviewCard
                        key={attachment.nodeId}
                        attachment={attachment}
                        onClear={() => onRemoveNodeAttachment?.(attachment.nodeId)}
                      />
                    ))}
                    {/* 粘贴内容 */}
                    {pastedContents.map((content) => (
                      <PastedContentCard
                        key={content.id}
                        content={content}
                        onRemove={(id) => onRemovePastedContent?.(id)}
                      />
                    ))}
                    {/* 上传文件 */}
                    {uploadedFiles.map((file) => (
                      <FilePreviewCard
                        key={file.id}
                        file={file}
                        onRemove={(id) => onRemoveUploadedFile?.(id)}
                      />
                    ))}
                  </div>
                </div>
                {/* 分隔线 */}
                <div className="mx-2.5 mt-1 border-t border-border/30" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => updateInputValue(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder={resolvedPlaceholder}
            disabled={isDisabled}
            className="w-full bg-transparent border-0 resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground/60 min-h-[60px] max-h-[240px] py-3 px-3 pb-1 focus:ring-0 focus:outline-none"
            rows={1}
            autoFocus
          />

          {/* 底部工具栏 */}
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            {/* 左侧：Agent选择器 */}
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-sm font-medium hover:bg-primary/10 flex items-center gap-2 max-w-[256px]"
                    disabled={isLoadingAgents}
                  >
                    <span className="text-foreground truncate">{resolvedAgentName}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[256px] max-h-72 overflow-y-auto">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-1">
                    {t('ai.selectAgent')}
                  </div>
                  {availableAgents.map((agent) => {
                    const isSelected = agent.name === agentName;
                    return (
                      <DropdownMenuItem
                        key={agent.id}
                        onClick={() => onSwitchAgent?.(agent)}
                        className={cn(
                          "text-xs cursor-pointer py-2",
                          isSelected && "bg-primary/10"
                        )}
                      >
                        <div className="flex items-center gap-2 w-full">
                          {/* 选中指示点 */}
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            isSelected ? "bg-primary" : "bg-transparent"
                          )} />
                          <div className={cn(
                            "flex flex-col gap-0.5 min-w-0",
                            !isSelected && "opacity-50"
                          )}>
                            <span className="font-medium truncate">{agent.name}</span>
                            {agent.description && (
                              <span className="text-[10px] text-muted-foreground line-clamp-1">
                                {agent.description}
                              </span>
                            )}
                            {agent.target_node_types && agent.target_node_types.length > 0 && (
                              <span className="text-[10px] text-muted-foreground/70">
                                {t('ai.supports', { types: agent.target_node_types.join(', ') })}
                              </span>
                            )}
                          </div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                  {availableAgents.length === 0 && (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      {t('ai.noAgents')}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* 右侧：节点附件 + 发送按钮 */}
            <div className="flex items-center gap-1">
              {/* 节点选择器 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0"
                    disabled={isDisabled || availableNodes.length === 0}
                    title={t('ai.addNode')}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 max-h-72 overflow-y-auto">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-1">
                    {t('ai.selectNode')}
                  </div>
                  {availableNodes.length === 0 && (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      {t('ai.noAvailableNodes')}
                    </div>
                  )}
                  {availableNodes.map((node) => {
                    const cfg = NODE_TYPE_ICONS[node.type || ''] ?? DEFAULT_NODE_ICON;
                    const Icon = cfg.icon;
                    const nodeData = node.data as Record<string, unknown>;
                    const label = (nodeData.title || nodeData.name || nodeData.description || `${cfg.label} ${node.id.slice(0, 6)}`) as string;
                    const excerpt = ((nodeData.description || '') as string).slice(0, 60);
                    return (
                      <DropdownMenuItem
                        key={node.id}
                        className="text-xs cursor-pointer py-2"
                        onClick={() => {
                          onAddNodeAttachment?.(extractNodeAttachment(node));
                        }}
                      >
                        <div className="flex items-center gap-2 w-full min-w-0">
                          <Icon className={cn('h-4 w-4 shrink-0', cfg.color)} />
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="font-medium truncate">{label}</span>
                            {excerpt && (
                              <span className="text-[10px] text-muted-foreground line-clamp-1">{excerpt}</span>
                            )}
                          </div>
                          <span className="text-[9px] text-muted-foreground/70 shrink-0">{cfg.label}</span>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 发送 / 停止生成 按钮 */}
              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  onClick={onStop}
                  className="h-8 w-8 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm hover:shadow-md transition-all duration-200"
                  title={t('ai.stopGenerating')}
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend || isDisabled}
                  className={cn(
                    'h-8 w-8 rounded-lg transition-all duration-200',
                    !canSend || isDisabled
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md'
                  )}
                  title={t('ai.send')}
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* 隐藏文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFileSelect(e.target.files);
          e.target && (e.target.value = '');
        }}
      />
    </div>
  );
}
