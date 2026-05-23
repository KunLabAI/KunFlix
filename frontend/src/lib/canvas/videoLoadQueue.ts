/**
 * 视频元数据加载并发队列
 *
 * 解决问题：
 *   画布初始化时，N 个 <video preload="metadata"> 会同时发起请求，
 *   塞满浏览器 HTTP/1.1 同源连接池（默认 6 个），导致 AI 面板的 fetch / SSE
 *   请求被排到队尾，表现为"打开 AI 面板对话需要等待"。
 *
 * 设计：
 *   - 全局最多 MAX_CONCURRENT 个 acquire 同时持有"加载槽位"
 *   - acquire() 返回 release 回调；持有期间允许该 url 设置 <video src>
 *   - release() 自动唤醒下一个等待者（FIFO）
 *   - markLoaded(url) 记录已加载过 metadata 的 url，再次访问可立即放行（跳过排队）
 */
const MAX_CONCURRENT = 3;

type Releaser = () => void;
type Starter = () => void;

let activeCount = 0;
const waiting: Starter[] = [];
const loadedUrls = new Set<string>();

/**
 * 申请一个视频元数据加载槽位。
 * - 槽位空闲：立刻返回 release 回调
 * - 槽位已满：返回 Promise，等待前置释放后才 resolve
 *
 * 调用方应在 metadata 加载完成 / 出错 / 组件卸载时调用 release()。
 * 重复调用 release() 是安全的（内部幂等）。
 */
export function acquireVideoSlot(): Promise<Releaser> {
  return new Promise<Releaser>((resolve) => {
    let released = false;
    const release: Releaser = () => {
      released && (() => {})();
      released || ((released = true), activeCount--, drainNext());
    };

    const start: Starter = () => {
      activeCount++;
      resolve(release);
    };

    activeCount < MAX_CONCURRENT ? start() : waiting.push(start);
  });
}

function drainNext() {
  const next = waiting.shift();
  next?.();
}

/**
 * 标记某个视频 URL 的 metadata 已加载完成。
 * 该 URL 之后再次进入视口时，可直接放行（不需排队）。
 */
export function markVideoMetadataLoaded(url: string) {
  url && loadedUrls.add(url);
}

/**
 * 查询某个 URL 是否已加载过 metadata。
 */
export function isVideoMetadataLoaded(url: string): boolean {
  return !!url && loadedUrls.has(url);
}

/**
 * 仅供测试/调试使用：重置队列状态。
 */
export function _resetVideoLoadQueueForTest() {
  activeCount = 0;
  waiting.length = 0;
  loadedUrls.clear();
}
