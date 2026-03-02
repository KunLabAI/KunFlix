
'use client';

import { motion } from 'framer-motion';
import { StoryTemplate } from './data';
import { Cpu, Rocket, Sword, Scroll, Heart, Crown, Pencil, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TemplateCardProps {
  template: StoryTemplate;
  isSelected: boolean;
  onClick: () => void;
}

const ICON_MAP: Record<string, any> = {
  Cpu,
  Rocket,
  Sword,
  Scroll,
  Heart,
  Crown,
  Pencil,
};

export default function TemplateCard({ template, isSelected, onClick }: TemplateCardProps) {
  // Get icon component from map or fallback
  const IconComponent = ICON_MAP[template.iconName] || FileText;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "cursor-pointer group relative overflow-hidden rounded-xl border p-4 transition-all duration-300",
        isSelected 
          ? `border-primary bg-primary/5 shadow-lg ring-1 ring-primary` 
          : "border-border bg-card hover:border-primary/50 hover:shadow-md"
      )}
    >
      {/* Selection Indicator */}
      {isSelected && (
        <motion.div
          layoutId="selection-indicator"
          className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary"
        />
      )}

      <div className="flex flex-col gap-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
        )}>
          <IconComponent className="w-5 h-5" />
        </div>
        
        <div>
          <h3 className={cn(
            "font-semibold mb-1 transition-colors",
            isSelected ? "text-primary" : "text-foreground"
          )}>
            {template.name}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {template.description}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
