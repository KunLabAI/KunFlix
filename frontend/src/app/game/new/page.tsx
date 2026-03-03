
'use client';

import { Suspense, useReducer, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TEMPLATES } from '@/components/create-game/data';
import { INITIAL_GAME_STATE, gameCreationReducer } from '@/components/game-creation/store';
import Step1BasicInfo from '@/components/game-creation/Step1BasicInfo';
import Step2Character from '@/components/game-creation/Step2Character';
import CreationPreview from '@/components/game-creation/CreationPreview';
import AssetLibrary from '@/components/game-creation/AssetLibrary';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Save, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

function GameCreationWorkflowContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');
  
  const [state, dispatch] = useReducer(gameCreationReducer, {
    ...INITIAL_GAME_STATE,
    templateId: templateId || TEMPLATES[0].id
  });

  const selectedTemplate = useMemo(() => 
    TEMPLATES.find(t => t.id === state.templateId) || TEMPLATES[0],
    [state.templateId]
  );

  const updateBasicInfo = (payload: any) => dispatch({ type: 'UPDATE_BASIC_INFO', payload });
  const updateCharacters = (payload: any) => dispatch({ type: 'UPDATE_CHARACTERS', payload });
  const nextStep = () => dispatch({ type: 'NEXT_STEP' });
  const prevStep = () => dispatch({ type: 'PREV_STEP' });

  // Handle Drag & Drop from Asset Library
  const handleAssetDragStart = (type: string, data: any) => {
    // Logic to handle dragging assets into the preview or form areas
    console.log('Dragging asset:', type, data);
  };

  return (
    <div className="h-screen w-full flex bg-background overflow-hidden">
      {/* Left Column: Form Section (Fixed 350px) */}
      <div className="w-[450px] h-full flex flex-col border-r border-border bg-background z-20 shadow-xl flex-shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/create-game')} className="rounded-full h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-semibold text-sm">返回</span>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {state.step === 1 && (
              <Step1BasicInfo 
                key="step1"
                state={state} 
                template={selectedTemplate}
                updateBasicInfo={updateBasicInfo}
                onNext={nextStep}
              />
            )}
            {state.step === 2 && (
              <Step2Character
                key="step2"
                state={state}
                template={selectedTemplate}
                updateCharacters={updateCharacters}
                onNext={nextStep}
                onPrev={prevStep}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Middle Column: Preview/Canvas Section (Flexible) */}
      <div className="flex-1 h-full bg-zinc-900/50 relative overflow-hidden flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-2xl h-full max-h-[800px] flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">实时预览</h2>
            <div className="flex gap-2">
               {/* View Toggle Buttons could go here */}
            </div>
          </div>
          
          <div className="flex-1 rounded-xl overflow-hidden shadow-2xl border border-border/50 bg-background/50 backdrop-blur-sm">
             <CreationPreview state={state} template={selectedTemplate} />
          </div>
        </div>
      </div>

      {/* Right Column: Asset Library (Fixed 300px) */}
      <div className="w-[450px] h-full flex-shrink-0 z-20 shadow-xl">
        <AssetLibrary onDragStart={handleAssetDragStart} />
      </div>
    </div>
  );
}

export default function GameCreationWorkflow() {
  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center">加载中...</div>}>
      <GameCreationWorkflowContent />
    </Suspense>
  );
}
