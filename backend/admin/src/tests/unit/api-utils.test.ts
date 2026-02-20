import { parseProviderModels } from '@/lib/api-utils';
import { describe, it, expect } from 'vitest';

describe('parseProviderModels', () => {
  it('should return array if input is array', () => {
    expect(parseProviderModels(['gpt-4'])).toEqual(['gpt-4']);
  });

  it('should parse JSON string array', () => {
    expect(parseProviderModels('["gpt-4", "gpt-3.5"]')).toEqual(['gpt-4', 'gpt-3.5']);
  });

  it('should return single item array if string is not JSON array', () => {
    expect(parseProviderModels('gpt-4')).toEqual(['gpt-4']);
  });

  it('should return empty array for other types', () => {
    // @ts-ignore
    expect(parseProviderModels(null)).toEqual([]);
  });
});
