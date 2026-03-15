import useSWR from 'swr';
import { fetcher } from '@/lib/api-utils';
import { VideoModelCapabilities, DEFAULT_VIDEO_CAPABILITIES } from '@/types/video';

/**
 * 获取视频模型能力配置
 * 
 * @param modelName 模型名称
 * @returns 模型能力配置
 */
export function useModelCapabilities(modelName: string | null) {
  const { data, error, isLoading } = useSWR<VideoModelCapabilities>(
    modelName ? `/videos/model-capabilities/${encodeURIComponent(modelName)}` : null,
    fetcher,
    {
      // 模型能力配置很少变化，可以缓存较长时间
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // 1分钟内不重复请求
    }
  );

  // 如果请求失败或模型未定义，返回默认配置
  const capabilities = data || (modelName ? null : DEFAULT_VIDEO_CAPABILITIES);

  return {
    capabilities,
    isLoading,
    isError: error,
    // 便捷属性
    isSupported: !!data && !error,
  };
}

/**
 * 根据能力配置判断是否需要显示某些字段
 */
export function useVideoFormVisibility(
  capabilities: VideoModelCapabilities | null,
  videoMode: string
) {
  if (!capabilities) {
    return {
      showModeSelect: true,
      showFirstFrame: videoMode !== 'text_to_video',
      showLastFrame: false,
      showPromptOptimizer: false,
      showFastPretreatment: false,
      showDurationSlider: true,
      durationOptions: [6, 10],
      resolutionOptions: ['480p', '720p'],
    };
  }

  const showModeSelect = capabilities.modes.length > 1;
  const needsImage = videoMode === 'image_to_video' || videoMode === 'edit';
  
  return {
    showModeSelect,
    showFirstFrame: capabilities.supports_first_frame && needsImage,
    showLastFrame: capabilities.supports_last_frame && needsImage,
    showPromptOptimizer: capabilities.supports_prompt_optimizer,
    showFastPretreatment: capabilities.supports_fast_pretreatment,
    showDurationSlider: capabilities.durations.length > 2,
    durationOptions: capabilities.durations,
    resolutionOptions: capabilities.resolutions,
    aspectRatioOptions: capabilities.aspect_ratios,
  };
}
