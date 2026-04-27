'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '@/lib/api';

// ---------------------------------------------------------------------------
// Types（与后端 routers/images.py 对齐）
// ---------------------------------------------------------------------------

export interface ImageProvider {
  id: string;
  name: string;
  provider_type: string;
  models: { name: string; display_name: string }[];
}

export interface ImageModelCapabilities {
  aspect_ratios: string[];
  qualities: string[];        // standard / hd / ultra
  output_formats: string[];   // png / jpeg / webp
  batch_count: { min: number; max: number };
  supported_modes: string[];  // text_to_image / edit / reference_images
}

export interface ImageGenParams {
  aspect_ratio?: string;
  quality?: 'standard' | 'hd' | 'ultra';
  batch_count?: number;
  output_format?: 'png' | 'jpeg' | 'webp';
}

export type ImageMode = 'text_to_image' | 'edit' | 'reference_images';

export interface ImageReference {
  url: string;
}

export interface ImageCreateParams {
  provider_id: string;
  model: string;
  prompt: string;
  session_id?: string;
  config?: ImageGenParams;
  mode?: ImageMode;
  reference_images?: ImageReference[];
}

export interface ImageGenerateResponse {
  images: string[];
  prompt: string;
  model: string;
  provider_id: string;
  provider_name?: string;
  credit_cost: number;
  created_at: string;
}

export interface ImageModel {
  provider_id: string;
  model_name: string;
  display_name: string;
  provider_type: string;
}

// Label maps（与 VideoGeneratePanel 风格对齐）
export const ASPECT_RATIO_LABELS: Record<string, string> = {
  auto: 'Auto',
  '1:1': '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3': '4:3',
  '3:4': '3:4',
  '3:2': '3:2',
  '2:3': '2:3',
  '21:9': '21:9',
  '2:1': '2:1',
  '1:2': '1:2',
};

export const QUALITY_LABELS: Record<string, string> = {
  standard: '标准',
  hd: '高清',
  ultra: '超清',
};

export const QUALITY_LABELS_EN: Record<string, string> = {
  standard: 'Standard',
  hd: 'HD',
  ultra: 'Ultra',
};

export const IMAGE_MODE_LABELS: Record<string, string> = {
  text_to_image: '文生图',
  edit: '图像编辑',
  reference_images: '多图参考',
};

// 各模式的参考图数量上限（统一约定）
export const IMAGE_MODE_MAX_REFS: Record<string, number> = {
  text_to_image: 0,
  edit: 1,
  reference_images: 10,
};

// ---------------------------------------------------------------------------
// Hook: useImageProviders — 获取启用的图像供应商
// ---------------------------------------------------------------------------

export function useImageProviders() {
  const [providers, setProviders] = useState<ImageProvider[]>([]);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get<{ enabled: boolean; providers: ImageProvider[] }>(
        '/images/providers',
      );
      setProviders(data.providers || []);
      setEnabled(!!data.enabled);
    } catch {
      setProviders([]);
      setEnabled(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return { providers, enabled, isLoading, refetch: fetchProviders };
}

// ---------------------------------------------------------------------------
// Hook: useImageModels — 扁平化所有图像模型
// ---------------------------------------------------------------------------

export function useImageModels() {
  const { providers, enabled, isLoading } = useImageProviders();

  const models = useMemo<ImageModel[]>(() => {
    const result: ImageModel[] = [];
    for (const p of providers) {
      for (const m of p.models) {
        result.push({
          provider_id: p.id,
          model_name: m.name,
          display_name: m.display_name,
          provider_type: p.provider_type,
        });
      }
    }
    return result;
  }, [providers]);

  return { models, enabled, isLoading };
}

// ---------------------------------------------------------------------------
// Hook: useImageModelCapabilities — 按 provider_type 取能力
// ---------------------------------------------------------------------------

export function useImageModelCapabilities(providerType: string | null) {
  const [capabilities, setCapabilities] = useState<ImageModelCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setCapabilities(null);
      const pt = providerType;
      pt || setIsLoading(false);
      pt && setIsLoading(true);
      pt && await (async () => {
        try {
          const { data } = await api.get<ImageModelCapabilities>(
            `/images/model-capabilities/${encodeURIComponent(pt)}`,
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
  }, [providerType]);

  return { capabilities, isLoading };
}

// ---------------------------------------------------------------------------
// Hook: useImageFormVisibility — 由能力派生表单选项
// ---------------------------------------------------------------------------

export function useImageFormVisibility(capabilities: ImageModelCapabilities | null) {
  const fallback = {
    aspectRatioOptions: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4'] as string[],
    qualityOptions: ['standard', 'hd'] as string[],
    outputFormatOptions: [] as string[],
    batchMin: 1,
    batchMax: 4,
    showOutputFormat: false,
    supportedModes: ['text_to_image'] as string[],
  };

  const c = capabilities;
  return c
    ? {
        aspectRatioOptions: c.aspect_ratios,
        qualityOptions: c.qualities,
        outputFormatOptions: c.output_formats,
        batchMin: c.batch_count.min,
        batchMax: c.batch_count.max,
        showOutputFormat: (c.output_formats?.length || 0) > 0,
        supportedModes: c.supported_modes || ['text_to_image'],
      }
    : fallback;
}

// ---------------------------------------------------------------------------
// Hook: useImageGenerationTask — 同步提交生成
// ---------------------------------------------------------------------------

export function useImageGenerationTask() {
  const [result, setResult] = useState<ImageGenerateResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 生成开始时间戳（用于实时计时）
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // 最近一次生成的总耗时（ms），导出给节点显示
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const submit = useCallback(async (params: ImageCreateParams) => {
    const start = Date.now();
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    setStartedAt(start);
    setLastDurationMs(null);
    try {
      const { data } = await api.post<ImageGenerateResponse>('/images/generate', params);
      const duration = Date.now() - start;
      mountedRef.current && (setResult(data), setLastDurationMs(duration));
      return data;
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Unknown error';
      mountedRef.current && setError(msg);
      throw e;
    } finally {
      mountedRef.current && (setIsSubmitting(false), setStartedAt(null));
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsSubmitting(false);
    setStartedAt(null);
    setLastDurationMs(null);
  }, []);

  return {
    result,
    isSubmitting,
    error,
    isCompleted: !!result,
    isFailed: !!error,
    startedAt,
    lastDurationMs,
    submit,
    reset,
  };
}
