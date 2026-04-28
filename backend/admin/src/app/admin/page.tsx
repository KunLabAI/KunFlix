'use client';

import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  UserCheck,
  DollarSign,
  Wallet,
  Loader2,
  Crown,
  Percent,
  ShieldCheck,
  BadgeDollarSign,
  UserMinus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useDashboardOverview,
  useRegistrationTrend,
  useActiveTrend,
  useConversionTrend,
  useTokenLeaderboard,
  useOperationalMetrics,
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
} from 'recharts';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  borderColor: 'hsl(var(--border))',
  color: 'hsl(var(--card-foreground))',
};

const BUCKET_KEYS = ['today', 'yesterday', 'this_week', 'this_month', 'older'] as const;

const PERIOD_KEYS = ['today', 'yesterday', 'week', 'month', 'quarter', 'all'] as const;

const LIMIT_OPTIONS = [10, 50, 100] as const;

const fmt = (n?: number | null) => (n ?? 0).toLocaleString();
const pct = (n?: number | null) => `${(n ?? 0).toFixed(2)}%`;

// ---------------------------------------------------------------------------
// Stat Card config (4 cards)
// ---------------------------------------------------------------------------

interface StatCardDef {
  key: string;
  labelKey: string;
  icon: React.ElementType;
  color: string;
  getValue: (o: NonNullable<ReturnType<typeof useDashboardOverview>['overview']>) => string;
}

