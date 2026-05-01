'use client';

import React from 'react';
import { Handle, Position } from '@xyflow/react';

/**
 * 视频节点左右两侧的连线把手（target + source 并排，hover 可见）
 */
export function EdgeHandles() {
  return (
    <>
      <div className="edge-handle-wrapper right group/handle pointer-events-auto">
        <Handle type="target" position={Position.Right} id="right-target" />
        <Handle type="source" position={Position.Right} id="right-source" />
        <div className="edge-handle-inner">
          <div className="edge-handle-line" />
          <div className="edge-handle-dot" />
        </div>
      </div>

      <div className="edge-handle-wrapper left group/handle pointer-events-auto">
        <Handle type="target" position={Position.Left} id="left-target" />
        <Handle type="source" position={Position.Left} id="left-source" />
        <div className="edge-handle-inner">
          <div className="edge-handle-line" />
          <div className="edge-handle-dot" />
        </div>
      </div>
    </>
  );
}
