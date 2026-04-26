'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Settings2, Send, Sparkles, Zap, ChevronDown, Square, XCircle, ArrowRight, Paperclip, ImageIcon, Film, Music, X, UserRound, Check } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  useVideoModels,
  useVideoModelCapabilities,
  useVideoFormVisibility,
  useVirtualHumanPresets,
  useVideoProviders,
  VIDEO_MODE_LABELS,
  RESOLUTION_LABELS,
  ASPECT_RATIO_LABELS,
  type VideoCreateParams,
} from '@/hooks/useVideoGeneration';
import type { CanvasNode, CharacterNodeData, VideoNodeData, AudioNodeData, VideoGenHistoryEntry } from '@/store/useCanvasStore';
import RefTagInput, { type RefTagInputRef, type RefImage, type RefType } from './RefTagInput';

// ---------------------------------------------------------------------------
// Provider logo mapping
// ---------------------------------------------------------------------------

const PROVIDER_ICONS: Record<string, string> = {
  openai: '/provider/openai.svg',
  azure: '/provider/azureai-color.svg',
  dashscope: '/provider/qwen-color.svg',
  anthropic: '/provider/claude-color.svg',
  gemini: '/provider/gemini-color.svg',
  deepseek: '/provider/deepseek-color.svg',
  minimax: '/provider/minimax-color.svg',
  xai: '/provider/grok.svg',
  doubao: '/provider/doubao-color.svg',
  kling: '/provider/kling-color.svg',
  meta: '/provider/meta-color.svg',
  microsoft: '/provider/microsoft-color.svg',
  openrouter: '/provider/openrouter.svg',
  sora: '/provider/sora-color.svg',
  ark: '/provider/volcengine-color.svg',
};

// ---------------------------------------------------------------------------
// Props — parent (VideoNode) owns task state
// ---------------------------------------------------------------------------

export interface VideoGeneratePanelProps {
  onSubmit: (params: VideoCreateParams) => void;
  onStop: () => void;
  isSubmitting: boolean;
  taskActive: boolean;
  taskDone: boolean;
  taskFailed: boolean;
  taskError?: string | null;
  submitError?: string | null;
  hasExistingVideo: boolean;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
  canvasNodes?: CanvasNode[];
  /** Pre-fill form from history entry (e.g. drag from history) */
  initialConfig?: Partial<VideoGenHistoryEntry> | null;
}

// ---------------------------------------------------------------------------
// Helper: extract image URL from a canvas image node
// ---------------------------------------------------------------------------

function getImageNodeUrl(node: CanvasNode): string | null {
  const data = node.data as CharacterNodeData;
  let url: string | null = (data.images && data.images[0]) || data.imageUrl || null;
  url && !url.startsWith('http') && !url.startsWith('/api/media/') && !url.startsWith('data:') && (url = `/api/media/${url}`);
  return url;
}

function getVideoNodeUrl(node: CanvasNode): string | null {
  const data = node.data as VideoNodeData;
  let url: string | null = data.videoUrl || null;
  url && !url.startsWith('http') && !url.startsWith('/api/media/') && !url.startsWith('data:') && (url = `/api/media/${url}`);
  return url;
}

function getAudioNodeUrl(node: CanvasNode): string | null {
  const data = node.data as AudioNodeData;
  let url: string | null = data.audioUrl || null;
  url && !url.startsWith('http') && !url.startsWith('/api/media/') && !url.startsWith('data:') && (url = `/api/media/${url}`);
  return url;
}

// Node picker mode determined by videoMode
type PickerMode = 'none' | 'single_image' | 'first_last_frame' | 'multi_image' | 'video';
const PICKER_MODE_MAP: Record<string, PickerMode> = {
  text_to_video: 'none',
  image_to_video: 'first_last_frame',
  reference_images: 'multi_image',
  edit: 'video',
  video_extension: 'video',
};
const DEFAULT_MAX_REFS = 5;

// ---------------------------------------------------------------------------
// Compact toggle switch
// ---------------------------------------------------------------------------

