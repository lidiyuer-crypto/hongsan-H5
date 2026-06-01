# 🏗️ 「找兄弟 H5」架构复盘与技术债报告

> 日期: 2026-06-02
> 范围: 全部源文件（58个核心文件）
> 状态: 等待确认后开始重构

---

## 目录

1. [项目结构总览](#一项目结构总览)
2. [核心模块总结](#二核心模块总结)
3. [打补丁式开发的证据](#三打补丁式开发的证据)
4. [技术债清单](#四技术债清单按严重程度排序)
5. [推荐架构](#五推荐架构-server-authoritative)
6. [当前 vs 推荐架构对比](#六当前-vs-推荐架构对比)
7. [最小重构路线图](#七最小重构路线图)

---

## 一、项目结构总览

```
项目根/
├── src/                          # 前端 React 19 + TypeScript
│   ├── engine/   (7 JS 文件)     # 原始本地引擎 — 从小程序移植
│   ├── lib/
│   │   ├── engine.ts             # barrel export
│   │   └── sound.ts              # 音效管理
│   ├── pages/
│   │   ├── Index.tsx  (763行)    # 首页: 本地+联网入口+认证+开发者模式
│   │   ├── Room.tsx   (540行)    # 房间页: 双模式(isOnline分支)
│   │   └── Game.tsx   (2066行)   # 🚨 核心怪兽组件
│   ├── network/
│   │   ├── NetworkGameClient.ts  (305行)  # WebSocket 单例
│   │   └── types.ts             (169行)  # 协议类型
│   └── stores/gameStore.ts      (133行)  # Zustand 认证+连接状态
│
├── server/                       # 后端 Bun 项目
│   └── src/
│       ├── index.ts              # Bun.serve 入口
│       ├── app.ts                # Hono 路由 + RoomManager + WS handler 注册
│       ├── auth/index.ts         # bcrypt + JWT
│       ├── db/                   # SQLite + Drizzle
│       ├── ws/handler.ts  (174行)# WebSocket 连接管理
│       ├── engine/   (5 TS 文件) # 服务端 TS 引擎
│       └── game/GameRoom.ts (1173行) # 🚨 服务端核心怪兽
```

---

## 二、核心模块总结

### 2.1 游戏规则 / 牌局逻辑 — ⚠️ 三份实现！

| 位置 | 语言 | 用途 | 核心函数 |
|------|------|------|---------|
| `src/engine/gameEngine.js` (965行) | JS | 本地单机引擎 | `executePlayAction`, `checkTeamVictory`, `checkGameOver`, `collectPotAction`, `updateRevealed`, `aiDecide` |
| `server/src/game/GameRoom.ts` (1173行) | TS | 服务端权威引擎 | 相同函数的不同实现 |
| `src/engine/victory.js` | JS | **死代码** — 导出但谁也不调用 | `checkTeamVictory`, `checkGameOver`, `calculateRanks` |

**基础引擎函数同样有两份**：

| 函数 | 前端 `src/engine/` (.js) | 服务端 `server/src/engine/` (.ts) |
|------|--------------------------|-----------------------------------|
| `analyze()` | analyzer.js:3-16 | analyzer.ts:12-30 |
| `canBeat()` | analyzer.js:18-31 | analyzer.ts:32-45 |
| `generateAllValidPlays()` | analyzer.js:51-163 | analyzer.ts:65-167 |
| `smartShuffleDeal()` | deck.js:30-104 | deck.ts:30-103 |
| `assignTeams()` | deck.js:116-135 | deck.ts:170-193 |
| `calculateFans()` | scoring.js:6-44 | scoring.ts:20-53 |
| `calculateSettlement()` | scoring.js:58-119 | scoring.ts:79-145 |
| `Card` class | card.js:3-14 (getter) | card.ts:2-46 (toJSON) |

### 2.2 玩家状态 — 三个不同的类型定义

```typescript
// 前端引擎
gameEngine.js: { id, openid, name, hand, pot, finished, isRed3Team, revealed, rank, canChe, isBot }

// 服务端
GameRoom.ts:   { id, userId, name, hand, pot, finished, isRed3Team, revealed, rank, canChe, isBot, disconnected }

// 前端UI (99个扁平字段)
GameUIState:   { myHand, p1Cards, p1Name, p1Pot, p1TeamText, ... (对手1/2/3各12字段) }

// 网络传输
types.ts:      { id, name, hand, handCount, pot, finished, isRed3Team?, revealed, rank, canChe, isBot, disconnected }
```

### 2.3 房间系统

- **服务端** `RoomManager` (app.ts:80-122): `Map<string, GameRoom>`
- **前端 Room.tsx**: 本地自管理 players 数组，在线通过 WebSocket 同步
- **数据传递**: `sessionStorage` 7个不同 key 在页面间传数据

### 2.4 网络通信 — 相对干净 ✅

- `NetworkGameClient.ts` (305行): 单例，连接/重连/心跳/消息路由
- `types.ts` (169行): 15 种客户端消息 + 12 种服务端消息
- `handler.ts` (174行): WebSocket 连接管理 + 心跳

### 2.5 UI/前端显示 — 单一怪兽组件

- `Game.tsx` (2066行) 承担了所有游戏UI渲染
- `GameUIState` (99个字段) 是整个UI的唯一数据源
- 没有任何子组件拆分

### 2.6 单机/联网耦合点 — 散布在每一个操作中

Game.tsx 中所有玩家操作都有 `isOnlineRef.current` 分支：

```
doPlay()            → { online: networkClient.playCards(),  local: engine.playCards() }
doPass()            → { online: networkClient.pass(),       local: engine.passTurn() }
handleCheAction()   → { online: networkClient.cheAction(),  local: engine.cheAction() }
handleDeclineChe()  → { online: networkClient.declineChe(), local: engine.declineChe() }
handleNextRound()   → { online: networkClient.nextRound(),  local: engine.nextRound() }
onCheTimerExpired() → { online: networkClient.declineChe(), local: engine.endChePhase() }
```

渲染也有双管线：

```
renderGameState()        → 本地模式，读取 engine.getState() → GameUIState
renderOnlineGameState()  → 在线模式，读取服务器 GameStateData → GameUIState
loadSettlement()         → 本地结算
renderOnlineSettlement() → 在线结算
```

---

## 三、打补丁式开发的证据

### 🔴 证据 1: 三份游戏逻辑（最高危）

`checkTeamVictory` 存在于三个文件中，内容相似但不完全相同：

- `gameEngine.js:123-174` — 内联函数，实际被调用
- `victory.js:3-58` — 导出但**从未被使用**的死代码
- `GameRoom.ts:695-762` — 服务端版本

每次修改游戏规则，必须在两个地方同步修改（第三个是死代码，已被遗忘）。

### 🔴 证据 2: 99字段的 GameUIState

一个 interface 承载所有 UI 状态。加新功能 = 加字段 = 在 `renderGameState` 和 `renderOnlineGameState` 两处都要处理。对手 1/2/3 各 12 个字段是复制粘贴的产物。

### 🔴 证据 3: 双渲染管线

`renderGameState` 和 `renderOnlineGameState` 做同一件事（构建 GameUIState），但实现不同。修复一个管线中的 bug 不会自动修复另一个。约 200 行重复逻辑。

### 🟠 证据 4: 双结算管线

`loadSettlement` 和 `renderOnlineSettlement` 各约 100 行，逻辑高度重复但输入数据结构不同。

### 🟠 证据 5: sessionStorage 作为 IPC

页面间通过 7 个不同的字符串 key 传数据，零类型安全：

```
onlineGameState, onlineRoomConfig, onlineRoomPlayers,
localGame, roomConfig, joinCode, roomAction
```

拼写错误 = 静默失败。新增配置项需要手动在每个环节传递。

### 🟠 证据 6: GameRoom.ts 单体类（1173行）

一个文件包含所有职责：
- 房间管理（增删玩家、准备切换）
- 游戏生命周期（开始、下一局）
- 游戏逻辑（出牌、过牌、扯牌、收池）
- 状态过滤（getStateForPlayer）
- 广播（broadcastGameState、broadcastRoomState）
- 5 种定时器管理（turn、che、collect、disconnect、bot）
- Bot AI（调度、执行、扯牌、出牌）
- 断线重连处理
- 结算计算

### 🟡 证据 7: 基础引擎的双重维护

8 个核心函数在 `src/engine/`（JS）和 `server/src/engine/`（TS）中有几乎相同的实现。修改算法需要两处同步。

### 🟡 证据 8: Card 对象序列化问题

- 前端 Card 用 getter → JSON.stringify 丢失 → 需要 `attachAllCards()` 恢复
- 服务端 Card 用 `toJSON()` 手动序列化

两种方案解决同一问题。

### 🟡 证据 9: 无处不在的 isOnlineRef

不是在架构层分离在线/本地模式，而是在每个函数里用 if/else 分支。要彻底删除本地模式需要修改至少 15 处代码。

---

## 四、技术债清单（按严重程度排序）

### 🔴 P0 — 会导致联网崩溃或状态不同步

| # | 债项 | 位置 | 影响 |
|---|------|------|------|
| 1 | **双引擎逻辑不同步** | gameEngine.js vs GameRoom.ts | 服务端和客户端对同一牌局的计算结果可能不同——章子计算、胜利判定、扯牌逻辑在两处独立维护 |
| 2 | **checkTeamVictory 三份实现** | gameEngine.js, victory.js, GameRoom.ts | victory.js是死代码；两个活实现需要手工保持同步 |
| 3 | **tableCards/historyCards 处理差异** | GameRoom.ts executePlay/cheAction/executeCheBot | 之前已修复过一次，但逻辑仍在三个不同方法中重复。未来修改极容易再次出现不同步 |
| 4 | **服务端 bot AI 与本地不一致** | GameRoom.ts executeBotMove | 服务端 bot 用 `generateAllValidPlays[0]`（最弱出牌），本地 bot 用 `aiDecide()`（策略性出牌）——行为不一致 |

### 🟠 P1 — 会阻碍后续开发

| # | 债项 | 位置 | 影响 |
|---|------|------|------|
| 5 | **Game.tsx 2066行单体组件** | src/pages/Game.tsx | 任何改动需要理解整个文件。无法单独测试 UI 组件 |
| 6 | **双渲染管线** | Game.tsx | 修改UI显示逻辑必须改两处 |
| 7 | **双结算管线** | Game.tsx | 同上 |
| 8 | **所有操作函数都有 isOnline 分支** | Game.tsx | 删除本地模式时要改15+处，容易遗漏 |
| 9 | **sessionStorage 数据传递** | Index/Room/Game | 7个字符串 key，零类型安全 |
| 10 | **基础引擎函数双重维护** | src/engine/ + server/src/engine/ | analyzer/card/deck/scoring 在两处有几乎相同的代码 |

### 🟡 P2 — 代码质量和可维护性

| # | 债项 | 位置 | 影响 |
|---|------|------|------|
| 11 | **victory.js 死代码** | src/engine/victory.js | 76行无用代码，误导开发者 |
| 12 | **GameUIState 99字段扁平化** | Game.tsx | 无层级结构，对手1/2/3各12字段是复制粘贴 |
| 13 | **Room.tsx 中 isOnline 分支散落** | Room.tsx | 与Game.tsx相同的问题模式 |
| 14 | **Card getter vs toJSON 两套序列化方案** | card.js vs card.ts | 同一概念两种实现 |
| 15 | **游戏配置传递6层管线** | Index→Room→server→Game | 文档中提到过但未解决 |
| 16 | **GameRoom.ts 无单元测试** | 整个项目 | 1173行纯逻辑零测试，每次修改靠手工验证 |

---

## 五、推荐架构（Server-Authoritative）

### 核心原则

> **Server 是唯一真实状态源 (Single Source of Truth)。Client 只发送操作意图，不直接决定结果。**

### 架构分层图

```
┌───────────────────────────┐
│   Game Engine (Pure)      │  ← 共享包: shared/engine/
│  • Card, Deck, Analyzer   │    所有游戏规则的真源
│  • Scoring, Victory       │    前端和服务端 import 同一份代码
│  • GameState (immutable)  │
└───────────────────────────┘
          ↑          ↑
          │          │
┌─────────┴──┐  ┌───┴─────────────┐
│  Client     │  │  Server (Bun)    │
│             │  │                  │
│  UI Layer:  │  │  RoomManager     │
│  ┌───────┐  │  │  ┌────────────┐  │
│  │ Index  │  │  │  │ RoomState  │  │
│  │ Room   │  │  │  │ (players)  │  │
│  │ Game   │  │  │  └────────────┘  │
│  └───────┘  │  │       ↓          │
│       ↓     │  │  GameScheduler   │
│  GameClient │──┤  ┌────────────┐  │
│  (thin)     │  │  │ GameState   │  │
│             │  │  │ + timers    │  │
│  Client     │  │  │ + bot AI    │  │
│  sends:     │  │  │ + validate  │  │
│  Intent     │  │  └────────────┘  │
│  (not       │  │       ↓          │
│   result)   │  │  BroadcastState  │
└─────────────┘  └──────────────────┘
```

### 第0层: `shared/engine/` (共享引擎包)

**唯一真源。** 前端和服务端都 `import { ... } from 'shared/engine'`。

```
shared/engine/
  Card.ts           — Card 类 (含 toJSON)
  constants.ts      — HAND_TYPES, POWER_LEVEL, RANK_DISPLAY, SUITS
  analyzer.ts       — analyze, canBeat, generateAllValidPlays
  deck.ts           — createFullDeck, smartShuffleDeal, normalDeal, assignTeams
  scoring.ts        — calculateFans, calculateAmount, calculateSettlement
  GameState.ts      — GameState 接口 + createInitialState() + 纯函数reducer
  BotAI.ts          — aiDecide() (统一的 bot 策略)
```

### 第1层: Server — 服务端权威调度

```
server/src/
  room/
    RoomManager.ts    — Map<code, GameRoom>，房间生命周期
    GameRoom.ts       — 玩家加入/离开/准备/bot管理 (~150行)
  game/
    GameController.ts — 接收操作意图 → 验证 → 执行 → 广播
    GameScheduler.ts  — turn timer, che timer, bot timer, collect timer
    StateFilter.ts    — getStateForPlayer(seat): 视角过滤
    BotController.ts  — scheduleBotMove, executeBotMove
    DisconnectHandler.ts — 断线/重连处理
  ws/
    ConnectionManager.ts — WebSocket 连接 + 心跳 + auth
    MessageRouter.ts     — 消息类型 → Controller dispatch
  api/
    auth.ts           — 注册/登录 (已有)
    routes.ts         — REST API (已有)
```

### 第2层: Client — 纯展示 + 操作意图

```
src/
  game/
    GameClient.ts      — WebSocket客户端
    GameStore.ts       — Zustand: 仅存客户端状态 (认证、连接、GameState快照)
    GameRenderer.ts    — GameStateData → GameUIState (一次性映射，无在线/本地分支)
    SettlementRenderer.ts — SettlementData → UI 展示数据
  pages/
    Index.tsx          — 首页 (去掉本地模式入口、开发者模式移到独立页)
    Room.tsx           — 房间页 (纯在线)
    game/              — 游戏页拆分:
      GamePage.tsx     — 路由+生命周期管理 (~100行)
      GameBoard.tsx    — 牌桌布局 (~200行)
      PlayerHand.tsx   — 手牌区 + 选牌交互 (~200行)
      OpponentView.tsx — 对手信息 (~80行)
      PlaySlots.tsx    — 出牌区 (~50行)
      Controls.tsx     — 出牌/过牌/提示/扯牌按钮 (~100行)
      SettlementModal.tsx — 结算弹窗 (~250行)
      ScorePanel.tsx   — 积分面板 (~80行)
      SelfCheDialog.tsx  — 自扯确认弹窗 (~50行)
```

---

## 六、当前 vs 推荐架构对比

| 维度 | 当前 | 推荐 |
|------|------|------|
| **引擎代码** | 3份 (前端JS + 服务端TS + GameRoom内联) | 1份 (shared/engine/) |
| **游戏状态** | GameEngine类 + GameRoom类各有实现 | GameState纯函数reducer |
| **UI组件** | Game.tsx 2066行单体 | 10个小文件，各司其职 |
| **渲染管线** | 双份 (renderGameState + renderOnlineGameState) | 单份 (GameRenderer) |
| **结算管线** | 双份 (loadSettlement + renderOnlineSettlement) | 单份 (SettlementRenderer) |
| **模式判断** | isOnlineRef 散落在15+处 | 无 — 仅在线模式 |
| **数据传递** | sessionStorage × 7 key | Zustand Store + URL params |
| **服务端** | GameRoom.ts 1173行单体 | 5个文件，职责单一 |
| **测试** | 0 | 每个纯函数可独立测试 |
| **新增配置** | 需要6层手动传递 | 类型系统保证 |

---

## 七、最小重构路线图

> 核心原则: **一次一步，每一步都可单独验证部署。**

### 第一步: 统一引擎包（2-3天）

**目标**: 消除双重维护，创建唯一真源

**操作**:
1. 新建 `shared/engine/` 目录
2. 将 `server/src/engine/` 的 5 个 TS 文件移入作为基准
3. 用 `shared/engine/` 替换前端 `src/engine/` 的 7 个 JS 文件
4. 删除 `src/engine/victory.js`（死代码）
5. 前端通过 tsconfig paths alias 引用
6. 修改 `src/lib/engine.ts` barrel → 指向 shared/engine/

**不改**: Game.tsx、GameRoom.ts 中的游戏逻辑函数（它们的重复逻辑第二步才统一）

**验证**: `npm run build` 通过 + 本地模式完整一局可玩

---

### 第二步: 定义统一 GameState（1-2天）

**目标**: 消除 GameRoom 和 GameEngine 中的重复游戏状态管理

**操作**:
1. 在 `shared/engine/GameState.ts` 中定义纯函数：
   ```typescript
   interface GameState { /* 所有状态字段 */ }
   function createInitialState(config, players): GameState;
   function executePlay(state, playerId, cards): GameState;
   function executePass(state, playerId): GameState;
   function executeChe(state, playerId, cards): GameState;
   function checkTeamVictory(state): VictoryResult | null;
   function collectPot(state): GameState;
   ```
2. 让 GameEngine（前端）和 GameRoom（服务端）都使用这些纯函数
3. 此时 gameEngine.js 和 GameRoom.ts 中的重复逻辑被统一

**验证**: 本地 + 在线各完整一局，章子计算和结算结果完全一致

---

### 第三步: 定义 RoomState 和网络协议（1天）

**目标**: 明确房间管理和消息协议的边界

**操作**:
1. 将 `src/network/types.ts` 迁移到 `shared/protocol/`
2. 客户端和服务端 import 同一份类型定义
3. 保证所有消息类型有编译时检查

**验证**: TypeScript 编译通过，无类型错误

---

### 第四步: 拆分 GameRoom.ts（2天）

**目标**: 1173行单体 → 多个职责清晰的模块

**操作**:
1. 从 GameRoom.ts 中抽出：
   - `GameScheduler.ts` — 所有 timer 管理
   - `BotController.ts` — bot 决策和调度
   - `StateFilter.ts` — getStateForPlayer()
2. GameRoom.ts 保留：房间管理（增删玩家、ready、开始/下一局）
3. 依赖关系：`GameRoom → GameScheduler → BotController`
4. **不动任何逻辑，只是搬家**

**验证**: 在线模式功能完全不变

---

### 第五步: 拆分 Game.tsx + 删除本地模式（2-3天）

**目标**: 2066行单体 → 多个小组件，彻底去掉 isOnline 分支

**操作**:
1. 抽出 `GameRenderer.ts`: GameStateData → GameUIState（唯一映射）
2. 抽出 `SettlementRenderer.ts`: SettlementData → UI
3. 删除 `renderGameState()` 和 `loadSettlement()`（本地版本）
4. 删除所有 `isOnlineRef.current` 分支
5. Game.tsx 拆分为 9 个子组件
6. 删除 `src/engine/gameEngine.js`（GameEngine 类）
7. 删除 Index.tsx 中的开发者模式入口

**验证**: 在线模式完整功能测试 → 部署 NAS → 真人验证

---

### 路线图总览

```
第1步: 统一引擎包          ████████░░░░░░░░░░  2-3天  风险: 低 (纯文件移动 + 删除死代码)
第2步: 统一 GameState      ░░░░░░░░████████░░  1-2天  风险: 中 (重构核心游戏逻辑)
第3步: 统一协议类型        ░░░░░░░░░░░░████░░  1天    风险: 低 (纯类型迁移)
第4步: 拆分 GameRoom      ░░░░░░░░░░░░░░░░██  2天    风险: 低 (纯拆分，不改逻辑)
第5步: 拆分 Game+删本地    ░░░░░░░░░░░░░░░░░░  2-3天  风险: 中 (大量前端改动)
                         ───────────────────
                         总计: 8-11天
```

---

## 附录: 关键文件清单

### 前端 (26个核心文件)

| 文件 | 行数 | 职责 | 问题等级 |
|------|------|------|---------|
| `src/pages/Game.tsx` | 2066 | 游戏页全部UI+逻辑 | 🔴 |
| `src/pages/Index.tsx` | 763 | 首页+认证+开发者模式 | 🟠 |
| `src/pages/Room.tsx` | 540 | 房间页(双模式) | 🟠 |
| `src/engine/gameEngine.js` | 965 | 本地引擎 | 🔴 |
| `src/engine/analyzer.js` | 166 | 牌型分析 | 🟡 |
| `src/engine/deck.js` | 189 | 发牌+组队 | 🟡 |
| `src/engine/scoring.js` | 121 | 番数+结算 | 🟡 |
| `src/engine/card.js` | 14 | Card类 | 🟡 |
| `src/engine/constants.js` | 5 | 常量 | ✅ |
| `src/engine/victory.js` | 76 | **死代码** | 🔴 |
| `src/lib/engine.ts` | 11 | Barrel export | ✅ |
| `src/network/NetworkGameClient.ts` | 305 | WS客户端 | ✅ |
| `src/network/types.ts` | 169 | 协议类型 | ✅ |
| `src/stores/gameStore.ts` | 133 | 认证+连接状态 | ✅ |

### 服务端 (12个核心文件)

| 文件 | 行数 | 职责 | 问题等级 |
|------|------|------|---------|
| `server/src/game/GameRoom.ts` | 1173 | 全部服务端游戏逻辑 | 🔴 |
| `server/src/app.ts` | 370 | 路由+RoomManager+WS处理 | 🟠 |
| `server/src/ws/handler.ts` | 174 | WS连接管理+心跳 | ✅ |
| `server/src/engine/analyzer.ts` | 168 | 牌型分析(TS版) | 🟡 |
| `server/src/engine/deck.ts` | 194 | 发牌+组队(TS版) | 🟡 |
| `server/src/engine/scoring.ts` | 146 | 番数+结算(TS版) | 🟡 |
| `server/src/engine/card.ts` | 48 | Card类(TS版) | 🟡 |
| `server/src/engine/constants.ts` | 23 | 常量(TS版) | ✅ |
