import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useCanvasStore } from '@/store/useCanvasStore';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Undo, Redo, Save, Check, Loader2 } from 'lucide-react';
import { formatLocalTime } from '@/lib/timeUtils';

export function TopBar() {
  const router = useRouter();
  const { t } = useTranslation();
  const { theaterTitle, setTheaterTitle, undo, redo, isSaving, isDirty, lastSavedAt } = useCanvasStore();

  const saveStatusText = isSaving ? t('canvas.saving') : isDirty ? t('canvas.unsaved') : lastSavedAt ? `${t('canvas.saved')} ${formatLocalTime(lastSavedAt)}` : '';

  return (
    <div className="flex items-center bg-card border border-border/50 rounded-lg p-1 gap-1 pointer-events-auto">
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => router.push('/')} title={t('canvas.back')}>
        <ArrowLeft className="w-4 h-4" />
      </Button>
      <div className="w-px h-4 bg-border/50 mx-1" />
      <input
        type="text"
        value={theaterTitle}
        onChange={(e) => setTheaterTitle(e.target.value)}
        className="bg-transparent text-sm font-medium text-foreground outline-none border-none px-2 py-1 w-40 truncate"
        placeholder={t('canvas.theaterName')}
      />
      <div className="w-px h-4 bg-border/50 mx-1" />
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={undo} title={t('canvas.undo')}>
        <Undo className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={redo} title={t('canvas.redo')}>
        <Redo className="w-4 h-4" />
      </Button>

    </div>
  );
}
