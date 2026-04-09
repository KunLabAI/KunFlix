import React, { memo, useState, useRef } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, Upload, AlertCircle, RefreshCw, Music } from 'lucide-react';
import { useCanvasStore, AudioNodeData, CanvasNode } from '@/store/useCanvasStore';
import { useResourceStore } from '@/store/useResourceStore';
import { NodeToolbar, ToolbarAction } from './NodeToolbar';
import { v4 as uuidv4 } from 'uuid';

const AudioNode = ({ id, data, selected }: NodeProps<Node<AudioNodeData>>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const { getNode } = useReactFlow();

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(data.name || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (confirm("确定要删除这张音频卡吗？")) {
      deleteNode(id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (node) {
      const currentData = node.data as AudioNodeData;
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
          name: currentData.name ? `${currentData.name} (副本)` : '未命名音频卡 (副本)',
          uploading: false,
        },
      };
      addNode(newNode);
    }
  };

  const handleUploadClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size (100MB max for audio)
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/flac', 'audio/aac', 'audio/x-m4a'];
    if (!validTypes.includes(file.type)) {
      setUploadError('仅支持 mp3、wav、ogg、flac、aac、m4a 格式');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setUploadError('音频大小不能超过 100MB');
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
      setUploadError(error.message || '上传失败，请重试');
      updateNodeData(id, { uploading: false });
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isUploading = data.uploading;

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
        aria-label="选择音频"
        data-testid="file-upload-input"
      />

      <div 
        ref={nodeRef}
        className={`audio-node-wrapper w-full h-full flex flex-col group relative ${isUploading ? 'nodrag' : ''}`}
      >
        {/* 标题悬浮在卡片上方 */}
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
                placeholder="未命名音频卡"
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
                {data.name || '未命名音频卡'}
              </h3>
            )}
          </div>
        </div>

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : 'border border-border/50'} overflow-hidden relative z-[2]`}>
          <CardContent 
            className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-4 overflow-hidden" 
          >
            {!data.audioUrl && !isUploading && !uploadError && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Music className="w-6 h-6 text-amber-500" />
                </div>
                <Button 
                  onClick={handleUploadClick} 
                  variant="default" 
                  role="button" 
                  aria-label="上传音频"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleUploadClick();
                    }
                  }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  上传音频
                </Button>
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
                  aria-label="重试上传"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleUploadClick();
                    }
                  }}
                >
                  <RefreshCw className="w-3 h-3 mr-2" /> 重试
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 工具条 */}
        <NodeToolbar
          actions={[
            {
              icon: <Copy className="h-3.5 w-3.5" />,
              onClick: handleDuplicate,
              title: '创建副本',
            },
            {
              icon: <Trash2 className="h-3.5 w-3.5" />,
              onClick: handleDelete,
              title: '删除',
              variant: 'danger',
            },
          ] as ToolbarAction[]}
        />

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
    </>
  );
};

export default memo(AudioNode);
