import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { fetcher } from '@/lib/api-utils';
import { PromptTemplate } from '@/types';

export function usePromptTemplates(filters?: {
  template_type?: string;
  agent_type?: string;
  is_active?: boolean;
}) {
  let url = `/prompt-templates/?limit=100`;
  if (filters?.template_type) url += `&template_type=${filters.template_type}`;
  if (filters?.agent_type) url += `&agent_type=${filters.agent_type}`;
  if (filters?.is_active !== undefined) url += `&is_active=${filters.is_active}`;

  const { data, error, isLoading } = useSWR<PromptTemplate[]>(url, fetcher);
  return {
    templates: data,
    isLoading,
    isError: error,
    mutate: () => mutate(url),
  };
}

export function usePromptTemplate(id: string) {
  const { data, error, isLoading, mutate: mutateTemplate } = useSWR<PromptTemplate>(
    id ? `/prompt-templates/${id}` : null,
    fetcher
  );
  return { template: data, error, isLoading, mutate: mutateTemplate };
}

export function useCreatePromptTemplate() {
  const createTemplate = async (values: Partial<PromptTemplate>) => {
    return await api.post('/prompt-templates/', values);
  };
  return { createTemplate };
}

export function useUpdatePromptTemplate() {
  const updateTemplate = async (id: string, values: Partial<PromptTemplate>) => {
    return await api.put(`/prompt-templates/${id}`, values);
  };
  return { updateTemplate };
}

export function useDeletePromptTemplate() {
  const deleteTemplate = async (id: string) => {
    await api.delete(`/prompt-templates/${id}`);
  };
  return { deleteTemplate };
}
