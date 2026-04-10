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

  // Actions
  fetchAssets: (options?: { pageSize?: number; typeFilter?: FileTypeFilter }) => Promise<void>;
  loadMore: () => Promise<void>;
  setTypeFilter: (type: FileTypeFilter) => void;
  addUpload: (file: File) => void;
  removeUpload: (id: string) => void;
  renameAsset: (id: string, name: string) => Promise<void>;
  replaceAssetFile: (id: string, file: File) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  /** 从外部上传（如画布）同步新资产到 store */
  syncAssetFromUpload: (asset: AssetItem | Record<string, unknown>) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let _uploadCounter = 0;

export const useResourceStore = create<ResourceState>((set, get) => ({
  assets: [],
  total: 0,
  page: 1,
  pageSize: 20,
  typeFilter: "all",
  isLoading: false,
  hasMore: false,
  uploadQueue: [],

  async fetchAssets(options) {
    const size = options?.pageSize ?? get().pageSize;
    const filter = options?.typeFilter ?? get().typeFilter;
    set({ isLoading: true, page: 1 });
    try {
      const res = await resourceApi.listAssets(1, size, filter);
      set({
        assets: res.items,
        total: res.total,
        page: 1,
        hasMore: res.items.length < res.total,
      });
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
      set({
        assets: merged,
        total: res.total,
        page: nextPage,
        hasMore: merged.length < res.total,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  setTypeFilter(type) {
    set({ typeFilter: type, assets: [], total: 0, page: 1 });
    get().fetchAssets();
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
          // 上传成功：将新资产添加到列表头部，移除上传队列项
          assets: [res.asset, ...s.assets],
          total: s.total + 1,
          uploadQueue: s.uploadQueue.filter((q) => q.id !== id),
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
    }));
  },

  async replaceAssetFile(id, file) {
    const updated = await resourceApi.updateAsset(id, { file });
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...updated } : a)),
    }));
  },

  async deleteAsset(id) {
    await resourceApi.deleteAsset(id);
    set((s) => ({
      assets: s.assets.filter((a) => a.id !== id),
      total: s.total - 1,
    }));
  },

  syncAssetFromUpload(asset) {
    const assetItem = asset as AssetItem;
    // 避免重复添加
    set((s) => {
      const exists = s.assets.some((a) => a.id === assetItem.id);
      return exists
        ? s
        : { assets: [assetItem, ...s.assets], total: s.total + 1 };
    });
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
    });
  },
}));
