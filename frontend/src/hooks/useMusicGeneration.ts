'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MusicProviderModel {
  name: string;
  display_name: string;
}

export interface MusicProvider {
  id: string;
  name: string;
  provider_type: string;
  music_provider_type: string;
  models: MusicProviderModel[];
}

export interface MusicModelCapabilities {
  model: string;
  formats: string[];
  duration_hint: string;
  supports_wav: boolean;
  supports_timeline: boolean;
  display_name: string;
}

export interface MusicStructuredInput {
  genre?: string;
  instruments?: string[];
  bpm?: number;
  key_scale?: string;
  mood?: string;
  language?: string;
  vocals?: boolean;
  lyrics?: string;
  timeline?: string;
}

export interface MusicCreateParams {
  provider_id?: string;
  model: string;
  prompt: string;
  session_id?: string;
  node_id?: string;
  output_format: 'mp3' | 'wav';
  negative_prompt?: string;
  structured?: MusicStructuredInput;
  reference_images?: { url: string; mime_type?: string }[];
}

export interface MusicTaskStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  prompt: string;
  lyrics?: string;
  model: string;
  output_format: string;
  audio_url?: string;
  credit_cost?: number;
  error_message?: string;
  provider_id?: string;
  user_id: string;
  input_image_count?: number;
  created_at: string;
  completed_at?: string;
}

export interface MusicSubmitResponse {
  task_id: string;
  status: string;
  session_id?: string;
  node_id?: string;
  model: string;
  provider_id?: string;
}

// Label maps
// 兼容保留：仅当后端无 display_name 时作为兼容兼底，正常情况下以后端为准
// （对齐 useImageGeneration 行为：display_name 完全来自后端，管理员可在后台编辑）
export const MUSIC_MODEL_LABELS: Record<string, string> = {
  'lyria-3-clip-preview': 'Lyria 3 Clip (30s)',
  'lyria-3-pro-preview': 'Lyria 3 Pro',
};

export const MUSIC_MODEL_LABELS_EN: Record<string, string> = {
  'lyria-3-clip-preview': 'Lyria 3 Clip (30s)',
  'lyria-3-pro-preview': 'Lyria 3 Pro',
};

export const MUSIC_OUTPUT_FORMAT_LABELS: Record<string, string> = {
  mp3: 'MP3',
  wav: 'WAV (HQ)',
};

// 常见流派
export const MUSIC_GENRE_OPTIONS: string[] = [
  'Pop',
  'Rock',
  'Electronic',
  'Hip-Hop',
  'Jazz',
  'Classical',
  'Ambient',
  'Lo-fi',
  'Folk',
  'R&B',
  'Metal',
  'Country',
  'Cinematic',
];

// 常见乐器
export const MUSIC_INSTRUMENT_OPTIONS: string[] = [
  'Piano',
  'Acoustic Guitar',
  'Electric Guitar',
  'Bass',
  'Drums',
  'Synth',
  'Strings',
  'Violin',
  'Cello',
  'Saxophone',
  'Trumpet',
  'Flute',
  'Organ',
  'Harp',
  '808',
];

export const MUSIC_KEY_SCALE_OPTIONS: string[] = [
  'C Major', 'C Minor',
  'D Major', 'D Minor',
  'E Major', 'E Minor',
  'F Major', 'F Minor',
  'G Major', 'G Minor',
  'A Major', 'A Minor',
  'B Major', 'B Minor',
];

export const MUSIC_LANGUAGE_OPTIONS: string[] = [
  'English',
  'Chinese',
  'Japanese',
  'Korean',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Instrumental',
];

export const MUSIC_MOOD_OPTIONS: string[] = [
  'Happy',
  'Melancholic',
  'Energetic',
  'Calm',
  'Dark',
  'Epic',
  'Dreamy',
  'Romantic',
  'Tense',
  'Playful',
];

// Terminal states
const TERMINAL_STATES = new Set(['completed', 'failed']);
const POLL_INTERVAL = 4000;

// ---------------------------------------------------------------------------
// Hook: useMusicProviders — fetch active music providers
// ---------------------------------------------------------------------------

export function useMusicProviders() {
  const [providers, setProviders] = useState<MusicProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get<MusicProvider[]>('/music/providers');
      setProviders(Array.isArray(data) ? data : []);
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
// Hook: useMusicModels — flat list of all (provider, model) pairs
// ---------------------------------------------------------------------------

export interface MusicModelFlat {
  provider_id: string;
  provider_name: string;
  model_name: string;
  display_name: string;
}

export function useMusicModels() {
  const { providers, isLoading } = useMusicProviders();

  const models = useMemo<MusicModelFlat[]>(() => {
    const out: MusicModelFlat[] = [];
    for (const p of providers) {
      for (const m of p.models) {
        out.push({
          provider_id: p.id,
          provider_name: p.name,
          model_name: m.name,
          // 直接使用后端传回的 display_name（管理员可在后台 model_metadata 中编辑）
          // 仅当后端未提供时才回落到本地标签表或模型名
          display_name: m.display_name || MUSIC_MODEL_LABELS[m.name] || m.name,
        });
      }
    }
    return out;
  }, [providers]);

  return { models, isLoading };
}

// ---------------------------------------------------------------------------
// Hook: useMusicModelCapabilities — fetch capabilities for a model
// ---------------------------------------------------------------------------

export function useMusicModelCapabilities(modelName: string | null) {
  const [capabilities, setCapabilities] = useState<MusicModelCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setCapabilities(null);
    const name = modelName;
    name && (async () => {
      setIsLoading(true);
      try {
        const { data } = await api.get<MusicModelCapabilities>(
          `/music/model-capabilities/${encodeURIComponent(name)}`,
          { signal: controller.signal },
        );
        setCapabilities(data);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [modelName]);

  return { capabilities, isLoading };
}

// ---------------------------------------------------------------------------
// Hook: useMusicTask — submit task + poll status
// ---------------------------------------------------------------------------

export function useMusicTask() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<MusicTaskStatus | null>(null);
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
      const { data } = await api.get<MusicTaskStatus>(`/music/${id}/status`);
      mountedRef.current && setStatus(data);
      TERMINAL_STATES.has(data.status) && stopPolling();
    } catch {
      // keep polling on transient error
    }
  }, [stopPolling]);

  const submit = useCallback(async (params: MusicCreateParams) => {
    setIsSubmitting(true);
    setError(null);
    setStatus(null);
    stopPolling();

    try {
      const { data } = await api.post<MusicSubmitResponse>('/music', params);
      const id = data.task_id;
      setTaskId(id);
      setStatus({
        id,
        status: (data.status as MusicTaskStatus['status']) || 'processing',
        prompt: params.prompt,
        model: data.model,
        output_format: params.output_format,
        provider_id: data.provider_id,
        user_id: '',
        created_at: new Date().toISOString(),
      });

      pollStatus(id);
      pollingRef.current = setInterval(() => pollStatus(id), POLL_INTERVAL);
      return data;
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Unknown error';
      setError(msg);
      return null;
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
