import useSWR from 'swr';
import { useState, useEffect, useRef } from 'react';
import api from '@/lib/axios';
import { fetcher } from '@/lib/api-utils';
import { VideoTaskListResponse, VideoCreateRequest } from '@/types';

const ACTIVE_STATUSES = new Set(['pending', 'processing']);

interface VideoTaskFilters {
  page?: number;
  pageSize?: number;
  status?: string;
  videoMode?: string;
  providerId?: string;
}

export function useVideoTasks(filters: VideoTaskFilters = {}) {
  const { page = 1, pageSize = 20, status, videoMode, providerId } = filters;
  const [refreshInterval, setRefreshInterval] = useState(0);
  const pollingRef = useRef(false);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  status && params.set('status', status);
  videoMode && params.set('video_mode', videoMode);
  providerId && params.set('provider_id', providerId);

  const url = `/videos/?${params.toString()}`;
  const { data, error, isLoading, mutate } = useSWR<VideoTaskListResponse>(url, fetcher, {
    refreshInterval,
  });

  // 对活跃任务触发 status 端点（驱动 xAI 轮询更新 DB）
  useEffect(() => {
    const activeIds = (data?.items ?? [])
      .filter(t => ACTIVE_STATUSES.has(t.status))
      .map(t => t.id);

    setRefreshInterval(activeIds.length > 0 ? 5000 : 0);

    // 并发调用 status 端点，使后端轮询 xAI 并写入 DB
    activeIds.length > 0 && !pollingRef.current && (async () => {
      pollingRef.current = true;
      await Promise.allSettled(activeIds.map(id => api.get(`/videos/${id}/status`)));
      pollingRef.current = false;
    })();
  }, [data]);

  return {
    tasks: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useCreateVideoTask() {
  const createVideoTask = async (body: VideoCreateRequest) => {
    const res = await api.post('/videos', body);
    return res.data;
  };
  return { createVideoTask };
}

export function useDeleteVideoTask() {
  const deleteVideoTask = async (taskId: string) => {
    await api.delete(`/videos/${taskId}`);
  };
  return { deleteVideoTask };
}
