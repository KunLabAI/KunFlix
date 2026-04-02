import useSWR, { mutate } from 'swr';
import { fetcher } from '@/lib/api-utils';
import api from '@/lib/axios';
import type { ToolProviderInfo, AgentToolUsage, ToolStats, ImageProviderCapabilities, VideoProviderCapabilities, ToolConfig } from '@/types';

export function useToolRegistry() {
  const { data, error, isLoading } = useSWR<ToolProviderInfo[]>(
    '/admin/tools/registry',
    fetcher,
  );
  return { registry: data, isLoading, isError: error };
}

export function useAgentToolUsage() {
  const { data, error, isLoading } = useSWR<AgentToolUsage[]>(
    '/admin/tools/agent-usage',
    fetcher,
  );
  return { agentUsage: data, isLoading, isError: error };
}

export function useToolStats() {
  const { data, error, isLoading, mutate } = useSWR<ToolStats>(
    '/admin/tools/stats',
    fetcher,
    { refreshInterval: 30_000 },
  );
  return { stats: data, isLoading, isError: error, mutate };
}

export function useImageCapabilities() {
  const { data, error, isLoading } = useSWR<ImageProviderCapabilities>(
    '/admin/tools/image-capabilities',
    fetcher,
  );
  return { capabilities: data, isLoading, isError: error };
}

export function useVideoCapabilities() {
  const { data, error, isLoading } = useSWR<VideoProviderCapabilities>(
    '/admin/tools/video-capabilities',
    fetcher,
  );
  return { capabilities: data, isLoading, isError: error };
}

// 工具配置管理
export function useToolConfig(toolName: string) {
  const { data, error, isLoading, mutate } = useSWR<ToolConfig>(
    toolName ? `/admin/tools/configs/${toolName}` : null,
    fetcher,
  );
  return { config: data, isLoading, isError: error, mutate };
}

export function useUpdateToolConfig() {
  const updateConfig = async (toolName: string, configData: { config?: Record<string, any>; is_enabled?: boolean }) => {
    const response = await api.put(`/admin/tools/configs/${toolName}`, configData);
    // 刷新缓存
    mutate(`/admin/tools/configs/${toolName}`);
    mutate('/admin/tools/configs');
    return response.data;
  };

  return { updateConfig };
}
