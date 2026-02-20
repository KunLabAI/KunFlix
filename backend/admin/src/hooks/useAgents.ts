import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { fetcher } from '@/lib/api-utils';
import { Agent } from '@/types';

export function useAgents(search?: string, page: number = 1, pageSize: number = 20) {
  let url = `/agents/?skip=${(page - 1) * pageSize}&limit=${pageSize}`;
  if (search) {
    url += `&search=${encodeURIComponent(search)}`;
  }
  const { data, error, isLoading } = useSWR<Agent[]>(url, fetcher);

  return {
    agents: data,
    isLoading,
    isError: error,
    mutate: () => mutate(url), 
  };
}

export function useAgent(id: string) {
    const { data, error, isLoading, mutate: mutateAgent } = useSWR<Agent>(id ? `/agents/${id}` : null, fetcher);
    return {
        agent: data,
        error,
        isLoading,
        isError: error,
        mutate: mutateAgent
    }
}

export function useDeleteAgent() {
  const deleteAgent = async (id: string) => {
    await api.delete(`/agents/${id}`);
  };
  return { deleteAgent };
}

export function useCreateAgent() {
    const createAgent = async (values: Partial<Agent>) => {
        return await api.post('/agents/', values);
    }
    return { createAgent };
}

export function useUpdateAgent() {
    const updateAgent = async (id: string, values: Partial<Agent>) => {
        return await api.put(`/agents/${id}`, values);
    }
    return { updateAgent };
}
