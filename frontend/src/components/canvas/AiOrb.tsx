'use client';

import { Warp } from '@paper-design/shaders-react';

/**
 * AI 动态头像（Orb）—— KunFlix 独立组件
 *
 * 基于 @paper-design/shaders-react 的 Warp shader 实现的果冻动效头像，
 * 粉嫩半透明的果冻身体、顶部镜面高光、带白点反光的圆眼睛，
 * 并周期性小幅蹦跳；叠加拟人化表情：眨眼、左右张望、“开心瞪眼 + 腮红”；
 * 被拖拽时冒汗、眼睛变 >< 并弹出 NONONO 气泡。
 * 对话气泡（含点击注入交互）由调用方（如 DraggableOrb）渲染为兄弟节点，
 * 本组件仅通过 talking 属性联动"说话蹦跳"动效。
 */

// 粉色系配色（延用红色主题，主色向粉偏移）：粉白 / 粉 / 浓粉红
const ORB_COLORS = {
  color1: '#ffd9e2ff',
  color2: '#ff92a4ff',
  color3: '#ff4d7dff',
};

// Shader 动效参数：加强背景流体的翻涌 / 流动感
// 关键：swirlIterations 从 0 提高，让 swirl 的漩涡分层真正生效；
// 同时提高 distortion（噪声扭曲）与 speed（流速），强化流动感。
const SHADER_PARAMS = {
  proportion: 0.35,
  softness: 1,
  distortion: 0.5,
  swirl: 1,
  swirlIterations: 8,
  shape: 'edge' as const,
  shapeScale: 0,
  speed: 8,
  scale: 0.31,
  rotation: 176,
  offsetX: 0.65,
  offsetY: 0.09,
};

interface AiOrbProps {
  /** 头像直径（px），默认 40 */
  size?: number;
  /** 是否冒汗（如被拖拽时） */
  sweating?: boolean;
  /** 是否处于"说话"状态（展示对话气泡时开心蹦跳） */
  talking?: boolean;
  className?: string;
}

