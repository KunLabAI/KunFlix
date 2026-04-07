import React, { useEffect, useRef, useMemo } from 'react';
import { useCanvasStore, StoryboardNodeData } from '@/store/useCanvasStore';
import { PivotField } from './types';
import { PivotTable } from './PivotTable';

const DEFAULT_FIELDS: PivotField[] = [
  { id: 'shot', name: '镜头', type: 'number' },
  { id: 'duration', name: '时长', type: 'number' },
  { id: 'sceneDesc', name: '场景描述', type: 'string' },
  { id: 'character', name: '角色', type: 'string' },
  { id: 'characterImg', name: '角色图', type: 'image' },
];

export const PivotEditor = ({ nodeId }: { nodeId: string }) => {
  const { nodes, updateNodeData } = useCanvasStore();
  const node = nodes.find(n => n.id === nodeId);
  const data = node?.data as StoryboardNodeData;

  // ---------------------------------------------------------------------------
  // Detect Agent-provided table data
  // Agent may send data in three ways:
  //   1. tableData + tableColumns  (preferred)
  //   2. pivotConfig.rows as data objects + pivotConfig.columns as column defs
  //   3. Traditional pivot config (rows/cols/values as field IDs)
  // ---------------------------------------------------------------------------
  const agentTable = useMemo(() => {
    // Preferred: explicit tableData field
    const td = data?.tableData;
    const tc = data?.tableColumns;
    const hasTableData = Array.isArray(td) && td.length > 0;
    const hasTableCols = Array.isArray(tc) && tc.length > 0;
    if (hasTableData) {
      const rows = td.map((r, i) => ({ ...r, key: `row-${i}` }));
      const fields: PivotField[] = hasTableCols
        ? tc.map(c => ({ id: c.key, name: c.label || c.key, type: (c.type === 'number' ? 'number' : 'string') as PivotField['type'] }))
        : Object.keys(rows[0]).filter(k => k !== 'key').map(k => ({ id: k, name: k, type: 'string' as const }));
      return { rows, fields };
    }

    // Fallback: detect agent format inside pivotConfig
    const pc = data?.pivotConfig;
    const pcRows = pc?.rows;
    const pcCols = pc?.columns;
    const rowsAreData = Array.isArray(pcRows) && pcRows.length > 0 && typeof pcRows[0] === 'object' && !Array.isArray(pcRows[0]);
    const colsAreDefs = Array.isArray(pcCols) && pcCols.length > 0 && typeof pcCols[0] === 'object';
    if (rowsAreData) {
      const rows = pcRows.map((r: Record<string, unknown>, i: number) => ({ ...r, key: `row-${i}` }));
      const fields: PivotField[] = colsAreDefs
        ? pcCols.map((c: any) => ({ id: c.key, name: c.label || c.key, type: (c.type === 'number' ? 'number' : 'string') as PivotField['type'] }))
        : Object.keys(rows[0]).filter((k: string) => k !== 'key').map((k: string) => ({ id: k, name: k, type: 'string' as const }));
      return { rows, fields };
    }

    return null;
  }, [data?.tableData, data?.tableColumns, data?.pivotConfig]);

  const hasAgentData = !!agentTable;
  const availableFields = hasAgentData ? agentTable.fields : DEFAULT_FIELDS;

  // Build display result directly from agent data
  const displayResult = useMemo(() => {
    const fields = hasAgentData ? agentTable!.fields : DEFAULT_FIELDS;
    const rows = hasAgentData ? agentTable!.rows : [];
    return {
      columns: fields.map(f => ({
        title: f.name,
        dataIndex: f.id,
        key: f.id,
        width: 150,
        __isMedia: f.type === 'image' || f.type === 'video',
      })),
      dataSource: rows,
    };
  }, [hasAgentData, agentTable]);

  // Sync to store
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    nodeId && updateNodeData(nodeId, { pivotData: displayResult });
  }, [displayResult, nodeId, updateNodeData]);

  return (
    <div className="flex w-full h-full bg-background border-t">
      <div className="flex-1 p-4 flex flex-col overflow-hidden min-w-0">
        <div className="flex justify-between items-center shrink-0 mb-3">
          <div className="text-sm font-semibold">
            表格 {displayResult.dataSource.length > 0 && `(${displayResult.dataSource.length} 行)`}
          </div>
        </div>
        <PivotTable data={displayResult} loading={false} />
      </div>
    </div>
  );
};
