"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";

interface CreateGameCardProps {
  onClick?: () => void;
}

export default function CreateGameCard({ onClick }: CreateGameCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="relative flex-shrink-0 w-[200px] h-[300px] rounded-xl overflow-hidden cursor-pointer group border-2 border-dashed border-muted-foreground/30 hover:border-primary transition-colors duration-300 bg-secondary/30 hover:bg-secondary/50 flex flex-col items-center justify-center gap-4"
      onClick={onClick}
    >
      <div className="p-4 rounded-full bg-background shadow-sm border border-border group-hover:scale-110 transition-transform duration-300">
        <Plus className="w-8 h-8 text-primary" />
      </div>
      <span className="text-muted-foreground font-medium group-hover:text-foreground transition-colors">
        创建新剧场
      </span>
    </motion.div>
  );
}
