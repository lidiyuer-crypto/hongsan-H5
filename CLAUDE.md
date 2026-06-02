# 找兄弟(红三/坨坨牌) H5版

## 项目概览
微信小程序"找兄弟"的H5移植版。React 19 + TypeScript + Vite 8。
**纯在线模式**: Bun + WebSocket 服务端权威，bot 补齐。
暖暗游戏厅设计。

## 启动
```bash
# 前端
npm run dev          # http://localhost:5173
npm run build        # 类型检查 + 构建

# 后端
cd server
bun run index.ts     # http://localhost:3001 (HTTP/WS)
```

## 目录结构
```
src/
  main.tsx              — 入口
  App.tsx               — 路由: / → /room/:code → /game/:id
  index.css             — 暖暗游戏厅设计系统
  pages/
    Index.tsx           — 首页(登录/注册 + 创建/加入在线房间)
    Room.tsx            — 房间页(在线bot补齐, 房主可改设置)
    Game.tsx            — 游戏页(~1220行, toast错误提示)
  game/
    types.ts            — GameUIState interface + cardDisplay/cardKey helpers
    GameRenderer.ts     — computeGameUI(): 服务端GameStateData→前端UI状态
    SettlementRenderer.ts — computeSettlementUI(): 结算数据→UI状态
  network/
    NetworkGameClient.ts — WebSocket客户端单例(连接/重连/心跳/消息路由)
    types.ts             — WebSocket协议类型
  engine/               — 旧JS re-export wrapper (→ shared/engine/)
  lib/engine.ts         — Barrel export (re-exports from shared/engine/)
  stores/gameStore.ts   — zustand(auth/connection)

shared/engine/          — 🏛️ 游戏引擎唯一源码 (前后端共享)
  card.ts               — Card class + CardData type
  constants.ts           — HAND_TYPES, POWER_LEVEL, RANK_DISPLAY, SUITS
  analyzer.ts            — analyze/canBeat/generateAllValidPlays
  deck.ts                — createFullDeck/smartShuffleDeal/normalDeal/assignTeams/adjustRed3sForTestMode
  scoring.ts             — calculateFans/calculateAmount/calculateSettlement
  GameState.ts           — 纯函数: executePlay/activateChePhase/endChePhase/collectPot/checkTeamVictory/checkGameOver/determineWinnerByPot/resetForNextRound + GameStateData/RoomConfig/GamePlayer types

server/                  — 独立Bun项目
  index.ts               — Bun.serve入口(HTTP+WS)
  src/
    app.ts               — Hono路由 + RoomManager + WS消息处理 (含 update_config)
    auth/index.ts        — bcrypt + JWT 注册/登录
    db/                  — SQLite + Drizzle(schema/migrate)
    ws/handler.ts        — WebSocket连接管理 + 心跳 + 路由
    game/GameRoom.ts     — 服务端权威游戏调度器(~800行) + 内部BotController类
```

## 设计系统 — "暖暗游戏厅"
- 底色: `#1a1510` 暖棕黑
- 强调: `#f0a828` 琥珀灯黄
- 牌面: `#f5ede0` 暖奶油
- 响应式: `clamp(min, preferred, max)` 桌面+移动端自适应
- 全部 inline style + CSS 变量
- 通用类: `.btn-game` `.btn-primary` `.btn-secondary` `.tag` `.card-face-el` `.card-back-el`

