import { useEffect, useState, useRef } from 'react';

export function usePivotEngine(data: any[], config: any) {
    const [result, setResult] = useState<any>({ columns: [], dataSource: [] });
    const [isCalculating, setIsCalculating] = useState(false);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        const workerCode = `
          self.onmessage = function(e) {
              const { data, config } = e.data;
              try {
                  const result = processPivot(data, config);
                  self.postMessage({ result });
              } catch (err) {
                  self.postMessage({ error: err.message });
              }
          };

          function processPivot(data, config) {
              if (!data || !data.length || (!config.rows.length && !config.cols.length && !config.values.length)) {
                  // If config is empty but we have available fields defined in the schema logic, 
                  // we'll handle the empty presentation in the PivotTable component.
                  return { 
                      columns: [
                        { title: '...', dataIndex: 'empty1', width: 150 },
                        { title: '...', dataIndex: 'empty2', width: 150 },
                        { title: '...', dataIndex: 'empty3', width: 150 },
                      ], 
                      dataSource: [] 
                  };
              }

              const { rows = [], cols = [], values = [] } = config;

              // 1. Filter
              let filteredData = data;

              // 2. Aggregate
              const dataMap = {}; 

              filteredData.forEach(row => {
                  const rKey = rows.length > 0 ? rows.map(r => row[r] || '').join('||') : 'Grand Total';
                  const cKey = cols.length > 0 ? cols.map(c => row[c] || '').join('||') : '';
                  
                  const cellKey = rKey + '___' + cKey;
                  if (!dataMap[cellKey]) {
                      dataMap[cellKey] = { __rKey: rKey, __cKey: cKey };
                      values.forEach(v => {
                          dataMap[cellKey][v.field] = {
                              sum: 0, count: 0, min: Infinity, max: -Infinity
                          };
                      });
                  }

                  values.forEach(v => {
                      const val = Number(row[v.field]) || 0;
                      const stat = dataMap[cellKey][v.field];
                      stat.sum += val;
                      stat.count += 1;
                      if (val < stat.min) stat.min = val;
                      if (val > stat.max) stat.max = val;
                  });
              });

              for (let key in dataMap) {
                  values.forEach(v => {
                      const stat = dataMap[key][v.field];
                      let finalVal = 0;
                      switch(v.agg) {
                          case 'sum': finalVal = stat.sum; break;
                          case 'count': finalVal = stat.count; break;
                          case 'avg': finalVal = stat.count ? stat.sum / stat.count : 0; break;
                          case 'max': finalVal = stat.max === -Infinity ? 0 : stat.max; break;
                          case 'min': finalVal = stat.min === Infinity ? 0 : stat.min; break;
                      }
                      dataMap[key][v.field + '_' + v.agg] = finalVal;
                  });
              }
              
              const columns = rows.map(r => ({
                  title: r,
                  dataIndex: r,
                  key: r,
                  width: 150,
                  fixed: 'left',
                  __isMedia: true // Flag for React component rendering
              }));
              if (rows.length === 0) {
                  columns.push({
                      title: 'Grand Total',
                      dataIndex: 'Grand Total',
                      key: 'Grand Total',
                      width: 150,
                      fixed: 'left'
                  });
              }

              const uniqueCKeys = Array.from(new Set(Object.values(dataMap).map((d: any) => d.__cKey)));
              if (uniqueCKeys.length === 1 && uniqueCKeys[0] === '') {
                  values.forEach(v => {
                      columns.push({
                          title: v.field + ' (' + v.agg + ')',
                          dataIndex: '___' + v.field + '_' + v.agg,
                          key: '___' + v.field + '_' + v.agg,
                          width: 120
                      });
                  });
              } else {
                  uniqueCKeys.forEach(cKey => {
                      const cTitles = cKey.split('||');
                      values.forEach(v => {
                          columns.push({
                              title: cTitles.join(' / ') + ' - ' + v.field + '(' + v.agg + ')',
                              dataIndex: cKey + '___' + v.field + '_' + v.agg,
                              key: cKey + '___' + v.field + '_' + v.agg,
                              width: 150
                          });
                      });
                  });
              }

              const rowMap = {};
              Object.values(dataMap).forEach((cell: any) => {
                  const { __rKey, __cKey } = cell;
                  if (!rowMap[__rKey]) {
                      const rValues = __rKey.split('||');
                      rowMap[__rKey] = { key: __rKey };
                      if (rows.length > 0) {
                          rows.forEach((r, i) => {
                              rowMap[__rKey][r] = rValues[i];
                          });
                      } else {
                          rowMap[__rKey]['Grand Total'] = 'Grand Total';
                      }
                  }
                  values.forEach(v => {
                      const dataIndex = __cKey + '___' + v.field + '_' + v.agg;
                      rowMap[__rKey][dataIndex] = cell[v.field + '_' + v.agg];
                  });
              });

              const dataSource = Object.values(rowMap);

              if (config.sort && config.sort.length) {
                  const { field, order } = config.sort[0];
                  dataSource.sort((a, b) => {
                      const vA = a[field] || 0;
                      const vB = b[field] || 0;
                      if (vA < vB) return order === 'asc' ? -1 : 1;
                      if (vA > vB) return order === 'asc' ? 1 : -1;
                      return 0;
                  });
              }

              return { columns, dataSource };
          }
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        workerRef.current = new Worker(url);

        workerRef.current.onmessage = (e) => {
            if (e.data.error) {
                console.error("Pivot worker error:", e.data.error);
            } else {
                setResult(e.data.result);
            }
            setIsCalculating(false);
        };

        return () => {
            workerRef.current?.terminate();
            URL.revokeObjectURL(url);
        };
    }, []);

    useEffect(() => {
        if (workerRef.current && data && config) {
            setIsCalculating(true);
            workerRef.current.postMessage({ data, config });
        }
    }, [data, config]);

    return { result, isCalculating };
}
