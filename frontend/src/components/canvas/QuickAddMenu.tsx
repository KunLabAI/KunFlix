'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollText, User, Film, Headphones, Clapperboard } from 'lucide-react';
import type { QuickAddMenuState } from '@/app/theater/[id]/hooks/useQuickAddMenu';

interface QuickAddMenuProps {
  menuState: QuickAddMenuState;
  onAddNode: (type: string) => void;
}

// Menu items config (avoids repetitive JSX)
const MENU_ITEMS: Array<{ type: string; icon: typeof ScrollText; iconClass: string; labelKey: string }> = [
  { type: 'text', icon: ScrollText, iconClass: 'text-indigo-500', labelKey: 'canvas.textCard' },
  { type: 'image', icon: User, iconClass: 'text-emerald-500', labelKey: 'canvas.imageCard' },
  { type: 'video', icon: Film, iconClass: 'text-purple-500', labelKey: 'canvas.videoCard' },
  { type: 'audio', icon: Headphones, iconClass: 'text-amber-500', labelKey: 'canvas.audioCard' },
  { type: 'storyboard', icon: Clapperboard, iconClass: 'text-amber-500', labelKey: 'canvas.storyboardCard' },
];

export function QuickAddMenu({ menuState, onAddNode }: QuickAddMenuProps) {
  const { t } = useTranslation();

  if (!menuState.show) return null;

  return (
    <Card
      className="quick-add-menu fixed z-[100] p-2 shadow-xl border-border/50 flex flex-col gap-1 w-48 bg-card"
      style={{
        left: menuState.x,
        top: menuState.y,
        transform: 'translate(-50%, 10px)',
      }}
    >
      <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
        {t('canvas.createConnectedNode')}
      </div>
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.type}
            variant="ghost"
            className="justify-start px-2 py-1.5 h-auto text-sm"
            onClick={() => onAddNode(item.type)}
          >
            <Icon className={`w-4 h-4 mr-2 ${item.iconClass}`} />
            {t(item.labelKey)}
          </Button>
        );
      })}
    </Card>
  );
}
