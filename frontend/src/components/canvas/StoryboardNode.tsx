
import { memo, useCallback, useMemo, useState } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow, NodeResizer } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Clapperboard, Trash2, Copy } from 'lucide-react';
import { useCanvasStore, StoryboardNodeData, CanvasNode } from '@/store/useCanvasStore';
import { NodeToolbar, ToolbarAction } from './NodeToolbar';
import { v4 as uuidv4 } from 'uuid';

const StoryboardNode = ({ id, data, selected }: NodeProps<Node<StoryboardNodeData>>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const [isEditing, setIsEditing] = useState(false);
  const { getNode } = useReactFlow();

  const handleDelete = (e: React.MouseEvent) => {
    if (confirm("确定要删除这张多维表格卡吗？")) {
      deleteNode(id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (node) {
      const newNode = {
        ...(node as CanvasNode),
        id: `storyboard-${uuidv4()}`,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: false,
        data: {
          ...node.data,
        },
      } as CanvasNode;
      addNode(newNode);
    }
  };

  // Extract table data
  const tableInfo = useMemo(() => {
    const td = data.tableData;
    const tc = data.tableColumns;
    const hasTableData = Array.isArray(td) && td.length > 0;
    const hasTableCols = Array.isArray(tc) && tc.length > 0;
    const columns: { key: string; label: string }[] = hasTableCols
      ? tc.map((c: any) => ({ key: c.key, label: c.label || c.key }))
      : hasTableData
        ? Object.keys(td[0]).filter(k => k !== 'key').map(k => ({ key: k, label: k }))
        : [];
    return { columns, rows: hasTableData ? td : [], total: hasTableData ? td.length : 0 };
  }, [data.tableData, data.tableColumns]);

  const hasData = tableInfo.total > 0;

  const handleCellBlur = useCallback((rowIndex: number, colKey: string, value: string) => {
    const td = data.tableData;
    if (!Array.isArray(td)) return;
    const updated = td.map((row, i) => (i === rowIndex ? { ...row, [colKey]: value } : row));
    updateNodeData(id, { tableData: updated });
  }, [data.tableData, id, updateNodeData]);

  return (
    <>
      <NodeResizer 
        color="#6d6d6d" 
        isVisible={selected} 
        minWidth={398} 
        minHeight={256}
        lineStyle={{ display: 'none' }}
        handleStyle={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '4px',
          border: '1px solid #6d6d6d',
          background: '#fff',
          opacity: selected ? 1 : 0,
          transition: 'opacity 0.2s'
        }}
      />
      <div 
        className={`w-full h-full flex flex-col group relative storyboard-node-wrapper ${isEditing ? 'nodrag' : ''}`}
        style={{ minWidth: 398, minHeight: 256 }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        onBlur={(e) => {
          // Exit editing when focus leaves the entire node
          if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) {
            setIsEditing(false);
          }
        }}
      >
        {/* 标题悬浮在卡片上方，不占节点布局空间 */}
        <div className="absolute bottom-full left-0 right-0 mb-1 px-1 flex items-center justify-between gap-2 min-h-[28px] nodrag">
          <div className="flex-1 min-w-0 flex items-center">
            <h3 
              className="font-bold text-sm h-7 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none gap-2" 
              title="多维表格卡" 
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Clapperboard className="w-4 h-4 text-amber-600" />
              多维表格卡
            </h3>
          </div>
        </div>

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : 'border border-border/50'} overflow-hidden relative z-[2] shadow-sm hover:shadow-md transition-all`}>
          <CardContent className={`p-0 flex-1 flex flex-col bg-background/50 overflow-hidden ${isEditing ? 'nowheel' : ''}`}>
              {hasData ? (
                <div
                  className="flex-1 flex flex-col w-full h-full overflow-auto"
                  onPointerDown={(e) => {
                    // In edit mode, block drag for scrollbar clicks
                    const el = e.currentTarget;
                    const rect = el.getBoundingClientRect();
                    const onVScrollbar = el.scrollHeight > el.clientHeight && e.clientX >= rect.right - 14;
                    const onHScrollbar = el.scrollWidth > el.clientWidth && e.clientY >= rect.bottom - 14;
                    if (isEditing && (onVScrollbar || onHScrollbar)) e.stopPropagation();
                  }}
                >
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/60 border-b border-border sticky top-0 z-[1]">
                        {tableInfo.columns.map(col => (
                          <th key={col.key} className="px-3 py-2 text-left font-medium text-muted-foreground max-w-[180px] bg-muted/60">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableInfo.rows.map((row: any, i: number) => (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                          {tableInfo.columns.map(col => (
                            <td
                              key={col.key}
                              className={`px-3 py-1.5 max-w-[180px] text-foreground/80 ${isEditing ? 'cursor-text' : 'cursor-default select-none'}`}
                              contentEditable={isEditing}
                              suppressContentEditableWarning
                              onBlur={(e) => handleCellBlur(i, col.key, e.currentTarget.textContent || '')}
                            >
                              {row[col.key] != null ? String(row[col.key]) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <span className="text-sm font-medium text-foreground/60">暂无数据</span>
                  <span className="text-[10px] text-muted-foreground/50">等待 Agent 填入数据</span>
                </div>
              )}
          </CardContent>
        </Card>

        {/* 工具条 */}
        <NodeToolbar
          actions={[
            {
              icon: <Copy className="h-3.5 w-3.5" />,
              onClick: handleDuplicate,
              title: '创建副本',
            },
            {
              icon: <Trash2 className="h-3.5 w-3.5" />,
              onClick: handleDelete,
              title: '删除',
              variant: 'danger',
            },
          ] as ToolbarAction[]}
        />

        {/* Left Edge */}
        <div className="edge-handle-wrapper left group/handle pointer-events-auto">
          <Handle type="target" position={Position.Left} id="left-target" />
          <Handle type="source" position={Position.Left} id="left-source" />
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
        </div>

        {/* Right Edge */}
        <div className="edge-handle-wrapper right group/handle pointer-events-auto">
          <Handle type="target" position={Position.Right} id="right-target" />
          <Handle type="source" position={Position.Right} id="right-source" />
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
        </div>
      </div>


    </>
  );
};

export default memo(StoryboardNode);
