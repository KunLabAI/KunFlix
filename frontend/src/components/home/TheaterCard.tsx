"use client";

import { motion } from "framer-motion";
import { Play, Layers } from "lucide-react";
import Image from "next/image";

const statusLabel: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};

const statusColor: Record<string, string> = {
  draft: "bg-yellow-500/80",
  published: "bg-green-500/80",
  archived: "bg-gray-500/80",
};

interface TheaterCardProps {
  id: string;
  title: string;
  image?: string | null;
  status?: string;
  nodeCount?: number;
  updatedAt?: string | null;
  onClick?: () => void;
}

export default function TheaterCard({
  title,
  image,
  status = "draft",
  nodeCount = 0,
  updatedAt,
  onClick,
}: TheaterCardProps) {
  const timeLabel = updatedAt
    ? new Date(updatedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
    : null;

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="relative flex-shrink-0 w-[200px] h-[300px] rounded-xl overflow-hidden cursor-pointer group shadow-lg border border-border/50 bg-card"
      onClick={onClick}
    >
      {/* Background / Image */}
      <div className="absolute inset-0 z-0">
        {image ? (
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/80 to-secondary/80 animate-gradient" />
        )}
      </div>

      {/* Status Badge */}
      <div className="absolute top-3 right-3 z-10">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${statusColor[status] ?? statusColor.draft}`}
        >
          {statusLabel[status] ?? status}
        </span>
      </div>

      {/* Overlay Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-300" />
      
      {/* Content Area - Glassmorphism */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-white/10 dark:border-white/5 transition-all duration-300 group-hover:bg-background/90">
        <h3 className="font-bold text-lg truncate text-foreground transition-colors duration-300">
          {title}
        </h3>

        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Layers className="w-3 h-3" />
          <span>{nodeCount} 节点</span>
          {timeLabel && <span className="ml-auto">{timeLabel}</span>}
        </div>
        
        <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
          <div className="p-1.5 bg-primary rounded-full text-primary-foreground">
            <Play className="w-3 h-3 fill-current" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">打开</span>
        </div>
      </div>
    </motion.div>
  );
}
