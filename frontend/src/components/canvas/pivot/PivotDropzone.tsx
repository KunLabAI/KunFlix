import React from 'react';
import { cn } from '@/lib/utils';
import { PivotField } from './types';

interface PivotDropzoneProps {
  id: string;
  title: string;
  items: PivotField[];
  onDrop: (item: PivotField, zoneId: string) => void;
  onRemove: (itemId: string, zoneId: string) => void;
  onItemClick?: (item: PivotField, zoneId: string) => void;
}

export const PivotDropzone: React.FC<PivotDropzoneProps> = ({ id, title, items, onDrop, onRemove, onItemClick }) => {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/pivot-field');
    if (data) {
      onDrop(JSON.parse(data), id);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 p-3 bg-secondary/20 border rounded-md min-h-[100px]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="text-xs font-semibold text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-background border rounded-md shadow-sm cursor-pointer hover:bg-accent"
            onClick={() => onItemClick?.(item, id)}
          >
            <span>{item.name}</span>
            <button
              className="text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id, id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
