/**
 * 首页「最近剧场」列表客户端缓存（模块单例 + 内存级，进程内有效）。
 *
 * 设计目标：
 *   - 用户在「首页 ↔ 剧场详情 ↔ 资产库」之间来回跳转时，避免每次回首页都重新发请求 + 重新转 loading。
 *   - 即使缓存陈旧也允许先用作占位渲染，再静默后台刷新（stale-while-revalidate）。
 *   - 局部增删改（rename / duplicate / delete / saveCanvas）必须能精确同步到缓存，避免 UI 与缓存不一致。
 *
 * 容量与生命周期：
 *   - 仅缓存第一页（page=1, page_size=20），与 RecentTheaters 当前消费形态一致。
 *   - 模块单例随页面会话存在；用户登出 / 切换账号时由调用方主动 invalidate。
 *   - 不落 localStorage，避免 SSR 不一致与多账号污染。
 */
import type { TheaterResponse } from "@/lib/theaterApi";

/** 新鲜窗口：1 分钟内视为新鲜，超过则触发后台刷新但仍可作占位 */
const FRESH_TTL_MS = 60_000;

interface Snapshot {
  items: TheaterResponse[];
  ts: number;
}

let snapshot: Snapshot | null = null;

export const theaterListCache = {
  /**
   * 任意可用的快照（无论是否新鲜）。用于组件 mount 时立即占位渲染，避免 loading 闪烁。
   */
  peek(): TheaterResponse[] | null {
    return snapshot ? snapshot.items : null;
  },

  /** 是否仍在新鲜窗口内。新鲜则可跳过后台刷新；陈旧则需 stale-while-revalidate。 */
  isFresh(): boolean {
    return !!snapshot && Date.now() - snapshot.ts < FRESH_TTL_MS;
  },

  /** 写入完整快照（接口返回成功后调用） */
  set(items: TheaterResponse[]): void {
    snapshot = { items, ts: Date.now() };
  },

  /** 完全失效。下次访问会真正发请求重拉（saveCanvas / 切换账号 / 强制刷新等场景）。 */
  invalidate(): void {
    snapshot = null;
  },

  /**
   * 局部更新或插入。
   *  - 已存在：原位替换（同步最新 title / thumbnail_url / updated_at 等）
   *  - 不存在：按 `mode` 决定插入位置
   *      head（默认）：放在最前，对应「新建 / 复制」语义
   *      tail：放到最后，对应不影响首屏顺序的兜底
   */
  upsert(theater: TheaterResponse, mode: "head" | "tail" = "head"): void {
    if (!snapshot) return;
    const idx = snapshot.items.findIndex((x) => x.id === theater.id);
    const exists = idx >= 0;
    snapshot.items = exists
      ? snapshot.items.map((x, k) => (k === idx ? theater : x))
      : mode === "head"
        ? [theater, ...snapshot.items]
        : [...snapshot.items, theater];
    snapshot.ts = Date.now();
  },

  /** 移除指定剧场，对应删除语义 */
  remove(id: string): void {
    if (!snapshot) return;
    snapshot.items = snapshot.items.filter((x) => x.id !== id);
    snapshot.ts = Date.now();
  },
};
