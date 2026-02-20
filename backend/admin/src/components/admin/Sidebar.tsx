'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Bot,
  Zap,
  Users,
  BookOpen,
} from 'lucide-react';

const items = [
  {
    title: '仪表盘',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'AI 供应商',
    href: '/admin/llm',
    icon: Bot,
  },
  {
    title: '智能体管理',
    href: '/admin/agents',
    icon: Zap,
  },
  {
    title: '玩家管理',
    href: '/admin/players',
    icon: Users,
  },
  {
    title: '故事管理',
    href: '/admin/stories',
    icon: BookOpen,
  },
];

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-10 flex flex-col border-r bg-background transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-14 items-center justify-center border-b px-4">
        <div className={cn("flex items-center gap-2 font-semibold", collapsed && "justify-center")}>
           {!collapsed && <span className="text-lg">Infinite Game</span>}
           {collapsed && <span className="text-lg">IG</span>}
        </div>
      </div>
      <nav className="flex-1 space-y-2 p-2">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? item.title : undefined}
            >
              <item.icon className="h-5 w-5" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-center text-xs text-muted-foreground">
        {!collapsed && <span>© 2024 Infinite Game</span>}
      </div>
    </aside>
  );
}
