import { create } from "zustand";
import { resourceApi, AssetItem } from "@/lib/resourceApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileTypeFilter = "all" | "image" | "video" | "audio";

export interface UploadQueueItem {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

// 按 typeFilter 分键的快照缓存：进入/切回资产库立即还原，避免 loading 闪烁。
interface CacheSnapshot {
  assets: AssetItem[];
  total: number;
  page: number;
  hasMore: boolean;
  ts: number;
}

const FRESH_TTL_MS = 60_000;

interface ResourceState {
  // 资产数据
  assets: AssetItem[];
  total: number;
  page: number;
  pageSize: number;
  typeFilter: FileTypeFilter;
  isLoading: boolean;
  hasMore: boolean;

  // 上传队列
  uploadQueue: UploadQueueItem[];

  // SWR 快照：按 filter 分键，仅在内存，管线生命周期随页面刷新。
  _cache: Partial<Record<FileTypeFilter, CacheSnapshot>>;

  // Actions
  fetchAssets: (options?: { pageSize?: number; typeFilter?: FileTypeFilter }) => Promise<void>;
  loadMore: () => Promise<void>;
  setTypeFilter: (type: FileTypeFilter) => void;
  addUpload: (file: File) => void;
  removeUpload: (id: string) => void;
  renameAsset: (id: string, name: string) => Promise<void>;
  replaceAssetFile: (id: string, file: File) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  batchDeleteAssets: (ids: string[]) => Promise<number>;
  /** 从外部上传（如画布）同步新资产到 store */
  syncAssetFromUpload: (asset: AssetItem | Record<string, unknown>) => void;
  /** 失效所有 filter 的缓存快照，下次访问重拉。 */
  invalidateCache: () => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let _uploadCounter = 0;

// 从当前 state 生成某个 filter 的快照
function snapshotOf(
  filter: FileTypeFilter,
  assets: AssetItem[],
  total: number,
  page: number,
  hasMore: boolean,
): { [k in FileTypeFilter]?: CacheSnapshot } {
  return { [filter]: { assets, total, page, hasMore, ts: Date.now() } };
}

export const useResourceStore = create<ResourceState>((set, get) => ({
  assets: [],
  total: 0,
  page: 1,
  pageSize: 20,
  typeFilter: "all",
  isLoading: false,
  hasMore: false,
  uploadQueue: [],
  _cache: {},

  async fetchAssets(options) {
    const size = options?.pageSize ?? get().pageSize;
    const filter = options?.typeFilter ?? get().typeFilter;
    const cache = get()._cache[filter];
    const fresh = !!cache && Date.now() - cache.ts < FRESH_TTL_MS;

    // 命中且新鲜：直接还原快照，不走 loading
    fresh && cache && set({
      assets: cache.assets,
      total: cache.total,
      page: cache.page,
      hasMore: cache.hasMore,
      typeFilter: filter,
      isLoading: false,
    });
    if (fresh) return;

    // 有 stale 数据（同 filter）：SWR 模式 — 保留旧数据不闪 loading。
    const hasStale = !!cache && cache.assets.length > 0;
    set({ typeFilter: filter, isLoading: !hasStale });
    hasStale && cache && set({
      assets: cache.assets,
      total: cache.total,
      page: cache.page,
      hasMore: cache.hasMore,
    });

    try {
      const res = await resourceApi.listAssets(1, size, filter);
      const hasMore = res.items.length < res.total;
      set((s) => ({
        assets: res.items,
        total: res.total,
        page: 1,
        hasMore,
        _cache: { ...s._cache, ...snapshotOf(filter, res.items, res.total, 1, hasMore) },
      }));
    } finally {
      set({ isLoading: false });
    }
  },

  async loadMore() {
    const { page, pageSize, typeFilter, assets, total, isLoading } = get();
    const loaded = assets.length >= total;
    if (isLoading || loaded) return;

    const nextPage = page + 1;
    set({ isLoading: true });
    try {
      const res = await resourceApi.listAssets(nextPage, pageSize, typeFilter);
      const merged = [...assets, ...res.items];
      const hasMore = merged.length < res.total;
      set((s) => ({
        assets: merged,
        total: res.total,
        page: nextPage,
        hasMore,
        _cache: { ...s._cache, ...snapshotOf(typeFilter, merged, res.total, nextPage, hasMore) },
      }));
    } finally {
      set({ isLoading: false });
    }
  },

  setTypeFilter(type) {
    // 只记录新 filter；fetchAssets 内部会处理快照还原 / 重拉
    set({ typeFilter: type });
    get().fetchAssets({ typeFilter: type });
  },

  addUpload(file) {
    const id = `upload-${++_uploadCounter}`;
    const item: UploadQueueItem = { id, file, progress: 0, status: "uploading" };
    set((s) => ({ uploadQueue: [...s.uploadQueue, item] }));

    resourceApi
      .uploadAsset(file, (progress) => {
        set((s) => ({
          uploadQueue: s.uploadQueue.map((q) =>
            q.id === id ? { ...q, progress } : q
          ),
        }));
      })
      .then((res) => {
        set((s) => ({
          // 上传成功：新资产添加到列表头部，移除上传队列项，并失效所有缓存
          assets: [res.asset, ...s.assets],
          total: s.total + 1,
          uploadQueue: s.uploadQueue.filter((q) => q.id !== id),
          _cache: {},
        }));
      })
      .catch((err) => {
        set((s) => ({
          uploadQueue: s.uploadQueue.map((q) =>
            q.id === id ? { ...q, status: "error", error: String(err) } : q
          ),
        }));
      });
  },

  removeUpload(id) {
    set((s) => ({ uploadQueue: s.uploadQueue.filter((q) => q.id !== id) }));
  },

  async renameAsset(id, name) {
    const updated = await resourceApi.updateAsset(id, { original_name: name });
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...updated } : a)),
      _cache: {},
    }));
  },

  async replaceAssetFile(id, file) {
    const updated = await resourceApi.updateAsset(id, { file });
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...updated } : a)),
      _cache: {},
    }));
  },

  async deleteAsset(id) {
    await resourceApi.deleteAsset(id);
    set((s) => ({
      assets: s.assets.filter((a) => a.id !== id),
      total: s.total - 1,
      _cache: {},
    }));
  },

  async batchDeleteAssets(ids) {
    const idSet = new Set(ids);
    // 乐观更新：先从 UI 移除并失效缓存
    set((s) => ({
      assets: s.assets.filter((a) => !idSet.has(a.id)),
      total: Math.max(0, s.total - ids.length),
      _cache: {},
    }));
    try {
      const res = await resourceApi.batchDeleteAssets(ids);
      return res.deleted;
    } catch (err) {
      // 回滚：重新加载
      get().fetchAssets();
      throw err;
    }
  },

  syncAssetFromUpload(asset) {
    const assetItem = asset as AssetItem;
    // 避免重复添加，同时失效缓存以重拉主源
    set((s) => {
      const exists = s.assets.some((a) => a.id === assetItem.id);
      return exists
        ? s
        : { assets: [assetItem, ...s.assets], total: s.total + 1, _cache: {} };
    });
  },

  invalidateCache() {
    set({ _cache: {} });
  },

  reset() {
    set({
      assets: [],
      total: 0,
      page: 1,
      typeFilter: "all",
      isLoading: false,
      hasMore: false,
      uploadQueue: [],
      _cache: {},
    });
  },
}));
