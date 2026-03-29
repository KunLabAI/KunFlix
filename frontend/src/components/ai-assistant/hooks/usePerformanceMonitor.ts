'use client';

import { useEffect, useRef, useCallback } from 'react';

interface PerformanceMetrics {
  // Long Task 指标
  longTasks: Array<{
    duration: number;
    startTime: number;
    attribution: string;
  }>;
  // LCP (Largest Contentful Paint)
  lcp?: number;
  // FID (First Input Delay)
  fid?: number;
  // CLS (Cumulative Layout Shift)
  cls?: number;
  // FPS
  fps: number[];
}

interface PerformanceMonitorOptions {
  onLongTask?: (duration: number, attribution: string) => void;
  onLCP?: (value: number) => void;
  onFID?: (value: number) => void;
  onCLS?: (value: number) => void;
  longTaskThreshold?: number; // 默认 200ms
  enableFPS?: boolean;
}

export function usePerformanceMonitor(options: PerformanceMonitorOptions = {}) {
  const {
    onLongTask,
    onLCP,
    onFID,
    onCLS,
    longTaskThreshold = 200,
    enableFPS = true,
  } = options;

  const metricsRef = useRef<PerformanceMetrics>({
    longTasks: [],
    fps: [],
  });
  const observersRef = useRef<PerformanceObserver[]>([]);
  const fpsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  // 上报性能数据
  const reportMetrics = useCallback(() => {
    const metrics = metricsRef.current;
    
    // 计算平均 FPS
    const avgFPS = metrics.fps.length > 0
      ? metrics.fps.reduce((a, b) => a + b, 0) / metrics.fps.length
      : 0;

    // 计算 Long Task 统计
    const longTaskCount = metrics.longTasks.length;
    const maxLongTaskDuration = metrics.longTasks.length > 0
      ? Math.max(...metrics.longTasks.map(t => t.duration))
      : 0;

    return {
      avgFPS: Math.round(avgFPS),
      longTaskCount,
      maxLongTaskDuration: Math.round(maxLongTaskDuration),
      lcp: metrics.lcp,
      fid: metrics.fid,
      cls: metrics.cls,
    };
  }, []);

  useEffect(() => {
    // 只在客户端执行
    if (typeof window === 'undefined') return;

    // 1. 监听 Long Task
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const duration = entry.duration;
            const attribution = (entry as any).attribution?.[0]?.name || 'unknown';
            
            metricsRef.current.longTasks.push({
              duration,
              startTime: entry.startTime,
              attribution,
            });

            // 超过阈值触发告警
            if (duration > longTaskThreshold) {
              onLongTask?.(duration, attribution);
              console.warn(`[Performance] Long Task detected: ${Math.round(duration)}ms`, attribution);
            }
          }
        });

        longTaskObserver.observe({ entryTypes: ['longtask'] });
        observersRef.current.push(longTaskObserver);
      } catch (e) {
        // Long Task API 可能不被支持
      }
    }

    // 2. 监听 LCP
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          if (lastEntry) {
            metricsRef.current.lcp = lastEntry.startTime;
            onLCP?.(lastEntry.startTime);
          }
        });

        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        observersRef.current.push(lcpObserver);
      } catch (e) {
        // LCP API 可能不被支持
      }
    }

    // 3. 监听 FID
    if ('PerformanceObserver' in window) {
      try {
        const fidObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const delay = (entry as any).processingStart - entry.startTime;
            metricsRef.current.fid = delay;
            onFID?.(delay);
          }
        });

        fidObserver.observe({ entryTypes: ['first-input'] });
        observersRef.current.push(fidObserver);
      } catch (e) {
        // FID API 可能不被支持
      }
    }

    // 4. 监听 CLS
    if ('PerformanceObserver' in window) {
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
              metricsRef.current.cls = clsValue;
              onCLS?.(clsValue);
            }
          }
        });

        clsObserver.observe({ entryTypes: ['layout-shift'] });
        observersRef.current.push(clsObserver);
      } catch (e) {
        // CLS API 可能不被支持
      }
    }

    // 5. FPS 监控
    if (enableFPS) {
      const measureFPS = () => {
        frameCountRef.current++;
        const currentTime = performance.now();
        const elapsed = currentTime - lastTimeRef.current;

        if (elapsed >= 1000) {
          const fps = Math.round((frameCountRef.current * 1000) / elapsed);
          metricsRef.current.fps.push(fps);
          
          // 只保留最近 60 个 FPS 样本
          if (metricsRef.current.fps.length > 60) {
            metricsRef.current.fps.shift();
          }

          frameCountRef.current = 0;
          lastTimeRef.current = currentTime;
        }

        requestAnimationFrame(measureFPS);
      };

      requestAnimationFrame(measureFPS);
    }

    // 清理
    return () => {
      observersRef.current.forEach(observer => observer.disconnect());
      observersRef.current = [];
      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current);
      }
    };
  }, [onLongTask, onLCP, onFID, onCLS, longTaskThreshold, enableFPS]);

  return {
    reportMetrics,
    getMetrics: () => ({ ...metricsRef.current }),
  };
}

// 用于测量特定操作的性能
export function useMeasurePerformance(operationName: string) {
  const measure = useCallback(<T,>(fn: () => T): T => {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    const duration = end - start;
    
    console.log(`[Performance] ${operationName}: ${duration.toFixed(2)}ms`);
    
    return result;
  }, [operationName]);

  const measureAsync = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    const duration = end - start;
    
    console.log(`[Performance] ${operationName} (async): ${duration.toFixed(2)}ms`);
    
    return result;
  }, [operationName]);

  return { measure, measureAsync };
}

export default usePerformanceMonitor;
