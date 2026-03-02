
import { StoryTemplate } from '@/components/create-game/data';

export interface GameState {
  step: number;
  templateId: string;
  basicInfo: {
    title: string;
    description: string;
    worldSetting: string; // The core world setting, potentially AI-enhanced
  };
  mainCharacter: {
    name: string;
    archetype: string;
    background: string;
    traits: string[];
  };
  opening: {
    location: string;
    situation: string;
    goal: string;
  };
}

export type GameCreationAction =
  | { type: 'SET_TEMPLATE'; payload: string }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'UPDATE_BASIC_INFO'; payload: Partial<GameState['basicInfo']> }
  | { type: 'UPDATE_MAIN_CHARACTER'; payload: Partial<GameState['mainCharacter']> }
  | { type: 'UPDATE_OPENING'; payload: Partial<GameState['opening']> };

export const INITIAL_GAME_STATE: GameState = {
  step: 1,
  templateId: '',
  basicInfo: {
    title: '',
    description: '',
    worldSetting: '',
  },
  mainCharacter: {
    name: '',
    archetype: '',
    background: '',
    traits: [],
  },
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
    case 'UPDATE_MAIN_CHARACTER':
      return { ...state, mainCharacter: { ...state.mainCharacter, ...action.payload } };
    case 'UPDATE_OPENING':
      return { ...state, opening: { ...state.opening, ...action.payload } };
    default:
      return state;
  }
}
