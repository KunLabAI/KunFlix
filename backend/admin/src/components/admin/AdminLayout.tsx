'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Bot,
  Zap,
  Users,
  CreditCard,
  Shield,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  MoreHorizontal,
  FileCode2,
  Film,
  Blocks,
  ServerCog,
  Wrench,
  UserCircle,
  Languages,
  Check,
  Settings,
  Mail,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const LANGUAGES = [
  { code: 'zh-CN', labelKey: 'layout.language.zhCN' },
  { code: 'en-US', labelKey: 'layout.language.enUS' },
] as const;

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const { t, i18n } = useTranslation();

  // If login page, don't show layout
  if (pathname === '/admin/login') {
    return <>{children}<Toaster /></>;
  }


  type NavLeaf = { kind: 'leaf'; title: string; href: string; icon: React.ElementType };
  type NavGroup = { kind: 'group'; key: string; title: string; icon: React.ElementType; children: NavLeaf[] };
  type NavItem = NavLeaf | NavGroup;

  const items: NavItem[] = [
    { kind: 'leaf', title: t('layout.sidebar.dashboard'), href: '/admin', icon: LayoutDashboard },
    { kind: 'leaf', title: t('layout.sidebar.llm'), href: '/admin/llm', icon: Bot },
    { kind: 'leaf', title: t('layout.sidebar.agents'), href: '/admin/agents', icon: Zap },
    { kind: 'leaf', title: t('layout.sidebar.skills'), href: '/admin/skills', icon: Blocks },
    { kind: 'leaf', title: t('layout.sidebar.mcp'), href: '/admin/mcp', icon: ServerCog },
    { kind: 'leaf', title: t('layout.sidebar.tools'), href: '/admin/tools', icon: Wrench },
    { kind: 'leaf', title: t('layout.sidebar.videos'), href: '/admin/videos', icon: Film },
    { kind: 'leaf', title: t('layout.sidebar.virtualHumans'), href: '/admin/virtual-humans', icon: UserCircle },
    { kind: 'leaf', title: t('layout.sidebar.promptTemplates'), href: '/admin/prompt-templates', icon: FileCode2 },
    { kind: 'leaf', title: t('layout.sidebar.users'), href: '/admin/users', icon: Users },
    { kind: 'leaf', title: t('layout.sidebar.subscriptions'), href: '/admin/subscriptions', icon: CreditCard },
    { kind: 'leaf', title: t('layout.sidebar.admins'), href: '/admin/admins', icon: Shield },
    {
      kind: 'group',
      key: 'system',
      title: t('layout.sidebar.system'),
      icon: Settings,
      children: [
        { kind: 'leaf', title: t('layout.sidebar.emailProviders'), href: '/admin/system/email-providers', icon: Mail },
      ],
    },
  ];

  // 跳转或子路由命中时自动展开对应分组
  const isLeafActive = (href: string) => href === '/admin' ? pathname === href : pathname.startsWith(href);
  const isGroupActive = (group: NavGroup) => group.children.some((c) => isLeafActive(c.href));

  // 某些子页面需要全屏/无内边距布局（如：创建/编辑智能体页面有自己的滚动和分栏机制）
  const isFullScreenPage = pathname?.match(/^\/admin\/agents\/[^/]+$/);

  return (
    <div className="fixed inset-0 flex w-full h-full bg-muted/40 overflow-hidden">
      <aside
        className={cn(
          "hidden border-r bg-background sm:flex flex-col transition-all duration-300",
          collapsed ? "w-14" : "w-64"
        )}
      >
        <div className={cn("flex h-14 items-center border-b px-3 lg:h-[60px]", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <div className="flex items-center gap-2 font-semibold truncate">
              <span className="text-lg ml-2">KunFlix</span>
            </div>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", collapsed ? "" : "")}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            <span className="sr-only">{t('layout.sidebar.toggleMenu')}</span>
          </Button>
        </div>
        
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            {items.map((item) => {
              if (item.kind === 'leaf') {
                const isActive = isLeafActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
                      isActive ? "bg-muted text-primary" : "text-muted-foreground",
                      collapsed && "justify-center px-2"
                    )}
                    title={collapsed ? item.title : undefined}
                  >
                    <item.icon className="h-4 w-4" />
                    {!collapsed && item.title}
                  </Link>
                );
              }
              // group
              const groupActive = isGroupActive(item);
              const isOpen = openGroups[item.key] ?? groupActive;
              const Icon = item.icon;
              // 折叠模式：直接展示顶图标，点击跳到首个子项
              if (collapsed) {
                const firstChild = item.children[0];
                return (
                  <Link
                    key={item.key}
                    href={firstChild.href}
                    className={cn(
                      "flex items-center justify-center px-2 py-2 rounded-lg transition-all hover:text-primary",
                      groupActive ? "bg-muted text-primary" : "text-muted-foreground"
                    )}
                    title={item.title}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              }
              return (
                <div key={item.key}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((s) => ({ ...s, [item.key]: !isOpen }))}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
                      groupActive ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.title}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="mt-1 ml-4 pl-3 border-l border-border space-y-0.5">
                      {item.children.map((child) => {
                        const childActive = isLeafActive(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-all hover:text-primary",
                              childActive ? "bg-muted text-primary" : "text-muted-foreground"
                            )}
                          >
                            <child.icon className="h-3.5 w-3.5" />
                            {child.title}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
        
        <div className="mt-auto p-4 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={cn("w-full justify-start pl-0 hover:bg-muted", collapsed && "justify-center px-0")}>
                <div className="flex items-center gap-2 w-full">
                   <Avatar className="h-8 w-8">
                      <AvatarFallback>AD</AvatarFallback>
                   </Avatar>
                   {!collapsed && (
                     <div className="flex flex-col items-start text-xs flex-1 min-w-0">
                       <span className="font-medium truncate w-full text-left">{user?.nickname || t('layout.account.admin')}</span>
                       <span className="text-muted-foreground truncate w-full text-left">{user?.email || 'admin@infinitetheater.com'}</span>
                     </div>
                   )}
                   {!collapsed && <MoreHorizontal className="h-4 w-4 text-muted-foreground ml-auto" />}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" className="w-56" sideOffset={10}>
                <DropdownMenuLabel>{user?.nickname || t('layout.account.myAccount')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Languages className="mr-2 h-4 w-4" />
                    <span>{t('layout.language.label')}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {LANGUAGES.map((lang) => (
                      <DropdownMenuItem
                        key={lang.code}
                        onClick={() => i18n.changeLanguage(lang.code)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            i18n.language === lang.code ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span>{t(lang.labelKey)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t('layout.account.logout')}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 w-full h-full overflow-hidden">
        <main className={cn(
          "flex-1 min-h-0 w-full h-full",
          isFullScreenPage ? "overflow-hidden" : "p-8 overflow-y-auto"
        )}>
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
};

export default AdminLayout;
