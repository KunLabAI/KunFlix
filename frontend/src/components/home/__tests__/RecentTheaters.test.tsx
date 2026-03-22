import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import RecentTheaters from '../RecentTheaters';
import { useAuth } from '@/context/AuthContext';
import { theaterApi } from '@/lib/theaterApi';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/theaterApi', () => ({
  theaterApi: {
    listTheaters: jest.fn(),
    deleteTheater: jest.fn(),
  },
}));

// Mock ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver;

describe('RecentTheaters', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: true });
    jest.clearAllMocks();
  });

  it('renders correctly and matches snapshot with fetched theaters', async () => {
    const mockTheaters = [
      {
        id: '1',
        title: 'Theater 1',
        thumbnail_url: null,
        status: 'draft',
        node_count: 2,
        created_at: '2023-10-10T12:00:00Z',
        updated_at: '2023-10-10T12:05:00Z',
      },
      {
        id: '2',
        title: 'Theater 2',
        thumbnail_url: null,
        status: 'published',
        node_count: 5,
        created_at: '2023-10-09T12:00:00Z',
        updated_at: null,
      }
    ];

    (theaterApi.listTheaters as jest.Mock).mockResolvedValue({ items: mockTheaters });

    const { container } = render(<RecentTheaters />);

    await waitFor(() => {
      expect(screen.getByText('Theater 1')).toBeInTheDocument();
      expect(screen.getByText('Theater 2')).toBeInTheDocument();
    });

    expect(container).toMatchSnapshot();
  });
});
