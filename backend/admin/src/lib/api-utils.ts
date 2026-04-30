import api from '@/lib/axios';

export const fetcher = (url: string) => api.get(url).then((res) => res.data);

/**
 * 统一提取 FastAPI / axios 错误为字符串，防止将 detail 对象或数组直接传给
 * React 子节点导致 "Objects are not valid as a React child"。
 * FastAPI 422 结构：{ detail: [{ loc: [..], msg: string, type: string, ctx?: {..} }] }
 */
export const formatApiError = (err: any, fallback = 'Request failed'): string => {
  const detail = err?.response?.data?.detail;
  const message = err?.response?.data?.message;

  // 映射表驱动的分派（避免 if-else 链）
  const formatters: Record<string, () => string> = {
    string: () => detail as string,
    array: () => (detail as any[])
      .map((d) => {
        const loc = Array.isArray(d?.loc) ? d.loc.filter((x: any) => x !== 'body').join('.') : '';
        const msg = d?.msg || JSON.stringify(d);
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join('; '),
    object: () => (detail?.msg as string) || JSON.stringify(detail),
  };

  const kind = typeof detail === 'string'
    ? 'string'
    : Array.isArray(detail)
      ? 'array'
      : detail && typeof detail === 'object'
        ? 'object'
        : '';

  return formatters[kind]?.() || (typeof message === 'string' && message) || err?.message || fallback;
};

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

type ModelMetadata = Record<string, { model_type?: string; display_name?: string }>;

/** 获取模型显示名：优先使用别称，无则回退原名 */
export const getModelDisplayName = (
  modelName: string,
  metadata?: ModelMetadata,
): string => {
  return metadata?.[modelName]?.display_name || modelName;
};

/** 解析模型列表并附带显示名 */
export const parseProviderModelsWithMeta = (
  models: string[] | string,
  metadata?: ModelMetadata,
): { value: string; displayName: string }[] => {
  const list = parseProviderModels(models);
  return list.map(m => ({
    value: m,
    displayName: getModelDisplayName(m, metadata),
  }));
};

export interface FlatModelEntry {
  value: string;
  displayName: string;
  providerId: string;
  providerName: string;
}

/**
 * 从所有活跃供应商中收集指定类型的模型，返回扁平化列表。
 * 每个条目携带 providerId，选择模型时可自动关联供应商。
 */
export const collectModelsByType = (
  providers: Array<{ id: string; name: string; models: string[] | string; is_active: boolean; model_metadata?: ModelMetadata }>,
  modelType: string,
): FlatModelEntry[] => {
  const result: FlatModelEntry[] = [];
  providers.forEach(p => {
    const models = parseProviderModels(p.models);
    models.forEach(m => {
      const meta = p.model_metadata?.[m];
      if (meta?.model_type === modelType) {
        result.push({
          value: m,
          displayName: meta.display_name || m,
          providerId: p.id,
          providerName: p.name,
        });
      }
    });
  });
  return result;
};
