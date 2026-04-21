import type { CanvasNode, ScriptNodeData, CharacterNodeData, VideoNodeData, StoryboardNodeData } from '@/store/useCanvasStore';
import type { NodeAttachment } from '@/store/useAIAssistantStore';

/** 文本节点发送给 AI 的最大纯文本字符数 */
const MAX_TEXT_LENGTH = 50000;

/**
 * 递归提取 Tiptap JSON 中的纯文本内容
 */
export function extractPlainTextFromTiptap(json: unknown, maxLength = 150): string {
  const parts: string[] = [];

  const walk = (node: unknown) => {
    const n = node as Record<string, unknown> | null;
    n?.type === 'text' && typeof n.text === 'string' && parts.push(n.text);
    Array.isArray(n?.content) && (n!.content as unknown[]).forEach(walk);
  };

  walk(json);
  const text = parts.join('').trim();
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

/**
 * 节点 → 附件数据映射表（按节点类型提取）
 */
const NODE_ATTACHMENT_EXTRACTORS: Record<string, (node: CanvasNode) => NodeAttachment> = {
  text: (node) => {
    const data = node.data as ScriptNodeData;
    const raw = extractPlainTextFromTiptap(data.content, Infinity);
    const fullText = raw.length > MAX_TEXT_LENGTH ? raw.slice(0, MAX_TEXT_LENGTH) + '...' : raw;
    return {
      nodeId: node.id,
      nodeType: 'text',
      label: data.title || '未命名文本',
      excerpt: raw.length > 150 ? raw.slice(0, 150) + '...' : raw,
      thumbnailUrl: null,
      meta: { tags: data.tags, fullText },
    };
  },
  image: (node) => {
    const data = node.data as CharacterNodeData;
    // 取第一张图片作为缩略图
    let thumbnailUrl: string | null = (data.images && data.images[0]) || data.imageUrl || null;
    if (thumbnailUrl && !thumbnailUrl.startsWith('http') && !thumbnailUrl.startsWith('/api/media/') && !thumbnailUrl.startsWith('data:')) {
      thumbnailUrl = `/api/media/${thumbnailUrl}`;
    }
    return {
      nodeId: node.id,
      nodeType: 'image',
      label: data.name || '未命名图片',
      excerpt: data.description || '',
      thumbnailUrl,
      meta: { uploading: data.uploading },
    };
  },
  video: (node) => {
    const data = node.data as VideoNodeData;
    // 将 videoUrl 转换为完整的 /api/media/ 路径
    let thumbnailUrl: string | null = data.videoUrl || null;
    if (thumbnailUrl && !thumbnailUrl.startsWith('http') && !thumbnailUrl.startsWith('/api/media/') && !thumbnailUrl.startsWith('data:')) {
      // 纯文件名或 UUID，添加 /api/media/ 前缀
      thumbnailUrl = `/api/media/${thumbnailUrl}`;
    }
    return {
      nodeId: node.id,
      nodeType: 'video',
      label: data.name || '未命名视频',
      excerpt: data.description || '',
      thumbnailUrl,
      meta: { fitMode: data.fitMode, uploading: data.uploading },
    };
  },
  storyboard: (node) => {
    const data = node.data as StoryboardNodeData;
    
    // ---------------------------------------------------------------------------
    // 提取表格数据（支持两种存储方式）
    // 1. tableData + tableColumns（优先）
    // 2. pivotConfig.rows + pivotConfig.columns（fallback）
    // ---------------------------------------------------------------------------
    let tableData: Record<string, unknown>[] | undefined;
    let tableColumns: { key: string; label: string; type?: string }[] | undefined;
    
    // 方式 1：直接存储在 tableData/tableColumns
    if (Array.isArray(data.tableData) && data.tableData.length > 0) {
      tableData = data.tableData;
      tableColumns = data.tableColumns;
    }
    // 方式 2：存储在 pivotConfig 中
    else if (data.pivotConfig) {
      const pc = data.pivotConfig;
      const pcRows = pc.rows;
      const pcCols = pc.columns;
      // 检查是否为数据对象格式（而非字段 ID 数组）
      const rowsAreData = Array.isArray(pcRows) && pcRows.length > 0 && typeof pcRows[0] === 'object' && !Array.isArray(pcRows[0]);
      const colsAreDefs = Array.isArray(pcCols) && pcCols.length > 0 && typeof pcCols[0] === 'object';
      if (rowsAreData) {
        tableData = pcRows as Record<string, unknown>[];
        tableColumns = colsAreDefs ? pcCols as { key: string; label: string; type?: string }[] : undefined;
      }
    }
    // 方式 3：存储在 pivotData（PivotEditor 同步的 displayResult）
    else if (data.pivotData) {
      const pd = data.pivotData;
      const pdRows = pd.dataSource;
      const pdCols = pd.columns;
      if (Array.isArray(pdRows) && pdRows.length > 0) {
        tableData = pdRows as Record<string, unknown>[];
        // pivotData.columns 格式为 [{title, dataIndex, key, width}]，需要转换
        if (Array.isArray(pdCols) && pdCols.length > 0) {
          tableColumns = pdCols.map((c: { title?: string; dataIndex?: string; key?: string }) => ({
            key: c.dataIndex || c.key || '',
            label: c.title || c.dataIndex || c.key || '',
          }));
        }
      }
    }
    
    const hasTableData = Array.isArray(tableData) && tableData.length > 0;
    const hasTableColumns = Array.isArray(tableColumns) && tableColumns.length > 0;
    
    // 如果有表格数据，优先显示表格信息
    const label = hasTableData
      ? `多维表格 (${tableData!.length}行)`
      : `分镜 #${data.shotNumber || ''}`;
    
    // 生成表格内容的摘要
    let excerpt = data.description || '';
    if (hasTableData && hasTableColumns) {
      const colNames = tableColumns!.map(c => c.label || c.key).join('、');
      excerpt = `表格列：${colNames}。${excerpt}`;
    }
    
    return {
      nodeId: node.id,
      nodeType: 'storyboard',
      label,
      excerpt,
      thumbnailUrl: null,
      meta: {
        duration: data.duration,
        shotNumber: data.shotNumber,
        // 核心数据：表格列定义和行数据
        tableColumns,
        tableData,
      },
    };
  },
};

/**
 * 从 CanvasNode 提取 NodeAttachment 数据
 */
export function extractNodeAttachment(node: CanvasNode): NodeAttachment {
  const extractor = NODE_ATTACHMENT_EXTRACTORS[node.type || ''];
  return extractor?.(node) ?? {
    nodeId: node.id,
    nodeType: node.type || 'unknown',
    label: '未知节点',
    excerpt: '',
    thumbnailUrl: null,
    meta: {},
  };
}
