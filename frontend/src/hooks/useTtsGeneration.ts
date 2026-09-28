'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { reportError } from '@/lib/canvas/toast';
import { useAuth } from '@/context/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TtsProviderModel {
  name: string;
  display_name: string;
}

export interface TtsProvider {
  id: string;
  name: string;
  provider_type: string;
  tts_provider_type: string;
  models: TtsProviderModel[];
}

export interface TtsModelCapabilities {
  model: string;
  multi_speaker: boolean;
  voice_design: boolean;
  display_name: string;
}

export interface TtsVoice {
  name: string;              // prebuilt 名称 或 复刻音色 voice_ ID（传给后端的值）
  tone: string;              // 英文语气标签（prebuilt），复刻为 ''
  gender: 'male' | 'female' | '';  // 预置音色固有性别（复刻为 ''）
  type: 'prebuilt' | 'replicated';
  display_name: string;      // prebuilt 名称 或 用户命名
  id: string | null;         // 复刻音色主键（用于删除）
}

export interface TtsSpeakerInput {
  speaker: string;
  voice?: string;
  text: string;
  style?: string;
}

export interface TtsCreateParams {
  provider_id?: string;
  model: string;
  text: string;
  voice: string;
  style?: string;
  speakers?: TtsSpeakerInput[];
  output_format?: 'wav' | 'l16';
  session_id?: string;
  node_id?: string;
}

export interface TtsTaskStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  text: string;
  model: string;
  voice?: string;
  style?: string;
  speakers?: TtsSpeakerInput[];
  output_format: string;
  audio_url?: string;
  credit_cost?: number;
  error_message?: string;
  provider_id?: string;
  user_id: string;
  created_at: string;
  completed_at?: string;
  // 后端扣费不足、余额被兜底扣到 0 时为 true（不持久化）
  billing_underpaid?: boolean;
  // 本次扣费后用户余额（不持久化，用于前端同步 user.credits）
  remaining_credits?: number | null;
}

export interface TtsSubmitResponse {
  task_id: string;
  status: string;
  session_id?: string;
  node_id?: string;
  model: string;
  provider_id?: string;
}

// Terminal states
const TERMINAL_STATES = new Set(['completed', 'failed']);
const POLL_INTERVAL = 3000;

// ---------------------------------------------------------------------------
// Hook: useTtsProviders — fetch active TTS providers
// ---------------------------------------------------------------------------

