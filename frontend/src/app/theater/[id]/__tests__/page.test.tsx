import { render, screen } from '@testing-library/react';
import TheaterEditorPage from '../page';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useAuth } from '@/context/AuthContext';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: '123' }),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/store/useCanvasStore', () => {
  const actual = jest.requireActual('@/store/useCanvasStore');
  return {
    ...actual,
    useCanvasStore: jest.fn(),
  };
});

jest.mock('@xyflow/react', () => {
  const actual = jest.requireActual('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ children }: any) => <div data-testid="react-flow">{children}</div>,
    Background: () => <div data-testid="background" />,
    MiniMap: () => <div data-testid="minimap" />,
    Panel: ({ children }: any) => <div data-testid="panel">{children}</div>,
  };
});

jest.mock('@/components/canvas/Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
jest.mock('@/components/canvas/ZoomControls', () => ({ ZoomControls: () => <div data-testid="zoom-controls" /> }));
jest.mock('@/components/canvas/ScriptNode', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('@/components/canvas/CharacterNode', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('@/components/canvas/StoryboardNode', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('@/components/canvas/VideoNode', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('@/components/canvas/CustomEdge', () => ({ CustomEdge: () => <div /> }));
jest.mock('@/components/canvas/AIAssistantPanel', () => ({ AIAssistantPanel: () => <div data-testid="ai-assistant" /> }));

jest.mock('uuid', () => ({
  v4: () => '123456789'
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('TheaterEditorPage', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: true });
    
    (useCanvasStore as unknown as jest.Mock).mockReturnValue({
      nodes: [],
      edges: [],
      isLoading: false,
      isSaving: false,
      isDirty: false,
      lastSavedAt: null,
      theaterTitle: 'Test Theater',
      onNodesChange: jest.fn(),
      onEdgesChange: jest.fn(),
      onConnect: jest.fn(),
      addNode: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn(),
      loadTheater: jest.fn().mockResolvedValue(undefined),
      saveToBackend: jest.fn().mockResolvedValue(undefined),
      setTheaterId: jest.fn(),
      setTheaterTitle: jest.fn(),
      takeSnapshot: jest.fn(),
    });
  });

  it('renders loading state when isLoading is true', () => {
    (useCanvasStore as unknown as jest.Mock).mockReturnValue({
      isLoading: true,
      loadTheater: jest.fn().mockResolvedValue(undefined),
      setTheaterId: jest.fn(),
    });

    render(<TheaterEditorPage />);
    expect(screen.getByText('正在加载剧场...')).toBeInTheDocument();
  });

  it('renders canvas and panels when loaded', () => {
    render(<TheaterEditorPage />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    expect(screen.getAllByTestId('panel').length).toBeGreaterThan(0);
  });
});
