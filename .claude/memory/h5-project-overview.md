---
name: h5-project-overview
description: 红三H5版项目概览 — React 19 + TypeScript + Vite，暖暗游戏厅设计，纯单机本地模式
metadata: 
  node_type: memory
  type: project
  originSessionId: fcaec1c4-e605-42a6-9cbd-25699630d75a
---

# 红三 H5版 · 项目概览

**最后更新:** 2026-05-29

## 项目定位
微信小程序"找兄弟"的 H5 移植版。React 19 + TypeScript + Vite 8，纯单机本地模式（无后端/无数据库/无云函数），一人+三 bot。

## 技术栈
- React 19 + TypeScript 6
- Vite 8 + Rolldown
- react-router-dom v7
- Tailwind CSS 4 + 自定义 CSS 变量
- zustand 5 (stores)
- 引擎: engine.ts — 从微信小程序 engine/ 合并移植的单一 TS 文件

## 关键文件
- `src/index.css` — 暖暗游戏厅设计系统，CSS 变量 + 通用组件类
- `src/pages/Index.tsx` — 首页，弹窗化创建/加入房间
- `src/pages/Room.tsx` — 房间页，左右分栏(设置+座位)
- `src/pages/Game.tsx` — 游戏页核心，~1350行，完整功能
- `src/lib/engine.ts` — 游戏引擎（纯逻辑，无UI依赖）
- `design-demo/warm-game-room.html` — 设计原型（视觉参考）

## 设计系统
暖暗游戏厅: 底色 `#1a1510` 暖棕黑 + 琥珀灯黄 `#f0a828` + 暖奶油牌面 `#f5ede0`
响应式: clamp(min, preferred, max) 实现桌面+移动端自适应
所有样式使用 inline style + CSS 变量，避免 CSS Modules 命名冲突

## 数据流
```
Index → sessionStorage('roomConfig') → Room
Room → new GameEngine() → sessionStorage('localGame') → Game
Game → engine.getStateForPlayer(0) → renderGameState() → setGameUI()
```

## 当前状态
- 单机本地模式完整可用
- 3个页面 + 引擎全部移植完成
- 暖暗设计系统已应用到全部文件
- 构建通过: 33模块, 25kB CSS, 317kB JS
- 开发服务器: `npm run dev` → http://localhost:5173
- 4个H5特有Bug已修复: 桌面鼠标选牌/选牌弹回/积分累计/手牌数量显示

## 与小程序的差异
- 框架: React vs 原生小程序
- 后端: 无 vs 微信云开发
- 联网: 无 vs 云DB实时同步
- 设计: 暖暗棕琥珀 vs 绿色金边暗色
- 引擎: 单文件TS vs 6模块JS

## 相关资源
- PRD: `红三-H5/docs/PRD.md`
- 设计原型: `红三-H5/design-demo/warm-game-room.html`
- 小程序版: `红三/` 目录