export function AiOrb({ size = 40, sweating = false, talking = false, className = '' }: AiOrbProps) {
  // 粉嫩半透明的果冻身体：接近浑圆、底部略宽且贴地，像一坪蹲坐的果冻
  const bodyWidth = size * 1.06;
  const bodyHeight = size * 0.96;
  const bodyLeft = (size - bodyWidth) / 2;

  // 五官尺寸随头像直径等比缩放（粉嫩半透明的果冻身体、顶部镜面高光、带白点反光的圆眼睛）
  const eyeWidth = size * 0.19;
  const eyeHeight = size * 0.26;
  const eyeGap = size * 0.2;
  const glintSize = size * 0.07;
  const blushWidth = size * 0.18;
  const blushHeight = size * 0.09;
  const sweatWidth = size * 0.13;
  const sweatHeight = size * 0.17;
  const panicEyeSize = size * 0.2;
  const panicStroke = Math.max(1.5, size * 0.05);

  return (
    <div
      className={`relative pointer-events-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* NONONO 气泡：拖拽时弹出在头像左侧 */}
      {sweating && (
        <div className="ai-orb-bubble" style={{ fontSize: Math.max(8, size * 0.22) }}>
          NONONO
        </div>
      )}

      {/* 身体层：呆毛 + 圆脸同属一个容器，呼吸 / 说话蹦跳时整体上下浮动，呆毛跟头同步 */}
      <div
        className={`absolute inset-0 ${talking && !sweating ? 'ai-orb-body-talk' : 'ai-orb-body'}`}
      >
        {/* 呆毛：头顶一撮小卷毛，平时轻轻摇摆，被拖拽时慌张狂颤；
            放在头像主体之前渲染，发根被圆脸盖住，像从头顶长出来 */}
        <svg
          className={`ai-orb-hair ${sweating ? 'ai-orb-hair-panic' : ''}`}
          style={{ width: size * 0.38, height: size * 0.34, left: '36%', bottom: '86%' }}
          viewBox="0 0 24 20"
          fill="none"
        >
          <path
            d="M4 19 C 5 10, 7 4, 14 3.5 C 19 3.2, 20 8, 16 8.5"
            stroke={ORB_COLORS.color3}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>

        {/* 粉嫩半透明的果冻身体：浑圆轮廓 + border-radius 循环形变的软糯抖动，
            叠加顶部镜面高光与内发光，做出半透明胶质感 */}
        <div
          className={`ai-orb-shape ${talking && !sweating ? 'ai-orb-shape-talk' : ''}`}
          style={{ width: bodyWidth, height: bodyHeight, left: bodyLeft, bottom: 0 }}
        >
          <Warp
            width={bodyWidth}
            height={bodyHeight}
            colors={[ORB_COLORS.color1, ORB_COLORS.color2, ORB_COLORS.color3]}
            proportion={SHADER_PARAMS.proportion}
            softness={SHADER_PARAMS.softness}
            distortion={SHADER_PARAMS.distortion}
            swirl={SHADER_PARAMS.swirl}
            swirlIterations={SHADER_PARAMS.swirlIterations}
            shape={SHADER_PARAMS.shape}
            shapeScale={SHADER_PARAMS.shapeScale}
            speed={SHADER_PARAMS.speed}
            scale={SHADER_PARAMS.scale}
            rotation={SHADER_PARAMS.rotation}
            offsetX={SHADER_PARAMS.offsetX}
            offsetY={SHADER_PARAMS.offsetY}
          />

          {/* 顶部镜面高光：标志性的一大块白色反光，不随脸部张望移动 */}
          <span
            className="ai-orb-gloss"
            style={{ width: bodyWidth * 0.34, height: bodyHeight * 0.22, left: '18%', top: '12%' }}
          />
          {/* 小高光点：主高光旁的一颗小反光 */}
          <span
            className="ai-orb-gloss ai-orb-gloss-dot"
            style={{ width: bodyWidth * 0.12, height: bodyHeight * 0.1, left: '54%', top: '10%' }}
          />

          {/* 脸部层：整体左右张望 */}
          <div className="ai-orb-face absolute inset-0">
            {/* 眼睛：平时眨眼/开心瞪眼，被拖拽时变成 >< 慌张眼 */}
            <div
              className="ai-orb-eyes absolute inset-0 flex items-center justify-center"
              style={{ gap: eyeGap, paddingBottom: bodyHeight * 0.2 }}
            >
              {sweating ? (
                <>
                  <span
                    className="ai-orb-eye-panic"
                    style={{
                      width: panicEyeSize,
                      height: panicEyeSize,
                      borderRight: `${panicStroke}px solid rgba(0, 0, 0, 0.9)`,
                      borderBottom: `${panicStroke}px solid rgba(0, 0, 0, 0.9)`,
                      transform: 'rotate(-45deg)',
                    }}
                  />
                  <span
                    className="ai-orb-eye-panic"
                    style={{
                      width: panicEyeSize,
                      height: panicEyeSize,
                      borderRight: `${panicStroke}px solid rgba(0, 0, 0, 0.9)`,
                      borderBottom: `${panicStroke}px solid rgba(0, 0, 0, 0.9)`,
                      transform: 'rotate(135deg)',
                    }}
                  />
                </>
              ) : (
                <>
                  <span className="ai-orb-eye" style={{ width: eyeWidth, height: eyeHeight }}>
                    <span className="ai-orb-glint" style={{ width: glintSize, height: glintSize }} />
                  </span>
                  <span className="ai-orb-eye" style={{ width: eyeWidth, height: eyeHeight }}>
                    <span className="ai-orb-glint" style={{ width: glintSize, height: glintSize }} />
                  </span>
                </>
              )}
            </div>

            {/* 脸颊腮红，开心时浮现 */}
            <span
              className="ai-orb-blush"
              style={{ width: blushWidth, height: blushHeight, left: '8%', top: '54%' }}
            />
            <span
              className="ai-orb-blush"
              style={{ width: blushWidth, height: blushHeight, right: '8%', top: '54%' }}
            />

            {/* 冒汗汗滴：拖拽时从额头两侧滴落 */}
            {sweating && (
              <>
                <span
                  className="ai-orb-sweat"
                  style={{ width: sweatWidth, height: sweatHeight, left: '16%', top: '10%' }}
                />
                <span
                  className="ai-orb-sweat"
                  style={{ width: sweatWidth, height: sweatHeight, right: '12%', top: '16%', animationDelay: '0.35s' }}
                />
                <span
                  className="ai-orb-sweat"
                  style={{ width: sweatWidth * 0.75, height: sweatHeight * 0.75, right: '30%', top: '5%', animationDelay: '0.7s' }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .ai-orb-body {
          transform-origin: bottom center;
          animation: ai-orb-hop 4.8s ease-in-out infinite;
        }
        .ai-orb-body-talk {
          transform-origin: bottom center;
          animation: ai-orb-talk-bounce 0.9s ease-in-out infinite;
        }
        /* 粉嫩半透明的果冻身体轮廓：浑圆胶体，循环形变出果冻感；内阴影伪造半透明胶质厚度 */
        .ai-orb-shape {
          position: absolute;
          overflow: hidden;
          border-radius: 50% 50% 46% 46% / 56% 56% 44% 44%;
          box-shadow:
            inset 0 -18% 22% -6% rgba(255, 255, 255, 0.55),
            inset 0 14% 18% -6% rgba(255, 60, 100, 0.35);
          animation: ai-orb-jelly 4.5s ease-in-out infinite;
        }
        .ai-orb-shape-talk {
          animation: ai-orb-jelly 1.8s ease-in-out infinite;
        }
        /* 镜面高光：斜向椭圆白光，边缘用模糊消隐 */
        .ai-orb-gloss {
          position: absolute;
          background: rgba(255, 255, 255, 0.85);
          border-radius: 999px;
          transform: rotate(-24deg);
          filter: blur(0.5px);
          opacity: 0.75;
        }
        .ai-orb-gloss-dot {
          opacity: 0.6;
        }
        .ai-orb-hair {
          position: absolute;
          overflow: visible;
          transform-origin: 20% 100%;
          animation: ai-orb-hair-sway 3.4s ease-in-out infinite;
        }
        .ai-orb-hair-panic {
          animation: ai-orb-hair-shake 0.3s ease-in-out infinite;
        }
        .ai-orb-face {
          animation: ai-orb-look 7s ease-in-out infinite;
        }
        .ai-orb-eyes {
          animation: ai-orb-squint 9s ease-in-out infinite;
        }
        .ai-orb-eye {
          position: relative;
          background: rgba(20, 8, 12, 0.92);
          border-radius: 999px;
          transform-origin: center;
          animation: ai-orb-blink 3.8s ease-in-out infinite;
        }
        /* 眼内白点反光：眼睛的灵动感来源 */
        .ai-orb-glint {
          position: absolute;
          left: 18%;
          top: 14%;
          background: #ffffff;
          border-radius: 999px;
          opacity: 0.95;
        }
        .ai-orb-eye-panic {
          border-radius: 3px;
        }
        .ai-orb-bubble {
          position: absolute;
          right: calc(100% + 0.5em);
          top: 50%;
          background: #ffffff;
          color: #ef4444;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          padding: 0.35em 0.55em;
          border-radius: 0.6em;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          transform: translateY(-50%);
          transform-origin: right center;
          animation: ai-orb-bubble-pop 0.25s ease-out, ai-orb-bubble-wobble 0.6s ease-in-out 0.25s infinite;
        }
        .ai-orb-bubble::after {
          content: '';
          position: absolute;
          left: 100%;
          top: 50%;
          margin-top: -0.3em;
          border: 0.3em solid transparent;
          border-left-color: #ffffff;
        }
        .ai-orb-speech {
          position: absolute;
          bottom: calc(100% + 0.7em);
          left: 58%;
          background: #ffffff;
          color: #334155;
          font-weight: 500;
          line-height: 1.4;
          white-space: nowrap;
          padding: 0.55em 0.85em;
          border-radius: 0.9em;
          border-bottom-left-radius: 0.28em;
          box-shadow: 0 3px 14px rgba(0, 0, 0, 0.2);
          transform-origin: left bottom;
          animation: ai-orb-speech-pop 0.3s ease-out, ai-orb-speech-float 3.2s ease-in-out 0.3s infinite;
        }
        .ai-orb-speech::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 0.7em;
          border: 0.38em solid transparent;
          border-top-color: #ffffff;
          border-left-color: #ffffff;
        }
        .ai-orb-blush {
          position: absolute;
          border-radius: 999px;
          background: rgba(255, 82, 110, 0.65);
          opacity: 0.3;
          animation: ai-orb-blush-pulse 9s ease-in-out infinite;
        }
        .ai-orb-sweat {
          position: absolute;
          background: linear-gradient(180deg, rgba(190, 230, 255, 0.95), rgba(90, 175, 255, 0.95));
          border-radius: 50% 50% 50% 50% / 70% 70% 40% 40%;
          animation: ai-orb-sweat-fall 1.1s ease-in infinite;
        }
        /* 左右看看：中间停留，偶尔瞟向两侧 */
        @keyframes ai-orb-look {
          0%, 26%, 62%, 100% { transform: translateX(0); }
          32%, 42% { transform: translateX(-9%); }
          48%, 58% { transform: translateX(9%); }
        }
        /* 眨眨眼：快速双眨 */
        @keyframes ai-orb-blink {
          0%, 86%, 100% { transform: scaleY(1); }
          89%, 95% { transform: scaleY(0.08); }
          92% { transform: scaleY(1); }
        }
        /* 开心瞪眼：眼睛弯成一条缝 */
        @keyframes ai-orb-squint {
          0%, 55%, 82%, 100% { transform: scaleY(1); }
          62%, 75% { transform: scaleY(0.5); }
        }
        /* 果冻软糯：浑圆胶体轮廓缓缓扭动 */
        @keyframes ai-orb-jelly {
          0%, 100% { border-radius: 50% 50% 46% 46% / 56% 56% 44% 44%; }
          33% { border-radius: 46% 54% 42% 50% / 52% 60% 46% 40%; }
          66% { border-radius: 54% 46% 50% 42% / 60% 52% 40% 46%; }
        }
        /* 蹦跳：长时间轻柔呼吸，然后蓄力下压 → 弹起拉长 → 落地压扁回弹 */
        @keyframes ai-orb-hop {
          0%, 100% { transform: translateY(0) scale(1); }
          16% { transform: translateY(1.5%) scale(1.02, 0.97); }
          30% { transform: translateY(2.5%) scale(1.06, 0.92); }
          40% { transform: translateY(-14%) scale(0.93, 1.1); }
          50% { transform: translateY(-17%) scale(0.98, 1.03); }
          60% { transform: translateY(0) scale(1.1, 0.87); }
          68% { transform: translateY(-4%) scale(0.97, 1.04); }
          78% { transform: translateY(0) scale(1); }
        }
        /* 说话时开心地小幅蹦跳 */
        @keyframes ai-orb-talk-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          35% { transform: translateY(-5%) scale(0.98, 1.03); }
          70% { transform: translateY(1.5%) scale(1.02, 0.98); }
        }
        /* 呆毛随风轻摇 */
        @keyframes ai-orb-hair-sway {
          0%, 100% { transform: rotate(-7deg); }
          50% { transform: rotate(8deg); }
        }
        /* 呆毛慌张狂颤（拖拽时） */
        @keyframes ai-orb-hair-shake {
          0%, 100% { transform: rotate(-16deg); }
          50% { transform: rotate(14deg); }
        }
        /* 腮红浮现：与瞪眼同步 */
        @keyframes ai-orb-blush-pulse {
          0%, 55%, 82%, 100% { opacity: 0.3; }
          62%, 75% { opacity: 0.85; }
        }
        /* 冒汗：汗滴冒出后沿脸面滑落消失 */
        @keyframes ai-orb-sweat-fall {
          0% { opacity: 0; transform: translateY(-30%) scale(0.4); }
          25% { opacity: 0.95; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(160%) scale(0.85); }
        }
        /* 气泡弹出 */
        @keyframes ai-orb-bubble-pop {
          0% { opacity: 0; transform: translateY(-50%) scale(0.3); }
          100% { opacity: 1; transform: translateY(-50%) scale(1); }
        }
        /* 气泡慌乱摆动 */
        @keyframes ai-orb-bubble-wobble {
          0%, 100% { transform: translateY(-50%) rotate(-3deg); }
          50% { transform: translateY(-50%) rotate(3deg); }
        }
        /* 对话气泡弹出 */
        @keyframes ai-orb-speech-pop {
          0% { opacity: 0; transform: scale(0.3); }
          100% { opacity: 1; transform: scale(1); }
        }
        /* 对话气泡轻盈漂浮 */
        @keyframes ai-orb-speech-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8%); }
        }
      `}</style>
    </div>
  );
}
