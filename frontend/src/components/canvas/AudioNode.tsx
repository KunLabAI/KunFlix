import React, { memo, useState, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, Upload, AlertCircle, RefreshCw, Music, ChevronDown, Headphones, Quote, Plus, FolderOpen, Loader2, X } from 'lucide-react';
import { useCanvasStore, AudioNodeData, CanvasNode } from '@/store/useCanvasStore';
import { useResourceStore } from '@/store/useResourceStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import NodeEffectOverlay from './NodeEffectOverlay';
import { NodeToolbar, ToolbarAction } from './NodeToolbar';
import { v4 as uuidv4 } from 'uuid';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const AudioNode = ({ id, data, selected }: NodeProps<Node<AudioNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const { getNode } = useReactFlow();

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(data.name || '');
  const [showLyrics, setShowLyrics] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Sync external title changes
  React.useEffect(() => {
    if (!isEditingTitle) {
      setEditTitle(data.name || '');
    }
  }, [data.name, isEditingTitle]);

  // Click outside to save title
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isEditingTitle && inputRef.current && !inputRef.current.contains(e.target as globalThis.Node)) {
        updateNodeData(id, { name: editTitle });
        setIsEditingTitle(false);
      }
    };
    
    if (isEditingTitle) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditingTitle, editTitle, id, updateNodeData]);

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingTitle(true);
    setEditTitle(data.name || '');
  };

  const handleTitleFinishEdit = () => {
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Escape') {
      handleTitleFinishEdit();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('canvas.node.deleteConfirm.audio'))) {
      deleteNode(id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (node) {
      const currentData = node.data as AudioNodeData;
      const currentName = currentData.name || t('canvas.node.unnamedAudioCard');
      const newNode: CanvasNode = {
        ...(node as CanvasNode),
        id: `audio-${uuidv4()}`,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: false,
        data: {
          ...currentData,
          name: t('canvas.node.copySuffix', { name: currentName }),
          uploading: false,
        },
      };
      addNode(newNode);
    }
  };

  const handleUploadClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    fileInputRef.current?.click();
  };

  const handleAddClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(prev => !prev);
  };

  const handlePickFromLibrary = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    setShowAssetPicker(true);
    useResourceStore.getState().fetchAssets({ pageSize: 100, typeFilter: 'audio' });
  };

  const handleSelectAsset = (assetUrl: string) => {
    updateNodeData(id, { audioUrl: assetUrl, uploading: false } as Partial<AudioNodeData>);
    setShowAssetPicker(false);
  };

  // 添加菜单级联按钮失焦关闭
  React.useEffect(() => {
    if (!showAddMenu) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        addMenuRef.current && !addMenuRef.current.contains(target) &&
        !target.closest('[data-node-toolbar]')
      ) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showAddMenu]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size (100MB max for audio)
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/flac', 'audio/aac', 'audio/x-m4a'];
    if (!validTypes.includes(file.type)) {
      setUploadError(t('canvas.node.upload.audioFormatError'));
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setUploadError(t('canvas.node.upload.audioSizeError'));
      return;
    }

    setUploadError(null);
    setUploadProgress(0);
    
    // Set local preview & uploading state
    const objectUrl = URL.createObjectURL(file);
    updateNodeData(id, { audioUrl: objectUrl, uploading: true } as Partial<AudioNodeData>);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/upload');
      
      const token = localStorage.getItem('access_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(percentComplete);
        }
      };

      const formData = new FormData();
      formData.append('file', file);

      const response = await new Promise<{ url?: string; error?: string; asset?: Record<string, unknown> }>((resolve, reject) => {
        xhr.onload = () => {
          try {
            let res;
            if (xhr.responseText) {
              res = JSON.parse(xhr.responseText);
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(res || {});
            } else {
              resolve({ error: res?.error || `上传失败 (HTTP ${xhr.status})` });
            }
          } catch (err) {
            resolve({ error: `解析响应失败: ${xhr.status} ${xhr.statusText}` });
          }
        };
        xhr.onerror = () => reject(new Error('网络请求失败或跨域错误'));
        xhr.send(formData);
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Success: 更新节点数据并同步到资源库
      updateNodeData(id, { audioUrl: response.url, uploading: false } as Partial<AudioNodeData>);
      
      // 同步新资源到 resourceStore
      response.asset && useResourceStore.getState().syncAssetFromUpload(response.asset);
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadError(error.message || t('canvas.node.upload.uploadFailed'));
      updateNodeData(id, { uploading: false });
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isUploading = data.uploading;

  const handleReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 确保 audioUrl 是完整的 /api/media/ 路径
    let audioUrl = data.audioUrl || '';
    const needsPrefix = audioUrl && !audioUrl.startsWith('http') && !audioUrl.startsWith('/api/media/') && !audioUrl.startsWith('data:');
    needsPrefix && (audioUrl = `/api/media/${audioUrl}`);
    
    // 检查节点是否已在附件中
    const store = useAIAssistantStore.getState();
    const isReferenced = store.nodeAttachments.some(a => a.nodeId === id);
    
    if (isReferenced) {
      // 已引用则撤销引用
      store.removeNodeAttachment(id);
    } else {
      // 未引用则添加引用
      store.addNodeAttachment({
        nodeId: id,
        nodeType: 'audio',
        label: data.name || t('canvas.node.unnamedAudioCard'),
        excerpt: data.description || '',
        thumbnailUrl: audioUrl,
        meta: {},
      });
      store.setIsOpen(true);
    }
  };

  // 检查节点是否已被引用
  const isReferenced = useAIAssistantStore((state) => state.nodeAttachments.some(a => a.nodeId === id));

  return (
    <>
      <NodeResizer 
        color="#6d6d6d" 
        isVisible={selected} 
        minWidth={280}
        minHeight={120}
        lineStyle={{ display: 'none' }}
        handleStyle={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '4px',
          border: '1px solid #6d6d6d',
          background: '#fff',
          opacity: selected ? 1 : 0,
          transition: 'opacity 0.2s'
        }}
      />
      
      {/* 隐藏的文件输入 */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".mp3,.wav,.ogg,.flac,.aac,.m4a" 
        onChange={handleFileChange}
        aria-label={t('canvas.node.upload.uploadAudio')}
        data-testid="file-upload-input"
      />

      <div 
        ref={nodeRef}
        className={`audio-node-wrapper w-full h-full flex flex-col group relative ${isUploading ? 'nodrag' : ''}`}
      >
        <NodeEffectOverlay nodeId={id} />
        <div className="absolute bottom-full left-0 right-0 mb-1 px-1 flex items-center justify-between gap-2 min-h-[28px] nodrag">
          <div className="flex-1 min-w-0 flex items-center">
            {isEditingTitle ? (
              <Input
                ref={inputRef}
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  updateNodeData(id, { name: e.target.value });
                }}
                className="font-bold text-sm h-7 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 focus:outline-none px-0 shadow-none cursor-text select-text rounded-none leading-none"
                placeholder={t('canvas.node.unnamedAudioCard')}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={handleTitleKeyDown}
                autoFocus
              />
            ) : (
              <h3 
                className="font-bold text-sm h-7 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none" 
                title={data.name} 
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={handleTitleDoubleClick}
              >
                <Headphones className="w-4 h-4 text-amber-500 mr-2 shrink-0" />
                {data.name || t('canvas.node.unnamedAudioCard')}
              </h3>
            )}
          </div>
        </div>

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : ''} overflow-hidden relative z-[2]`}>
          <CardContent 
            className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-4 overflow-hidden" 
          >
            {!data.audioUrl && !isUploading && !uploadError && (
              <div className="flex flex-col items-center justify-center gap-1 py-8">
                <Headphones className="w-10 h-10 text-muted-foreground/30" />
              </div>
            )}

            {data.audioUrl && (
              <div className="w-full flex flex-col items-center gap-3 p-2">
                <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Music className="w-7 h-7 text-amber-500" />
                </div>
                <audio 
                  src={data.audioUrl} 
                  controls
                  className="w-full nodrag" 
                  onPointerDown={(e) => e.stopPropagation()}
                  preload="metadata"
                />
                {data.lyrics && (
                  <div className="w-full nodrag">
                    <button
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      onClick={() => setShowLyrics(!showLyrics)}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <ChevronDown className={`h-3 w-3 transition-transform ${showLyrics ? 'rotate-180' : ''}`} />
                      {showLyrics ? t('canvas.node.audio.hideLyrics') : t('canvas.node.audio.showLyrics')}
                    </button>
                    {showLyrics && (
                      <div className="mt-1.5 p-2 rounded bg-muted/50 text-[11px] text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
                        {data.lyrics}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {isUploading && (
              <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 p-4">
                <div className="w-full max-w-[200px] h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 ease-linear" 
                    style={{ width: `${uploadProgress}%` }}
                    data-testid="upload-progress-bar"
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground mt-3">
                  {Math.round(uploadProgress)}%
                </span>
              </div>
            )}

            {uploadError && !isUploading && (
              <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center z-10 p-4 text-center gap-3">
                <div className="text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">{uploadError}</span>
                </div>
                <Button 
                  onClick={handleUploadClick} 
                  variant="outline" 
                  size="sm" 
                  role="button" 
                  aria-label={t('canvas.node.upload.retry')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleUploadClick();
                    }
                  }}
                >
                  <RefreshCw className="w-3 h-3 mr-2" /> {t('canvas.node.upload.retry')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 工具条 */}
        <NodeToolbar
          className={showAddMenu ? '!opacity-100 !pointer-events-auto !translate-y-0' : undefined}
          actions={[
            {
              icon: <Quote className="h-3.5 w-3.5" />,
              onClick: handleReference,
              title: isReferenced ? t('canvas.node.toolbar.unreference') : t('canvas.node.toolbar.reference'),
              variant: isReferenced ? 'primary' : undefined,
            },
            {
              icon: <Plus className="h-3.5 w-3.5" />,
              onClick: handleAddClick,
              title: t('canvas.node.upload.addAudio'),
            },
            {
              icon: <Copy className="h-3.5 w-3.5" />,
              onClick: handleDuplicate,
              title: t('canvas.node.toolbar.duplicate'),
            },
            {
              icon: <Trash2 className="h-3.5 w-3.5" />,
              onClick: handleDelete,
              title: t('canvas.node.toolbar.delete'),
              variant: 'danger',
            },
          ] as ToolbarAction[]}
        />

        {/* 添加音频级联按钮 */}
        {showAddMenu && (
          <div
            ref={addMenuRef}
            className="absolute left-1/2 -translate-x-1/2 flex items-center bg-background/95 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 shadow-lg pointer-events-auto nodrag animate-in fade-in zoom-in-95 duration-150 z-30"
            style={{ bottom: '-100px' }}
          >
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              onClick={(e) => { e.stopPropagation(); handleUploadClick(e); }}
              title={t('canvas.node.upload.uploadAudio')}
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-border/50" />
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              onClick={(e) => { e.stopPropagation(); handlePickFromLibrary(e); }}
              title={t('canvas.node.upload.fromLibrary')}
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right Edge */}
        <div className="edge-handle-wrapper right group/handle pointer-events-auto">
          <Handle type="target" position={Position.Right} id="right-target" />
          <Handle type="source" position={Position.Right} id="right-source" />
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
        </div>

        {/* Left Edge */}
        <div className="edge-handle-wrapper left group/handle pointer-events-auto">
          <Handle type="target" position={Position.Left} id="left-target" />
          <Handle type="source" position={Position.Left} id="left-source" />
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
        </div>
      </div>

      {/* 资产库选择弹窗 */}
      {showAssetPicker && typeof document !== 'undefined' && createPortal(
        <AudioAssetPickerDialog
          currentUrl={data.audioUrl || ''}
          onSelect={handleSelectAsset}
          onClose={() => setShowAssetPicker(false)}
          t={t}
        />,
        document.body
      )}
    </>
  );
};

export default memo(AudioNode);

// ============================================================
// 子组件：音频资产库选择弹窗
// ============================================================
interface AudioAssetPickerDialogProps {
  currentUrl: string;
  onSelect: (url: string) => void;
  onClose: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function AudioAssetPickerDialog({ currentUrl, onSelect, onClose, t }: AudioAssetPickerDialogProps) {
  const assets = useResourceStore((s) => s.assets);
  const isLoading = useResourceStore((s) => s.isLoading);
  const audioAssets = useMemo(() => assets.filter(a => a.file_type === 'audio'), [assets]);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { e.key === 'Escape' && onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border/50 rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden shadow-xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold">{t('canvas.node.upload.fromLibrary')}</span>
          </div>
          <button
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && audioAssets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Music className="w-10 h-10 mb-3 opacity-20" />
              <span className="text-sm">{t('sidebar.noAudio')}</span>
            </div>
          )}

          {!isLoading && audioAssets.length > 0 && (
            <div className="flex flex-col gap-2">
              {audioAssets.map((asset) => {
                const isSelected = currentUrl === asset.url;
                return (
                  <button
                    key={asset.id}
                    disabled={isSelected}
                    onClick={() => onSelect(asset.url)}
                    className={`relative flex items-center gap-3 rounded-lg border p-3 transition-all ${
                      isSelected
                        ? 'opacity-40 cursor-not-allowed border-border/30'
                        : 'border-border/50 hover:border-amber-500/60 hover:ring-1 hover:ring-amber-500/30 cursor-pointer'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Music className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <span className="text-sm font-medium truncate block">
                        {asset.original_name || asset.filename}
                      </span>
                      {asset.duration && (
                        <span className="text-[11px] text-muted-foreground">
                          {Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-medium text-muted-foreground">{t('canvas.node.upload.alreadyAdded')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