function ToggleSwitch({
  checked,
  onChange,
  label,
  icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        {icon}
        {label}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-3 w-3 rounded-full bg-background shadow-sm transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Native select styling
// ---------------------------------------------------------------------------

const SELECT_CLS =
  'w-full h-7 rounded-md border border-border/50 bg-background px-2 text-[11px] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring';

const SELECT_ARROW_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 6px center',
  paddingRight: '20px',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VideoGeneratePanel({
  onSubmit,
  onStop,
  isSubmitting,
  taskActive,
  taskDone,
  taskFailed,
  taskError,
  submitError,
  hasExistingVideo,
  onApplyToNode,
  onApplyToNextNode,
  canvasNodes = [],
  initialConfig,
}: VideoGeneratePanelProps) {
  const { t } = useTranslation();

  // Data
  const { models, isLoading: modelsLoading } = useVideoModels();
  const { providers } = useVideoProviders();

  // Model dropdown state
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Form state
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const configRef = useRef<HTMLDivElement>(null);

  // Config state
  const [videoMode, setVideoMode] = useState('text_to_video');
  const [imageUrl, setImageUrl] = useState('');
  const [lastFrameImageUrl, setLastFrameImageUrl] = useState('');
  const [referenceImages, setReferenceImages] = useState<RefImage[]>([]);
  const [extensionVideoUrl, setExtensionVideoUrl] = useState('');
  const [duration, setDuration] = useState(6);
  const [quality, setQuality] = useState('720p');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [promptOptimizer, setPromptOptimizer] = useState(true);
  const [fastPretreatment, setFastPretreatment] = useState(false);

  // Derived
  const selectedModel = models.find((m) => `${m.provider_id}::${m.model_name}` === selectedModelKey) || null;
  const { capabilities } = useVideoModelCapabilities(selectedModel?.model_name || null);
  const visibility = useVideoFormVisibility(capabilities, videoMode);

  // Auto-correct params when capabilities change
  useEffect(() => {
    const caps = capabilities;
    caps &&
      (() => {
        !caps.modes.includes(videoMode) && setVideoMode(caps.modes[0]);
        !caps.resolutions.includes(quality) && setQuality(caps.resolutions[0]);
        !caps.durations.includes(duration) && setDuration(caps.durations[0]);
        !caps.aspect_ratios.includes(aspectRatio) && setAspectRatio(caps.aspect_ratios[0]);
      })();
  }, [capabilities]);

  // Clear attachments when switching modes
  useEffect(() => {
    videoMode === 'text_to_video' && (setImageUrl(''), setLastFrameImageUrl(''), setReferenceImages([]), setExtensionVideoUrl(''));
    videoMode === 'image_to_video' && (setReferenceImages([]), setExtensionVideoUrl(''));
    videoMode === 'reference_images' && (setImageUrl(''), setLastFrameImageUrl(''), setExtensionVideoUrl(''));
    (videoMode === 'edit' || videoMode === 'video_extension') && (setReferenceImages([]), setImageUrl(''), setLastFrameImageUrl(''));
  }, [videoMode]);

  // Click outside closes config
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      configRef.current && !configRef.current.contains(e.target as HTMLElement) && setShowConfig(false);
    };
    showConfig && document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showConfig]);

  // Apply initialConfig once when models are available
  const appliedInitRef = useRef(false);
  useEffect(() => {
    const cfg = initialConfig;
    (cfg && models.length > 0 && !appliedInitRef.current) && (() => {
      appliedInitRef.current = true;
      cfg.prompt && setPrompt(cfg.prompt);
      // Restore model selection
      const modelKey = cfg.provider_id && cfg.model
        ? `${cfg.provider_id}::${cfg.model}`
        : (models.find(m => m.model_name === cfg.model) ?? null);
      const resolvedKey = typeof modelKey === 'string'
        ? modelKey
        : modelKey ? `${modelKey.provider_id}::${modelKey.model_name}` : '';
      resolvedKey && models.some(m => `${m.provider_id}::${m.model_name}` === resolvedKey) && setSelectedModelKey(resolvedKey);
      cfg.video_mode && setVideoMode(cfg.video_mode);
      cfg.duration && setDuration(cfg.duration);
      cfg.quality && setQuality(cfg.quality);
      cfg.aspect_ratio && setAspectRatio(cfg.aspect_ratio);
    })();
  }, [initialConfig, models]);

  // Node picker state
  const [showNodePicker, setShowNodePicker] = useState(false);
  const nodePickerRef = useRef<HTMLDivElement>(null);

  // Virtual human presets
  const { presets: vhPresets, isSeedance } = useVirtualHumanPresets(selectedModel?.model_name || null);
  const [showVhPicker, setShowVhPicker] = useState(false);
  const vhPickerRef = useRef<HTMLDivElement>(null);
  const showVhButton = isSeedance && (videoMode === 'reference_images' || videoMode === 'image_to_video');

  // Picker mode based on current video mode
  const pickerMode: PickerMode = PICKER_MODE_MAP[videoMode] || 'none';

  // Available nodes from canvas
  const imageNodes = useMemo(
    () => canvasNodes.filter((n) => n.type === 'image' && getImageNodeUrl(n)),
    [canvasNodes],
  );
  const videoNodes = useMemo(
    () => canvasNodes.filter((n) => n.type === 'video' && getVideoNodeUrl(n)),
    [canvasNodes],
  );
  const audioNodes = useMemo(
    () => canvasNodes.filter((n) => n.type === 'audio' && getAudioNodeUrl(n)),
    [canvasNodes],
  );

  // Per-type limits from capabilities
  const maxRefImages = capabilities?.max_reference_images ?? DEFAULT_MAX_REFS;
  const supportsRefVideos = capabilities?.supports_reference_videos ?? false;
  const supportsRefAudios = capabilities?.supports_reference_audios ?? false;
  const maxRefVideos = capabilities?.max_reference_videos ?? 0;
  const maxRefAudios = capabilities?.max_reference_audios ?? 0;
  const maxTotalRefs = maxRefImages + maxRefVideos + maxRefAudios;

  // Ref counts by type
  const imageRefCount = referenceImages.filter(r => r.refType === 'image').length;
  const videoRefCount = referenceImages.filter(r => r.refType === 'video').length;
  const audioRefCount = referenceImages.filter(r => r.refType === 'audio').length;

  // Nodes to show in picker — multi_image shows mixed types for Seedance
  const pickerNodes = useMemo(() => {
    const isMulti = pickerMode === 'multi_image';
    const isVid = pickerMode === 'video';
    const nodes = isVid ? videoNodes : isMulti ? [
      ...imageNodes,
      ...(supportsRefVideos ? videoNodes : []),
      ...(supportsRefAudios ? audioNodes : []),
    ] : imageNodes;
    return nodes;
  }, [pickerMode, imageNodes, videoNodes, audioNodes, supportsRefVideos, supportsRefAudios]);

  const hasPickerSelection =
    (pickerMode === 'single_image' && !!imageUrl) ||
    (pickerMode === 'first_last_frame' && !!imageUrl && !!lastFrameImageUrl) ||
    (pickerMode === 'multi_image' && referenceImages.length > 0) ||
    (pickerMode === 'video' && !!extensionVideoUrl);

  // Click outside closes node picker
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      nodePickerRef.current && !nodePickerRef.current.contains(e.target as HTMLElement) && setShowNodePicker(false);
    };
    showNodePicker && document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showNodePicker]);

  // Click outside closes virtual human picker
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      vhPickerRef.current && !vhPickerRef.current.contains(e.target as HTMLElement) && setShowVhPicker(false);
    };
    showVhPicker && document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showVhPicker]);

  // Select a virtual human preset (always image type)
  const handleSelectVhPreset = (preset: typeof vhPresets[number]) => {
    imageRefCount >= maxRefImages && (void 0);
    imageRefCount < maxRefImages && (() => {
      setReferenceImages((prev) => [...prev, {
        url: preset.asset_uri,
        name: preset.name,
        refType: 'image' as RefType,
        previewUrl: preset.preview_url,
      }]);
      // Auto-switch to reference_images mode when adding a virtual human in image_to_video mode
      videoMode === 'image_to_video' && setVideoMode('reference_images');
      inputRef.current?.insertTag(imageRefCount + 1, preset.name);
      imageRefCount + 1 >= maxRefImages && setShowVhPicker(false);
    })();
  };

  // Ref to the rich input for inserting tags programmatically
  const inputRef = useRef<RefTagInputRef>(null);

  // Remove a reference and clean up type-specific tags in prompt, then renumber
  const TAG_PREFIX_MAP: Record<RefType, string> = { image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO' };
  const handleRemoveRefImage = (removeIdx: number) => {
    const removedRef = referenceImages[removeIdx];
    const newRefs = referenceImages.filter((_, i) => i !== removeIdx);
    setReferenceImages(newRefs);
    const removedType = removedRef.refType;
    const prefix = TAG_PREFIX_MAP[removedType];
    const typeIdx = referenceImages.slice(0, removeIdx).filter(r => r.refType === removedType).length + 1;
    const totalOfType = referenceImages.filter(r => r.refType === removedType).length;
    let updated = prompt;
    updated = updated.replace(new RegExp(`<${prefix}_${typeIdx}>`, 'g'), '');
    for (let i = totalOfType; i > typeIdx; i--) {
      updated = updated.replace(new RegExp(`<${prefix}_${i}>`, 'g'), `<${prefix}_${i - 1}>`);
    }
    updated = updated.replace(/  +/g, ' ').trim();
    setPrompt(updated);
  };

  const handleSelectNode = (node: CanvasNode) => {
    const data = node.data as Record<string, unknown>;
    const nodeName = (data.name as string) || node.id.slice(0, 8);
    // single_image: set imageUrl
    pickerMode === 'single_image' && (() => {
      const url = getImageNodeUrl(node);
      url && setImageUrl(url);
      setShowNodePicker(false);
    })();
    // first_last_frame: fill first frame first, then last frame
    pickerMode === 'first_last_frame' && (() => {
      const url = getImageNodeUrl(node);
      url && (!imageUrl
        ? setImageUrl(url)
        : (setLastFrameImageUrl(url), setShowNodePicker(false)));
    })();
    // multi_image: append to referenceImages — supports image/video/audio node types
    pickerMode === 'multi_image' && (() => {
      const nt = node.type as string;
      const urlMap: Record<string, () => string | null> = {
        image: () => getImageNodeUrl(node),
        video: () => getVideoNodeUrl(node),
        audio: () => getAudioNodeUrl(node),
      };
      const limitMap: Record<string, [number, number]> = {
        image: [imageRefCount, maxRefImages],
        video: [videoRefCount, maxRefVideos],
        audio: [audioRefCount, maxRefAudios],
      };
      const refType = (nt === 'video' ? 'video' : nt === 'audio' ? 'audio' : 'image') as RefType;
      const url = urlMap[nt]?.() ?? getImageNodeUrl(node);
      const [count, max] = limitMap[nt] ?? [imageRefCount, maxRefImages];
      url && count < max && (() => {
        setReferenceImages((prev) => [...prev, { url, name: nodeName, refType }]);
        // Insert type-specific tag: <IMAGE_N>, <VIDEO_N>, or <AUDIO_N>
        inputRef.current?.insertTag(count + 1, nodeName, refType);
      })();
      referenceImages.length + 1 >= maxTotalRefs && setShowNodePicker(false);
    })();
    // video: set extensionVideoUrl
    pickerMode === 'video' && (() => {
      const url = getVideoNodeUrl(node);
      url && setExtensionVideoUrl(url);
      setShowNodePicker(false);
    })();
  };

  const canSubmit = !!selectedModel && prompt.trim().length > 0 && !isSubmitting && !taskActive;

  const handleModelChange = (key: string) => {
    setSelectedModelKey(key);
    setVideoMode('text_to_video');
    setDuration(6);
    setQuality('720p');
    setImageUrl('');
    setLastFrameImageUrl('');
    setReferenceImages([]);
    setExtensionVideoUrl('');
  };

  const handleSubmit = () => {
    const m = selectedModel;
    const isRef = videoMode === 'reference_images';
    const imgRefs = referenceImages.filter(r => r.refType === 'image');
    const vidRefs = referenceImages.filter(r => r.refType === 'video');
    const audRefs = referenceImages.filter(r => r.refType === 'audio');
    m &&
      onSubmit({
        provider_id: m.provider_id,
        model: m.model_name,
        video_mode: videoMode,
        prompt: prompt.trim(),
        image_url: visibility.showFirstFrame ? imageUrl || undefined : undefined,
        last_frame_image: visibility.showLastFrame ? lastFrameImageUrl || undefined : undefined,
        reference_images: isRef && imgRefs.length > 0
          ? imgRefs.map((ref) => ({ url: ref.url }))
          : undefined,
        reference_videos: isRef && vidRefs.length > 0
          ? vidRefs.map((ref) => ({ url: ref.url }))
          : undefined,
        reference_audios: isRef && audRefs.length > 0
          ? audRefs.map((ref) => ({ url: ref.url }))
          : undefined,
        extension_video_url: (videoMode === 'edit' || videoMode === 'video_extension') && extensionVideoUrl
          ? extensionVideoUrl
          : undefined,
        config: {
          duration,
          quality,
          aspect_ratio: aspectRatio,
          prompt_optimizer: visibility.showPromptOptimizer ? promptOptimizer : undefined,
          fast_pretreatment: visibility.showFastPretreatment ? fastPretreatment : undefined,
        },
      });
  };

  // Click outside closes model dropdown
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as HTMLElement) && setShowModelDropdown(false);
    };
    showModelDropdown && document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showModelDropdown]);

  // Group models by provider for the dropdown
  const groupedModels = useMemo(() => {
    const groups: { providerName: string; providerId: string; providerType: string; models: typeof models }[] = [];
    for (const p of providers) {
      const pModels = models.filter(m => m.provider_id === p.id);
      pModels.length > 0 && groups.push({ providerName: p.name, providerId: p.id, providerType: p.provider_type, models: pModels });
    }
    // Include any models not matched to a provider
    const coveredIds = new Set(providers.map(p => p.id));
    const orphans = models.filter(m => !coveredIds.has(m.provider_id));
    orphans.length > 0 && groups.push({ providerName: 'Other', providerId: '__other__', providerType: '', models: orphans });
    return groups;
  }, [models, providers]);

  const handleModelSelect = useCallback((key: string) => {
    handleModelChange(key);
    setShowModelDropdown(false);
  }, []);

  // Resolve current provider logo for the trigger button
  const selectedProviderType = useMemo(() => {
    const group = groupedModels.find(g => g.models.some(m => `${m.provider_id}::${m.model_name}` === selectedModelKey));
    return group?.providerType || '';
  }, [groupedModels, selectedModelKey]);
  const selectedProviderLogo = PROVIDER_ICONS[selectedProviderType] || '';



  return (
    <div className="w-full space-y-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {/* Main input container — MessageInput style */}
      <div className="bg-muted/50 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200 flex flex-col">
        {/* Attachment previews — image(s) or video */}
        {/* Single image (non-first_last_frame modes) */}
        {pickerMode === 'single_image' && imageUrl && (
          <div className="px-3 pt-2.5 pb-0">
            <div className="relative inline-block group/imgpreview">
              <img src={imageUrl} alt="Reference" className="h-16 w-16 rounded-lg object-cover border border-border/50" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <button type="button" onClick={() => setImageUrl('')} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/imgpreview:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground">
                <X className="h-2.5 w-2.5" />
              </button>
              <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-black/60 text-white backdrop-blur-sm">
                {t('canvas.node.video.firstFrameImage')}
              </div>
            </div>
          </div>
        )}

        {/* First + Last frame preview for image_to_video */}
        {pickerMode === 'first_last_frame' && imageUrl && (
          <div className="px-3 pt-2.5 pb-0 flex items-center gap-1.5">
            {/* First frame */}
            <div className="relative inline-block group/firstframe">
              <img src={imageUrl} alt="First frame" className="h-16 w-16 rounded-lg object-cover border border-border/50" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <button type="button" onClick={() => { setImageUrl(''); setLastFrameImageUrl(''); }} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/firstframe:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground">
                <X className="h-2.5 w-2.5" />
              </button>
              <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-semibold bg-emerald-600/80 text-white backdrop-blur-sm">
                {t('canvas.node.video.firstFrame')}
              </div>
            </div>
            {/* Arrow connector */}
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            {/* Last frame or placeholder */}
            {lastFrameImageUrl ? (
              <div className="relative inline-block group/lastframe">
                <img src={lastFrameImageUrl} alt="Last frame" className="h-16 w-16 rounded-lg object-cover border border-border/50" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <button type="button" onClick={() => setLastFrameImageUrl('')} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/lastframe:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground">
                  <X className="h-2.5 w-2.5" />
                </button>
                <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-semibold bg-amber-600/80 text-white backdrop-blur-sm">
                  {t('canvas.node.video.lastFrame')}
                </div>
              </div>
            ) : visibility.showLastFrame ? (
              <button
                type="button"
                onClick={() => setShowNodePicker(true)}
                className="h-16 w-16 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/40 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer group/addlast"
              >
                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover/addlast:text-primary/60 transition-colors" />
                <span className="text-[8px] text-muted-foreground/60 group-hover/addlast:text-primary/60 transition-colors">{t('canvas.node.video.addLastFrame')}</span>
              </button>
            ) : null}
          </div>
        )}

        {pickerMode === 'multi_image' && referenceImages.length > 0 && (
          <div className="px-3 pt-2.5 pb-0 flex gap-1.5 flex-wrap">
            {referenceImages.map((ref, idx) => {
              const isImg = ref.refType === 'image';
              const isVid = ref.refType === 'video';
              const isAud = ref.refType === 'audio';
              // Image-only index for <IMAGE_N> tag
              const imgIdx = isImg ? referenceImages.slice(0, idx).filter(r => r.refType === 'image').length + 1 : 0;
              const tagColor = isVid ? 'text-amber-300' : isAud ? 'text-teal-300' : 'text-blue-300';
              const tagLabel = isVid ? `VIDEO_${referenceImages.slice(0, idx).filter(r => r.refType === 'video').length + 1}`
                : isAud ? `AUDIO_${referenceImages.slice(0, idx).filter(r => r.refType === 'audio').length + 1}`
                : `IMAGE_${imgIdx}`;
              const TypeIcon = isVid ? Film : isAud ? Music : ImageIcon;
              return (
                <div key={idx} className="relative inline-block group/imgpreview">
                  {isVid ? (
                    <div className="h-14 w-14 rounded-lg border border-border/50 bg-muted overflow-hidden">
                      <video src={ref.url} className="w-full h-full object-cover" preload="metadata" muted />
                    </div>
                  ) : isAud ? (
                    <div className="h-14 w-14 rounded-lg border border-border/50 bg-muted flex items-center justify-center">
                      <Music className="w-6 h-6 text-teal-400/60" />
                    </div>
                  ) : (ref.previewUrl || ref.url) && !(ref.url.startsWith('asset://') && !ref.previewUrl) ? (
                    <img src={ref.previewUrl || ref.url} alt={ref.name} className="h-14 w-14 rounded-lg object-cover border border-border/50" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                  ) : null}
                  {isImg && (
                    <div className={cn('h-14 w-14 rounded-lg border border-border/50 bg-muted flex items-center justify-center', (ref.previewUrl || (!ref.url.startsWith('asset://') && ref.url)) ? 'hidden absolute inset-0' : '')}>
                      <UserRound className="w-6 h-6 text-muted-foreground/50" />
                    </div>
                  )}
                  <button type="button" onClick={() => handleRemoveRefImage(idx)} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/imgpreview:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground">
                    <X className="h-2.5 w-2.5" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 px-0.5 py-0.5 rounded-b-lg text-[7px] font-semibold bg-black/70 text-white backdrop-blur-sm text-center leading-tight truncate">
                    <span className={tagColor}>&lt;{tagLabel}&gt;</span>
                    <br />
                    <span className="opacity-80">{ref.name}</span>
                  </div>
                  {/* Type badge */}
                  <div className="absolute top-0.5 left-0.5">
                    <TypeIcon className={cn('w-3 h-3', isVid ? 'text-amber-400' : isAud ? 'text-teal-400' : 'text-emerald-400')} />
                  </div>
                </div>
              );
            })}
            <span className="text-[9px] text-muted-foreground self-end pb-1">{referenceImages.length}/{maxTotalRefs}</span>
          </div>
        )}

        {pickerMode === 'video' && extensionVideoUrl && (
          <div className="px-3 pt-2.5 pb-0">
            <div className="relative inline-block group/vidpreview">
              <div className="h-16 w-24 rounded-lg bg-muted border border-border/50 flex items-center justify-center overflow-hidden">
                <video src={extensionVideoUrl} className="w-full h-full object-cover" preload="metadata" muted />
              </div>
              <button type="button" onClick={() => setExtensionVideoUrl('')} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/vidpreview:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground">
                <X className="h-2.5 w-2.5" />
              </button>
              <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-black/60 text-white backdrop-blur-sm">
                {t('canvas.node.video.sourceVideo')}
              </div>
            </div>
          </div>
        )}

        {/* Rich prompt input with inline <IMAGE_N> tags */}
        <RefTagInput
          ref={inputRef}
          value={prompt}
          onChange={setPrompt}
          referenceImages={referenceImages}
          placeholder={t('canvas.node.video.promptPlaceholder')}
          disabled={taskActive}
          onSubmit={() => canSubmit && handleSubmit()}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
          {/* Left: model selector */}
          <div className="flex items-center gap-1">
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => setShowModelDropdown(v => !v)}
                disabled={modelsLoading || taskActive}
                className={cn(
                  'h-8 pl-2 pr-6 rounded-lg bg-transparent text-sm font-medium cursor-pointer inline-flex items-center gap-1.5',
                  'hover:bg-primary/10 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  selectedModelKey ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {selectedProviderLogo && <img src={selectedProviderLogo} alt="" className="w-4 h-4 object-contain" />}
                {modelsLoading ? '...' : (selectedModel?.display_name || t('canvas.node.video.selectModel'))}
                <ChevronDown className={cn(
                  'absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-transform duration-150',
                  showModelDropdown && 'rotate-180',
                )} />
              </button>

              {/* Custom model dropdown */}
              {showModelDropdown && (
                <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                  {groupedModels.map((group) => {
                    const logoSrc = PROVIDER_ICONS[group.providerType];
                    return (
                      <div key={group.providerId}>
                        <div className="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider bg-muted/30 sticky top-0 border-b border-border/30 flex items-center gap-1.5">
                          {logoSrc && <img src={logoSrc} alt="" className="w-3.5 h-3.5 object-contain" />}
                          {group.providerName}
                        </div>
                        {group.models.map((m) => {
                          const key = `${m.provider_id}::${m.model_name}`;
                          const isSelected = key === selectedModelKey;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleModelSelect(key)}
                              className={cn(
                                'w-full flex items-center gap-2 px-2.5 py-2 text-xs transition-colors cursor-pointer',
                                isSelected
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-foreground hover:bg-accent',
                              )}
                            >
                              <span className="flex-1 text-left font-medium truncate">{m.display_name}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {models.length === 0 && !modelsLoading && (
                    <div className="p-3 text-[10px] text-muted-foreground text-center">
                      {t('canvas.node.video.noVideoProviders')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: node picker + config + action buttons */}
          <div className="flex items-center gap-1">
            {/* Virtual human picker — shown for Seedance models */}
            {showVhButton && (
              <div className="relative" ref={vhPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowVhPicker((v) => !v)}
                  disabled={taskActive || vhPresets.length === 0 || imageRefCount >= maxRefImages}
                  className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center',
                    'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    showVhPicker && 'bg-accent text-foreground',
                  )}
                  title={t('canvas.node.video.selectVirtualHuman')}
                >
                  <UserRound className="w-4 h-4" />
                </button>

                {/* Virtual human dropdown */}
                {showVhPicker && (
                  <div className="absolute bottom-full right-0 mb-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border/50">
                      {t('canvas.node.video.selectVirtualHuman')}
                    </div>
                    {vhPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectVhPreset(preset)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer"
                      >
                        <div className="h-9 w-9 shrink-0 relative">
                          <img
                            src={preset.preview_url}
                            alt={preset.name}
                            className="h-9 w-9 rounded-lg object-cover border border-border/30"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                          />
                          <div className="hidden h-9 w-9 rounded-lg border border-border/30 bg-muted flex items-center justify-center absolute inset-0">
                            <UserRound className="w-4 h-4 text-muted-foreground/50" />
                          </div>
                        </div>
                        <div className="flex flex-col min-w-0 flex-1 text-left">
                          <span className="font-medium truncate text-foreground">{preset.name}</span>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {preset.gender === 'female' ? '女' : '男'} · {preset.style}
                          </span>
                        </div>
                        <UserRound className="w-3 h-3 shrink-0 text-purple-400" />
                      </button>
                    ))}
                    {vhPresets.length === 0 && (
                      <div className="p-3 text-[10px] text-muted-foreground text-center">
                        {t('canvas.node.video.noVirtualHumans')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Node picker — shown when mode needs node input */}
            {(pickerMode !== 'none' && pickerMode !== 'first_last_frame') && (
              <div className="relative" ref={nodePickerRef}>
                <button
                  type="button"
                  onClick={() => setShowNodePicker((v) => !v)}
                  disabled={taskActive || pickerNodes.length === 0}
                  className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center',
                    'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    showNodePicker && 'bg-accent text-foreground',
                    hasPickerSelection && 'text-primary',
                  )}
                  title={pickerMode === 'video' ? t('canvas.node.video.selectVideoNode') : t('canvas.node.video.selectImageNode')}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* Dropdown */}
                {showNodePicker && (
                  <div className="absolute bottom-full right-0 mb-1 w-56 max-h-60 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border/50">
                      {pickerMode === 'video'
                        ? t('canvas.node.video.selectVideoNode')
                        : pickerMode === 'multi_image'
                          ? t('canvas.node.video.selectRefImages', { max: maxTotalRefs })
                          : t('canvas.node.video.selectImageNode')}
                    </div>
                    {pickerNodes.map((node) => {
                      const nt = node.type as string;
                      const isVideo = pickerMode === 'video' || nt === 'video';
                      const isAudio = nt === 'audio';
                      const data = node.data as Record<string, unknown>;
                      const label = ((data.name || node.id.slice(0, 8)) as string);
                      const thumbUrl = isVideo ? getVideoNodeUrl(node) : isAudio ? null : getImageNodeUrl(node);
                      const NodeIcon = isVideo ? Film : isAudio ? Music : ImageIcon;
                      const iconColor = isVideo ? 'text-amber-400' : isAudio ? 'text-teal-400' : 'text-node-green';
                      // Check per-type limit
                      const atLimit = isVideo ? videoRefCount >= maxRefVideos
                        : isAudio ? audioRefCount >= maxRefAudios
                        : imageRefCount >= maxRefImages;
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => handleSelectNode(node)}
                          disabled={pickerMode === 'multi_image' && atLimit}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer',
                            pickerMode === 'multi_image' && atLimit && 'opacity-40 cursor-not-allowed',
                          )}
                        >
                          {isAudio ? (
                            <div className="h-8 w-8 rounded bg-muted border border-border/30 shrink-0 flex items-center justify-center">
                              <Music className="w-4 h-4 text-teal-400/60" />
                            </div>
                          ) : thumbUrl && (
                            isVideo
                              ? <div className="h-8 w-12 rounded bg-muted border border-border/30 shrink-0 overflow-hidden"><video src={thumbUrl} className="w-full h-full object-cover" preload="metadata" muted /></div>
                              : <img src={thumbUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0 border border-border/30" />
                          )}
                          <div className="flex flex-col min-w-0 flex-1 text-left">
                            <span className="font-medium truncate text-foreground">{label}</span>
                          </div>
                          <NodeIcon className={cn('w-3 h-3 shrink-0', iconColor)} />
                        </button>
                      );
                    })}
                    {pickerNodes.length === 0 && (
                      <div className="p-3 text-[10px] text-muted-foreground text-center">
                        {pickerMode === 'video' ? t('canvas.node.video.noVideoNodes') : t('canvas.node.video.noImageNodes')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Node picker — first_last_frame mode */}
            {pickerMode === 'first_last_frame' && (
              <div className="relative" ref={nodePickerRef}>
                <button
                  type="button"
                  onClick={() => setShowNodePicker((v) => !v)}
                  disabled={taskActive || imageNodes.length === 0}
                  className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center',
                    'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    showNodePicker && 'bg-accent text-foreground',
                    imageUrl && 'text-primary',
                  )}
                  title={!imageUrl ? t('canvas.node.video.selectFirstFrame') : t('canvas.node.video.selectLastFrame')}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {showNodePicker && (
                  <div className="absolute bottom-full right-0 mb-1 w-56 max-h-60 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border/50">
                      {!imageUrl ? t('canvas.node.video.selectFirstFrame') : t('canvas.node.video.selectLastFrame')}
                    </div>
                    {imageNodes.map((node) => {
                      const data = node.data as Record<string, unknown>;
                      const label = ((data.name || node.id.slice(0, 8)) as string);
                      const thumbUrl = getImageNodeUrl(node);
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => handleSelectNode(node)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer"
                        >
                          {thumbUrl && (
                            <img src={thumbUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0 border border-border/30" />
                          )}
                          <div className="flex flex-col min-w-0 flex-1 text-left">
                            <span className="font-medium truncate text-foreground">{label}</span>
                          </div>
                          <ImageIcon className={cn('w-3 h-3 shrink-0 text-node-green')} />
                        </button>
                      );
                    })}
                    {imageNodes.length === 0 && (
                      <div className="p-3 text-[10px] text-muted-foreground text-center">
                        {t('canvas.node.video.noImageNodes')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Config toggle */}
            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              disabled={!selectedModel || taskActive}
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center',
                'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                showConfig && 'bg-accent text-foreground',
              )}
              title={t('canvas.node.video.advancedSettings')}
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {/* Action button: submit / stop */}
            {taskActive ? (
              <button
                type="button"
                onClick={onStop}
                className="h-8 w-8 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center"
                title={t('canvas.node.video.stopGenerate')}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  'h-8 w-8 rounded-lg transition-all duration-200 flex items-center justify-center',
                  canSubmit
                    ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
                title={t('canvas.node.video.submit')}
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* "Apply to Node" / "Apply to Next Node" button — shown when task done */}
      {taskDone && (
        <button
          type="button"
          onClick={hasExistingVideo ? onApplyToNextNode : onApplyToNode}
          className="w-full h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          {hasExistingVideo
            ? t('canvas.node.video.applyToNextNode')
            : t('canvas.node.video.applyToNode')}
        </button>
      )}

      {/* Expandable config section */}
      {showConfig && selectedModel && (
        <div
          ref={configRef}
          className="rounded-lg border border-border/50 bg-card p-2.5 space-y-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {/* Mode */}
          {visibility.showModeSelect && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.video.mode')}</label>
              <select value={videoMode} onChange={(e) => setVideoMode(e.target.value)} className={SELECT_CLS} style={SELECT_ARROW_STYLE}>
                {capabilities?.modes.map((mode) => (
                  <option key={mode} value={mode}>
                    {VIDEO_MODE_LABELS[mode] || mode}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Duration */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.video.duration')}</label>
              <span className="text-[11px] font-medium">{duration === -1 ? 'Auto' : `${duration}s`}</span>
            </div>
            {visibility.showDurationSlider ? (
              <Slider
                value={[duration]}
                onValueChange={(v) => setDuration(v[0])}
                min={Math.min(...visibility.durationOptions)}
                max={Math.max(...visibility.durationOptions)}
                step={1}
              />
            ) : (
              <div className="flex gap-1 flex-wrap">
                {visibility.durationOptions.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                      duration === d
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-border/50 hover:bg-secondary',
                    )}
                  >
                    {d === -1 ? 'Auto' : `${d}s`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quality + Aspect Ratio */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.video.quality')}</label>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} className={SELECT_CLS} style={SELECT_ARROW_STYLE}>
                {visibility.resolutionOptions.map((r) => (
                  <option key={r} value={r}>
                    {RESOLUTION_LABELS[r] || r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.video.aspectRatio')}</label>
              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className={SELECT_CLS} style={SELECT_ARROW_STYLE}>
                {visibility.aspectRatioOptions.map((ar) => (
                  <option key={ar} value={ar}>
                    {ASPECT_RATIO_LABELS[ar] || ar}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* First/Last frame hint — URL inputs removed, use node picker + preview instead */}

          {/* Advanced toggles */}
          {(visibility.showPromptOptimizer || visibility.showFastPretreatment) && (
            <div className="space-y-1.5 pt-1.5 border-t border-border/30">
              {visibility.showPromptOptimizer && (
                <ToggleSwitch
                  checked={promptOptimizer}
                  onChange={setPromptOptimizer}
                  label={t('canvas.node.video.promptOptimizer')}
                  icon={<Sparkles className="w-3 h-3" />}
                />
              )}
              {visibility.showFastPretreatment && (
                <ToggleSwitch
                  checked={fastPretreatment}
                  onChange={setFastPretreatment}
                  label={t('canvas.node.video.fastPretreatment')}
                  icon={<Zap className="w-3 h-3" />}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Task failed inline hint */}
      {taskFailed && taskError && (
        <div className="flex items-center gap-1.5 text-destructive text-[11px] p-1">
          <XCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{taskError}</span>
        </div>
      )}

      {/* Submission error (not a task failure) */}
      {submitError && (
        <div className="flex items-center gap-1.5 text-destructive text-[11px] p-1">
          <XCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{submitError}</span>
        </div>
      )}
    </div>
  );
}
