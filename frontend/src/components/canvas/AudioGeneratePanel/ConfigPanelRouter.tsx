'use client';

import React from 'react';
import type { MusicModelCapabilities } from '@/hooks/useMusicGeneration';
import { isLyriaModel, isLyriaPro } from './utils';
import { LyriaConfigPanel } from './LyriaConfigPanel';
import { GenericMusicConfigPanel } from './GenericMusicConfigPanel';

export interface MusicFormState {
  // 共享
  outputFormat: 'mp3' | 'wav';
  setOutputFormat: (v: 'mp3' | 'wav') => void;
  negativePrompt: string;
  setNegativePrompt: (v: string) => void;

  // Lyria 结构化字段
  genre: string; setGenre: (v: string) => void;
  instruments: string[]; setInstruments: (v: string[]) => void;
  bpm: number; setBpm: (v: number) => void;
  keyScale: string; setKeyScale: (v: string) => void;
  mood: string; setMood: (v: string) => void;
  lyrics: string; setLyrics: (v: string) => void;
  timeline: string; setTimeline: (v: string) => void;
  language: string; setLanguage: (v: string) => void;
  vocals: boolean; setVocals: (v: boolean) => void;
}

interface Props {
  modelName: string | null;
  capabilities: MusicModelCapabilities | null;
  state: MusicFormState;
}

/**
 * 按选中模型分派到对应配置面板：
 * - Lyria 系列 → LyriaConfigPanel（10 字段完整）
 * - 其它音乐模型 → GenericMusicConfigPanel（输出格式 + 反向提示）
 */
export function ConfigPanelRouter({ modelName, capabilities, state }: Props) {
  const lyria = isLyriaModel(modelName);
  const pro = isLyriaPro(modelName);

  return lyria ? (
    <LyriaConfigPanel
      capabilities={capabilities}
      isPro={pro}
      genre={state.genre}
      setGenre={state.setGenre}
      instruments={state.instruments}
      setInstruments={state.setInstruments}
      bpm={state.bpm}
      setBpm={state.setBpm}
      keyScale={state.keyScale}
      setKeyScale={state.setKeyScale}
      mood={state.mood}
      setMood={state.setMood}
      lyrics={state.lyrics}
      setLyrics={state.setLyrics}
      timeline={state.timeline}
      setTimeline={state.setTimeline}
      outputFormat={state.outputFormat}
      setOutputFormat={state.setOutputFormat}
      language={state.language}
      setLanguage={state.setLanguage}
      vocals={state.vocals}
      setVocals={state.setVocals}
    />
  ) : (
    <GenericMusicConfigPanel
      capabilities={capabilities}
      outputFormat={state.outputFormat}
      setOutputFormat={state.setOutputFormat}
      negativePrompt={state.negativePrompt}
      setNegativePrompt={state.setNegativePrompt}
    />
  );
}
