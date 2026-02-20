import React from 'react';
import { render, screen } from '@testing-library/react';
import BasicInfo from '@/components/admin/agents/AgentForm/BasicInfo';
import { Form } from 'antd';
import { describe, it, expect, vi } from 'vitest';

// Mock matchMedia for Ant Design
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <Form>{children}</Form>
);

describe('BasicInfo', () => {
  const mockProviders = [
    { id: 1, name: 'OpenAI', models: ['gpt-4'], is_active: true },
  ];
  const mockOnProviderChange = vi.fn();

  it('renders correctly', () => {
    render(
      <Wrapper>
        <BasicInfo 
          providers={mockProviders} 
          selectedProviderId={null} 
          onProviderChange={mockOnProviderChange} 
        />
      </Wrapper>
    );
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('AI 供应商')).toBeInTheDocument();
  });
});
