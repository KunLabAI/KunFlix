// 为 react-syntax-highlighter 的深层 CJS 子路径补充模块声明。
// @types/react-syntax-highlighter 通过 typesVersions 仅声明标准入口
// （如 react-syntax-highlighter/prism-async-light），未覆盖 dist/cjs/** 子路径；
// 在 strict + noImplicitAny 下会触发 TS2307 / 隐式 any 报错（生产构建 type check 阶段失败）。
// 此处按实际运行时导出形状对齐，避免侵入业务代码。

declare module 'react-syntax-highlighter/dist/cjs/prism-async-light' {
  import { ComponentType } from 'react';
  import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';

  const PrismAsyncLight: ComponentType<SyntaxHighlighterProps> & {
    registerLanguage: (name: string, language: unknown) => void;
  };
  export default PrismAsyncLight;
}

declare module 'react-syntax-highlighter/dist/cjs/languages/prism/*' {
  const language: unknown;
  export default language;
}
