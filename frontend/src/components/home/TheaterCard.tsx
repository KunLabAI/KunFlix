"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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

// 状态配置映射表
const STATUS_CONFIG: Record<string, { 
  label: string; 
  icon: React.ElementType; 
}> = {
  draft: { 
    label: "草稿", 
    icon: Circle, 
  },
  published: { 
    label: "已发布", 
    icon: CheckCircle2, 
  },
  archived: { 
    label: "已归档", 
    icon: Archive, 
  },
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
  nodes?: TheaterNode[]; // 画布节点列表，用于提取背景
  onClick?: () => void;
  onRename?: (id: string, newTitle: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
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
}: TheaterCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { confirm, dialog: confirmDialog, setLoading: setConfirmLoading } = useConfirmDialog();
  const { input, dialog: inputDialog, setLoading: setInputLoading } = useInputDialog();
  
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  // 从画布节点中提取图片/视频作为背景
  const extractBackgroundFromNodes = (): string | null => {
    // 优先级：image > video
    const mediaNodes = nodes.filter((node) => 
      node.node_type === "image" || node.node_type === "video"
    );
    
    for (const node of mediaNodes) {
      const data = node.data;
      if (!data) continue;
      
      // 图片节点
      if (node.node_type === "image" && data.imageUrl) {
        return data.imageUrl;
      }
      
      // 视频节点
      if (node.node_type === "video" && data.videoUrl) {
        // 视频使用缩略图或第一帧
        return data.thumbnail || data.videoUrl;
      }
    }
    
    return null;
  };

  // 最终背景图：传入的 image > 从节点提取 > null
  const backgroundImage = image || extractBackgroundFromNodes();

  // 格式化时间
  const formatTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    const timeFormats: Record<number, string> = {
      0: "今天",
      1: "昨天",
    };
    
    return timeFormats[diffDays] ?? date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  const timeLabel = formatTime(updatedAt);
  const hasActions = onRename || onDuplicate || onDelete;

  // 重命名处理
  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRename) return;
    
    const newTitle = await input({
      title: "重命名剧场",
      description: "请输入新的剧场名称",
      defaultValue: title,
      placeholder: "剧场名称",
      confirmText: "保存",
      cancelText: "取消",
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
      title: "删除剧场",
      description: `确定要删除"${title}"吗？此操作不可恢复，所有相关数据将被永久删除。`,
      type: "delete",
      confirmText: "删除",
      cancelText: "取消",
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
        onClick={onClick}
      >
        {/* Card Container */}
        <div className="relative w-full h-full rounded-2xl overflow-hidden">
          {/* Background Image/Video */}
          {backgroundImage ? (
            <div className="absolute inset-0">
              {backgroundImage.match(/\.(mp4|webm|mov|avi)$/i) ? (
                /* Video Background - use video element with poster */
                <video
                  src={backgroundImage}
                  className="w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
                  preload="metadata"
                  muted
                  playsInline
                />
              ) : (
                /* Image Background */
                <Image
                  src={backgroundImage}
                  alt={title}
                  fill
                  className="object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
                />
              )}
            </div>
          ) : (
            /* Solid Background when no image - uses theme colors */
            <div className="absolute inset-0 bg-muted transition-transform duration-500 ease-in-out group-hover:scale-110" />
          )}

          {/* Theme-aware Gradient Overlay - darker for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

          {/* Status Badge */}
          <div className="absolute top-4 left-4 z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-foreground bg-background/80 backdrop-blur-md">
              <StatusIcon className="w-3 h-3" />
              {statusConfig.label}
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
                    <span className="sr-only">更多选项</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 z-50">
                  {onRename && (
                    <DropdownMenuItem onClick={handleRename} className="cursor-pointer">
                      <Edit2 className="w-4 h-4 mr-2" />
                      <span>重命名</span>
                    </DropdownMenuItem>
                  )}
                  {onDuplicate && (
                    <DropdownMenuItem onClick={handleDuplicate} className="cursor-pointer">
                      <Copy className="w-4 h-4 mr-2" />
                      <span>创建副本</span>
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      <span>删除</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Content Area */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            {/* Title */}
            <h3 className="text-2xl font-bold tracking-tight truncate mb-2 text-foreground">
              {title}
            </h3>

            {/* Meta Info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                <span>{nodeCount} 节点</span>
              </div>
              {timeLabel && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>{timeLabel}</span>
                </div>
              )}
            </div>

            {/* Open Button */}
            <div className="flex items-center justify-between rounded-xl px-4 py-3 backdrop-blur-md bg-background/20 border border-border/50 transition-all duration-300 group-hover:bg-background/30">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 fill-current" />
                <span className="text-sm font-semibold tracking-wide">打开剧场</span>
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
