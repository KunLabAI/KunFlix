/**
 * edgeRules.ts 矩阵与 validateEdge 的单元测试。
 * 测试覆盖：
 *  - 5x5 矩阵字面值与 edgeRules.md 第 4 节一致
 *  - validateEdge 早返回顺序（self_loop → same_polarity → duplicate_edge → cycle → matrix）
 */
import type { Edge } from '@xyflow/react';
import {
  EDGE_LEGALITY_MATRIX,
  validateEdge,
  getEdgeLegality,
  type NodeType,
} from '../edgeRules';

const noEdges: Edge[] = [];

const mkEdge = (source: string, target: string, sh = 'right-source', th = 'left-target'): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
  sourceHandle: sh,
  targetHandle: th,
});

describe('EDGE_LEGALITY_MATRIX 字面值锁定', () => {
  it('text 行：全 allow', () => {
    expect(EDGE_LEGALITY_MATRIX.text).toEqual({
      text: 'allow', image: 'allow', video: 'allow', audio: 'allow', storyboard: 'allow',
    });
  });

  it('image 行：→audio=forbid, →text=deferred，其余 allow', () => {
    expect(EDGE_LEGALITY_MATRIX.image).toEqual({
      text: 'deferred', image: 'allow', video: 'allow', audio: 'forbid', storyboard: 'allow',
    });
  });

  it('video 行：→text=deferred, →audio=deferred，其余 allow', () => {
    expect(EDGE_LEGALITY_MATRIX.video).toEqual({
      text: 'deferred', image: 'allow', video: 'allow', audio: 'deferred', storyboard: 'allow',
    });
  });

  it('audio 行：→image=forbid, →text=deferred, →audio=deferred，其余 allow', () => {
    expect(EDGE_LEGALITY_MATRIX.audio).toEqual({
      text: 'deferred', image: 'forbid', video: 'allow', audio: 'deferred', storyboard: 'allow',
    });
  });

  it('storyboard 行：全 allow', () => {
    expect(EDGE_LEGALITY_MATRIX.storyboard).toEqual({
      text: 'allow', image: 'allow', video: 'allow', audio: 'allow', storyboard: 'allow',
    });
  });
});

describe('validateEdge 硬约束', () => {
  it('self_loop：拒绝自环', () => {
    const r = validateEdge({
      sourceId: 'n1', targetId: 'n1',
      sourceType: 'text', targetType: 'text',
      sourceHandle: 'right-source', targetHandle: 'left-target',
      existingEdges: noEdges,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('self_loop');
  });

  it('same_polarity：同侧 handle（都在 right）拒绝', () => {
    const r = validateEdge({
      sourceId: 'a', targetId: 'b',
      sourceType: 'text', targetType: 'text',
      sourceHandle: 'right-source', targetHandle: 'right-source',
      existingEdges: noEdges,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('same_polarity');
  });

  it('same_polarity：异侧 source→source 放行（Loose 模式典型场景）', () => {
    // 回归用例：ReactFlow ConnectionMode.Loose 下，*-source 覆盖在 *-target 上层，
    // 图像右边 → 视频左边的拖拽两端都会命中 *-source，但几何上属于异侧，应放行。
    const r = validateEdge({
      sourceId: 'a', targetId: 'b',
      sourceType: 'image', targetType: 'video',
      sourceHandle: 'right-source', targetHandle: 'left-source',
      existingEdges: noEdges,
    });
    expect(r.ok).toBe(true);
  });

  it('duplicate_edge：完全相同四元组拒绝', () => {
    const existing: Edge[] = [mkEdge('a', 'b')];
    const r = validateEdge({
      sourceId: 'a', targetId: 'b',
      sourceType: 'text', targetType: 'text',
      sourceHandle: 'right-source', targetHandle: 'left-target',
      existingEdges: existing,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('duplicate_edge');
  });

  it('cycle：A→B 存在时 B→A 拒绝', () => {
    const existing: Edge[] = [mkEdge('A', 'B')];
    const r = validateEdge({
      sourceId: 'B', targetId: 'A',
      sourceType: 'text', targetType: 'text',
      sourceHandle: 'right-source', targetHandle: 'left-target',
      existingEdges: existing,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('cycle');
  });
});

describe('validateEdge 矩阵', () => {
  const base = {
    sourceId: 'a', targetId: 'b',
    sourceHandle: 'right-source', targetHandle: 'left-target',
    existingEdges: noEdges,
  } as const;

  it('image→audio：forbid', () => {
    const r = validateEdge({ ...base, sourceType: 'image', targetType: 'audio' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('forbidden_type_combination');
  });

  it('audio→image：forbid', () => {
    const r = validateEdge({ ...base, sourceType: 'audio', targetType: 'image' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('forbidden_type_combination');
  });

  it('image→text：deferred → not_supported_yet', () => {
    const r = validateEdge({ ...base, sourceType: 'image', targetType: 'text' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_supported_yet');
  });

  it('video→audio：deferred → not_supported_yet', () => {
    const r = validateEdge({ ...base, sourceType: 'video', targetType: 'audio' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_supported_yet');
  });

  it('text→image：allow', () => {
    const r = validateEdge({ ...base, sourceType: 'text', targetType: 'image' });
    expect(r.ok).toBe(true);
  });

  it('storyboard→video：allow', () => {
    const r = validateEdge({ ...base, sourceType: 'storyboard', targetType: 'video' });
    expect(r.ok).toBe(true);
  });

  it('未知类型：按 allow 处理', () => {
    const r = validateEdge({ ...base, sourceType: 'ghost' as unknown as NodeType, targetType: 'text' });
    expect(r.ok).toBe(true);
  });
});

describe('getEdgeLegality', () => {
  it('image→audio = forbid', () => {
    expect(getEdgeLegality('image', 'audio')).toBe('forbid');
  });
  it('video→text = deferred', () => {
    expect(getEdgeLegality('video', 'text')).toBe('deferred');
  });
  it('text→storyboard = allow', () => {
    expect(getEdgeLegality('text', 'storyboard')).toBe('allow');
  });
});
