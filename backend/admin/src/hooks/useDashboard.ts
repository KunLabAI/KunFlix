import useSWR from 'swr';
import api from '@/lib/axios';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverviewData {
  total_users: number;
  active_users: number;
  total_theaters: number;
  total_assets: number;
  total_video_tasks: number;
  total_music_tasks: number;
  total_credits_consumed: number;
  paid_users: number;
  paid_conversion_rate: number;
  api_error_rate: number;
  tool_total_calls: number;
  tool_errors: number;
}

export interface RegistrationTrendData {
  buckets: Record<string, number>;
  daily: Array<{ date: string; count: number }>;
  period: string;
}

export interface TokenLeaderboardEntry {
  rank: number;
  user_id: string;
  nickname: string;
  email: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  credits: number;
}

export interface PlanBreakdown {
  plan_id: string;
  plan_name: string;
  price_usd: number;
  active_count: number;
  revenue: number;
}

export interface SubscriptionAnalysisData {
  total_active_subscriptions: number;
  by_plan: PlanBreakdown[];
  time_buckets: Record<string, number>;
}

export interface ContentStatsData {
  video: { total: number; completed: number; failed: number; success_rate: number };
  image: { total: number; completed: number; failed: number; success_rate: number };
  music: { total: number; completed: number; failed: number; success_rate: number };
  assets_by_type: Record<string, number>;
  tool_execution: { total: number; errors: number; error_rate: number; avg_duration_ms: number | null };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useDashboardOverview() {
  const { data, error, isLoading } = useSWR<OverviewData>('/admin/dashboard/overview', fetcher);
  return { overview: data, error, isLoading };
}

export function useRegistrationTrend(period: string = 'month') {
  const { data, error, isLoading } = useSWR<RegistrationTrendData>(`/admin/dashboard/registration-trend?period=${period}`, fetcher);
  return { trend: data, error, isLoading };
}

export function useTokenLeaderboard(limit: number = 10) {
  const { data, error, isLoading } = useSWR<TokenLeaderboardEntry[]>(`/admin/dashboard/token-leaderboard?limit=${limit}`, fetcher);
  return { leaderboard: data ?? [], error, isLoading };
}

export function useSubscriptionAnalysis() {
  const { data, error, isLoading } = useSWR<SubscriptionAnalysisData>('/admin/dashboard/subscription-analysis', fetcher);
  return { subscriptions: data, error, isLoading };
}

export function useContentStats() {
  const { data, error, isLoading } = useSWR<ContentStatsData>('/admin/dashboard/content-stats', fetcher);
  return { content: data, error, isLoading };
}
