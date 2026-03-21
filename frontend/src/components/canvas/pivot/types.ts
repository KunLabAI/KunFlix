export type AggregationType = 'sum' | 'count' | 'avg' | 'max' | 'min';

export interface PivotField {
  id: string;
  name: string;
  type: 'string' | 'number' | 'date' | 'image' | 'video';
}

export interface PivotValueField {
  field: string;
  agg: AggregationType;
  format?: 'number' | 'percent' | 'currency';
  decimalPlaces?: number;
}

export interface PivotConfig {
  rows: string[];
  cols: string[];
  values: PivotValueField[];
  sort?: { field: string; order: 'asc' | 'desc' }[];
  filter?: { field: string; operator: string; value: any }[];
}

export interface PivotDataResult {
  columns: any[];
  dataSource: any[];
}
