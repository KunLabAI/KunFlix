'use client';

import React, { useState, useRef } from 'react';
import {
  Users,
  UserCheck,
  BookOpen,
  FileImage,
  Video,
  Coins,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Crown,
  Wrench,
  Clock,
  Music,
  Film,
  ImageIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useDashboardOverview,
  useRegistrationTrend,
  useTokenLeaderboard,
  useSubscriptionAnalysis,
  useContentStats,
} from '@/hooks/useDashboard';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  borderColor: 'hsl(var(--border))',
  color: 'hsl(var(--card-foreground))',
};

const BUCKET_LABELS: Record<string, string> = {
  today: '今日',
  yesterday: '昨日',
  this_week: '本周',
  this_month: '本月',
  older: '更早',
};

const PIE_COLORS = [
  'hsl(var(--chart-1, 220 70% 50%))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
];

const fmt = (n?: number | null) => (n ?? 0).toLocaleString();
const pct = (n?: number | null) => `${(n ?? 0).toFixed(2)}%`;

// ---------------------------------------------------------------------------
// Period / Limit options
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'quarter', label: '近三月' },
  { key: 'all', label: '全部' },
];

const PERIOD_TITLE: Record<string, string> = {
  today: '注册趋势（今日）',
  yesterday: '注册趋势（近 2 天）',
  week: '注册趋势（本周）',
  month: '注册趋势（近 30 天）',
  quarter: '注册趋势（近 3 个月）',
  all: '注册趋势（全部）',
};

const LIMIT_OPTIONS = [10, 50, 100] as const;

// ---------------------------------------------------------------------------
// Stat Card config
// ---------------------------------------------------------------------------

interface StatCardDef {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  getValue: (o: NonNullable<ReturnType<typeof useDashboardOverview>['overview']>) => string;
}

