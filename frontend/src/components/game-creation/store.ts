
import { StoryTemplate } from '@/components/create-game/data';

export interface GameState {
  step: number;
  templateId: string;
  basicInfo: {
    title: string;
    description: string;
    worldSetting: string; // The core world setting, potentially AI-enhanced
  };
  characters: Character[];
  opening: {
    location: string;
    situation: string;
    goal: string;
  };
}

export interface Character {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'unknown';
  role: 'protagonist' | 'npc';
  archetype: string;
  background: string;
  traits: string[];
  avatar?: string;
  isExpanded?: boolean;
}

export type GameCreationAction =
  | { type: 'SET_TEMPLATE'; payload: string }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'UPDATE_BASIC_INFO'; payload: Partial<GameState['basicInfo']> }
  | { type: 'UPDATE_CHARACTERS'; payload: Character[] }
  | { type: 'UPDATE_OPENING'; payload: Partial<GameState['opening']> };

export const INITIAL_GAME_STATE: GameState = {
  step: 1,
  templateId: '',
  basicInfo: {
    title: '',
    description: '',
    worldSetting: '',
  },
  characters: [{
    id: 'init-1',
    name: '',
    gender: 'unknown',
    role: undefined as any,
    archetype: '',
    background: '',
    traits: [],
    isExpanded: true,
  }],
  opening: {
    location: '',
    situation: '',
    goal: '',
  },
};

export function gameCreationReducer(state: GameState, action: GameCreationAction): GameState {
  switch (action.type) {
    case 'SET_TEMPLATE':
      return { ...state, templateId: action.payload };
    case 'NEXT_STEP':
      return { ...state, step: state.step + 1 };
    case 'PREV_STEP':
      return { ...state, step: Math.max(1, state.step - 1) };
    case 'UPDATE_BASIC_INFO':
      return { ...state, basicInfo: { ...state.basicInfo, ...action.payload } };
    case 'UPDATE_CHARACTERS':
      return { ...state, characters: action.payload };
    case 'UPDATE_OPENING':
      return { ...state, opening: { ...state.opening, ...action.payload } };
    default:
      return state;
  }
}
