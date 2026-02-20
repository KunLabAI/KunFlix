import api from '@/lib/axios';

export const fetcher = (url: string) => api.get(url).then((res) => res.data);

export const parseProviderModels = (models: string[] | string): string[] => {
  if (Array.isArray(models)) {
    return models;
  }
  if (typeof models === 'string') {
    try {
      const parsed = JSON.parse(models);
      return Array.isArray(parsed) ? parsed : [models];
    } catch (e) {
      return [models];
    }
  }
  return [];
};
