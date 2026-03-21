// import type { Meta, StoryObj } from '@storybook/react';
import { PivotEditor } from './PivotEditor';

const meta = {
  title: 'Canvas/PivotEditor',
  component: PivotEditor,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

// Note: Requires mocking useCanvasStore in Storybook decorators
export const Default = {
  args: {
    nodeId: 'mock-node-id',
  },
};
