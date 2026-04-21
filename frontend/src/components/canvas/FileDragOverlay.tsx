'use client';

import { useTranslation } from 'react-i18next';
import { FileText, Image, Film, Music, FileSpreadsheet } from 'lucide-react';
import type { FileType } from '@/app/theater/[id]/hooks/useFileDragDrop';

interface FileDragOverlayProps {
  isDraggingFile: boolean;
  dragFileType: FileType | null;
  dragPosition: { x: number; y: number };
}

// Icon and label mappings (avoids switch-case)
const FILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <FileText className="w-8 h-8 text-blue-500" />,
  image: <Image className="w-8 h-8 text-emerald-500" />,
  video: <Film className="w-8 h-8 text-purple-500" />,
  audio: <Music className="w-8 h-8 text-amber-500" />,
  spreadsheet: <FileSpreadsheet className="w-8 h-8 text-green-600" />,
};

const FILE_TYPE_LABEL_KEYS: Record<string, string> = {
  text: 'canvas.fileType.text',
  image: 'canvas.fileType.image',
  video: 'canvas.fileType.video',
  audio: 'canvas.fileType.audio',
  spreadsheet: 'canvas.fileType.spreadsheet',
};

export function FileDragOverlay({ isDraggingFile, dragFileType, dragPosition }: FileDragOverlayProps) {
  const { t } = useTranslation();

  if (!isDraggingFile) return null;

  const icon = FILE_TYPE_ICONS[dragFileType ?? ''] ?? <FileText className="w-8 h-8 text-muted-foreground" />;
  const label = t(FILE_TYPE_LABEL_KEYS[dragFileType ?? ''] ?? 'canvas.fileType.default');

  return (
    <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
      <div
        className="bg-card border-2 border-primary border-dashed rounded-xl p-8 shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200"
        style={{
          position: 'absolute',
          left: dragPosition.x - 100,
          top: dragPosition.y - 80,
          pointerEvents: 'none',
        }}
      >
        {icon}
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">{t('canvas.dropToCreateNode', { type: label })}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('canvas.multiFileDrop')}</p>
        </div>
      </div>
    </div>
  );
}
