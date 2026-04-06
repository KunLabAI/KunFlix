import React, { useState, useEffect } from 'react';
import { useCanvasStore, StoryboardNodeData } from '@/store/useCanvasStore';
import { PivotConfig, PivotField, PivotValueField } from './types';
import { PivotDropzone } from './PivotDropzone';
import { PivotTable } from './PivotTable';
import { usePivotEngine } from './usePivotEngine';
import { Settings, Database } from 'lucide-react';
import { Drawer, Select } from 'antd';
import { Button } from '@/components/ui/button';

const DEFAULT_EMPTY_DATA: any[] = [];

// These are default fields for a new Storyboard node when there's no incoming data
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

  // Real app logic: check if there's incoming dataset from upstream nodes
  // For now, we simulate that if it's a brand new node, we use empty data and default fields
  const hasExternalData = false; 
  const dataSource = hasExternalData ? [] /* Mock external data */ : DEFAULT_EMPTY_DATA;
  const availableFields = hasExternalData ? [] /* Derived fields */ : DEFAULT_FIELDS;

  const [config, setConfig] = useState<PivotConfig>({
    rows: [],
    cols: [],
    values: [],
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingValue, setEditingValue] = useState<PivotValueField | null>(null);

  useEffect(() => {
    if (data?.pivotConfig && Object.keys(data.pivotConfig).length > 0) {
      // 合并默认配置，确保所有必要字段都存在
      setConfig({
        rows: [],
        cols: [],
        values: [],
        ...data.pivotConfig,
      });
    }
  }, [data?.pivotConfig]);

  // Use engine
  const { result, isCalculating } = usePivotEngine(dataSource, config);

  // Sync to node
  useEffect(() => {
    if (nodeId && config) {
      updateNodeData(nodeId, { pivotConfig: config, pivotData: result });
    }
  }, [config, result, nodeId, updateNodeData]);

  const handleDragStart = (e: React.DragEvent, field: PivotField) => {
    e.dataTransfer.setData('application/pivot-field', JSON.stringify(field));
  };

  const handleDrop = (field: PivotField, zone: string) => {
    setConfig(prev => {
      const next = { ...prev };
      if (zone === 'rows' && !next.rows.includes(field.id)) {
        next.rows = [...next.rows, field.id];
      } else if (zone === 'cols' && !next.cols.includes(field.id)) {
        next.cols = [...next.cols, field.id];
      } else if (zone === 'values' && !next.values.find(v => v.field === field.id)) {
        next.values = [...next.values, { field: field.id, agg: field.type === 'number' ? 'sum' : 'count' }];
      }
      return next;
    });
  };

  const handleRemove = (fieldId: string, zone: string) => {
    setConfig(prev => {
      const next = { ...prev };
      if (zone === 'rows') {
        next.rows = next.rows.filter(r => r !== fieldId);
      } else if (zone === 'cols') {
        next.cols = next.cols.filter(c => c !== fieldId);
      } else if (zone === 'values') {
        next.values = next.values.filter(v => v.field !== fieldId);
      }
      return next;
    });
  };

  return (
    <div className="flex w-full h-full bg-background border-t">
      <div className="w-[250px] border-r p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Database className="w-4 h-4" /> 字段列表
        </div>
        <div className="flex flex-col gap-2">
          {availableFields.length > 0 ? (
            availableFields.map(f => (
              <div
                key={f.id}
                draggable
                onDragStart={(e) => handleDragStart(e, f)}
                className="px-3 py-2 text-sm bg-card border rounded-md cursor-grab hover:bg-accent hover:shadow-sm transition-all"
              >
                {f.name} 
                <span className="text-xs text-muted-foreground ml-1">
                  ({
                    f.type === 'string' ? '文本' : 
                    f.type === 'number' ? '数字' : 
                    f.type === 'date' ? '日期' : 
                    f.type === 'image' ? '图片' : 
                    f.type === 'video' ? '视频' : f.type
                  })
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground text-center py-4 bg-secondary/20 rounded-md border border-dashed">
              暂无可用字段
              <br />
              <span className="opacity-70 mt-1 inline-block">请先连接包含数据的节点</span>
            </div>
          )}
        </div>
        <hr className="my-2" />
        <PivotDropzone
          id="rows"
          title="行 (Rows)"
          items={config.rows.map(r => availableFields.find(f => f.id === r)!).filter(Boolean)}
          onDrop={handleDrop}
          onRemove={handleRemove}
        />
        <PivotDropzone
          id="cols"
          title="列 (Columns)"
          items={config.cols.map(c => availableFields.find(f => f.id === c)!).filter(Boolean)}
          onDrop={handleDrop}
          onRemove={handleRemove}
        />
        <PivotDropzone
          id="values"
          title="值 (Values)"
          items={config.values.map(v => ({
            id: v.field,
            name: `${availableFields.find(f => f.id === v.field)?.name} (${v.agg})`,
            type: 'number'
          }))}
          onDrop={handleDrop}
          onRemove={handleRemove}
          onItemClick={(item) => {
             const val = config.values.find(v => v.field === item.id);
             if (val) {
                setEditingValue(val);
                setDrawerOpen(true);
             }
          }}
        />
      </div>
      <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden min-w-0">
        <div className="flex justify-between items-center shrink-0">
          <div className="text-sm font-semibold">透视表预览 {dataSource.length > 0 && `(${dataSource.length} 行)`}</div>
          <Button variant="outline" size="sm" onClick={() => { setEditingValue(null); setDrawerOpen(true); }}>
            <Settings className="w-4 h-4 mr-2" />
            配置
          </Button>
        </div>
        <PivotTable data={result} loading={isCalculating} />
      </div>

      <Drawer
        title="透视表配置"
        placement="right"
        onClose={() => { setDrawerOpen(false); setEditingValue(null); }}
        open={drawerOpen}
      >
        {editingValue && (
          <div className="flex flex-col gap-4">
             <div className="font-semibold">{availableFields.find(f => f.id === editingValue.field)?.name}</div>
             <div className="flex flex-col gap-2">
               <label className="text-sm">聚合方式</label>
               <Select
                 value={editingValue.agg}
                 onChange={(val) => {
                    setConfig(prev => ({
                       ...prev,
                       values: prev.values.map(v => v.field === editingValue.field ? { ...v, agg: val } : v)
                    }));
                 }}
                 options={[
                   { label: '求和 (Sum)', value: 'sum' },
                   { label: '计数 (Count)', value: 'count' },
                   { label: '平均值 (Average)', value: 'avg' },
                   { label: '最大值 (Max)', value: 'max' },
                   { label: '最小值 (Min)', value: 'min' },
                 ]}
               />
             </div>
             {/* Additional format options could be added here */}
          </div>
        )}
        {!editingValue && (
            <div className="text-sm text-muted-foreground flex flex-col gap-4">
                <p>请在左侧点击一个值字段进行详细配置。</p>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">全局排序</label>
                    <Select
                        placeholder="选择排序字段"
                        allowClear
                        value={config.sort?.[0]?.field}
                        onChange={(val) => {
                            if (!val) {
                                setConfig(prev => ({ ...prev, sort: [] }));
                                return;
                            }
                            setConfig(prev => ({ ...prev, sort: [{ field: val, order: 'desc' }] }));
                        }}
                        options={[
                            ...config.rows.map(r => ({ label: `按 ${availableFields.find(f => f.id === r)?.name} (行)`, value: r })),
                            ...config.values.map(v => ({ label: `按 ${availableFields.find(f => f.id === v.field)?.name} (值)`, value: `___${v.field}_${v.agg}` }))
                        ]}
                    />
                </div>
            </div>
        )}
      </Drawer>
    </div>
  );
};
