"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { 
  Search, Menu, X, User, Home, FolderOpen, 
  LogOut, Settings
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import SettingsDialog from "@/components/SettingsDialog";


// 导航链接配置
const NAV_LINKS = [
  { key: "home", labelKey: "nav.home", href: "/", icon: Home },
  { key: "resources", labelKey: "nav.resources", href: "/resources", icon: FolderOpen },
];

// 用户菜单配置
const USER_MENU_ITEMS = [
  { key: "settings", labelKey: "userMenu.settings", icon: Settings },
];

export default function TopBar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 点击外部关闭用户菜单和搜索
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

  // 导航处理
  const handleNavigate = (href: string) => {
    router.push(href);
    setMobileMenuOpen(false);
  };

  // 用户菜单处理
  const handleUserMenuClick = (key: string) => {
    const handlers: Record<string, () => void> = {
      settings: () => setSettingsOpen(true),
    };
    handlers[key]?.();
    setUserMenuOpen(false);
  };

  // 搜索提交
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      console.log("Search:", searchQuery);
      // TODO: 实现搜索逻辑
    }
  };

  return (
    <>
      {/* Main TopBar */}
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

            {/* Center: Desktop Navigation */}
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
                        layoutId="activeNav"
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
                      animate={{ width: 240, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ type: "spring" as const, stiffness: 400, damping: 30 }}
                      onSubmit={handleSearchSubmit}
                      className="overflow-hidden"
                    >
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder={t("search.homePlaceholder")}
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

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            transition={{ type: "spring" as const, damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 z-40 w-72 bg-background border-r border-border md:hidden"
          >
            <div className="flex flex-col h-full pt-20 pb-6 px-4">
              {/* Mobile Search */}
              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("search.mobilePlaceholder")}
                  className={cn(
                    "w-full h-10 pl-9 pr-4 text-sm rounded-lg",
                    "bg-secondary border border-transparent",
                    "placeholder:text-muted-foreground",
                    "focus:bg-background focus:border-border focus:outline-none"
                  )}
                />
              </div>

              {/* Mobile Navigation */}
              <nav className="flex flex-col gap-1">
                {NAV_LINKS.map((link, index) => {
                  const isActive = pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));
                  return (
                    <motion.button
                      key={link.key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleNavigate(link.href)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-lg text-left",
                        "transition-colors duration-200",
                        isActive 
                          ? "bg-secondary text-foreground" 
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      )}
                    >
                      <link.icon className="w-5 h-5" />
                      <span className="font-medium">{t(link.labelKey)}</span>
                    </motion.button>
                  );
                })}
              </nav>

              {/* Mobile User Section */}
              <div className="mt-auto pt-6 border-t border-border">
                <div className="flex items-center gap-3 px-3 py-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-muted flex items-center justify-center">
                    <User className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user?.nickname || t("userMenu.guest")}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email || t("userMenu.notLoggedIn")}</p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-3 mt-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">{t("userMenu.logout")}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay for mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
