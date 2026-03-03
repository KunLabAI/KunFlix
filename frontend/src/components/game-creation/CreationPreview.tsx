'use client';

import { motion } from 'framer-motion';
import { GameState } from './store';
import { StoryTemplate } from '@/components/create-game/data';
import { Gamepad2, User, Flag, ArrowRight } from 'lucide-react';
import Image from 'next/image';

interface CreationPreviewProps {
  state: GameState;
  template: StoryTemplate;
}

export default function CreationPreview({ state, template }: CreationPreviewProps) {
  const currentStep = state.step;
  const mainChar = state.characters?.[0];

  return (
    <div className="relative h-full w-full bg-zinc-950 text-zinc-100 overflow-hidden flex flex-col items-center justify-center p-8">
      {/* Background with Template Theme */}
      <div className="absolute inset-0 z-0">
        {template.backgroundImage ? (
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-30 blur-sm scale-105 transition-all duration-1000"
            style={{ backgroundImage: `url('${template.backgroundImage}')` }}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${template.color} opacity-10 blur-3xl`} />
        )}
        <div className="absolute inset-0 bg-zinc-950/80" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8">
        {/* Progress Indicator */}
        <div className="flex items-center justify-between px-4">
          <div className={`flex flex-col items-center gap-2 ${currentStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 1 ? 'border-primary bg-primary/20' : 'border-muted-foreground/30'}`}>
              <Gamepad2 className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium">设定</span>
          </div>
          <div className="flex-1 h-0.5 mx-2 bg-muted-foreground/20">
            <motion.div 
              className="h-full bg-primary" 
              initial={{ width: '0%' }}
              animate={{ width: currentStep > 1 ? '100%' : '0%' }}
            />
          </div>
          <div className={`flex flex-col items-center gap-2 ${currentStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 2 ? 'border-primary bg-primary/20' : 'border-muted-foreground/30'}`}>
              <User className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium">角色</span>
          </div>
          <div className="flex-1 h-0.5 mx-2 bg-muted-foreground/20">
            <motion.div 
              className="h-full bg-primary" 
              initial={{ width: '0%' }}
              animate={{ width: currentStep > 2 ? '100%' : '0%' }}
            />
          </div>
          <div className={`flex flex-col items-center gap-2 ${currentStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 3 ? 'border-primary bg-primary/20' : 'border-muted-foreground/30'}`}>
              <Flag className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium">开场</span>
          </div>
        </div>

        {/* Dynamic Card Preview */}
        <motion.div 
          layout
          className="bg-zinc-900/90 backdrop-blur-md rounded-xl border border-zinc-800 shadow-2xl overflow-hidden"
        >
          {/* Header Image Area */}
          <div className="h-32 bg-zinc-800 relative overflow-hidden">
            {template.backgroundImage && (
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-60"
                style={{ backgroundImage: `url('${template.backgroundImage}')` }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4">
              <motion.h2 
                key={state.basicInfo.title || 'Untitled'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-bold text-white truncate"
              >
                {state.basicInfo.title || '未命名故事'}
              </motion.h2>
              <motion.p 
                key={state.basicInfo.description || 'No description'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-zinc-400 truncate"
              >
                {state.basicInfo.description || '暂无简介...'}
              </motion.p>
            </div>
          </div>

          {/* Content Body */}
          <div className="p-6 space-y-6 min-h-[200px]">
            {currentStep === 1 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <span className="text-xs font-medium text-primary uppercase tracking-wider">世界观</span>
                  <p className="text-sm text-zinc-300 leading-relaxed line-clamp-6">
                    {state.basicInfo.worldSetting || '等待设定世界观...'}
                  </p>
                </div>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex-shrink-0 flex items-center justify-center border border-zinc-700 overflow-hidden relative">
                    {mainChar?.avatar ? (
                        <Image 
                            src={mainChar.avatar} 
                            alt={mainChar.name || "Character"} 
                            fill 
                            className="object-cover"
                        />
                    ) : (
                        <User className="w-8 h-8 text-zinc-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-white truncate">{mainChar?.name || '无名氏'}</h3>
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                            {mainChar?.role === 'protagonist' ? '主角' : 'NPC'}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                        <span className="text-xs text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 truncate max-w-full">
                        {mainChar?.archetype || '未定职业'}
                        </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-zinc-300 line-clamp-4">
                  {mainChar?.background || '等待设定背景故事...'}
                </p>
              </motion.div>
            )}
          </div>
          
          {/* Footer Action */}
          <div className="p-4 bg-zinc-950/50 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <span>{template.category}</span>
            <span className="flex items-center gap-1">
              预览模式 <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
