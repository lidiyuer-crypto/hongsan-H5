---
name: online-bot-support
description: 在线房间 bot 补齐机制 — 服务端 addBot、auto-fill、bot turn调度
metadata:
  type: project
---

# 在线房间 Bot 支持

## 设计
- userId 用负值 (如 `-(seat+1)*1000 - counter`)，不与真实用户 DB id 冲突
- `isBot: true` 标记贯穿 room players → game players → broadcast
- bot 默认 ready，命名：电脑A/B/C/D

## Room 层
- `addBot()`: 找空座位 → 负值 userId → push players → broadcastRoomState
- `startGame()` auto-fill: `while (players.length < 4) this.addBot()`
- `broadcastRoomState()` 发送 `isBot` + `ownerId`

## Game 层
- `startGame()` 从 room players 继承 `isBot` 到 game players
- `startTurnTimer()`: `player.isBot` → `scheduleBotMove()`（不走 30s turn timer）
- **必须清理旧 bot timer**：`scheduleBotMove` 中用 `botTimers.get→clearTimeout→delete` 防重复
- `executeBotMove()`: 60% 扯牌，否则 pick 最弱有效牌；打不过 pass

## 前端
- `NetworkGameClient.addBot()` 发 `{ type: 'add_bot' }`
- Room.tsx: ownerId 来自 server → 房主可见「🤖 添加电脑」
- `allReady` 改为 `players.every(p => p.ready || p.isBot)`

**Why:** 4 人局测试必须补齐 bot，负值 userId 避让真实用户。
**How to apply:** bot 新增逻辑必须同时更新 room 层和 game 层。
