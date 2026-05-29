---
name: warm-dark-design-system
description: 暖暗游戏厅设计系统 — 色彩/字体/组件/响应式规格，用于红三H5版
metadata: 
  node_type: memory
  type: reference
  originSessionId: fcaec1c4-e605-42a6-9cbd-25699630d75a
---

# 暖暗游戏厅 · Design System

## 设计哲学
**暖暗 / 琥珀灯 / 年轻化 / 简约 / 油圈**
受众: 年轻人（油圈基调），极简风格，游戏厅氛围

## 色彩体系
```
底色        #1a1510  --bg-deep        暖棕黑 — 最深底色
表面        #24201a  --bg-surface     暖深棕 — 区域背景
卡片        #2c2720  --bg-card        中棕 — 卡片/组件
悬浮        #322d26  --bg-elevated    浅棕 — 弹窗/浮层
主文字      #e8e0d5  --ink-primary    暖奶油 — 主要内容
次文字      #8a8070  --ink-secondary  暖灰 — 辅助信息
弱文字      #5c564c  --ink-dim        深暖灰 — 禁用/占位
强调        #f0a828  --accent         琥珀灯黄 — 按钮/高亮/计时器
强调光晕    rgba(240,168,40,0.18)      --accent-glow
强调柔和    rgba(240,168,40,0.08)      --accent-soft
成功        #7ab87e  --green          哑绿 — Ready/通过
成功柔和    rgba(122,184,126,0.15)     --green-soft
失败        #c46b6b  --red            哑红 — 错误/警告
失败柔和    rgba(196,107,107,0.15)     --red-soft
牌面        #f5ede0  --card-face      暖奶油 — 牌正面
红牌        #c0392b  --card-red       深红 — 红心/方片
黑牌        #2c2c2c  --card-black     深黑 — 黑桃/梅花
```

## 响应式字号 (clamp)
```
--fs-xs:   clamp(10px, 1.5vmin, 12px)  标签/脚注
--fs-sm:   clamp(11px, 1.8vmin, 14px)  次要按钮/辅助文字
--fs-base: clamp(13px, 2.2vmin, 16px)  正文
--fs-md:   clamp(15px, 2.8vmin, 20px)  小标题
--fs-lg:   clamp(18px, 3.5vmin, 26px)  标题
--fs-xl:   clamp(22px, 5vmin, 32px)    大标题
```

## 响应式牌尺寸 (clamp)
```
--card-w:       clamp(38px, 10vmin, 62px)    手牌宽
--card-h:       calc(var(--card-w) * 1.42)   手牌高
--card-overlap: calc(var(--card-w) * -0.32)  重叠偏移
--play-card-w:  clamp(34px, 8.5vmin, 52px)   出牌位宽
--play-card-h:  calc(var(--play-card-w) * 1.42)
--mini-card-w:  clamp(16px, 3.5vmin, 24px)   对手手牌宽
--mini-card-h:  calc(var(--mini-card-w) * 1.42)
```

## 圆角
```
--radius-sm: 4px   标签/小元素
--radius-md: 8px   按钮/输入框
--radius-lg: 14px  卡片/弹窗
--radius-xl: 20px  大容器/模态
```

## 通用组件类
- **btn-game**: 通用按钮 base (inline-flex + transition + active:scale(0.97))
- **btn-primary**: 琥珀渐变主按钮 (linear-gradient + 金色光晕阴影)
- **btn-secondary**: 卡片色次要按钮 (bg-card + 半透明边框)
- **btn-ghost**: 透明幽灵按钮
- **tag**: 通用标签 base
- **tag-red / tag-black / tag-owner / tag-bot**: 彩色标签变体
- **card-face-el**: 牌正面 (暖奶油底色 + red/black 颜色变体)
- **card-back-el**: 牌背面 (深底色 + 花纹 + 弱文字"🂠")

## 布局约定
- 全屏: `100vw × 100vh`, `overflow: hidden`
- 横屏游戏页: flex column (top-zone / middle-zone / bottom-zone)
- 竖屏首页/房间页: flex column 居中
- 弹窗: `position: fixed + z-index: 100`
- 滚动: `view + overflow-y: auto` (不用 scroll-view)

## 选中态
- 牌选中: 琥珀色边框 + 琥珀光晕 boxShadow
- 按钮选中: accent-soft 背景 + accent 文字
- 段选器选中: accent-soft 背景 + accent 文字

## 为什么是 inline style
所有组件使用 inline style + CSS 变量引用（如 `color: 'var(--accent)'`），原因:
1. 动态样式无需 CSS Modules 命名
2. 避免 Tailwind 类名爆炸
3. CSS 变量保证设计系统一致性
4. 条件样式直接在 JSX 中表达，无需 `classnames` 库
