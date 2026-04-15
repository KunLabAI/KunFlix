"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { 
  Play, Layers, MoreHorizontal, Edit2, Copy, Trash2, 
  Clock, Circle, CheckCircle2, Archive, ArrowRight 
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirmDialog, useInputDialog } from "@/components/ui/confirm-dialog";

// 滑动阈值配置
const SWIPE_THRESHOLD = 10; // 水平移动超过 10px 视为滑动意图

// 状态配置映射表
const STATUS_CONFIG: Record<string, { 
  labelKey: string; 
  icon: React.ElementType; 
}> = {
  draft: { labelKey: "theater.status.draft", icon: Circle },
  published: { labelKey: "theater.status.published", icon: CheckCircle2 },
  archived: { labelKey: "theater.status.archived", icon: Archive },
};

// 时间格式映射
const TIME_KEY_MAP: Record<number, string> = {
  0: "theater.today",
  1: "theater.yesterday",
};

// 画布节点类型
interface TheaterNode {
  id: string;
  node_type: string;
  data?: {
    imageUrl?: string;
    videoUrl?: string;
    thumbnail?: string;
    url?: string;
  };
}

interface TheaterCardProps {
  id: string;
  title: string;
  image?: string | null;
  status?: string;
  nodeCount?: number;
  updatedAt?: string | null;
  nodes?: TheaterNode[];
  onClick?: () => void;
  onRename?: (id: string, newTitle: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  priority?: boolean;
}

export default function TheaterCard({
  id,
  title,
  image,
  status = "draft",
  nodeCount = 0,
  updatedAt,
  nodes = [],
  onClick,
  onRename,
  onDuplicate,
  onDelete,
  priority = false,
}: TheaterCardProps) {
  const { t, i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const { confirm, dialog: confirmDialog, setLoading: setConfirmLoading } = useConfirmDialog();
  const { input, dialog: inputDialog, setLoading: setInputLoading } = useInputDialog();
  
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  // ========== 滑动检测机制 ==========
  // 用于区分：水平滑动（轮播滚动）vs 点击（进入剧场）
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const isSwipingRef = useRef(false);

  // 从画布节点中提取图片/视频作为背景
  const extractBackgroundFromNodes = (): string | null => {
    const mediaNodes = nodes.filter((node) => 
      node.node_type === "image" || node.node_type === "video"
    );
    
    for (const node of mediaNodes) {
      const data = node.data;
      if (!data) continue;
      
      if (node.node_type === "image" && data.imageUrl) {
        return data.imageUrl;
      }
      
      if (node.node_type === "video" && data.videoUrl) {
        return data.thumbnail || data.videoUrl;
      }
    }
    
    return null;
  };

  const backgroundImage = image || extractBackgroundFromNodes();

  // 格式化时间
  const formatTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    const timeKey = TIME_KEY_MAP[diffDays];
    if (timeKey) return t(timeKey);
    
    const locale = i18n.language === "en-US" ? "en-US" : "zh-CN";
    return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  };

  const timeLabel = formatTime(updatedAt);
  const hasActions = onRename || onDuplicate || onDelete;

  // ========== 指针事件处理 ==========
  // 记录指针按下位置
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 只处理左键
    if (e.button !== 0) return;
    // 忽略下拉菜单和按钮
    const target = e.target as HTMLElement;
    if (target.closest('[data-radix-collection-item]') || target.closest('button')) return;

    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    isSwipingRef.current = false;
  }, []);

  // 检测是否在水平滑动
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;

    const deltaX = Math.abs(e.clientX - pointerStartRef.current.x);
    const deltaY = Math.abs(e.clientY - pointerStartRef.current.y);

    // 水平移动大于阈值且水平方向为主时，标记为滑动
    if (deltaX > SWIPE_THRESHOLD && deltaX > deltaY) {
      isSwipingRef.current = true;
    }
  }, []);

  // 指针抬起 - 清理状态
  const handlePointerUp = useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  // 点击处理 - 如果是滑动则阻止
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isSwipingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isSwipingRef.current = false;
      return;
    }
    onClick?.();
  }, [onClick]);

  // 重命名处理
  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRename) return;
    
    const newTitle = await input({
      title: t("theater.renameDialog.title"),
      description: t("theater.renameDialog.description"),
      defaultValue: title,
      placeholder: t("theater.renameDialog.placeholder"),
      confirmText: t("theater.renameDialog.confirm"),
      cancelText: t("theater.renameDialog.cancel"),
    });
    
    if (newTitle && newTitle !== title) {
      setInputLoading(true);
      try {
        await onRename(id, newTitle);
      } finally {
        setInputLoading(false);
      }
    }
  };

  // 创建副本处理
  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDuplicate) return;
    
    setIsLoading(true);
    try {
      await onDuplicate(id);
    } finally {
      setIsLoading(false);
    }
  };

  // 删除处理
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    
    const confirmed = await confirm({
      title: t("theater.deleteDialog.title"),
      description: t("theater.deleteDialog.description", { title }),
      type: "delete",
      confirmText: t("theater.deleteDialog.confirm"),
      cancelText: t("theater.deleteDialog.cancel"),
    });
    
    if (confirmed) {
      setConfirmLoading(true);
      try {
        await onDelete(id);
      } finally {
        setConfirmLoading(false);
      }
    }
  };

  return (
    <>
      <motion.div
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={cn(
          "relative flex-shrink-0 w-[260px] h-[360px] rounded-2xl overflow-hidden cursor-pointer group",
          "shadow-sm hover:shadow-md transition-shadow duration-500",
          isLoading && "opacity-70 pointer-events-none"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
      >
        {/* Card Container */}
        <div className="relative w-full h-full rounded-2xl overflow-hidden">
          {/* Background Image/Video */}
          {backgroundImage ? (
            <div className="absolute inset-0">
              {backgroundImage.match(/\.(mp4|webm|mov|avi)$/i) ? (
                <video
                  src={backgroundImage}
                  className="w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
                  preload="metadata"
                  muted
                  playsInline
                />
              ) : (
                <Image
                  src={backgroundImage}
                  alt={title}
                  fill
                  sizes="260px"
                  priority={priority}
                  loading={priority ? "eager" : "lazy"}
                  className="object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
                />
              )}
            </div>
          ) : (
            <div className="absolute inset-0 bg-muted transition-transform duration-500 ease-in-out group-hover:scale-110" />
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

          {/* Status Badge */}
          <div className="absolute top-4 left-4 z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-foreground bg-background/80 backdrop-blur-md">
              <StatusIcon className="w-3 h-3" />
              {t(statusConfig.labelKey)}
            </span>
          </div>

          {/* Action Menu */}
          {hasActions && (
            <div className="absolute top-3 right-3 z-20">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "h-9 w-9 rounded-xl flex items-center justify-center",
                      "bg-black/20 backdrop-blur-md text-white",
                      "opacity-100 md:opacity-0 md:group-hover:opacity-100",
                      "transition-all duration-300 hover:bg-black/40"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                    <span className="sr-only">{t("theater.moreOptions")}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 z-50">
                  {onRename && (
                    <DropdownMenuItem onClick={handleRename} className="cursor-pointer">
                      <Edit2 className="w-4 h-4 mr-2" />
                      <span>{t("theater.rename")}</span>
                    </DropdownMenuItem>
                  )}
                  {onDuplicate && (
                    <DropdownMenuItem onClick={handleDuplicate} className="cursor-pointer">
                      <Copy className="w-4 h-4 mr-2" />
                      <span>{t("theater.duplicate")}</span>
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      <span>{t("theater.delete")}</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Content Area */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <h3 className="text-2xl font-bold tracking-tight truncate mb-2 text-foreground">
              {title}
            </h3>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                <span>{t("theater.nodeCount", { count: nodeCount })}</span>
              </div>
              {timeLabel && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>{timeLabel}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl px-4 py-3 backdrop-blur-md bg-background/20 border border-border/50 transition-all duration-300 group-hover:bg-background/30">
              <div className="flex items-center gap-2">
                <Play className="w-4 w-4 fill-current" />
                <span className="text-sm font-semibold tracking-wide">{t("theater.openTheater")}</span>
              </div>
              <ArrowRight className="h-4 w-4 transform transition-transform duration-300 group-hover:translate-x-1" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Dialogs */}
      {confirmDialog}
      {inputDialog}
    </>
  );
}
