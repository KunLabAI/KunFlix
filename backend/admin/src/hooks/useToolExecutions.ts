import useSWR from 'swr';
import { fetcher } from '@/lib/api-utils';
import type { ToolExecutionListResponse } from '@/types';

interface UseToolExecutionsParams {
  skip?: number;
  limit?: number;
  tool_name?: string;
  provider_name?: string;
  status?: string;
  agent_id?: string;
}

export function useToolExecutions(params: UseToolExecutionsParams = {}) {
  const searchParams = new URLSearchParams();
  const entries: [string, string | number | undefined][] = [
    ['skip', params.skip],
    ['limit', params.limit],
    ['tool_name', params.tool_name],
    ['provider_name', params.provider_name],
    ['status', params.status],
    ['agent_id', params.agent_id],
  ];
  entries.forEach(([k, v]) => v !== undefined && searchParams.set(k, String(v)));

  const qs = searchParams.toString();
  const url = `/admin/tools/executions${qs ? `?${qs}` : ''}`;

  const { data, error, isLoading, mutate } = useSWR<ToolExecutionListResponse>(
    url,
    fetcher,
    { refreshInterval: 15_000 },
  );

  return {
    executions: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError: error,
    mutate,
  };
}
