'use client';

import React from 'react';
import { VideoTaskCard } from '@/components/ai-assistant/VideoTaskCard';
import { MusicTaskCard } from '@/components/ai-assistant/MusicTaskCard';
import { TtsTaskCard } from '@/components/ai-assistant/TtsTaskCard';
import { LazyImage } from '@/components/ai-assistant/LazyImage';
import { CallTimelinePanel } from '@/components/ai-assistant/CallTimelinePanel';
import { useTheme } from '@/context/ThemeContext';

/* ── 演示素材（public/effect 下的静态图；音视频用静默占位地址） ─────────── */
const DEMO_IMAGE = '/effect/023576f6-ce4d-4e16-ae0f-22ce69ac363e.jpg';
const DEMO_IMAGE_2 = '/effect/1619b2eb-11a6-4302-9b0a-c4ee79283af6.jpg';
const DEMO_BROKEN_SRC = '/demo-missing-media.jpg';
// data URI 静默 WAV：保证播放器可正常渲染且不产生网络请求
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/* ── 单色主题 token 一览（任务卡实际消费的中性变量，随深浅主题切换） ─────── */
const THEME_TOKENS = [
  { var: '--card', label: '卡片背景', usage: 'bg-card' },
  { var: '--border', label: '卡片边框', usage: 'border-border' },
  { var: '--muted', label: '徽标/骨架/进度轨', usage: 'bg-muted' },
  { var: '--muted-foreground', label: '次要文字/图标', usage: 'text-muted-foreground' },
  { var: '--foreground', label: '主文字/进度填充', usage: 'text-foreground' },
  { var: '--primary', label: '播放键背景', usage: 'bg-primary' },
  { var: '--destructive', label: '失败态唯一强调色', usage: 'text-destructive' },
] as const;

/* ── 工具调用时间轴示例数据（generate_image / generate_video 等工具链） ── */
const DEMO_SKILL_CALLS = [
  { skill_name: 'media_tools', status: 'loaded' as const },
];
const DEMO_TOOL_CALLS = [
  { tool_name: 'generate_image', status: 'executing' as const, arguments: { prompt: '赛博朋克城市夜景' } },
  {
    tool_name: 'generate_video',
    status: 'completed' as const,
    arguments: { prompt: '海浪拍打礁石', video_mode: 'text_to_video' },
    result: '<!-- __VIDEO_TASK__|demo-task|text_to_video|wan-3.0 -->',
    duration: 1240,
  },
  {
    tool_name: 'generate_music',
    status: 'completed' as const,
    result: JSON.stringify({ error: 'Music generation failed: provider quota exceeded' }),
    duration: 380,
  },
];

interface SectionProps {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, description, children }: SectionProps) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground/80">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StateCell({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <code className="text-[11px] font-mono text-foreground/80">{label}</code>
        {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
      </div>
      <div className="rounded-xl border border-border/40 bg-muted/10 p-3">{children}</div>
    </div>
  );
}

/**
 * AI 助手任务卡片演示页（视觉验收 / 样式调试用）。
 *
 * 覆盖 AI 调用工具时产生的四类媒体任务在对话面板中的真实渲染组件：
 * - 图像：Markdown 内联 ![image](url) → LazyImage（无独立任务卡）
 * - 视频：VideoTaskCard（__VIDEO_TASK__ 标记 / video_task_created SSE）
 * - 音乐：MusicTaskCard（__MUSIC_TASK__ 标记 / music_task_created SSE）
 * - 语音：TtsTaskCard（__TTS_TASK__ 标记 / tts_task_created SSE）
 *
 * 三张任务卡通过 mockStatus 注入静态状态，跳过 /status 轮询；
 * 生产调用不传该 prop，行为不变。
 */
