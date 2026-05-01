'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useVideoModels,
  useVideoProviders,
  useVideoModelCapabilities,
  useVideoFormVisibility,
  type VideoModel,
} from '@/hooks/useVideoGeneration';
import type { VideoGenHistoryEntry } from '@/store/useCanvasStore';
import type { FlatVideoModelItem } from '@/components/canvas/VideoGeneratePanel/types';

/**
 * Panel 表单状态 + 能力纠正 + 扁平模型列表 + 初始配置一次性应用。
 * 附件相关状态完全交由 useVideoPanelReferences 管理。
 */
export function useVideoPanelForm(initialConfig?: Partial<VideoGenHistoryEntry> | null) {
  const { models, isLoading: modelsLoading } = useVideoModels();
  const { providers } = useVideoProviders();

  // 表单状态
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [videoMode, setVideoMode] = useState('text_to_video');
  const [duration, setDuration] = useState(6);
  const [quality, setQuality] = useState('720p');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [promptOptimizer, setPromptOptimizer] = useState(true);
  const [fastPretreatment, setFastPretreatment] = useState(false);

  // 派生
  const selectedModel: VideoModel | null = useMemo(
    () => models.find((m) => `${m.provider_id}::${m.model_name}` === selectedModelKey) || null,
    [models, selectedModelKey],
  );
  const { capabilities } = useVideoModelCapabilities(selectedModel?.model_name || null);
  const visibility = useVideoFormVisibility(capabilities, videoMode);

  // 能力变化时自动纠正参数
  useEffect(() => {
    const caps = capabilities;
    caps && (() => {
      !caps.modes.includes(videoMode) && setVideoMode(caps.modes[0]);
      !caps.resolutions.includes(quality) && setQuality(caps.resolutions[0]);
      !caps.durations.includes(duration) && setDuration(caps.durations[0]);
      !caps.aspect_ratios.includes(aspectRatio) && setAspectRatio(caps.aspect_ratios[0]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities]);

  // initialConfig 首次应用（用于历史拖拽创建节点场景）
  const appliedInitRef = useRef(false);
  useEffect(() => {
    const cfg = initialConfig;
    (cfg && models.length > 0 && !appliedInitRef.current) && (() => {
      appliedInitRef.current = true;
      cfg.prompt && setPrompt(cfg.prompt);
      const direct = cfg.provider_id && cfg.model ? `${cfg.provider_id}::${cfg.model}` : '';
      const fallback = !direct && cfg.model ? models.find((m) => m.model_name === cfg.model) : null;
      const resolvedKey = direct || (fallback ? `${fallback.provider_id}::${fallback.model_name}` : '');
      resolvedKey && models.some((m) => `${m.provider_id}::${m.model_name}` === resolvedKey) && setSelectedModelKey(resolvedKey);
      cfg.video_mode && setVideoMode(cfg.video_mode);
      cfg.duration && setDuration(cfg.duration);
      cfg.quality && setQuality(cfg.quality);
      cfg.aspect_ratio && setAspectRatio(cfg.aspect_ratio);
    })();
  }, [initialConfig, models]);

  // 扁平化模型列表（带 provider 元信息）
  const flatModels = useMemo<FlatVideoModelItem[]>(() => {
    const list: FlatVideoModelItem[] = [];
    const covered = new Set<string>();
    for (const p of providers) {
      covered.add(p.id);
      for (const m of models.filter((mm) => mm.provider_id === p.id)) {
        list.push({
          key: `${m.provider_id}::${m.model_name}`,
          model: m,
          providerType: p.provider_type,
          providerName: p.name,
        });
      }
    }
    for (const m of models.filter((mm) => !covered.has(mm.provider_id))) {
      list.push({
        key: `${m.provider_id}::${m.model_name}`,
        model: m,
        providerType: '',
        providerName: 'Other',
      });
    }
    return list;
  }, [models, providers]);

  const selectedProviderType = useMemo(
    () => flatModels.find((f) => f.key === selectedModelKey)?.providerType || '',
    [flatModels, selectedModelKey],
  );

  /**
   * 切换模型：重置模式 / duration / quality。
   * 附件清理由 useVideoPanelReferences 消费 `selectedModelKey` 变化来处理。
   */
  const handleModelChange = useCallback((key: string) => {
    setSelectedModelKey(key);
    setVideoMode('text_to_video');
    setDuration(6);
    setQuality('720p');
  }, []);

  return {
    // 列表 & 状态
    models,
    providers,
    modelsLoading,
    flatModels,
    capabilities,
    visibility,
    // 选中模型
    selectedModel,
    selectedModelKey,
    selectedProviderType,
    // 值 & setter
    prompt,
    setPrompt,
    videoMode,
    setVideoMode,
    duration,
    setDuration,
    quality,
    setQuality,
    aspectRatio,
    setAspectRatio,
    promptOptimizer,
    setPromptOptimizer,
    fastPretreatment,
    setFastPretreatment,
    // 动作
    handleModelChange,
  };
}

export type UseVideoPanelFormReturn = ReturnType<typeof useVideoPanelForm>;