const STAT_CARDS: StatCardDef[] = [
  { key: 'users', label: '用户总数', icon: Users, color: 'text-blue-500', getValue: (o) => fmt(o.total_users) },
  { key: 'active', label: '活跃用户', icon: UserCheck, color: 'text-green-500', getValue: (o) => fmt(o.active_users) },
  { key: 'theaters', label: '故事总数', icon: BookOpen, color: 'text-violet-500', getValue: (o) => fmt(o.total_theaters) },
  { key: 'assets', label: '生成资产', icon: FileImage, color: 'text-cyan-500', getValue: (o) => fmt(o.total_assets) },
  { key: 'video', label: '视频任务', icon: Video, color: 'text-rose-500', getValue: (o) => fmt(o.total_video_tasks) },
  { key: 'credits', label: '积分消耗', icon: Coins, color: 'text-amber-500', getValue: (o) => fmt(o.total_credits_consumed) },
  { key: 'conversion', label: '付费转化率', icon: TrendingUp, color: 'text-emerald-500', getValue: (o) => pct(o.paid_conversion_rate) },
  { key: 'error', label: 'API 错误率', icon: AlertTriangle, color: 'text-red-500', getValue: (o) => pct(o.api_error_rate) },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function StatCardGrid() {
  const { overview, isLoading } = useDashboardOverview();

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STAT_CARDS.map(({ key, label, icon: Icon, color, getValue }) => (
        <Card key={key} className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className={`h-4 w-4 ${color}`} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight">{overview ? getValue(overview) : '—'}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registration trend
// ---------------------------------------------------------------------------

function RegistrationTrendChart() {
  const [period, setPeriod] = useState('month');
  const { trend, isLoading } = useRegistrationTrend(period);

  const buckets = trend?.buckets ?? {};
  const daily = trend?.daily ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{PERIOD_TITLE[period] ?? '注册趋势'}</CardTitle>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                  period === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {Object.entries(BUCKET_LABELS).map(([k, v]) => (
            <Badge key={k} variant="secondary" className="text-xs font-normal">
              {v}：{fmt(buckets[k])}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {isLoading ? <LoadingSpinner /> : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                  className="fill-muted-foreground"
                />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => `日期：${l}`} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="注册数"
                  stroke="hsl(var(--primary))"
                  fill="url(#regGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Token leaderboard (virtual scroll)
// ---------------------------------------------------------------------------

const RANK_COLORS: Record<number, string> = {
  1: 'text-amber-500',
  2: 'text-slate-400',
  3: 'text-amber-700',
};

const ROW_HEIGHT = 52;

function TokenLeaderboard() {
  const [limit, setLimit] = useState<number>(10);
  const { leaderboard, isLoading } = useTokenLeaderboard(limit);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: leaderboard.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base">Token 消耗排行榜</CardTitle>
          </div>
          <div className="flex gap-1">
            {LIMIT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                  limit === n
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                Top {n}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-0">
        {isLoading ? <LoadingSpinner /> : leaderboard.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无数据</p>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[40px_1fr_100px_80px] gap-1 border-b px-1 pb-1.5 text-xs font-medium text-muted-foreground">
              <span>#</span>
              <span>用户</span>
              <span className="text-right">总 Token</span>
              <span className="text-right">积分</span>
            </div>
            {/* Virtual scroll area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto"
            >
              <div
                style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}
              >
                {rowVirtualizer.getVirtualItems().map((vRow) => {
                  const entry = leaderboard[vRow.index];
                  return (
                    <div
                      key={entry.user_id}
                      className="absolute left-0 top-0 grid w-full grid-cols-[40px_1fr_100px_80px] items-center gap-1 border-b border-border/50 px-1"
                      style={{ height: vRow.size, transform: `translateY(${vRow.start}px)` }}
                    >
                      <span className={`text-sm font-semibold tabular-nums ${RANK_COLORS[entry.rank] ?? ''}`}>
                        {entry.rank}
                      </span>
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback className="text-[10px]">
                            {(entry.nickname?.[0] ?? entry.email?.[0] ?? '?').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium leading-none">{entry.nickname || '—'}</p>
                          <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
                        </div>
                      </div>
                      <span className="text-right text-sm tabular-nums">{fmt(entry.total_tokens)}</span>
                      <span className="text-right text-sm tabular-nums">{fmt(entry.credits)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Subscription analysis
// ---------------------------------------------------------------------------

function SubscriptionAnalysis() {
  const { subscriptions, isLoading } = useSubscriptionAnalysis();

  if (isLoading) return <LoadingSpinner />;

  const byPlan = subscriptions?.by_plan ?? [];
  const timeBuckets = subscriptions?.time_buckets ?? {};

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">订阅分析</CardTitle>
        <p className="text-xs text-muted-foreground">
          活跃订阅：{fmt(subscriptions?.total_active_subscriptions)}
        </p>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byPlan} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="plan_name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [fmt(value as number), name]}
              />
              <Bar dataKey="active_count" name="活跃用户" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revenue" name="收入 (USD)" fill="hsl(var(--chart-2, 160 60% 45%))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Separator className="my-3" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {Object.entries(timeBuckets).map(([k, v]) => (
            <span key={k}>{BUCKET_LABELS[k] ?? k}：<strong className="text-foreground">{fmt(v)}</strong></span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Content stats (pie charts)
// ---------------------------------------------------------------------------

function ContentStats() {
  const { content, isLoading } = useContentStats();

  if (isLoading) return <LoadingSpinner />;

  const video = content?.video;
  const image = content?.image;
  const music = content?.music;

  const pieData = [
    { name: '视频成功', value: video?.completed ?? 0 },
    { name: '视频失败', value: video?.failed ?? 0 },
    { name: '图像成功', value: image?.completed ?? 0 },
    { name: '图像失败', value: image?.failed ?? 0 },
    { name: '音乐成功', value: music?.completed ?? 0 },
    { name: '音乐失败', value: music?.failed ?? 0 },
  ];

  const successCards = [
    { label: '视频生成', icon: Film, total: video?.total ?? 0, rate: video?.success_rate ?? 0, color: 'text-rose-500' },
    { label: '图像生成', icon: ImageIcon, total: image?.total ?? 0, rate: image?.success_rate ?? 0, color: 'text-cyan-500' },
    { label: '音乐生成', icon: Music, total: music?.total ?? 0, rate: music?.success_rate ?? 0, color: 'text-violet-500' },
  ];

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">内容生成统计</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <div className="grid grid-cols-3 gap-3 mb-3">
          {successCards.map(({ label, icon: Icon, total, rate, color }) => (
            <div key={label} className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                {label}
              </div>
              <p className="mt-1 text-lg font-bold">{fmt(total)}</p>
              <p className="text-xs text-muted-foreground">
                成功率：<span className="text-foreground font-medium">{rate.toFixed(1)}%</span>
              </p>
            </div>
          ))}
        </div>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={72}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
                strokeWidth={0}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Operational metrics
// ---------------------------------------------------------------------------

function OperationalMetrics() {
  const { overview, isLoading: overviewLoading } = useDashboardOverview();
  const { content, isLoading: contentLoading } = useContentStats();

  if (overviewLoading || contentLoading) return <LoadingSpinner />;

  const tool = content?.tool_execution;

  const metrics = [
    { label: '工具总调用', value: fmt(overview?.tool_total_calls), icon: Wrench, color: 'text-blue-500' },
    { label: '工具错误数', value: fmt(overview?.tool_errors), icon: AlertTriangle, color: 'text-red-500' },
    { label: '错误率', value: pct(tool?.error_rate), icon: TrendingUp, color: 'text-amber-500' },
    { label: '平均耗时', value: tool?.avg_duration_ms != null ? `${tool.avg_duration_ms.toFixed(0)} ms` : '—', icon: Clock, color: 'text-emerald-500' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">运营指标</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                {label}
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4">
      <h2 className="text-2xl font-bold tracking-tight">仪表盘</h2>

      {/* Row 1: Stat cards */}
      <StatCardGrid />

      {/* Row 2+3: Left stack (trend + subscription) | Right (token leaderboard spans full height) */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <RegistrationTrendChart />
          <SubscriptionAnalysis />
        </div>
        <div className="lg:col-span-2">
          <TokenLeaderboard />
        </div>
      </div>

      {/* Row 4: Content stats */}
      <ContentStats />

      {/* Row 4: Operational metrics */}
      <OperationalMetrics />
    </div>
  );
}
