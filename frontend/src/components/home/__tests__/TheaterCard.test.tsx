import React from 'react';
import { render } from '@testing-library/react';
import TheaterCard from '../TheaterCard';

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Play: () => <div data-testid="play-icon" />,
  Layers: () => <div data-testid="layers-icon" />,
  MoreHorizontal: () => <div data-testid="more-icon" />,
  Trash: () => <div data-testid="trash-icon" />,
}));

describe('TheaterCard', () => {
  it('renders correctly and matches snapshot', () => {
    const { container } = render(
      <TheaterCard
        id="123"
        title="Test Theater"
        status="published"
        nodeCount={5}
        createdAt="2023-10-10T12:00:00Z"
        updatedAt="2023-10-10T12:05:00Z"
      />
    );
    expect(container).toMatchSnapshot();
  });

  it('renders delete button when onDelete is provided', () => {
    const { container } = render(
      <TheaterCard
        id="123"
        title="Test Theater"
        status="draft"
        nodeCount={0}
        createdAt="2023-10-10T12:00:00Z"
        onDelete={() => {}}
      />
    );
    expect(container).toMatchSnapshot();
  });
});