export default function TaskCardsDemoPage() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="min-h-screen w-full bg-background text-foreground p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-10">
        {/* 头部 */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">AI 助手 · 媒体任务卡片演示</h1>
          <p className="text-sm text-muted-foreground">
            图像 / 视频 / 音乐 / 语音 四类工具任务在对话面板中的全状态展示 · 当前主题：{resolvedTheme}
          </p>
        </header>

        {/* 单色主题 token 一览 */}
        <Section
          title="单色主题 Token · 深浅主题自适应"
          description="重设计后任务卡不再使用多彩的 --color-status-* 系列，改为统一消费中性主题变量：卡片 bg-card + border-border，文字/图标走 foreground 与 muted-foreground，仅失败态用 destructive 作为唯一强调色。以下色板随当前主题实时切换。"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {THEME_TOKENS.map((token) => (
              <div key={token.var} className="rounded-lg border border-border/40 bg-muted/10 p-3 flex items-center gap-2.5">
                <span
                  className="size-8 rounded-md border border-border/60 shrink-0"
                  style={{ background: `var(${token.var})` }}
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{token.label}</div>
                  <code className="text-[9px] font-mono text-muted-foreground truncate block">{token.usage}</code>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 图像任务 */}
        <Section
          title="① 图像任务 · LazyImage（Markdown 内联渲染）"
          description="generate_image 工具结果以 ![image](url) 形式回传，经 ChatMessage 的 markdown img 组件渲染为 LazyImage：懒加载骨架屏 → 加载成功（悬停显示拖拽/预览提示条）→ 加载失败占位。无独立任务卡片、无轮询。"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StateCell label="loading" hint="骨架屏 animate-pulse（进入视口前）">
              <div className="flex items-center justify-center">
                <span
                  className="block bg-muted animate-pulse rounded-lg"
                  style={{ minWidth: 200, minHeight: 150, maxHeight: 320 }}
                />
              </div>
            </StateCell>
            <StateCell label="success" hint="悬停查看工具条 · 可拖拽到画布 · 双击全屏">
              <LazyImage src={DEMO_IMAGE} alt="演示图像任务结果" maxHeight={220} />
            </StateCell>
            <StateCell label="error" hint="src 加载失败占位">
              <LazyImage src={DEMO_BROKEN_SRC} alt="演示加载失败" maxHeight={220} />
            </StateCell>
          </div>
          <StateCell label="success · 多图网格" hint="n>1 时工具结果返回多张 Markdown 图片，依次内联渲染">
            <div className="flex flex-wrap gap-3">
              <LazyImage src={DEMO_IMAGE} alt="演示图 1" maxHeight={160} />
              <LazyImage src={DEMO_IMAGE_2} alt="演示图 2" maxHeight={160} />
            </div>
          </StateCell>
        </Section>

        {/* 视频任务 */}
        <Section
          title="② 视频任务 · VideoTaskCard"
          description="状态机 pending → processing → completed / failed（5s 轮询 /videos/:id/status）。单色卡片 bg-card + border-border；进行中为骨架占位（无时长预估文案），活动反馈由头部 spinner 承载；完成后头部中间（左状态、右模型名那一行）hover 显现拖拽手柄，拖手柄即可落到画布；失败态 destructive 强调 + 完整错误 + 一键复制。"
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StateCell label="pending" hint="等待生成...">
              <VideoTaskCard
                task={{ taskId: 'demo-video-pending', videoMode: 'text_to_video', model: 'wan-3.0' }}
                mockStatus={{ status: 'pending', video_mode: 'text_to_video', model: 'wan-3.0' }}
              />
            </StateCell>
            <StateCell label="processing" hint="骨架占位 + 头部 spinner（无耗时文案）">
              <VideoTaskCard
                task={{ taskId: 'demo-video-processing', videoMode: 'image_to_video', model: 'wan-3.0' }}
                mockStatus={{ status: 'processing', video_mode: 'image_to_video', model: 'wan-3.0' }}
              />
            </StateCell>
            <StateCell label="completed" hint="hover 头部中间显现拖拽手柄 · 原生播放器 + 画质/时长/积分 + 下载">
              <VideoTaskCard
                task={{ taskId: 'demo-video-completed' }}
                mockStatus={{
                  status: 'completed',
                  video_url: DEMO_IMAGE,
                  quality: '1080p',
                  duration: 6,
                  credit_cost: 30,
                  video_mode: 'text_to_video',
                  model: 'wan-3.0',
                }}
              />
            </StateCell>
            <StateCell label="failed" hint="完整错误 + 复制按钮">
              <VideoTaskCard
                task={{ taskId: 'demo-video-failed' }}
                mockStatus={{
                  status: 'failed',
                  error_message: '上游供应商超时：视频生成请求在 300s 内未完成',
                  video_mode: 'text_to_video',
                  model: 'wan-3.0',
                }}
              />
            </StateCell>
          </div>
        </Section>

        {/* 音乐任务 */}
        <Section
          title="③ 音乐任务 · MusicTaskCard"
          description="与视频卡同构（5s 轮询 /music/:id/status），头部类型图标 Music 恒为中性色；完成后头部中间 hover 显现拖拽手柄，下方为极简自绘播放器（primary 播放键 + 细进度条 + 时间 + 下载），歌词开关内联在播放器行，可展开歌词面板。"
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StateCell label="pending" hint="等待生成...">
              <MusicTaskCard
                task={{ taskId: 'demo-music-pending', model: 'lyria-2' }}
                mockStatus={{ status: 'pending', model: 'lyria-2' }}
              />
            </StateCell>
            <StateCell label="processing" hint="骨架占位（无耗时文案）">
              <MusicTaskCard
                task={{ taskId: 'demo-music-processing', model: 'lyria-2' }}
                mockStatus={{ status: 'processing', model: 'lyria-2' }}
              />
            </StateCell>
            <StateCell label="completed" hint="hover 显现拖拽手柄 · 极简播放器（静默占位源）+ 歌词开关">
              <MusicTaskCard
                task={{ taskId: 'demo-music-completed' }}
                mockStatus={{
                  status: 'completed',
                  audio_url: SILENT_WAV,
                  credit_cost: 10,
                  model: 'lyria-2',
                  lyrics: '[Verse]\n霓虹灯下的海岸线\n晚风把故事吹散\n\n[Chorus]\n我们追着光奔跑\n直到黎明来到',
                }}
              />
            </StateCell>
            <StateCell label="failed" hint="完整错误 + 复制按钮">
              <MusicTaskCard
                task={{ taskId: 'demo-music-failed' }}
                mockStatus={{ status: 'failed', error_message: '供应商配额已用尽，请稍后重试', model: 'lyria-2' }}
              />
            </StateCell>
          </div>
        </Section>

        {/* 语音任务 */}
        <Section
          title="④ 语音任务 · TtsTaskCard"
          description="与音乐卡同构（4s 轮询 /tts/:id/status），头部类型图标 Mic；进行中为骨架占位；完成后头部中间 hover 显现拖拽手柄（拖回画布还原为 TTS 节点），复用同一极简播放器，并额外捕获 text/voice/style 元数据。"
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StateCell label="pending" hint="等待合成...">
              <TtsTaskCard
                task={{ taskId: 'demo-tts-pending', model: 'gemini-tts' }}
                mockStatus={{ status: 'pending', model: 'gemini-tts' }}
              />
            </StateCell>
            <StateCell label="processing" hint="骨架占位（无耗时文案）">
              <TtsTaskCard
                task={{ taskId: 'demo-tts-processing', model: 'gemini-tts' }}
                mockStatus={{ status: 'processing', model: 'gemini-tts' }}
              />
            </StateCell>
            <StateCell label="completed" hint="hover 显现拖拽手柄 · 极简播放器（静默占位源）+ 积分 + 下载">
              <TtsTaskCard
                task={{ taskId: 'demo-tts-completed' }}
                mockStatus={{
                  status: 'completed',
                  audio_url: SILENT_WAV,
                  credit_cost: 2,
                  model: 'gemini-tts',
                  text: '欢迎使用 KunFlix 画布语音合成。',
                  voice: 'Kore',
                }}
              />
            </StateCell>
            <StateCell label="failed" hint="完整错误 + 复制按钮">
              <TtsTaskCard
                task={{ taskId: 'demo-tts-failed' }}
                mockStatus={{ status: 'failed', error_message: 'Request contains an invalid argument. (style 需搭配具体音色)', model: 'gemini-tts' }}
              />
            </StateCell>
          </div>
        </Section>

        {/* 工具调用时间轴 */}
        <Section
          title="⑤ 伴随上下文 · CallTimelinePanel（技能/工具调用时间轴）"
          description="任务卡出现前，对话面板先展示工具链时间轴：执行中（Loader 旋转）→ 成功（自动折叠摘要）/ 失败（红色错误条，未展开也显示错误摘要）。"
        >
          <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
            <CallTimelinePanel skillCalls={DEMO_SKILL_CALLS} toolCalls={DEMO_TOOL_CALLS} />
          </div>
        </Section>
      </div>
    </div>
  );
}