const STAT_CARDS: StatCardDef[] = [
  { key: 'users', labelKey: 'dashboard.stat.totalUsers', icon: Users, color: 'text-blue-500', getValue: (o) => fmt(o.total_users) },
  { key: 'today_active', labelKey: 'dashboard.stat.todayActive', icon: UserCheck, color: 'text-green-500', getValue: (o) => fmt(o.today_active_users) },
  { key: 'today_revenue', labelKey: 'dashboard.stat.todayRevenue', icon: DollarSign, color: 'text-amber-500', getValue: (o) => `$${fmt(o.today_revenue)}` },
  { key: 'total_revenue', labelKey: 'dashboard.stat.totalRevenue', icon: Wallet, color: 'text-violet-500', getValue: (o) => `$${fmt(o.total_revenue)}` },
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
  const { t } = useTranslation();
  const { overview, isLoading } = useDashboardOverview();

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STAT_CARDS.map(({ key, labelKey, icon: Icon, color, getValue }) => (
        <Card key={key} className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t(labelKey)}</CardTitle>
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
// Period selector (shared)
// ---------------------------------------------------------------------------

function PeriodSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1">
      {PERIOD_KEYS.map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
            value === key
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {t(`dashboard.period.${key}`)}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registration trend
// ---------------------------------------------------------------------------

function RegistrationTrendChart() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('month');
  const { trend, isLoading } = useRegistrationTrend(period);

  const buckets = trend?.buckets ?? {};
  const daily = trend?.daily ?? [];

  const title = t('dashboard.trend.titleWithRange', {
    name: t('dashboard.trend.registration'),
    range: t(`dashboard.period.rangeLabel.${period}`),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {BUCKET_KEYS.map((k) => (
            <Badge key={k} variant="secondary" className="text-xs font-normal">
              {t(`dashboard.bucket.${k}`)}：{fmt(buckets[k])}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {isLoading ? <LoadingSpinner /> : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => t('dashboard.trend.dateLabel', { date: l })} />
                <Area type="monotone" dataKey="count" name={t('dashboard.trend.registrationSeries')} stroke="hsl(var(--primary))" fill="url(#regGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Active trend
// ---------------------------------------------------------------------------

function ActiveTrendChart() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('month');
  const { trend, isLoading } = useActiveTrend(period);

  const daily = trend?.daily ?? [];

  const title = t('dashboard.trend.titleWithRange', {
    name: t('dashboard.trend.active'),
    range: t(`dashboard.period.rangeLabel.${period}`),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {isLoading ? <LoadingSpinner /> : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2, 160 60% 45%))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2, 160 60% 45%))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => t('dashboard.trend.dateLabel', { date: l })} />
                <Area type="monotone" dataKey="count" name={t('dashboard.trend.activeSeries')} stroke="hsl(var(--chart-2, 160 60% 45%))" fill="url(#activeGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Conversion trend
// ---------------------------------------------------------------------------

function ConversionTrendChart() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('month');
  const { trend, isLoading } = useConversionTrend(period);

  const daily = trend?.daily ?? [];

  const title = t('dashboard.trend.titleWithRange', {
    name: t('dashboard.trend.conversion'),
    range: t(`dashboard.period.rangeLabel.${period}`),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {isLoading ? <LoadingSpinner /> : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => t('dashboard.trend.dateLabel', { date: l })} />
                <Bar dataKey="new_subscriptions" name={t('dashboard.trend.conversionSeries')} fill="hsl(var(--chart-3, 30 80% 55%))" radius={[4, 4, 0, 0]} />
              </BarChart>
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

const ROW_HEIGHT = 56;

function TokenLeaderboard() {
  const { t } = useTranslation();
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
            <CardTitle className="text-base">{t('dashboard.leaderboard.title')}</CardTitle>
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
                {t('dashboard.leaderboard.top', { n })}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-0">
        {isLoading ? <LoadingSpinner /> : leaderboard.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('dashboard.leaderboard.empty')}</p>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[40px_1fr_100px_100px] gap-1 border-b px-1 pb-1.5 text-xs font-medium text-muted-foreground">
              <span>{t('dashboard.leaderboard.rank')}</span>
              <span>{t('dashboard.leaderboard.user')}</span>
              <span className="text-right">{t('dashboard.leaderboard.totalTokens')}</span>
              <span className="text-right">{t('dashboard.leaderboard.credits')}</span>
            </div>
            {/* Virtual scroll area */}
            <div ref={scrollRef} className="flex-1 overflow-auto">
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                {rowVirtualizer.getVirtualItems().map((vRow) => {
                  const entry = leaderboard[vRow.index];
                  return (
                    <div
                      key={entry.user_id}
                      className="absolute left-0 top-0 grid w-full grid-cols-[40px_1fr_100px_100px] items-center gap-1 border-b border-border/50 px-1"
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
                          <p className="truncate text-sm font-medium leading-none">{entry.nickname || t('dashboard.leaderboard.nicknamePlaceholder')}</p>
                          <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
                        </div>
                      </div>
                      <span className="text-right text-sm tabular-nums">{fmt(entry.total_tokens)}</span>
                      <div className="text-right">
                        <p className="text-sm tabular-nums font-medium">{fmt(entry.credits)}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">-{fmt(entry.credits_consumed)}</p>
                      </div>
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
// Business Metrics (PUR / Retention / MRR / Churn)
// ---------------------------------------------------------------------------

function BusinessMetrics() {
  const { t } = useTranslation();
  const { metrics, isLoading } = useOperationalMetrics();

  if (isLoading) return <LoadingSpinner />;

  const cards = [
    { label: t('dashboard.metrics.pur'), value: pct(metrics?.pur), icon: Percent, color: 'text-blue-500' },
    { label: t('dashboard.metrics.retention'), value: pct(metrics?.retention_rate), icon: ShieldCheck, color: 'text-green-500' },
    { label: t('dashboard.metrics.mrr'), value: `$${fmt(metrics?.mrr)}`, icon: BadgeDollarSign, color: 'text-amber-500' },
    { label: t('dashboard.metrics.churn'), value: pct(metrics?.churn_rate), icon: UserMinus, color: 'text-red-500' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('dashboard.metrics.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, color }) => (
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
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4">
      <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.title')}</h2>

      {/* Row 1: Stat cards */}
      <StatCardGrid />

      {/* Row 2: Left stack (3 trend charts) | Right (token leaderboard spans full height) */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <RegistrationTrendChart />
          <ActiveTrendChart />
          <ConversionTrendChart />
        </div>
        <div className="lg:col-span-2">
          <TokenLeaderboard />
        </div>
      </div>

      {/* Row 3: Business metrics */}
      <BusinessMetrics />
    </div>
  );
}
