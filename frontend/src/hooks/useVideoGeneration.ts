'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoProvider {
  id: string;
  name: string;
  provider_type: string;
  models: { name: string; display_name: string }[];
}

export interface VideoModelCapabilities {
  provider: string;
  modes: string[];
  durations: number[];
  resolutions: string[];
  supports_first_frame: boolean;
  supports_last_frame: boolean;
  supports_reference_images: boolean;
  supports_video_extension: boolean;
  supports_video_edit: boolean;
  supports_audio: boolean;
  max_reference_images: number;
  supports_reference_videos?: boolean;
  max_reference_videos?: number;
  supports_reference_audios?: boolean;
  max_reference_audios?: number;
  supports_prompt_optimizer: boolean;
  supports_fast_pretreatment: boolean;
  aspect_ratios: string[];
}

export interface VideoCreateParams {
  provider_id: string;
  model: string;
  video_mode: string;
  prompt: string;
  image_url?: string;
  last_frame_image?: string;
  reference_images?: { url: string }[];
  reference_videos?: { url: string }[];
  reference_audios?: { url: string }[];
  extension_video_url?: string;
  config?: {
    duration: number;
    quality: string;
    aspect_ratio: string;
    prompt_optimizer?: boolean;
    fast_pretreatment?: boolean;
  };
}

export interface VideoTaskStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  quality?: string;
  duration?: number;
  credit_cost?: number;
  error_message?: string;
  video_mode?: string;
  model?: string;
  prompt?: string;
}

// Label maps
export const VIDEO_MODE_LABELS: Record<string, string> = {
  text_to_video: '文生视频',
  image_to_video: '图生视频(包含首尾帧)',
  edit: '视频编辑',
  reference_images: '多模态参考生成',
  video_extension: '视频扩展',
};

export const VIDEO_MODE_LABELS_EN: Record<string, string> = {
  text_to_video: 'Text to Video',
  image_to_video: 'Image to Video',
  edit: 'Video Edit',
  reference_images: 'Multi-modal Reference',
  video_extension: 'Video Extension',
};

export const RESOLUTION_LABELS: Record<string, string> = {
  '480p': '480p',
  '512p': '512p',
  '720p': '720p',
  '768p': '768p',
  '1080p': '1080p',
  '4k': '4K',
};

export const ASPECT_RATIO_LABELS: Record<string, string> = {
  '16:9': '16:9',
  '9:16': '9:16',
  '1:1': '1:1',
  '4:3': '4:3',
  '3:4': '3:4',
  '3:2': '3:2',
  '2:3': '2:3',
  '21:9': '21:9',
  adaptive: 'Auto',
};

// ---------------------------------------------------------------------------
// Flat model type + hook
// ---------------------------------------------------------------------------

export interface VideoModel {
  provider_id: string;
  model_name: string;
  display_name: string;
}

// ---------------------------------------------------------------------------
// Virtual Human Preset type
// ---------------------------------------------------------------------------

export interface VirtualHumanPreset {
  id: string;
  asset_id: string;
  asset_uri: string;
  name: string;
  gender: 'male' | 'female';
  style: string;
  preview_url: string;
  description: string;
  is_active: boolean;
  sort_order: number;
}

// Seedance 模型名前缀（仅这些模型支持虚拟人像）
const SEEDANCE_MODEL_PREFIX = 'doubao-seedance';

// Terminal states
const TERMINAL_STATES = new Set(['completed', 'failed']);
const POLL_INTERVAL = 5000;

// ---------------------------------------------------------------------------
// Hook: useVideoProviders — fetch available video providers
// ---------------------------------------------------------------------------

export function useVideoProviders() {
  const [providers, setProviders] = useState<VideoProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get<{ providers: VideoProvider[] }>('/videos/providers/video');
      setProviders(data.providers || []);
    } catch {
      setProviders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return { providers, isLoading, refetch: fetchProviders };
}

// ---------------------------------------------------------------------------
// Hook: useVideoModels — flat list of all video models across providers
// ---------------------------------------------------------------------------

export function useVideoModels() {
  const { providers, isLoading } = useVideoProviders();

  const models = useMemo<VideoModel[]>(() => {
    const result: VideoModel[] = [];
    for (const p of providers) {
      for (const m of p.models) {
        result.push({ provider_id: p.id, model_name: m.name, display_name: m.display_name });
      }
    }
    return result;
  }, [providers]);

  return { models, isLoading };
}

