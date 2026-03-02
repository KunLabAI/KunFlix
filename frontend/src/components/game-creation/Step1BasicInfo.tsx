
'use client';

import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { GameState } from './store';
import { StoryTemplate } from '@/components/create-game/data';

interface Step1BasicInfoProps {
  state: GameState;
  template: StoryTemplate;
  updateBasicInfo: (data: Partial<GameState['basicInfo']>) => void;
  onNext: () => void;
}

export default function Step1BasicInfo({ state, template, updateBasicInfo, onNext }: Step1BasicInfoProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  // Mock AI Generation
  const handleAiGenerate = async () => {
    setIsGenerating(true);
    // Simulate AI delay
    setTimeout(() => {
      updateBasicInfo({
        title: `${template.name}: 觉醒`,
        description: `在${template.name}的世界中，旧的秩序正在崩塌。作为一名被选中的变革者，你将在混乱中寻找新的希望。`,
        worldSetting: `${template.description} 这个世界正处于剧变的前夜，神秘的能量波动在各地出现，古老的预言似乎正在应验。各大势力蠢蠢欲动，而你，恰好站在了风暴的中心。`,
      });
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-full relative"
    >
      <div className="flex-1 overflow-y-auto p-6 pb-24 space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">基础故事设定</h2>
          <p className="text-muted-foreground">
            基于您选择的 <span className="font-semibold text-primary">{template.name}</span> 模板，让我们来完善世界观。
          </p>
        </div>

        {/* AI Assistance Section */}
        <div className="bg-secondary/30 p-4 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="w-4 h-4 text-yellow-500" />
              AI 故事助手
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiGenerate}
              disabled={isGenerating}
              className="h-8 text-xs"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                '一键生成设定'
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            AI 将根据模板自动生成标题、简介和详细的世界观设定。您可以随时手动修改。
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              游戏标题
            </label>
            <Input
              value={state.basicInfo.title}
              onChange={(e) => updateBasicInfo({ title: e.target.value })}
              placeholder="为你的冒险起个名字..."
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              一句话简介
            </label>
            <Input
              value={state.basicInfo.description}
              onChange={(e) => updateBasicInfo({ description: e.target.value })}
              placeholder="简单描述这个故事..."
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              世界观设定 (详细)
            </label>
            <Textarea
              value={state.basicInfo.worldSetting}
              onChange={(e) => updateBasicInfo({ worldSetting: e.target.value })}
              placeholder="详细描述这个世界的规则、现状和危机..."
              className="min-h-[200px] bg-background leading-relaxed resize-none"
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button 
          onClick={onNext} 
          disabled={!state.basicInfo.title}
          size="lg"
          className="w-full"
        >
          下一步：主角设定
        </Button>
      </div>
    </motion.div>
  );
}
