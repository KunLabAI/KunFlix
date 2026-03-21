# Pivot Table (多维表) 组件

## 概述
为前端画布中的“多维表格节点（StoryboardNode）”提供强大的多维分析能力。支持行、列、值的自由拖拽，多种聚合方式，以及基于 Web Worker 和 antd 虚拟滚动的高性能渲染。

## 目录结构
- `PivotEditor.tsx`: 包含拖拽区域与数据表格的主入口组件。
- `PivotDropzone.tsx`: 拖拽接收区（行、列、值）。
- `PivotTable.tsx`: 基于 `antd` 封装的高性能透视表。
- `usePivotEngine.ts`: 使用 Web Worker 处理交叉表聚合与重组的 Hooks。
- `types.ts`: 数据类型定义。

## 数据格式示例

### 节点保存的数据结构 (`pivotConfig`)
```json
{
  "rows": ["category", "status"],
  "cols": ["year"],
  "values": [
    { "field": "revenue", "agg": "sum" },
    { "field": "budget", "agg": "avg" }
  ],
  "sort": [{ "field": "___revenue_sum", "order": "desc" }]
}
```

### 原始数据集格式
```json
[
  { "id": 1, "category": "Action", "year": 2021, "revenue": 1000, "status": "Released" },
  { "id": 2, "category": "Comedy", "year": 2021, "revenue": 500, "status": "Released" }
]
```

## 性能调优参数
- **Web Worker**: 聚合计算完全在后台线程进行，主线程渲染 `isCalculating` loading 状态。大数据量时不会阻塞 UI。
- **虚拟滚动**: `PivotTable` 默认开启 `antd` 的 `virtual` 模式，在 10k 单元格情况下可保持 ≥50fps 滚动帧率。
- **分页与渲染限制**: 可通过传递 `pagination={{ pageSize: 100 }}` 控制单页 DOM 节点数量。建议列数过多时使用 `scroll={{ x: 'max-content' }}` 配合外层容器 `overflow: hidden`。

## Props 说明
### `PivotEditor`
| 参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `nodeId` | `string` | 当前画布中选中的多维表格节点 ID。组件会自动同步状态至该节点 `data.pivotConfig` |

### `usePivotEngine`
| 参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `data` | `any[]` | 原始扁平数据集 |
| `config` | `PivotConfig` | 行、列、值的透视配置 |
**返回值**: `{ result: { columns: any[], dataSource: any[] }, isCalculating: boolean }`