## 关键架构决策
- **shared/engine/ 统一引擎**: 前后端共享同一套游戏逻辑源码，消除双引擎分化
- **src/engine/*.js re-export wrapper**: 向前兼容，实际代码在 shared/engine/*.ts
- **服务端权威**: 所有出牌由服务端验证(GameRoom)，客户端只发操作意图
- **纯函数提取**: `executePlay`/`checkTeamVictory`/`collectPot` 等纯状态变换在 GameState.ts，不依赖定时器/网络/DB
- **BotController 内部类**: GameRoom 内的私有类，封装 bot AI 调度
- **gameUI 单状态对象**: `GameUIState` interface (~100字段)，`computeGameUI()` 组装
- **WebSocket JSON 协议**: 16种客户端→服务端消息(含 update_config) + 12种服务端→客户端消息
- **视角过滤**: `getStateForPlayer(seat)` 仅发送该玩家完整手牌，对手只发 `handCount`
- **纯在线模式 (Phase 5)**: 已删除本地模式，App 必须连接服务器。已删除文件: `src/engine/gameEngine.js`, `src/engine/victory.js`, `server/src/engine/`

## 数据流
```
Index → POST /api/auth/register|login → JWT → ws://host:3001/ws (auth)
  → create_room(config) | join_room → room_state(广播) → update_config(房主改设置)
  → ready → start_game → game_state(per-player)
  → play_cards|pass|che → 服务端验证(GameState.ts纯函数) → broadcast
  → checkTeamVictory|checkGameOver → settlement → next_round
```

## 联网模式常见陷阱

### Bot 相关
- **Bot userId 用负值**: `-(seat+1)*1000 - counter`，不与真实用户 DB id 冲突
- **isBot 贯穿全流程**: room players → game players → broadcastRoomState/gameState
- **Bot 无 WebSocket 连接**: `sendToUser(botUserId)` 静默跳过（clients.get 返回 null）
- **scheduleBotMove 必须清旧 timer**: `botTimers.get→clearTimeout→delete` 防止重复调度
- **Bot 不穿透扯牌**: `executeBotMove` 中 `if (g.chePhase && !player.canChe) return`
- **Bot 互搏时扯牌加速**: `activateChePhase` 中无人类能扯→timeout 800ms (原 3000ms)

### 扯牌旗标
- **roundHasCheHappened**: `endChePhase()` 设为 true → `collectPot()` 重置为 false
- **cheAction() 后必须 startTurnTimer()**: 人类扯牌成功→出牌权转给扯牌者→需启动 timer

### 前端静默失败
- **doPlay 静默 return**: 全部改为 `flashError('...')` toast 提示
- **服务端 action_result error**: 通过 `onError` 订阅展示到 UI
- **handleCheAction**: 必须防护 `!gs?.lastValidPlay` 防 null 引用

### 权限
- **ownerId**: `room_state` 消息携带，用于前端判断房主身份
- **add_bot 仅房主可调**: 服务端检查 `room.ownerId !== userId`
- **update_config 仅房主可调**: 且游戏开始后拒绝修改

### 章子统计陷阱
- **checkGameOver 必须清空数组**: `tableCards/historyCards/pendingCollect` 否则 `collectPot` 定时器二次累加→章子翻倍
- **scheduleCollect 加 status 守卫**: `if (game.status !== 'playing') return` 双重保护

### 牌背渲染
- **faceDown 不与 revealed 绑定**: 身份揭示(出红三)≠牌面朝上。faceDown 仅游戏结束(`status==='finished'`)时变 false

### 配置传递
- **update_config 同步**: Room.tsx useEffect 监听所有设置项，房主修改即发 `update_config` WS 消息
- **新配置字段管线**: Room state→update_config→GameRoom.config→createInitialGameState→GameStateData→broadcastGameState→computeGameUI→JSX

## 游戏机制 (完整保留自小程序)
- 4人局2v2红三/黑三阵营，52张牌(4-16点)
- 扯牌机制: 同点数2张抢出牌权，氢弹(4张)可压扯牌
- 坨坨牌: 五级smartShuffle分级发牌
- 番数: 普通炸弹+1/氢弹+2/双关+1/业务+N，平翻/陡翻
- 进贡: 1-3名同队+5, 2-4名同队+5
- 身份揭示: 5种情况逐玩家逻辑
- 多局制: 8/16/24/32局 + 积分累计

## 常见陷阱

### 事件系统 (H5 vs 小程序)
- **鼠标+触控双事件**: H5需同时处理touch和mouse事件。仅`onTouchStart`→桌面端无法选牌。`mousemove`需检查`e.buttons & 1`确认左键按下。`mouseleave`=touchcancel
- **React冒泡=小程序catchtap**: click事件沿DOM树冒泡。父容器`onClick`清空选区时，子卡片必须`onClick={e => e.stopPropagation()}`。这是WXML `catchtap="noop"`的React等效写法
- **e.touches[0].x不存在**: 微信小程序中不存在，用`pageX`。H5的mouse事件直接用`e.pageX`

### 状态管理
- **轮询/重渲染覆盖选区**: `computeGameUI`会覆盖`myHand`，必须从旧`myHand`建立cardKey→isSelected的Map保留
- **`_doAction()` 后强制 `_lastTurnIndex = -1`**: 同步bot loop可能让turnIndex绕回→计时器不重启

### 游戏机制
- **自扯弹窗**: 打出3张炸弹无上轮 → 弹窗双确认(炸弹/自扯)

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
