import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// Default node dimensions if not provided by node.measured
const DEFAULT_NODE_WIDTH = 300;
const DEFAULT_NODE_HEIGHT = 200;

/**
 * Calculates the auto-layout positions for nodes using Dagre.
 * It separates connected nodes (which form graphs) and isolated nodes.
 * Isolated nodes are placed in a grid below the main graph.
 */
export const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'LR'
) => {
  // Configure Dagre Graph
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 80, // space between nodes horizontally
    ranksep: 120, // space between layers vertically
    align: 'UL', // Alignment for rank nodes
  });

  // Identify connected vs isolated nodes
  const connectedNodeIds = new Set<string>();
  edges.forEach((edge) => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });

  const connectedNodes = nodes.filter(node => connectedNodeIds.has(node.id));
  const isolatedNodes = nodes.filter(node => !connectedNodeIds.has(node.id));

  // 1. Layout connected nodes using Dagre
  connectedNodes.forEach((node) => {
    // Note: in React Flow 12+, measured width/height is populated if node has been rendered
    const width = node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT;
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  let maxGraphY = 0;
  let maxGraphX = 0;

  const layoutedConnectedNodes = connectedNodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT;

    // Dagre returns the center point of the node, React Flow needs top-left
    const x = nodeWithPosition.x - width / 2;
    const y = nodeWithPosition.y - height / 2;

    if (y + height > maxGraphY) maxGraphY = y + height;
    if (x + width > maxGraphX) maxGraphX = x + width;

    return {
      ...node,
      position: { x, y },
    };
  });

  // 2. Layout isolated nodes in a grid below the main graph
  const gridStartY = connectedNodes.length > 0 ? maxGraphY + 150 : 0;
  let currentX = 0;
  let currentY = gridStartY;
  let currentRowMaxHeight = 0;
  const MAX_GRID_WIDTH = Math.max(maxGraphX, 1200); // Wrap to next row if exceeding graph width or 1200px
  
  // Group isolated nodes by type to make the grid look organized
  const isolatedByType = isolatedNodes.reduce((acc, node) => {
    const type = node.type || 'default';
    if (!acc[type]) acc[type] = [];
    acc[type].push(node);
    return acc;
  }, {} as Record<string, Node[]>);

  const layoutedIsolatedNodes: Node[] = [];

  Object.values(isolatedByType).forEach((typeGroup) => {
    typeGroup.forEach((node) => {
      const width = node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH;
      const height = node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT;

      // Wrap to next row
      if (currentX + width > MAX_GRID_WIDTH && currentX > 0) {
        currentX = 0;
        currentY += currentRowMaxHeight + 80;
        currentRowMaxHeight = 0;
      }

      layoutedIsolatedNodes.push({
        ...node,
        position: { x: currentX, y: currentY },
      });

      currentX += width + 80; // gap between grid items
      if (height > currentRowMaxHeight) {
        currentRowMaxHeight = height;
      }
    });
    
    // After finishing a type group, force a new line for the next type
    if (typeGroup.length > 0) {
      currentX = 0;
      currentY += currentRowMaxHeight + 120; // larger gap between types
      currentRowMaxHeight = 0;
    }
  });

  return {
    nodes: [...layoutedConnectedNodes, ...layoutedIsolatedNodes],
    edges,
  };
};
