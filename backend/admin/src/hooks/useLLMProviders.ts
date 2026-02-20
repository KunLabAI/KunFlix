import useSWR from 'swr';
import { fetcher } from '@/lib/api-utils';
import { LLMProvider } from '@/types';

export function useLLMProviders() {
  const { data, error, isLoading } = useSWR<LLMProvider[]>('/admin/llm-providers/', fetcher);

  const activeProviders = data?.filter((p) => p.is_active) || [];

  return {
    providers: data,
    activeProviders,
    isLoading,
    isError: error,
  };
}
