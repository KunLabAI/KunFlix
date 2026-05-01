'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  useImageModels,
  useImageProviders,
  useImageModelCapabilities,
  useImageFormVisibility,
  type ImageMode,
} from '@/hooks/useImageGeneration';
import type { ImageGenHistoryEntry } from '@/store/useCanvasStore';

/**
 * Panel 内部所有表单状态 + 能力自动纠正 + 初始配置应用
 */
export function useImagePanelForm(initialConfig?: Partial<ImageGenHistoryEntry> | null) {
  const { models, enabled, isLoading: modelsLoading } = useImageModels();
  const { providers } = useImageProviders();

  // Form state
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [prompt, setPrompt] = useState('');

  // Config state
  const [mode, setMode] = useState<ImageMode>('text_to_image');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [quality, setQuality] = useState('standard');
  const [batchCount, setBatchCount] = useState(1);
  const [outputFormat, setOutputFormat] = useState('');

  // Derived
  const selectedModel = models.find((m) => `${m.provider_id}::${m.model_name}` === selectedModelKey) || null;
  const selectedProviderType = selectedModel?.provider_type || '';
  const { capabilities } = useImageModelCapabilities(selectedProviderType || null);
  const visibility = useImageFormVisibility(capabilities);

  // Auto-correct params when capabilities change
  useEffect(() => {
    const caps = capabilities;
    caps && (() => {
      caps.aspect_ratios.length > 0 && !caps.aspect_ratios.includes(aspectRatio) && setAspectRatio(caps.aspect_ratios[0]);
      caps.qualities.length > 0 && !caps.qualities.includes(quality) && setQuality(caps.qualities[0]);
      batchCount < caps.batch_count.min && setBatchCount(caps.batch_count.min);
      batchCount > caps.batch_count.max && setBatchCount(caps.batch_count.max);
      const hasFmt = caps.output_formats.length > 0;
      hasFmt && !caps.output_formats.includes(outputFormat) && setOutputFormat(caps.output_formats[0]);
      !hasFmt && outputFormat && setOutputFormat('');
      const modes = caps.supported_modes || ['text_to_image'];
      !modes.includes(mode) && setMode(modes[0] as ImageMode);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities]);

  // Apply initialConfig once when models are available
  const appliedInitRef = useRef(false);
  useEffect(() => {
    const cfg = initialConfig;
    (cfg && models.length > 0 && !appliedInitRef.current) && (() => {
      appliedInitRef.current = true;
      cfg.prompt && setPrompt(cfg.prompt);
      const key = cfg.provider_id && cfg.model ? `${cfg.provider_id}::${cfg.model}` : '';
      key && models.some(m => `${m.provider_id}::${m.model_name}` === key) && setSelectedModelKey(key);
      cfg.aspect_ratio && setAspectRatio(cfg.aspect_ratio);
      cfg.quality && setQuality(cfg.quality);
      cfg.batch_count && setBatchCount(cfg.batch_count);
      cfg.output_format && setOutputFormat(cfg.output_format);
    })();
  }, [initialConfig, models]);

  // Flatten models with provider info
  const flatModels = useMemo(() => {
    const list: { key: string; model: typeof models[number]; providerType: string; providerName: string }[] = [];
    const covered = new Set<string>();
    for (const p of providers) {
      covered.add(p.id);
      for (const m of models.filter(mm => mm.provider_id === p.id)) {
        list.push({
          key: `${m.provider_id}::${m.model_name}`,
          model: m,
          providerType: p.provider_type,
          providerName: p.name,
        });
      }
    }
    for (const m of models.filter(mm => !covered.has(mm.provider_id))) {
      list.push({
        key: `${m.provider_id}::${m.model_name}`,
        model: m,
        providerType: m.provider_type,
        providerName: 'Other',
      });
    }
    return list;
  }, [models, providers]);

  const handleModelSelect = useCallback((key: string) => {
    setSelectedModelKey(key);
  }, []);

  return {
    // lists & status
    models,
    enabled,
    modelsLoading,
    flatModels,
    capabilities,
    visibility,
    // selected model
    selectedModel,
    selectedModelKey,
    selectedProviderType,
    // form values & setters
    prompt,
    setPrompt,
    mode,
    setMode,
    aspectRatio,
    setAspectRatio,
    quality,
    setQuality,
    batchCount,
    setBatchCount,
    outputFormat,
    setOutputFormat,
    // actions
    handleModelSelect,
  };
}
