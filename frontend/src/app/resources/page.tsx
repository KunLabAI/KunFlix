"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers, Image as ImageIcon, Video, Music,
  LayoutGrid, List, FolderOpen, Loader2, Upload, X, AlertCircle,
  Search, Home, LogOut, Settings, CheckSquare, Trash2, Download,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useResourceStore, FileTypeFilter } from "@/store/useResourceStore";
import { AssetItem } from "@/lib/resourceApi";
import { useAuth } from "@/context/AuthContext";
import AssetCard from "@/components/resources/AssetCard";
import AssetEditDialog from "@/components/resources/AssetEditDialog";
import AssetDeleteDialog from "@/components/resources/AssetDeleteDialog";
import AssetPreviewDialog from "@/components/resources/AssetPreviewDialog";
import SettingsDialog from "@/components/SettingsDialog";
import Logo from "@/components/Logo";

// 导航链接配置
const NAV_LINKS = [
  { key: "home", labelKey: "nav.home", href: "/", icon: Home },
  { key: "resources", labelKey: "nav.resources", href: "/resources", icon: FolderOpen },
];

// 用户菜单配置
const USER_MENU_ITEMS = [
  { key: "settings", labelKey: "userMenu.settings", icon: Settings },
];

// 筛选标签配置
const FILTER_TABS: { key: FileTypeFilter; labelKey: string; icon: React.ElementType; color: string }[] = [
  { key: "all", labelKey: "filter.all", icon: Layers, color: "text-foreground" },
  { key: "image", labelKey: "filter.image", icon: ImageIcon, color: "text-node-green" },
  { key: "video", labelKey: "filter.video", icon: Video, color: "text-node-yellow" },
  { key: "audio", labelKey: "filter.audio", icon: Music, color: "text-node-blue" },
];

// 视图模式配置
const VIEW_MODES = [
  { key: "grid", icon: LayoutGrid, labelKey: "viewMode.grid" },
  { key: "list", icon: List, labelKey: "viewMode.list" },
];

// 文件类型颜色映射
const TYPE_COLORS: Record<string, string> = {
  image: "border-node-green/30 hover:border-node-green/60",
  video: "border-node-yellow/30 hover:border-node-yellow/60",
  audio: "border-node-blue/30 hover:border-node-blue/60",
};

// 上传状态样式
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted-foreground",
  uploading: "bg-primary",
  done: "bg-node-green",
  error: "bg-destructive",
};

