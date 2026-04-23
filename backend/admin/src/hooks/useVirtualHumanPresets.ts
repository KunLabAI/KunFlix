import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { fetcher } from '@/lib/api-utils';
import { VirtualHumanPreset, VirtualHumanPresetCreate, VirtualHumanPresetUpdate } from '@/types';

const BASE_URL = '/admin/virtual-human-presets';

export function useVirtualHumanPresets() {
  const { data, error, isLoading, mutate: mutateList } = useSWR<VirtualHumanPreset[]>(
    BASE_URL,
    fetcher,
  );

  return {
    presets: data,
    isLoading,
    isError: error,
    mutate: mutateList,
  };
}

export function useCreateVirtualHumanPreset() {
  const createPreset = async (values: VirtualHumanPresetCreate) => {
    const res = await api.post(BASE_URL, values);
    await mutate(BASE_URL);
    return res.data as VirtualHumanPreset;
  };
  return { createPreset };
}

export function useUpdateVirtualHumanPreset() {
  const updatePreset = async (id: string, values: VirtualHumanPresetUpdate) => {
    const res = await api.put(`${BASE_URL}/${id}`, values);
    await mutate(BASE_URL);
    return res.data as VirtualHumanPreset;
  };
  return { updatePreset };
}

export function useDeleteVirtualHumanPreset() {
  const deletePreset = async (id: string) => {
    await api.delete(`${BASE_URL}/${id}`);
    await mutate(BASE_URL);
  };
  return { deletePreset };
}
