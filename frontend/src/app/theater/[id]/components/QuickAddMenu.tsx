import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollText, User, Clapperboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface QuickAddMenuProps {
  show: boolean;
  x: number;
  y: number;
  onAdd: (type: string) => void;
}

export function QuickAddMenu({ show, x, y, onAdd }: QuickAddMenuProps) {
  const { t } = useTranslation();
  if (!show) return null;

  return (
    <Card 
      className="quick-add-menu fixed z-[100] p-2 shadow-xl border-border/50 flex flex-col gap-1 w-48 bg-card"
      style={{ 
        left: x, 
        top: y,
        transform: 'translate(-50%, 10px)'
      }}
    >
      <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
        {t('canvas.createConnectedNode')}
      </div>
      <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => onAdd('script')}>
        <ScrollText className="w-4 h-4 mr-2 text-indigo-500" />
        {t('canvas.textCard')}
      </Button>
      <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => onAdd('character')}>
        <User className="w-4 h-4 mr-2 text-emerald-500" />
        {t('canvas.imageCard')}
      </Button>
      <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => onAdd('storyboard')}>
        <Clapperboard className="w-4 h-4 mr-2 text-amber-500" />
        {t('canvas.storyboardCard')}
      </Button>
    </Card>
  );
}