export default function ResourcesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const {
    assets, total, isLoading, hasMore, typeFilter, uploadQueue,
    fetchAssets, loadMore, setTypeFilter, addUpload, removeUpload,
  } = useResourceStore();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isDragOver, setIsDragOver] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [batchMode, setBatchMode] = useState<"delete" | "download" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteIds, setBatchDeleteIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 首次加载
  useEffect(() => { fetchAssets(); }, []);

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    const obs = new IntersectionObserver(
      ([entry]) => { entry.isIntersecting && hasMore && !isLoading && loadMore(); },
      { rootMargin: "200px" }
    );
    el && obs.observe(el);
    return () => { el && obs.unobserve(el); };
  }, [hasMore, isLoading, loadMore]);

  // 点击外部关闭菜单和搜索
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (searchOpen && !(event.target as Element).closest('.search-container')) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchOpen]);

  // 搜索打开时自动聚焦
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // 文件处理
  const SIZE_LIMITS: Record<string, number> = {
    image: 50 * 1024 * 1024,
    video: 500 * 1024 * 1024,
    audio: 100 * 1024 * 1024,
  };
  const SIZE_LABELS: Record<string, string> = { image: "50MB", video: "500MB", audio: "100MB" };
  const MIME_TYPE_MAP: Record<string, string> = { "image/": "image", "video/": "video", "audio/": "audio" };

  const deriveType = (file: File): string => {
    for (const [prefix, type] of Object.entries(MIME_TYPE_MAP)) {
      if (file.type.startsWith(prefix)) return type;
    }
    return "other";
  };

  const handleFiles = (files: FileList | null) => {
    setSizeError(null);
    const fileList = files ? Array.from(files) : [];
    const oversized: string[] = [];
    const valid: File[] = [];

    fileList.forEach((f) => {
      const type = deriveType(f);
      const limit = SIZE_LIMITS[type] ?? 50 * 1024 * 1024;
      const label = SIZE_LABELS[type] ?? "50MB";
      f.size <= limit
        ? valid.push(f)
        : oversized.push(t("resources.exceedLabel", { name: f.name, limit: label }));
    });

    oversized.length > 0 && setSizeError(t("resources.sizeExceeded", { files: oversized.join(", ") }));
    valid.forEach(addUpload);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // 导航处理
  const handleNavigate = (href: string) => {
    router.push(href);
  };

  // 用户菜单处理
  const handleUserMenuClick = (key: string) => {
    const handlers: Record<string, () => void> = {
      settings: () => setSettingsOpen(true),
    };
    handlers[key]?.();
    setUserMenuOpen(false);
  };

  // 过滤资源
  const filteredAssets = assets.filter((asset) => {
    const matchesType = typeFilter === "all" || asset.file_type === typeFilter;
    const matchesSearch = !searchQuery || 
      (asset.original_name || asset.filename).toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // 事件处理
  const handlePreview = useCallback((asset: AssetItem) => setPreviewTarget(asset), []);
  const handleRename = useCallback((asset: AssetItem) => setEditTarget({ asset, mode: "rename" }), []);
  const handleReplace = useCallback((asset: AssetItem) => setEditTarget({ asset, mode: "replace" }), []);
  const handleDelete = useCallback((asset: AssetItem) => setDeleteTarget(asset), []);
  const handleToggleSelect = useCallback((asset: AssetItem) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(asset.id) ? next.delete(asset.id) : next.add(asset.id);
      return next;
    });
  }, []);

  // 全选 / 取消全选
  const handleSelectAll = useCallback(() => {
    const allIds = filteredAssets.map(a => a.id);
    setSelectedIds(prev => prev.size === allIds.length ? new Set() : new Set(allIds));
  }, [filteredAssets]);

  // 进入批量模式
  const enterBatchMode = useCallback((mode: "delete" | "download") => {
    setBatchMode(mode);
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  // 退出选择模式
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setBatchMode(null);
    setSelectedIds(new Set());
  }, []);

  // 批量删除确认
  const handleBatchDelete = useCallback(() => {
    setBatchDeleteIds(Array.from(selectedIds));
  }, [selectedIds]);

  // 批量删除完成后清理
  const handleBatchDeleteClose = useCallback(() => {
    setBatchDeleteIds([]);
    exitSelectionMode();
  }, [exitSelectionMode]);

  // 批量下载
  const [isDownloading, setIsDownloading] = useState(false);
  const handleBatchDownload = useCallback(async () => {
    const selected = assets.filter(a => selectedIds.has(a.id));
    selected.length === 0 && null;
    setIsDownloading(true);
    try {
      for (const asset of selected) {
        const a = document.createElement("a");
        a.href = asset.url;
        a.download = asset.original_name || asset.filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // 稍作延迟避免浏览器阻止
        await new Promise(r => setTimeout(r, 300));
      }
    } finally {
      setIsDownloading(false);
    }
  }, [assets, selectedIds]);

  // ---------------------------------------------------------------------------
  // Rubber-band (marquee) selection
  // ---------------------------------------------------------------------------
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const rubberBandRef = useRef(rubberBand);
  rubberBandRef.current = rubberBand;

  // 获取滚动容器（.overflow-y-auto 父元素）
  const getScrollContainer = useCallback(() => {
    return gridContainerRef.current?.closest(".overflow-y-auto") as HTMLElement | null;
  }, []);

  const handleMarqueeStart = useCallback((e: React.MouseEvent) => {
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    const isInteractive = ["button", "input", "a", "video", "audio"].includes(tag) ||
      (e.target as HTMLElement).closest("button, a, [role=\"menuitem\"], [data-radix-collection-item]");
    // 仅在选择模式 + 左键 + 非交互元素上触发
    selectionMode && e.button === 0 && !isInteractive && (() => {
      const container = gridContainerRef.current;
      const scrollEl = getScrollContainer();
      const rect = container?.getBoundingClientRect();
      const scrollTop = scrollEl?.scrollTop ?? 0;
      rect && setRubberBand({
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top + scrollTop,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top + scrollTop,
      });
    })();
  }, [selectionMode, getScrollContainer]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const rb = rubberBandRef.current;
      const container = gridContainerRef.current;
      rb && container && (() => {
        const rect = container.getBoundingClientRect();
        const scrollEl = container.closest(".overflow-y-auto") as HTMLElement | null;
        const scrollTop = scrollEl?.scrollTop ?? 0;
        setRubberBand(prev => prev ? {
          ...prev,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top + scrollTop,
        } : null);
      })();
    };

    const handleUp = () => {
      const rb = rubberBandRef.current;
      const container = gridContainerRef.current;
      rb && container && (() => {
        const minX = Math.min(rb.startX, rb.x);
        const maxX = Math.max(rb.startX, rb.x);
        const minY = Math.min(rb.startY, rb.y);
        const maxY = Math.max(rb.startY, rb.y);

        // 忽略面积太小的拖拽（避免误触发）
        const area = (maxX - minX) * (maxY - minY);
        area > 100 && (() => {
          const cards = container.querySelectorAll("[data-asset-id]");
          const containerRect = container.getBoundingClientRect();
          const scrollEl = container.closest(".overflow-y-auto") as HTMLElement | null;
          const scrollTop = scrollEl?.scrollTop ?? 0;
          const hitIds = new Set<string>();

          cards.forEach(card => {
            const cardRect = card.getBoundingClientRect();
            // 将 card 位置转换为与 rubber-band 相同的坐标系（容器相对 + scrollTop）
            const cardLeft = cardRect.left - containerRect.left;
            const cardTop = cardRect.top - containerRect.top + scrollTop;
            const cardRight = cardLeft + cardRect.width;
            const cardBottom = cardTop + cardRect.height;

            const intersects = cardLeft < maxX && cardRight > minX && cardTop < maxY && cardBottom > minY;
            const id = card.getAttribute("data-asset-id");
            intersects && id && hitIds.add(id);
          });

          setSelectedIds(prev => {
            const next = new Set(prev);
            hitIds.forEach(id => next.add(id));
            return next;
          });
        })();
      })();
      setRubberBand(null);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, []);

  // 编辑/删除/预览 dialog 状态
  const [editTarget, setEditTarget] = useState<{ asset: AssetItem; mode: "rename" | "replace" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<AssetItem | null>(null);

  // 空状态文案映射
  const emptyTitle = searchQuery ? t("resources.noMatchTitle") : t("resources.emptyTitle");
  const emptyDesc = searchQuery ? t("resources.noMatchDescription") : t("resources.emptyDescription");

  return (
    <main className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="shrink-0 bg-background/80 backdrop-blur-xl border-b border-border/50 z-50">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Left: Logo */}
            <div className="flex items-center">
              <button 
                onClick={() => handleNavigate("/")}
                className="flex items-center gap-2 group"
              >
                <Logo size={32} />
                <span className="hidden sm:block font-semibold text-foreground text-sm tracking-tight">
                  KunFlix
                </span>
              </button>
            </div>

            {/* Center: Navigation */}
            <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));
                return (
                  <button
                    key={link.key}
                    onClick={() => handleNavigate(link.href)}
                    className={cn(
                      "relative px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                      isActive 
                        ? "text-foreground" 
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    {t(link.labelKey)}
                    {isActive && (
                      <motion.div
                        layoutId="activeNavResources"
                        className="absolute inset-0 bg-secondary rounded-md -z-10"
                        transition={{ type: "spring" as const, bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Right: Search + User */}
            <div className="flex items-center gap-2">
              {/* Search Container */}
              <div className="search-container relative flex items-center">
                <AnimatePresence mode="wait">
                  {searchOpen ? (
                    <motion.form
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 200, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ type: "spring" as const, stiffness: 400, damping: 30 }}
                      onSubmit={(e) => { e.preventDefault(); }}
                      className="overflow-hidden"
                    >
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder={t("search.placeholder")}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className={cn(
                            "w-full h-9 pl-9 pr-8 text-sm rounded-lg",
                            "bg-secondary border border-transparent",
                            "placeholder:text-muted-foreground",
                            "focus:bg-background focus:border-border focus:outline-none",
                            "transition-all duration-200"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setSearchOpen(false)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary transition-colors"
                        >
                          <X className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    </motion.form>
                  ) : (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setSearchOpen(true)}
                      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      aria-label={t("search.label")}
                    >
                      <Search className="w-5 h-5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* User Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className={cn(
                    "p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors",
                    userMenuOpen && "bg-secondary text-foreground"
                  )}
                  aria-label={t("userMenu.label")}
                >
                  <div className="w-6 h-6 rounded-full bg-amber-800 flex items-center justify-center text-white text-xs font-semibold">
                    {(user?.nickname ?? "U").charAt(0).toLowerCase()}
                  </div>
                </button>

                {/* User Dropdown */}
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className={cn(
                        "absolute right-0 top-full mt-2 w-48 py-1.5 rounded-xl",
                        "bg-popover border border-border shadow-lg",
                        "origin-top-right z-50"
                      )}
                    >
                      <div className="px-3 py-2 border-b border-border/50">
                        <p className="text-sm font-medium text-foreground truncate">{user?.nickname || t("userMenu.guest")}</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email || t("userMenu.notLoggedIn")}</p>
                      </div>
                      
                      {USER_MENU_ITEMS.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => handleUserMenuClick(item.key)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                        >
                          <item.icon className="w-4 h-4 text-muted-foreground" />
                          {t(item.labelKey)}
                        </button>
                      ))}
                      
                      <div className="border-t border-border/50 mt-1 pt-1">
                        <button
                          onClick={logout}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          {t("userMenu.logout")}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Sub Header - Title, Filters, View Mode in one row */}
      <div className="shrink-0 bg-background/80 backdrop-blur-xl z-40">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            {/* Left: Title + Resource Count */}
            <div className="flex items-center gap-3 shrink-0">
              <h1 className="text-base font-semibold text-foreground">{t("resources.title")}</h1>
              <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                {total}
              </span>
            </div>

            {/* Right: Filter Tabs (Icon only) + View Mode Toggle + Upload Button */}
            <div className="flex items-center gap-2">
              {/* Filter Tabs - Icon only */}
              <div className="hidden sm:flex items-center gap-1 p-1 bg-secondary/50 rounded-lg">
                {FILTER_TABS.map((tab) => {
                  const isActive = typeFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setTypeFilter(tab.key)}
                      className={cn(
                        "relative p-1.5 rounded-md transition-all",
                        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                      title={t(tab.labelKey)}
                    >
                      <tab.icon className={cn("w-4 h-4", isActive && tab.color)} />
                      {isActive && (
                        <motion.div
                          layoutId="activeFilter"
                          className="absolute inset-0 bg-background rounded-md shadow-sm -z-10"
                          transition={{ type: "spring" as const, bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-lg shrink-0">
                {VIEW_MODES.map((mode) => {
                  const isActive = viewMode === mode.key;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => setViewMode(mode.key as "grid" | "list")}
                      className={cn(
                        "p-1.5 rounded-md transition-all",
                        isActive 
                          ? "bg-background text-foreground shadow-sm" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title={t(mode.labelKey)}
                    >
                      <mode.icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>

              {/* Upload Button */}
              <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium shrink-0"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">{t("resources.uploadFile")}</span>
              </button>

              {/* Batch Management Dropdown */}
              {selectionMode ? (
                <button
                  onClick={exitSelectionMode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium shrink-0 transition-colors bg-primary/10 text-primary border border-primary/30"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("resources.cancel")}</span>
                </button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium shrink-0 transition-colors border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span className="hidden sm:inline">{t("resources.batchManage")}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => enterBatchMode("delete")}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t("resources.batchDelete")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => enterBatchMode("download")}>
                      <Download className="w-4 h-4 mr-2" />
                      {t("resources.batchDownload")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Mobile Filter Tabs - Icon only */}
          <div className="flex sm:hidden items-center gap-1 p-1 bg-secondary/50 rounded-lg overflow-x-auto pb-2 -mb-2 w-fit ml-auto">
            {FILTER_TABS.map((tab) => {
              const isActive = typeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setTypeFilter(tab.key)}
                  className={cn(
                    "relative p-1.5 rounded-md transition-all",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  title={t(tab.labelKey)}
                >
                  <tab.icon className={cn("w-4 h-4", isActive && tab.color)} />
                  {isActive && (
                    <motion.div
                      layoutId="activeFilterMobile"
                      className="absolute inset-0 bg-background rounded-md shadow-sm -z-10"
                      transition={{ type: "spring" as const, bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Batch Selection Action Bar — 固定在 Sub Header 下方 */}
        <AnimatePresence>
          {selectionMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-2 pt-1">
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSelectAll}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {selectedIds.size === filteredAssets.length && filteredAssets.length > 0
                        ? t("resources.deselectAll")
                        : t("resources.selectAll")}
                    </button>
                    <span className="text-sm text-muted-foreground">
                      {t("resources.selectedCount", { count: selectedIds.size })}
                    </span>
                  </div>

                  {/* 根据 batchMode 显示对应操作按钮 */}
                  {batchMode === "delete" && (
                    <button
                      onClick={handleBatchDelete}
                      disabled={selectedIds.size === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t("resources.deleteSelected")}
                    </button>
                  )}
                  {batchMode === "download" && (
                    <button
                      onClick={handleBatchDownload}
                      disabled={selectedIds.size === 0 || isDownloading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {isDownloading ? t("resources.downloading") : t("resources.downloadSelected")}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto w-full">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-6">
        {/* Size limit error */}
        <AnimatePresence>
          {sizeError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-start gap-2.5 mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-sm flex-1">{sizeError}</span>
              <button 
                onClick={() => setSizeError(null)} 
                className="shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload Queue */}
        <AnimatePresence>
          {uploadQueue.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 space-y-2"
            >
              {uploadQueue.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/50 border border-border/30"
                >
                  <Loader2 className={cn(
                    "w-5 h-5 shrink-0",
                    item.status === "uploading" && "animate-spin text-primary",
                    item.status === "error" && "text-destructive"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.file.name}</div>
                    <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <motion.div
                        className={cn("h-full rounded-full", STATUS_STYLES[item.status])}
                        initial={{ width: 0 }}
                        animate={{ width: `${item.progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => removeUpload(item.id)} 
                    className="shrink-0 p-2 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Asset Grid / List with Drag Overlay */}
        <div 
          className="relative"
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Drag Overlay - Only visible when dragging */}
          <AnimatePresence>
            {isDragOver && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 bg-primary/10 backdrop-blur-sm rounded-2xl border-2 border-dashed border-primary flex items-center justify-center pointer-events-none"
              >
                <div className="flex flex-col items-center gap-4 text-primary">
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                    <Upload className="w-8 h-8" />
                  </div>
                  <p className="text-lg font-medium">{t("resources.dropToUpload")}</p>
                  <p className="text-sm text-primary/70">{t("resources.supportedFormats")}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*"
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />

          {filteredAssets.length > 0 ? (
          <div
            ref={gridContainerRef}
            className="relative"
            onMouseDown={handleMarqueeStart}
          >
            {/* Rubber-band selection overlay */}
            {rubberBand && (() => {
              const left = Math.min(rubberBand.startX, rubberBand.x);
              const top = Math.min(rubberBand.startY, rubberBand.y);
              const width = Math.abs(rubberBand.x - rubberBand.startX);
              const height = Math.abs(rubberBand.y - rubberBand.startY);
              return (
                <div
                  className="absolute z-30 border-2 border-primary/60 bg-primary/10 rounded-sm pointer-events-none"
                  style={{ left, top, width, height }}
                />
              );
            })()}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                viewMode === "grid"
                  ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                  : "flex flex-col gap-3"
              )}
            >
              <AnimatePresence mode="popLayout">
                {filteredAssets.map((asset, index) => (
                  <motion.div
                    key={asset.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.03 }}
                    layout
                    data-asset-id={asset.id}
                  >
                    <AssetCard
                      asset={asset}
                      viewMode={viewMode}
                      selectable={selectionMode}
                      selected={selectedIds.has(asset.id)}
                      onToggleSelect={handleToggleSelect}
                      onPreview={handlePreview}
                      onRename={handleRename}
                      onReplace={handleReplace}
                      onDelete={handleDelete}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        ) : (
          !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-muted-foreground"
            >
              <div className="w-24 h-24 rounded-2xl bg-secondary/50 flex items-center justify-center mb-6">
                <FolderOpen className="w-12 h-12 opacity-30" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {emptyTitle}
              </h3>
              <p className="text-sm text-center max-w-sm mb-6">
                {emptyDesc}
              </p>
            </motion.div>
          )
        )}

        {/* Loading / Infinite scroll sentinel */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={sentinelRef} className="h-4" />
        </div>
        </div>
      </div>

      {/* Dialogs */}
      <AssetPreviewDialog
        asset={previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
      <AssetEditDialog
        asset={editTarget?.asset ?? null}
        mode={editTarget?.mode ?? null}
        onClose={() => setEditTarget(null)}
      />
      <AssetDeleteDialog
        asset={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Batch Delete Dialog */}
      <AssetDeleteDialog
        asset={null}
        batchIds={batchDeleteIds}
        onClose={handleBatchDeleteClose}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}
