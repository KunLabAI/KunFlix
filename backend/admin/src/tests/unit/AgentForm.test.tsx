import React from 'react';
import { render, screen } from '@testing-library/react';
import BasicInfo from '@/components/admin/agents/AgentForm/BasicInfo';
import { useForm, FormProvider } from 'react-hook-form';
import { describe, it, expect, vi } from 'vitest';

// Mock matchMedia
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

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const methods = useForm({
    defaultValues: {
      name: '',
      description: '',
      provider_id: undefined,
      model: '',
    }
  });
  return (
    <FormProvider {...methods}>
      <form>{children}</form>
    </FormProvider>
  );
};

describe('BasicInfo', () => {
  const mockProviders = [
    { id: 1, name: 'OpenAI', models: ['gpt-4'], is_active: true },
  ] as any;

  it('renders correctly', () => {
    render(
      <Wrapper>
        <BasicInfo 
          providers={mockProviders} 
        />
      </Wrapper>
    );
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('供应商')).toBeInTheDocument();
  });
});
