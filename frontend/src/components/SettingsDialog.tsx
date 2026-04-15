"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Info,
  Tag,
  Calendar,
  RefreshCw,
  Globe2,
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
import { useGitHubReleases } from "@/hooks/useGitHubReleases";
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
const TAB_KEYS = ["subscription", "general", "billing", "about"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_ICONS: Record<TabKey, React.ElementType> = {
  subscription: Clock,
  general: Globe,
  billing: CreditCard,
  about: Info,
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

  const { releases, loading: releasesLoading, error: releasesError, refetch: refetchReleases } =
    useGitHubReleases(open && currentTab === "about");

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
    about: AboutTab,
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
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Glasses className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">{t("settings.billing.inDevelopment")}</p>
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

  // ── About ──────────────────────────────────────────────────────────────
  function AboutTab() {
    const currentVersion = releases[0]?.tag_name ?? "v0.1.0";
    const formatDate = (iso: string) => {
      const d = new Date(iso);
      return d.toLocaleDateString(i18n.language === "zh-CN" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    /** Parse markdown body into simple rendered sections */
    const renderBody = (body: string) => {
      const lines = body.split("\n");
      const elements: React.ReactNode[] = [];
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        // heading
        const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
        if (headingMatch) {
          elements.push(
            <h4 key={i} className="text-sm font-semibold text-foreground mt-3 mb-1">
              {headingMatch[1]}
            </h4>
          );
          return;
        }
        // list item
        const listMatch = trimmed.match(/^[-*]\s+(.+)/);
        if (listMatch) {
          elements.push(
            <li key={i} className="text-sm text-muted-foreground ml-4 list-disc">
              {listMatch[1]}
            </li>
          );
          return;
        }
        // non-empty text
        if (trimmed) {
          elements.push(
            <p key={i} className="text-sm text-muted-foreground">
              {trimmed}
            </p>
          );
        }
      });
      return elements;
    };

    return (
      <div className="space-y-8">
        {/* app info header */}
        <section>
          <div className="flex items-center gap-4 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 64 64" fill="currentColor" className="text-foreground shrink-0">
              <defs><clipPath id="about-logo-a"><rect width="60" height="60" fill="none"/></clipPath><clipPath id="about-logo-c"><rect width="64" height="64"/></clipPath></defs>
              <g clipPath="url(#about-logo-c)"><g transform="translate(2 2)"><g clipPath="url(#about-logo-a)">
                <path d="M30,2.824A27.184,27.184,0,0,1,40.577,55.042,27.184,27.184,0,0,1,19.423,4.958,27,27,0,0,1,30,2.824M30,0A30,30,0,1,0,60,30,30,30,0,0,0,30,0"/>
                <path d="M97.059,78.824a18.235,18.235,0,1,1-12.894,5.341,18.116,18.116,0,0,1,12.894-5.341m0-2.824a21.059,21.059,0,1,0,21.059,21.059A21.059,21.059,0,0,0,97.059,76" transform="translate(-67.059 -67.059)"/>
                <path d="M30,78.591a38.131,38.131,0,0,1,10.873,1.54,29.932,29.932,0,0,1,8.717,4.122c4.893,3.439,7.587,7.914,7.587,12.6s-2.694,9.161-7.587,12.6a29.933,29.933,0,0,1-8.717,4.122,39.152,39.152,0,0,1-21.745,0,29.933,29.933,0,0,1-8.717-4.122c-4.893-3.439-7.587-7.914-7.587-12.6s2.694-9.161,7.587-12.6a29.932,29.932,0,0,1,8.717-4.122A38.131,38.131,0,0,1,30,78.591m0-2.824c-16.569,0-30,9.441-30,21.086s13.431,21.086,30,21.086S60,108.5,60,96.853,46.569,75.767,30,75.767" transform="translate(0 -66.853)"/>
                <path d="M177.445,177.038l-4.409-8.572a.927.927,0,0,1,1.224-1.26l19.658,9.4a.927.927,0,0,1,0,1.672l-19.626,9.393a.927.927,0,0,1-1.225-1.259l4.378-8.527a.927.927,0,0,0,0-.847" transform="translate(-152.585 -147.452)"/>
                <path d="M203.494,130.281l-22.82-10.925a.928.928,0,0,1-.056-1.644A16.386,16.386,0,0,1,204.81,129.3a.927.927,0,0,1-1.316.984" transform="translate(-158.954 -102.008)"/>
                <path d="M183.291,282.585a13.765,13.765,0,0,1-2.654-1.2.927.927,0,0,1,.074-1.631l22.821-10.964a.927.927,0,0,1,1.318.976,16.42,16.42,0,0,1-21.56,12.818" transform="translate(-158.987 -237.087)"/>
              </g></g></g>
            </svg>
            <div>
              <h2 className="text-xl font-bold text-foreground">KunFlix</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{currentVersion}</span>
              </div>
            </div>
          </div>
          {/* social links */}
          <div className="flex items-center gap-3">
            {/* GitHub */}
            <a
              href="https://github.com/KunLabAI/KunFlix"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="GitHub"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </a>
            {/* Website */}
            <a
              href="https://kunpuai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={t("settings.about.website")}
            >
              <Globe2 className="w-[18px] h-[18px]" />
            </a>
            {/* WeChat */}
            <WeChatIcon />
          </div>
        </section>

        <hr className="border-border" />

        {/* release list */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">{t("settings.about.changelog")}</h2>
            <button
              type="button"
              onClick={() => refetchReleases()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={t("settings.about.refresh")}
            >
              <RefreshCw className={cn("w-4 h-4", releasesLoading && "animate-spin")} />
            </button>
          </div>

          {releasesLoading && releases.length === 0 ? (
            <div className="flex items-center justify-center py-14 text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {t("settings.about.loading")}
            </div>
          ) : releasesError ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground text-sm">
              <p>{t("settings.about.fetchError")}</p>
              <button
                type="button"
                onClick={() => refetchReleases()}
                className="mt-3 px-4 py-1.5 rounded-lg text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                {t("settings.about.retry")}
              </button>
            </div>
          ) : releases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground text-sm">
              <Info className="w-10 h-10 mb-3 opacity-30" />
              <p>{t("settings.about.noReleases")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {releases.map((release, idx) => (
                <div
                  key={release.id}
                  className={cn(
                    "rounded-xl border p-5 transition-colors",
                    idx === 0
                      ? "border-blue-200 bg-blue-50/50 dark:border-blue-800/50 dark:bg-blue-950/20"
                      : "border-border bg-muted/20"
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base font-bold text-foreground truncate">
                        {release.name || release.tag_name}
                      </span>
                      {idx === 0 && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/40 shrink-0">
                          {t("settings.about.latest")}
                        </span>
                      )}
                      {release.prerelease && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/40 shrink-0">
                          Pre-release
                        </span>
                      )}
                    </div>
                    <a
                      href={release.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title={t("settings.about.viewOnGitHub")}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(release.published_at)}</span>
                  </div>
                  {release.body && (
                    <div className="space-y-0.5">{renderBody(release.body)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
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

// ── WeChat icon with QR popover ─────────────────────────────────────────
function WeChatIcon() {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(true);
  };
  const handleLeave = () => {
    timerRef.current = setTimeout(() => setShow(false), 200);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="WeChat"
      >
        <svg viewBox="0 0 1184 1024" fill="currentColor" className="w-[18px] h-[18px]">
          <path d="M331.424 263.424q0-23.424-14.272-37.728t-37.728-14.272q-24.576 0-43.424 14.56t-18.848 37.44q0 22.272 18.848 36.864t43.424 14.56q23.424 0 37.728-14.016t14.272-37.44zM756 553.152q0-16-14.56-28.576t-37.44-12.576q-15.424 0-28.288 12.864t-12.864 28.288q0 16 12.864 28.864t28.288 12.864q22.848 0 37.44-12.576t14.56-29.152zM621.152 263.424q0-23.424-14.016-37.728t-37.44-14.272q-24.576 0-43.424 14.56t-18.848 37.44q0 22.272 18.848 36.864t43.424 14.56q23.424 0 37.44-14.016t14.016-37.44zM984 553.152q0-16-14.848-28.576t-37.152-12.576q-15.424 0-28.288 12.864t-12.864 28.288q0 16 12.864 28.864t28.288 12.864q22.272 0 37.152-12.576t14.848-29.152zM832 326.272q-17.728-2.272-40-2.272-96.576 0-177.728 44t-127.712 119.136-46.56 164.288q0 44.576 13.152 86.848-20 1.728-38.848 1.728-14.848 0-28.576-0.864t-31.424-3.712-25.44-4-31.136-6.016-28.576-6.016l-144.576 72.576 41.152-124.576q-165.728-116-165.728-280 0-96.576 55.712-177.728t150.848-127.712 207.712-46.56q100.576 0 190.016 37.728t149.728 104.288 78.016 148.864zM1170.272 646.848q0 66.848-39.136 127.712t-106.016 110.56l31.424 103.424-113.728-62.272q-85.728 21.152-124.576 21.152-96.576 0-177.728-40.288t-127.712-109.44-46.56-150.848 46.56-150.848 127.712-109.44 177.728-40.288q92 0 173.152 40.288t130.016 109.728 48.864 150.56z" />
        </svg>
      </button>

      {show && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 animate-in fade-in-0 zoom-in-95 duration-150"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {/* arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 rotate-45 border-l border-t border-border bg-background" />
          <div className="w-44 rounded-xl border border-border bg-background shadow-lg p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/social/QR.jpg"
              alt="WeChat QR Code"
              className="w-full h-auto rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
