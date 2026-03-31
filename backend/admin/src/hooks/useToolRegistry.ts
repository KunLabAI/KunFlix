import useSWR from 'swr';
import { fetcher } from '@/lib/api-utils';
import type { ToolProviderInfo, AgentToolUsage, ToolStats, ImageProviderCapabilities } from '@/types';

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
