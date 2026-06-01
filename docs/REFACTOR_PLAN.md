# 7天重构计划：消除双引擎，统一游戏逻辑

> 基于 [ARCHITECTURE.md](./ARCHITECTURE.md) 审计结果制定
>
> 目标：**刚好消除核心痛苦**——不做完美架构，只消除双引擎这个根因

---

## 背景

当前项目在 3 个地方独立维护同一套游戏规则：
1. `src/engine/gameEngine.js` — 前端本地模式
2. `src/engine/victory.js` — 死代码（无人调用）
3. `server/src/game/GameRoom.ts` — 服务端内联实现

每次修 bug / 加功能都需要三处同步，P0 的 4 个问题全部根源于此。

---

## 判断结论：必须做小范围重构

继续打补丁的代价已超过重构的成本。当前 16 个 P0/P1 问题中，所有 P0 都源自双引擎。

---

## 1. 可以保留的代码 ✅

| 代码 | 理由 |
|------|------|
| `src/engine/analyzer.js` | 牌型分析逻辑成熟稳定 |
| `src/engine/deck.js` | 发牌/坨坨牌/assignTeams 逻辑完整 |
| `src/engine/scoring.js` | 番数/结算计算正确 |
| `src/engine/card.js` + `src/engine/constants.js` | 基础定义 |
| `src/network/NetworkGameClient.ts` | WebSocket 客户端设计合理 |
| `src/network/types.ts` | 协议定义完整 |
| `server/src/ws/handler.ts` | 心跳/连接管理已稳定 |
| `server/src/auth/index.ts` | 认证逻辑独立 |
| `src/index.css` | 设计系统完整 |
| `src/lib/sound.ts` | 音效独立 |
| UI 渲染代码（卡片渲染、结算弹窗、对手头像布局） | 视觉效果没问题 |

## 2. 必须隔离的代码 ⚠️

| 代码 | 隔离方式 |
|------|---------|
| `server/src/engine/` (5 个 TS 文件) | 与 `src/engine/` 合并到 `shared/engine/` |
| `server/src/game/GameRoom.ts` 中的游戏纯逻辑 | 抽到 `shared/engine/GameState.ts` 作为纯函数 |
| `server/src/game/GameRoom.ts` 中的 bot AI | 抽到独立 `BotController.ts` |
| `src/engine/victory.js` | **直接删除**（死代码） |

## 3. 必须重写的代码 🔴

| 代码 | 原因 | 重写方式 |
|------|------|---------|
| `src/engine/gameEngine.js` (965行) | 与 GameRoom 重复的游戏逻辑 | 删除整个文件 |
| `server/src/game/GameRoom.ts` (1173行) | 单体类混了游戏逻辑、调度、Bot AI、广播 | 拆为 5 个文件 |
| `src/pages/Game.tsx` 双渲染管线 | 两套 renderGameState | 合并为一个 GameRenderer |
| `src/pages/Game.tsx` 双结算管线 | 两套 settlement 渲染 | 合并为一个 SettlementRenderer |

## 4. 最危险的耦合点 🔗

1. **GameRoom.checkTeamVictory() ↔ gameEngine.checkTeamVictory()** — 同一段逻辑在两个文件中各自实现
2. **GameRoom.executePlay() ↔ gameEngine.executePlayAction()** — tableCards/historyCards 处理逻辑分散
3. **sessionStorage 数据传递链** — Index→Room→Game 通过 7 个字符串 key 传数据，零类型安全
4. **Game.tsx 中 isOnlineRef 的 15+ 处分支** — 删本地模式时容易遗漏

## 5. 继续打补丁的崩溃预测 💥

| 崩溃场景 | 触发条件 | 影响 |
|---------|---------|------|
| 进贡计算再次出错 | 修了一处没同步另一处 | 线上结算数字错误 |
| 新牌型上线 | analyzer 改动只在一处生效 | 服务端拒绝合法出牌 |
| 加第 16 个网络消息 | 漏加 GameRoom 方法 | 消息静默丢弃 |
| 加游戏配置项 | 6 层传递管线漏一环 | 配置不生效 |
| 删本地模式 | isOnline 分支删漏 | 白屏崩溃 |
| GameRoom.ts 再加 200 行 | 单人理解时间超过 30 分钟 | 新成员无法接手 |

---

## 6. 7 天重构计划

