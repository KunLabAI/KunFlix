
'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StoryTemplate, TemplateCategory } from './data';
import TemplateCard from './TemplateCard';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TemplateListProps {
  templates: StoryTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function TemplateList({ templates, selectedId, onSelect }: TemplateListProps) {
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesCategory = activeTab === 'ALL' || t.category === activeTab;
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           t.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [templates, activeTab, searchQuery]);

  return (
    <div className="w-full h-full flex flex-col bg-background/50 backdrop-blur-sm border-t border-border">
      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 p-4 border-b border-border items-center justify-between bg-background/80 sticky top-0 z-20">
        <Tabs defaultValue="ALL" value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList>
            <TabsTrigger value="ALL">全部</TabsTrigger>
            <TabsTrigger value={TemplateCategory.SCI_FI}>科幻</TabsTrigger>
            <TabsTrigger value={TemplateCategory.FANTASY}>奇幻</TabsTrigger>
            <TabsTrigger value={TemplateCategory.ROMANCE}>爱情</TabsTrigger>
            <TabsTrigger value={TemplateCategory.CUSTOM}>自定义</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索模板..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredTemplates.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <p>没有找到匹配的模板</p>
          </div>
        ) : (
          <motion.div 
            layout
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            <AnimatePresence>
              {filteredTemplates.map((template) => (
                <motion.div
                  key={template.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <TemplateCard
                    template={template}
                    isSelected={selectedId === template.id}
                    onClick={() => onSelect(template.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
