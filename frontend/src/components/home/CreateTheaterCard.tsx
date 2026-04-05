"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface CreateTheaterCardProps {
  onClick?: () => void;
}

export default function CreateTheaterCard({ onClick }: CreateTheaterCardProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "relative flex-shrink-0 w-[260px] h-[360px] rounded-2xl overflow-hidden cursor-pointer group",
        "bg-secondary/30 hover:bg-secondary/50",
        "border-2 border-dashed border-border hover:border-primary/50",
        "flex flex-col items-center justify-center gap-6"
      )}
      onClick={onClick}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
        <div 
          className="w-full h-full"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)`,
            backgroundSize: '20px 20px'
          }}
        />
      </div>

      {/* Icon */}
      <div className={cn(
        "relative p-6 rounded-2xl",
        "bg-background",
        "group-hover:scale-110 transition-all duration-500"
      )}>
        <Plus className="w-12 h-12 text-primary" />
      </div>

      {/* Text */}
      <div className="text-center z-10">
        <span className="block text-foreground font-semibold text-xl mb-2">
          {t("home.createTheater")}
        </span>
        <span className="text-muted-foreground text-sm">
          {t("home.createDesc")}
        </span>
      </div>
    </motion.div>
  );
}
