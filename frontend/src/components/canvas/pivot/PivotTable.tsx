import React, { useMemo } from 'react';
import { Table } from 'antd';
import { PivotDataResult } from './types';

interface PivotTableProps {
  data: PivotDataResult;
  loading?: boolean;
}

export const PivotTable: React.FC<PivotTableProps> = ({ data, loading }) => {
  const processedColumns = useMemo(() => {
    return data.columns.map(col => {
      if (col.__isMedia) {
        return {
          ...col,
          render: (val: any) => {
            if (typeof val === 'string') {
              if (val.match(/\.(jpeg|jpg|gif|png|webp)$/i) || val.startsWith('data:image') || val.includes('unsplash.com')) {
                return <img src={val} alt="preview" className="h-10 w-auto object-contain rounded" />;
              }
              if (val.match(/\.(mp4|webm|ogg)$/i) || val.startsWith('data:video') || val.includes('test-videos.co.uk')) {
                return <video src={val} className="h-10 w-auto rounded" controls />;
              }
            }
            return val;
          }
        };
      }
      return col;
    });
  }, [data.columns]);

  const isEmpty = !data.dataSource || data.dataSource.length === 0;

  return (
    <div className="w-full h-full overflow-hidden border rounded-md bg-card flex flex-col relative">
      <Table
        columns={processedColumns}
        dataSource={data.dataSource}
        loading={loading}
        pagination={{ pageSize: 100 }}
        scroll={{ y: 800, x: 1200 }} // antd virtual table requires numeric scroll x/y
        virtual
        size="small"
        bordered
      />
      {isEmpty && !loading && (
        <div className="absolute inset-0 top-[39px] bg-background/50 flex flex-col items-center justify-center pointer-events-none z-10">
          <div className="text-muted-foreground text-sm flex flex-col items-center gap-2">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-20 mb-2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
            <p>暂无数据</p>
            <p className="text-xs opacity-60">等待 Agent 填入数据</p>
          </div>
        </div>
      )}
    </div>
  );
};