export function useTtsProviders() {
  const [providers, setProviders] = useState<TtsProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get<TtsProvider[]>('/tts/providers');
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
// Hook: useTtsModels — flat list of all (provider, model) pairs
// ---------------------------------------------------------------------------

export interface TtsModelFlat {
  provider_id: string;
  provider_name: string;
  model_name: string;
  display_name: string;
}

export function useTtsModels() {
  const { providers, isLoading } = useTtsProviders();

  const models = useMemo<TtsModelFlat[]>(() => {
    const out: TtsModelFlat[] = [];
    for (const p of providers) {
      for (const m of p.models) {
        out.push({
          provider_id: p.id,
          provider_name: p.name,
          model_name: m.name,
          // 直接使用后端传回的 display_name（管理员可在后台 model_metadata 中编辑）
          display_name: m.display_name || m.name,
        });
      }
    }
    return out;
  }, [providers]);

  return { models, isLoading };
}

// ---------------------------------------------------------------------------
// Hook: useTtsVoices — fetch voice list (prebuilt + user's replicated)
// ---------------------------------------------------------------------------

export function useTtsVoices() {
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchVoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get<TtsVoice[]>('/tts/voices');
      setVoices(Array.isArray(data) ? data : []);
    } catch {
      setVoices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  return { voices, isLoading, refetch: fetchVoices };
}

// ---------------------------------------------------------------------------
// Voice replication API (multipart upload)
// ---------------------------------------------------------------------------

export interface ReplicateVoiceParams {
  displayName: string;
  sourceAudio: File;
  consentAudio: File;
  providerId?: string;
  model?: string;
}

export interface ReplicateVoiceResult {
  voice_id: string;
  id: string;
  display_name: string;
  model?: string;
  provider_id?: string;
}

/** 上传参考音频 + 授权音频复刻音色（持久入库）。 */
export async function replicateVoice(params: ReplicateVoiceParams): Promise<ReplicateVoiceResult> {
  const formData = new FormData();
  formData.append('display_name', params.displayName);
  formData.append('source_audio', params.sourceAudio);
  formData.append('consent_audio', params.consentAudio);
  params.providerId && formData.append('provider_id', params.providerId);
  params.model && formData.append('model', params.model);
  const { data } = await api.post<ReplicateVoiceResult>('/tts/voices/replicate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** 删除用户自己的复刻音色记录。 */
export async function deleteReplicatedVoice(voicePk: string): Promise<void> {
  await api.delete(`/tts/voices/replicated/${voicePk}`);
}

// ---------------------------------------------------------------------------
// Extended Voice Library (扩展音色库)
// ---------------------------------------------------------------------------

export interface LibraryVoice {
  id: string;
  display_name: string;
  gender: 'male' | 'female' | 'neutral' | '';
  language_code: string;
  accent: string;
  pitch: 'low' | 'medium' | 'high' | '';
  persona: string;
  description: string;
  type: string;
}

export interface VoiceLibraryQuery {
  provider_id?: string;
  gender?: string;
  language_code?: string;
  pitch?: string;
  accent?: string;
  context?: string;
  search?: string;
  type?: string;
  page_size?: number;
  page_token?: string;
}

export interface VoiceLibraryResult {
  voices: LibraryVoice[];
  next_page_token: string;
}

/** 查询扩展音色库（后端代理 Google GET /v1beta/voices）。 */
export async function fetchVoiceLibrary(query: VoiceLibraryQuery): Promise<VoiceLibraryResult> {
  const { data } = await api.get<VoiceLibraryResult>('/tts/voice-library', { params: query });
  return { voices: data?.voices || [], next_page_token: data?.next_page_token || '' };
}

// ---------------------------------------------------------------------------
// Voice preview (音色试听，同步合成一小段，不计费)
// ---------------------------------------------------------------------------

export interface TtsPreviewParams {
  voice: string;            // 预置音色名 / voice_ 复刻或库 ID / auto
  text?: string;
  style?: string;
  model?: string;
  providerId?: string;
}

/** 合成试听音频，返回可直接赋给 <audio>.src 的 data URI。 */
export async function previewVoice(params: TtsPreviewParams): Promise<string> {
  const { data } = await api.post<{ audio_base64: string; mime_type: string }>('/tts/preview', {
    voice: params.voice,
    text: params.text || undefined,
    style: params.style || undefined,
    model: params.model || undefined,
    provider_id: params.providerId || undefined,
  });
  return `data:${data.mime_type || 'audio/wav'};base64,${data.audio_base64}`;
}

// ---------------------------------------------------------------------------
// Hook: useTtsTask — submit task + poll status
// ---------------------------------------------------------------------------

export function useTtsTask() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<TtsTaskStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // 仅提示一次余额被兜底扣到 0 的事件
  const underpaidNotifiedRef = useRef(false);
  const { updateCredits } = useAuth();

  const stopPolling = useCallback(() => {
    pollingRef.current && clearInterval(pollingRef.current);
    pollingRef.current = null;
  }, []);

  const pollStatus = useCallback(async (id: string) => {
    try {
      const { data } = await api.get<TtsTaskStatus>(`/tts/${id}/status`);
      mountedRef.current && setStatus(data);
      // 后端扣费后同步最新余额到 AuthContext，驱动 useCreditsGuard 即时生效
      mountedRef.current && data.remaining_credits != null && updateCredits(data.remaining_credits);
      // 后端扣费不足、余额被兜底扣到 0 时提示一次
      mountedRef.current && data.billing_underpaid && !underpaidNotifiedRef.current && (
        (underpaidNotifiedRef.current = true),
        toast.warning(
          '本次操作已扣除您剩余的全部积分，余额已为 0。请充值后继续使用。',
          { duration: 4500 },
        )
      );
      TERMINAL_STATES.has(data.status) && stopPolling();
    } catch {
      // keep polling on transient error
    }
  }, [stopPolling, updateCredits]);

  const submit = useCallback(async (params: TtsCreateParams) => {
    setIsSubmitting(true);
    setError(null);
    setStatus(null);
    stopPolling();

    try {
      const { data } = await api.post<TtsSubmitResponse>('/tts', params);
      const id = data.task_id;
      setTaskId(id);
      setStatus({
        id,
        status: (data.status as TtsTaskStatus['status']) || 'processing',
        text: params.text,
        model: data.model,
        voice: params.voice,
        speakers: params.speakers,
        output_format: params.output_format || 'wav',
        provider_id: data.provider_id,
        user_id: '',
        created_at: new Date().toISOString(),
      });

      pollStatus(id);
      pollingRef.current = setInterval(() => pollStatus(id), POLL_INTERVAL);
      return data;
    } catch (e: unknown) {
      const normalized = reportError(e);
      setError(normalized.detail);
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
