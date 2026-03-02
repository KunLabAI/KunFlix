
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, FileText, Video, Search, Upload } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface AssetLibraryProps {
  onDragStart: (type: string, data: any) => void;
}

export default function AssetLibrary({ onDragStart }: AssetLibraryProps) {
  const [activeTab, setActiveTab] = useState('text');

  return (
    <div className="h-full flex flex-col bg-background border-l border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold mb-3">资产库</h2>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="text"><FileText className="w-4 h-4" /></TabsTrigger>
            <TabsTrigger value="image"><ImageIcon className="w-4 h-4" /></TabsTrigger>
            <TabsTrigger value="video"><Video className="w-4 h-4" /></TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="搜索资产..." className="pl-9 h-9" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence mode="wait">
          {activeTab === 'text' && (
            <motion.div
              key="text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <div className="text-xs font-medium text-muted-foreground mb-2">预设文本片段</div>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={() => onDragStart('text', { content: `示例文本片段 ${i}` })}
                  className="p-3 rounded-md bg-secondary/50 border border-border cursor-grab hover:border-primary/50 transition-colors text-sm"
                >
                  示例文本片段 {i}...
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'image' && (
            <motion.div
              key="image"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-2 gap-3"
            >
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={() => onDragStart('image', { src: `/placeholder-${i}.png` })}
                  className="aspect-square rounded-md bg-secondary/50 border border-border cursor-grab hover:border-primary/50 transition-colors flex items-center justify-center overflow-hidden"
                >
                  <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'video' && (
            <motion.div
              key="video"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={() => onDragStart('video', { src: `/video-${i}.mp4` })}
                  className="aspect-video rounded-md bg-secondary/50 border border-border cursor-grab hover:border-primary/50 transition-colors flex items-center justify-center"
                >
                  <Video className="w-8 h-8 text-muted-foreground/50" />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 border-t border-border bg-muted/20">
        <Button variant="outline" className="w-full gap-2 border-dashed">
          <Upload className="w-4 h-4" />
          上传新资产
        </Button>
      </div>
    </div>
  );
}
