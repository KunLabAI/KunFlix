import { renderHook } from '@testing-library/react';
import { usePivotEngine } from './usePivotEngine';

// Mock Web Worker
class WorkerMock {
  url: string;
  onmessage: (msg: any) => void;
  constructor(stringUrl: string) {
    this.url = stringUrl;
    this.onmessage = () => {};
  }
  postMessage(msg: any) {
    // Simulate a basic return for testing
    setTimeout(() => {
      this.onmessage({ data: { result: { columns: [{ title: 'Mock', dataIndex: 'mock' }], dataSource: [{ mock: 1 }] } } });
    }, 10);
  }
  terminate() {}
}

global.Worker = WorkerMock as any;
global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

describe('usePivotEngine', () => {
  it('should initialize and run web worker calculation', async () => {
    const data = [{ category: 'A', value: 10 }];
    const config = { rows: ['category'], cols: [], values: [{ field: 'value', agg: 'sum' }] };
    
    const { result, rerender } = renderHook(() => usePivotEngine(data, config));
    
    expect(result.current.isCalculating).toBe(true);
    
    // Wait for worker mock
    await new Promise(r => setTimeout(r, 20));
    
    expect(result.current.isCalculating).toBe(false);
    expect(result.current.result.columns.length).toBe(1);
  });
});
