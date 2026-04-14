"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import {
  Clock,
  Globe,
  CreditCard,
  Gift,
  HelpCircle,
  ChevronDown,
  Receipt,
  Glasses,
  HardDrive,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── helpers ─────────────────────────────────────────────────────────────────
interface DailyUsage {
  date: string;
  total: number;
}

const USAGE_PERIOD_OPTIONS: Array<{ key: string; days: number; labelKey: string }> = [
  { key: "week", days: 7, labelKey: "settings.subscription.periodWeek" },
  { key: "month", days: 30, labelKey: "settings.subscription.periodMonth" },
  { key: "quarter", days: 90, labelKey: "settings.subscription.periodQuarter" },
  { key: "all", days: 90, labelKey: "settings.subscription.periodAll" },
];

const USAGE_PERIOD_FALLBACK: Record<string, string> = {
  week: "7天",
  month: "30天",
  quarter: "90天",
  all: "全部",
};

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  borderColor: "hsl(var(--border))",
  color: "hsl(var(--card-foreground))",
};

interface StorageInfo {
  used_bytes: number;
  quota_bytes: number;
  usage_percent: number;
}

const formatBytes = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
};

// ── types & config ──────────────────────────────────────────────────────────
const TAB_KEYS = ["subscription", "general", "billing"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_ICONS: Record<TabKey, React.ElementType> = {
  subscription: Clock,
  general: Globe,
  billing: CreditCard,
};

const SUB_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Pro", cls: "bg-primary text-primary-foreground" },
  expired: { label: "Expired", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  inactive: { label: "Free", cls: "bg-muted text-muted-foreground border border-border" },
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── main component ──────────────────────────────────────────────────────────
export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const [currentTab, setCurrentTab] = useState<TabKey>("subscription");
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usagePeriod, setUsagePeriod] = useState("month");
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  const badge = SUB_BADGE[user?.subscription_status ?? "inactive"] ?? SUB_BADGE.inactive;

  // ── data fetching ──────────────────────────────────────────────────────
  const usageDays = USAGE_PERIOD_OPTIONS.find((o) => o.key === usagePeriod)?.days ?? 30;

  const fetchDailyUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const { data } = await api.get<DailyUsage[]>("/auth/credits/daily-usage", { params: { days: usageDays } });
      setDailyUsage(data);
    } catch { /* silent */ }
    setUsageLoading(false);
  }, [usageDays]);

  const fetchStorageInfo = useCallback(async () => {
    setStorageLoading(true);
    try {
      const { data } = await api.get<StorageInfo>("/media/storage-usage");
      setStorageInfo(data);
    } catch { /* silent */ }
    setStorageLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchDailyUsage();
    fetchStorageInfo();
  }, [open, fetchDailyUsage, fetchStorageInfo]);

  const handleUsagePeriodChange = useCallback((key: string) => {
    setUsagePeriod(key);
  }, []);

  // ── tab content map ─────────────────────────────────────────────────────
  const TAB_CONTENT: Record<TabKey, () => React.JSX.Element> = {
    subscription: SubscriptionTab,
    general: GeneralTab,
    billing: BillingTab,
  };
  const ActiveContent = TAB_CONTENT[currentTab] ?? SubscriptionTab;

  // ── Subscription ────────────────────────────────────────────────────────
  function SubscriptionTab() {
    return (
      <div className="space-y-8">
        {/* user header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-800 flex items-center justify-center text-white text-lg font-semibold shrink-0">
            {(user?.nickname ?? "U").charAt(0).toLowerCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-foreground truncate">{user?.nickname}</span>
              <span className={cn("px-2 py-0.5 rounded text-xs font-medium", badge.cls)}>{badge.label}</span>
            </div>
            <p className="text-sm text-muted-foreground truncate">{t("profile.email")}: {user?.email}</p>
          </div>
        </div>

        {/* plan */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">{t("settings.subscription.plan")}</h2>
          <div className="rounded-xl bg-muted/50 border border-border p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-xl font-bold text-foreground">{t("settings.subscription.freePlan")}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30">
                    {t("settings.subscription.currentPlan")}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{t("settings.subscription.upgradeDesc")}</p>
              </div>
              <button className="px-5 py-2 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity shrink-0">
                {t("settings.subscription.upgrade")}
              </button>
            </div>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {(user?.credits ?? 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                {t("settings.subscription.remainingCredits")}
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </section>

        {/* usage chart */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-foreground">{t("settings.subscription.usage")}</h2>
            <div className="flex gap-1">
              {USAGE_PERIOD_OPTIONS.map(({ key, labelKey }) => (
                <button
                  key={key}
                  onClick={() => handleUsagePeriodChange(key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    usagePeriod === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t(labelKey, USAGE_PERIOD_FALLBACK[key])}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{t("settings.subscription.dailyUsage")}</p>
          <div className="w-full h-[260px] rounded-xl border border-border bg-muted/20 overflow-hidden p-2">
            {usageLoading ? (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />{t("settings.general.loadingStorage")}
              </div>
            ) : dailyUsage.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                {t("settings.subscription.noUsageData")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyUsage} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(5)}
                    className="fill-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(l) => `${t("settings.subscription.dateLabel", "日期")}：${l}`}
                    formatter={(value) => [Number(value ?? 0).toFixed(2), t("settings.subscription.creditsConsumed", "消耗")]}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name={t("settings.subscription.creditsConsumed", "积分消耗")}
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.15)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* extra credits */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">{t("settings.subscription.extraCredits")}</h2>
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Gift className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">{t("settings.subscription.noExtraCredits")}</p>
          </div>
        </section>
      </div>
    );
  }

  // ── General ─────────────────────────────────────────────────────────────
  function GeneralTab() {
    const langOptions = [
      { value: "zh-CN", label: "简体中文" },
      { value: "en-US", label: "English" },
    ];
    const themeOptions: { value: "light" | "system" | "dark"; labelKey: string }[] = [
      { value: "light", labelKey: "settings.general.themeLight" },
      { value: "dark", labelKey: "settings.general.themeDark" },
      { value: "system", labelKey: "settings.general.themeSystem" },
    ];

    return (
      <div className="space-y-8">
        {/* profile */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-5">{t("settings.general.profile")}</h2>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-800 flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {(user?.nickname ?? "U").charAt(0).toLowerCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{user?.nickname}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </section>

        <hr className="border-border" />

        {/* language & time */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-5">{t("settings.general.languageAndTime")}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{t("settings.general.displayLanguage")}</span>
              <div className="relative">
                <select
                  value={i18n.language}
                  onChange={(e) => i18n.changeLanguage(e.target.value)}
                  className="appearance-none px-4 py-2 pr-8 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  {langOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{t("settings.general.timezone")}</span>
              <div className="relative">
                <select
                  defaultValue="Asia/Shanghai"
                  className="appearance-none px-4 py-2 pr-8 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  <option value="Asia/Shanghai">(GMT+08:00) Asia/Shanghai</option>
                  <option value="America/New_York">(GMT-05:00) America/New_York</option>
                  <option value="Europe/London">(GMT+00:00) Europe/London</option>
                  <option value="Asia/Tokyo">(GMT+09:00) Asia/Tokyo</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>
        </section>

        <hr className="border-border" />

        {/* appearance */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-5">{t("settings.general.appearance")}</h2>
          <div className="flex gap-4 flex-wrap">
            {themeOptions.map(({ value, labelKey }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={cn(
                    "w-24 h-16 rounded-xl border-2 overflow-hidden transition-all",
                    active
                      ? "border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.3)]"
                      : "border-border hover:border-foreground/30"
                  )}>
                    <ThemePreview variant={value} />
                  </div>
                  <span className={cn("text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                    {t(labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <hr className="border-border" />

        {/* storage */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">{t("settings.general.storage")}</h2>
          {storageLoading ? (
            <p className="text-sm text-muted-foreground">{t("settings.general.loadingStorage")}</p>
          ) : storageInfo ? (
            <div className="space-y-4">
              {/* progress bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    {formatBytes(storageInfo.used_bytes)} / {formatBytes(storageInfo.quota_bytes)}
                  </span>
                  <span className={cn(
                    "text-sm font-medium tabular-nums",
                    storageInfo.usage_percent > 90 ? "text-red-500" : storageInfo.usage_percent > 70 ? "text-amber-500" : "text-foreground"
                  )}>
                    {storageInfo.usage_percent}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      storageInfo.usage_percent > 90 ? "bg-red-500" : storageInfo.usage_percent > 70 ? "bg-amber-500" : "bg-blue-500"
                    )}
                    style={{ width: `${Math.min(storageInfo.usage_percent, 100)}%` }}
                  />
                </div>
              </div>
              {/* detail rows */}
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("settings.general.storageUsed")}: </span>
                  <span className="font-medium text-foreground">{formatBytes(storageInfo.used_bytes)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("settings.general.storageQuota")}: </span>
                  <span className="font-medium text-foreground">{formatBytes(storageInfo.quota_bytes)}</span>
                </div>
              </div>
              {/* link to resources */}
              <button
                onClick={() => { onOpenChange(false); router.push("/resources"); }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors"
              >
                <HardDrive className="w-4 h-4" />
                {t("settings.general.manageResources")}
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="w-4 h-4 opacity-40" />
              {formatBytes(user?.storage_used_bytes ?? 0)} / {formatBytes(user?.storage_quota_bytes ?? 2147483648)}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ── Billing ─────────────────────────────────────────────────────────────
  function BillingTab() {
    return (
      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">{t("settings.billing.plan")}</h2>
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <Glasses className="w-10 h-10 text-foreground" />
              <div>
                <p className="text-base font-bold text-foreground">{t("settings.billing.freePlan")}</p>
                <p className="text-sm text-muted-foreground">{t("settings.billing.dailyCreditsLimit", { count: 1000 })}</p>
              </div>
            </div>
            <button className="px-5 py-2 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
              {t("settings.billing.upgradePlan")}
            </button>
          </div>
          <hr className="border-border" />
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">{t("settings.billing.history")}</h2>
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
            <Receipt className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">{t("settings.billing.noHistory")}</p>
          </div>
        </section>
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-[95vw] h-[85vh] max-h-[85vh] p-0 gap-0 overflow-hidden border-border/60">
        {/* accessible title */}
        <DialogHeader className="sr-only">
          <DialogTitle>{t("settings.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex h-full">
          {/* ── sidebar (md+) ── */}
          <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-muted/30">
            <div className="px-5 pt-6 pb-4">
              <h2 className="text-xl font-bold text-foreground tracking-tight">
                {t("settings.title")}
              </h2>
            </div>

            <nav className="flex-1 px-3 space-y-0.5">
              {TAB_KEYS.map((key) => {
                const Icon = TAB_ICONS[key];
                const active = currentTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCurrentTab(key)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {t(`settings.tabs.${key}`)}
                  </button>
                );
              })}
            </nav>

          </aside>

          {/* ── main content ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* mobile tabs */}
            <div className="md:hidden flex overflow-x-auto border-b border-border px-4 pt-3 pb-0 gap-1 scrollbar-none shrink-0">
              {TAB_KEYS.map((key) => {
                const Icon = TAB_ICONS[key];
                const active = currentTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCurrentTab(key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-all shrink-0 border-b-2",
                      active
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t(`settings.tabs.${key}`)}
                  </button>
                );
              })}
            </div>

            {/* scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8">
              <div className="max-w-4xl">
                <ActiveContent />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Theme preview mini-cards ──────────────────────────────────────────────
function ThemePreview({ variant }: { variant: "light" | "system" | "dark" }) {
  const colors: Record<string, { bg: string; bar: string; dot: string }> = {
    light: { bg: "bg-white", bar: "bg-gray-200", dot: "bg-gray-800" },
    system: { bg: "bg-gradient-to-r from-white to-gray-900", bar: "bg-gray-400", dot: "bg-gray-600" },
    dark: { bg: "bg-gray-900", bar: "bg-gray-700", dot: "bg-gray-300" },
  };
  const c = colors[variant] ?? colors.light;

  return (
    <div className={cn("w-full h-full flex items-end justify-center p-1.5", c.bg)}>
      <div className="flex items-center gap-1">
        <div className={cn("w-6 h-1.5 rounded-full", c.bar)} />
        <div className={cn("w-2.5 h-2.5 rounded-full", c.dot)} />
      </div>
    </div>
  );
}