// ---------------------------------------------------------------------------
// Hook: useVirtualHumanPresets — fetch available virtual human presets
// ---------------------------------------------------------------------------

export function useVirtualHumanPresets(modelName: string | null) {
  const [presets, setPresets] = useState<VirtualHumanPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isSeedance = !!modelName && modelName.toLowerCase().startsWith(SEEDANCE_MODEL_PREFIX);

  useEffect(() => {
    const controller = new AbortController();
    setPresets([]);
    isSeedance && (async () => {
      setIsLoading(true);
      try {
        const { data } = await api.get<{ count: number; presets: VirtualHumanPreset[] }>(
          '/videos/virtual-human-presets',
          { signal: controller.signal },
        );
        setPresets(data.presets || []);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isSeedance]);

  return { presets, isLoading, isSeedance };
}

// ---------------------------------------------------------------------------
// Hook: useVideoModelCapabilities — fetch capabilities for a model
// ---------------------------------------------------------------------------

export function useVideoModelCapabilities(modelName: string | null) {
  const [capabilities, setCapabilities] = useState<VideoModelCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setCapabilities(null);
      const name = modelName;
      name || (setIsLoading(false));
      name && (setIsLoading(true));
      name && await (async () => {
        try {
          const { data } = await api.get<VideoModelCapabilities>(
            `/videos/model-capabilities/${encodeURIComponent(name)}`,
            { signal: controller.signal },
          );
          setCapabilities(data);
        } catch {
          // ignore
        } finally {
          setIsLoading(false);
        }
      })();
    })();
    return () => controller.abort();
  }, [modelName]);

  return { capabilities, isLoading };
}

// ---------------------------------------------------------------------------
// Hook: useVideoFormVisibility — derive visible fields from capabilities
// ---------------------------------------------------------------------------

export function useVideoFormVisibility(
  capabilities: VideoModelCapabilities | null,
  videoMode: string,
) {
  const fallback = {
    showModeSelect: true,
    showFirstFrame: videoMode !== 'text_to_video',
    showLastFrame: false,
    showPromptOptimizer: false,
    showFastPretreatment: false,
    showDurationSlider: true,
    durationOptions: [6, 10] as number[],
    resolutionOptions: ['480p', '720p'] as string[],
    aspectRatioOptions: ['16:9', '9:16', '1:1'] as string[],
  };

  const caps = capabilities;
  caps || (void 0);

  const needsImage = videoMode === 'image_to_video' || videoMode === 'edit';

  return caps
    ? {
        showModeSelect: caps.modes.length > 1,
        showFirstFrame: caps.supports_first_frame && needsImage,
        showLastFrame: caps.supports_last_frame && needsImage,
        showPromptOptimizer: caps.supports_prompt_optimizer,
        showFastPretreatment: caps.supports_fast_pretreatment,
        showDurationSlider: caps.durations.length > 2,
        durationOptions: caps.durations,
        resolutionOptions: caps.resolutions,
        aspectRatioOptions: caps.aspect_ratios,
      }
    : fallback;
}

// ---------------------------------------------------------------------------
// Hook: useVideoTask — submit task + poll status
// ---------------------------------------------------------------------------

export function useVideoTask() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoTaskStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    pollingRef.current && clearInterval(pollingRef.current);
    pollingRef.current = null;
  }, []);

  const pollStatus = useCallback(async (id: string) => {
    try {
      const { data } = await api.get<VideoTaskStatus>(`/videos/${id}/status`);
      mountedRef.current && setStatus(data);
      TERMINAL_STATES.has(data.status) && stopPolling();
    } catch {
      // keep polling on network error
    }
  }, [stopPolling]);

  const submit = useCallback(async (params: VideoCreateParams) => {
    setIsSubmitting(true);
    setError(null);
    setStatus(null);
    stopPolling();

    try {
      const { data } = await api.post<VideoTaskStatus>('/videos', params);
      const id = data.id;
      setTaskId(id);
      setStatus(data);

      // start polling
      pollStatus(id);
      pollingRef.current = setInterval(() => pollStatus(id), POLL_INTERVAL);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Unknown error';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [pollStatus, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setTaskId(null);
    setStatus(null);
    setError(null);
    setIsSubmitting(false);
  }, [stopPolling]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return {
    taskId,
    status,
    isSubmitting,
    error,
    submit,
    reset,
    isTerminal: status ? TERMINAL_STATES.has(status.status) : false,
    isCompleted: status?.status === 'completed',
    isFailed: status?.status === 'failed',
  };
}