```
Day 1-2: 合并引擎 + 删除死代码         风险: 低
Day 3-4: 拆分 GameRoom + 纯函数 GameState  风险: 中
Day 5-6: 前端去双管线 + 拆 Game.tsx      风险: 中
Day 7:   删除本地模式 + 回归测试         风险: 中
```

---

### Day 1-2: 合并引擎（风险: 低）

**目标**：一个目录承载所有引擎代码，不再有 JS/TS 双重维护。

**步骤**：
1. 新建 `shared/engine/` → 移入 server 的 5 个 TS 文件作为唯一真源
2. 对比 `src/engine/` JS 文件，将差异合并到 shared
3. 删除 `src/engine/victory.js`（死代码）
4. 前端 tsconfig paths 指向 `shared/engine/`
5. 更新所有 import 路径

**产出**：`shared/engine/` 统一引擎，前后端共享

**验证**：`npm run build` + `tsc` 通过

---

### Day 3-4: 拆分 GameRoom + 纯函数 GameState（风险: 中）

**目标**：GameRoom 从 1173 行拆为职责单一的模块。

**纯函数提取到 `shared/engine/GameState.ts`**：
- `createInitialState(config, players) → GameState`
- `executePlay(state, playerId, cards) → GameState`
- `executePass(state, playerId) → GameState`
- `executeChe(state, playerId, cards) → GameState`
- `checkTeamVictory(state) → VictoryResult | null`
- `checkGameOver(state) → boolean`
- `collectPot(state) → GameState`
- `updateRevealed(state) → GameState`

**GameRoom 拆分**：
- `GameRoom.ts` → `GameController.ts` (~200行): 调纯函数 + 广播
- `GameRoom.ts` → `BotController.ts` (~150行): bot 决策 + 调度
- `GameRoom.ts` → `GameScheduler.ts` (~80行): timer 管理

**产出**：GameRoom 1173行 → ~300行（仅房间管理职责）

**验证**：本地 + 在线各完整 8 局，结算金额完全一致

---

### Day 5-6: 前端去双管线 + 拆 Game.tsx（风险: 中）

**目标**：Game.tsx 从 2066 行拆为 9 个文件。

**新建文件**：
- `src/game/GameRenderer.ts` — 合并 renderGameState + renderOnlineGameState
- `src/game/SettlementRenderer.ts` — 合并两套结算渲染
- `src/game/PlayerHand.tsx` — 手牌渲染 + 选牌交互 (~300行)
- `src/game/OpponentView.tsx` — 对手信息 (~100行)
- `src/game/PlaySlots.tsx` — 出牌区 (~60行)
- `src/game/Controls.tsx` — 操作按钮 (~120行)
- `src/game/SettlementModal.tsx` — 结算弹窗 (~250行)
- `src/game/ScorePanel.tsx` — 积分面板 (~80行)

**瘦身**：Game.tsx → GamePage.tsx (~200行)，路由 + useEffect 订阅 + 子组件编排

**产出**：最大文件不超过 300 行

**验证**：在线模式 UI 行为与重构前完全一致

---

### Day 7: 删除本地模式 + 回归测试（风险: 中）

**目标**：移除所有本地模式代码路径。

**步骤**：
1. 删除所有 `isOnlineRef.current` 分支 → 直接调 networkClient
2. 删除 `src/engine/gameEngine.js` 引用
3. 删除 Index.tsx 开发者模式弹窗（移为独立路由）
4. 删除 Room.tsx 本地模式分支
5. 清理 sessionStorage 本地模式 key

**验证清单**：
- 注册 → 创建房间 → 加 3 bot → 完整 8 局 → 每局结算 → 最终积分
- 多标签模拟多玩家
- 断线重连
- 部署 NAS 真人验证

---

## 不做的事（明确边界）

- ❌ 不改游戏规则（不增加新牌型、新机制）
- ❌ 不改网络协议（不增加新消息类型）
- ❌ 不改 UI 视觉设计
- ❌ 不加单元测试框架
- ❌ 不改数据库/持久化

---

## 每日风险评估

```
Day 1-2 ██░░░░░  风险:低   纯文件移动，编译通过即可
Day 3-4 █████░░  风险:中   纯函数提取 + 拆分，逻辑不变
Day 5-6 █████░░  风险:中   前端拆分，保持行为一致
Day 7   ██████░  风险:中   删除模式，需仔细排查
```

---

> 📅 制定日期: 2026-06-02
> 📋 基于: [ARCHITECTURE.md](./ARCHITECTURE.md) 审计报告
