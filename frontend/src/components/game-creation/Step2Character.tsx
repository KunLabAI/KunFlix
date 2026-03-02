
'use client';

import { useState } from 'react';
import { RefreshCw, User, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { GameState } from './store';
import { StoryTemplate } from '@/components/create-game/data';

interface Step2CharacterProps {
  state: GameState;
  template: StoryTemplate;
  updateCharacter: (data: Partial<GameState['mainCharacter']>) => void;
  onNext: () => void;
  onPrev: () => void;
}

export default function Step2Character({ state, template, updateCharacter, onNext, onPrev }: Step2CharacterProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  // Mock AI Character Generation
  const handleAiGenerate = async () => {
    setIsGenerating(true);
    setTimeout(() => {
      updateCharacter({
        name: '亚历克斯·维恩',
        archetype: '反抗军黑客',
        background: `在${template.name}的世界中，亚历克斯曾是一名顶级企业的安全顾问，直到他发现了公司深处的秘密。现在，他潜伏在暗影中，用他的代码对抗不公。`,
        traits: ['敏捷', '黑客技术', '逻辑清晰', '隐秘行动'],
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
          <h2 className="text-2xl font-bold text-foreground">主角设定</h2>
          <p className="text-muted-foreground">
            谁将在这个故事中展开冒险？您可以手动输入，或让 AI 为您推荐。
          </p>
        </div>

        <div className="bg-secondary/30 p-4 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Wand2 className="w-4 h-4 text-purple-500" />
              AI 角色建议
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
                '生成角色建议'
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">主角姓名</label>
              <Input
                value={state.mainCharacter.name}
                onChange={(e) => updateCharacter({ name: e.target.value })}
                placeholder="输入姓名..."
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">角色原型/职业</label>
              <Input
                value={state.mainCharacter.archetype}
                onChange={(e) => updateCharacter({ archetype: e.target.value })}
                placeholder="如：孤胆英雄、黑客..."
                className="bg-background"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">背景故事</label>
            <Textarea
              value={state.mainCharacter.background}
              onChange={(e) => updateCharacter({ background: e.target.value })}
              placeholder="简述角色的过往经历..."
              className="min-h-[150px] bg-background leading-relaxed resize-none"
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex gap-3">
        <Button variant="outline" onClick={onPrev} size="lg" className="flex-1">
          上一步
        </Button>
        <Button 
          onClick={onNext} 
          disabled={!state.mainCharacter.name}
          size="lg"
          className="flex-[2]"
        >
          下一步：开启冒险
        </Button>
      </div>
    </motion.div>
  );
}
