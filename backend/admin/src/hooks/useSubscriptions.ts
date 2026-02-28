import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { fetcher } from '@/lib/api-utils';
import { SubscriptionPlan } from '@/types';

const LIST_KEY = '/admin/subscriptions/';

export function useSubscriptions() {
  const { data, error, isLoading } = useSWR<SubscriptionPlan[]>(LIST_KEY, fetcher);

  return {
    plans: data,
    isLoading,
    isError: error,
    mutate: () => mutate(LIST_KEY),
  };
}

export function useCreatePlan() {
  const createPlan = async (values: Partial<SubscriptionPlan>) => {
    return await api.post(LIST_KEY, values);
  };
  return { createPlan };
}

export function useUpdatePlan() {
  const updatePlan = async (id: string, values: Partial<SubscriptionPlan>) => {
    return await api.put(`/admin/subscriptions/${id}`, values);
  };
  return { updatePlan };
}

export function useDeletePlan() {
  const deletePlan = async (id: string) => {
    await api.delete(`/admin/subscriptions/${id}`);
  };
  return { deletePlan };
}
