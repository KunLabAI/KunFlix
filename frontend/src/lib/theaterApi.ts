import api from "./api";

// ---------------------------------------------------------------------------
// TypeScript interfaces (match backend schemas)
// ---------------------------------------------------------------------------

export interface TheaterNodeResponse {
  id: string;
  theater_id: string;
  node_type: string;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  z_index: number;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

export interface TheaterEdgeResponse {
  id: string;
  theater_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  edge_type: string;
  animated: boolean;
  style: Record<string, unknown>;
  created_at: string;
}

export interface TheaterResponse {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  status: "draft" | "published" | "archived";
  canvas_viewport: Record<string, unknown>;
  settings: Record<string, unknown>;
  node_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface TheaterDetailResponse extends TheaterResponse {
  nodes: TheaterNodeResponse[];
  edges: TheaterEdgeResponse[];
}

export interface TheaterListResponse {
  items: TheaterResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface TheaterNodeCreate {
  id?: string;
  node_type: string;
  position_x: number;
  position_y: number;
  width?: number | null;
  height?: number | null;
  z_index?: number;
  data: Record<string, unknown>;
}

export interface TheaterEdgeCreate {
  id?: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string | null;
  target_handle?: string | null;
  edge_type?: string;
  animated?: boolean;
  style?: Record<string, unknown>;
}

export interface TheaterSaveRequest {
  nodes: TheaterNodeCreate[];
  edges: TheaterEdgeCreate[];
  canvas_viewport?: Record<string, number>;
}

export interface TheaterCreateRequest {
  title?: string;
  description?: string | null;
  status?: "draft" | "published" | "archived";
}

export interface TheaterUpdateRequest {
  title?: string;
  description?: string | null;
  thumbnail_url?: string | null;
  status?: "draft" | "published" | "archived";
  canvas_viewport?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const theaterApi = {
  async createTheater(data: TheaterCreateRequest = {}): Promise<TheaterResponse> {
    const res = await api.post<TheaterResponse>("/theaters", data);
    return res.data;
  },

  async listTheaters(
    page = 1,
    pageSize = 20,
    status?: string,
  ): Promise<TheaterListResponse> {
    const params: Record<string, unknown> = { page, page_size: pageSize };
    if (status) params.status = status;
    const res = await api.get<TheaterListResponse>("/theaters", { params });
    return res.data;
  },

  async getTheater(theaterId: string): Promise<TheaterDetailResponse> {
    const res = await api.get<TheaterDetailResponse>(`/theaters/${theaterId}`);
    return res.data;
  },

  async updateTheater(
    theaterId: string,
    data: TheaterUpdateRequest,
  ): Promise<TheaterResponse> {
    const res = await api.put<TheaterResponse>(`/theaters/${theaterId}`, data);
    return res.data;
  },

  async deleteTheater(theaterId: string): Promise<void> {
    await api.delete(`/theaters/${theaterId}`);
  },

  async saveCanvas(
    theaterId: string,
    data: TheaterSaveRequest,
  ): Promise<TheaterDetailResponse> {
    const res = await api.put<TheaterDetailResponse>(
      `/theaters/${theaterId}/canvas`,
      data,
    );
    return res.data;
  },

  async duplicateTheater(theaterId: string): Promise<TheaterResponse> {
    const res = await api.post<TheaterResponse>(
      `/theaters/${theaterId}/duplicate`,
    );
    return res.data;
  },
};
