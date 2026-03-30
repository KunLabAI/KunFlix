import api from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetItem {
  id: string;
  user_id: string;
  filename: string;
  original_name: string | null;
  file_type: string | null;
  mime_type: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  url: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

export interface AssetListResponse {
  items: AssetItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface UploadResponse {
  url: string;
  asset: AssetItem;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const resourceApi = {
  /** 获取当前用户的资源列表（分页，可按类型筛选） */
  async listAssets(
    page = 1,
    pageSize = 20,
    fileType?: string | null
  ): Promise<AssetListResponse> {
    const params: Record<string, string | number> = { page, page_size: pageSize };
    fileType && fileType !== "all" && (params.file_type = fileType);
    const { data } = await api.get<AssetListResponse>("/media/assets", { params });
    return data;
  },

  /** 上传文件（支持进度回调） */
  uploadAsset(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<UploadResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append("file", file);

      xhr.open("POST", "/api/media/upload");

      // 附加 JWT token
      const token = localStorage.getItem("access_token");
      token && xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText);
          xhr.status >= 200 && xhr.status < 300
            ? resolve(response)
            : reject(new Error(response.detail || "Upload failed"));
        } catch {
          reject(new Error(`上传失败 (HTTP ${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(formData);
    });
  },

  /** 更新资源（重命名和/或替换文件） */
  async updateAsset(
    id: string,
    options: { original_name?: string; file?: File }
  ): Promise<AssetItem> {
    const formData = new FormData();
    options.original_name && formData.append("original_name", options.original_name);
    options.file && formData.append("file", options.file);

    const { data } = await api.put<AssetItem>(`/media/assets/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  /** 硬删除资源 */
  async deleteAsset(id: string): Promise<void> {
    await api.delete(`/media/assets/${id}`);
  },
};
