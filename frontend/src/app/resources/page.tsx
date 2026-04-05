"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers, Image as ImageIcon, Video, Music,
  LayoutGrid, List, FolderOpen, Loader2, Upload, X, AlertCircle,
  Search, Home, Users, Sun, Moon, User, LogOut, Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useResourceStore, FileTypeFilter } from "@/store/useResourceStore";
import { AssetItem } from "@/lib/resourceApi";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import AssetCard from "@/components/resources/AssetCard";
import AssetEditDialog from "@/components/resources/AssetEditDialog";
import AssetDeleteDialog from "@/components/resources/AssetDeleteDialog";
import AssetPreviewDialog from "@/components/resources/AssetPreviewDialog";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// 导航链接配置
const NAV_LINKS = [
  { key: "home", labelKey: "nav.home", href: "/", icon: Home },
  { key: "resources", labelKey: "nav.resources", href: "/resources", icon: FolderOpen },
  { key: "community", labelKey: "nav.community", href: "#", icon: Users },
];

// 用户菜单配置
const USER_MENU_ITEMS = [
  { key: "profile", labelKey: "userMenu.profile", icon: User },
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

// 主题 aria-label 映射
const THEME_LABELS: Record<string, string> = {
  dark: "theme.switchToLight",
  light: "theme.switchToDark",
};

export default function ResourcesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
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
      profile: () => console.log("Profile clicked"),
      settings: () => console.log("Settings clicked"),
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

  // 编辑/删除/预览 dialog 状态
  const [editTarget, setEditTarget] = useState<{ asset: AssetItem; mode: "rename" | "replace" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<AssetItem | null>(null);

  // 空状态文案映射
  const emptyTitle = searchQuery ? t("resources.noMatchTitle") : t("resources.emptyTitle");
  const emptyDesc = searchQuery ? t("resources.noMatchDescription") : t("resources.emptyDescription");

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Left: Logo */}
            <div className="flex items-center">
              <button 
                onClick={() => handleNavigate("/")}
                className="flex items-center gap-2 group"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-node-purple to-node-blue flex items-center justify-center">
                  <span className="text-white font-bold text-sm">IN</span>
                </div>
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

            {/* Right: Search + Theme + Language + User */}
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

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label={t(THEME_LABELS[theme])}
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Language Switcher */}
              <LanguageSwitcher />

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
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-muted flex items-center justify-center">
                    <User className="w-3 h-3 text-primary-foreground" />
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
      <div className="fixed top-16 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl">
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
      </div>

      {/* Content */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-36 pb-6">
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
                >
                  <AssetCard
                    asset={asset}
                    viewMode={viewMode}
                    onPreview={handlePreview}
                    onRename={handleRename}
                    onReplace={handleReplace}
                    onDelete={handleDelete}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
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
    </main>
  );
}
