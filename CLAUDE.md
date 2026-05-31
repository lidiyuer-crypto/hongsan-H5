# 找兄弟(红三/坨坨牌) H5版

## 项目概览
微信小程序"找兄弟"的H5移植版。React 19 + TypeScript + Vite 8。
**双模式**: 本地单机 (1人类+3 bot) + 联网对战 (Bun + WebSocket 服务端权威)。
暖暗游戏厅设计。

## 启动
```bash
# 前端
npm run dev          # http://localhost:5173
npm run build        # 类型检查 + 构建

# 后端 (联网模式)
cd server
bun run index.ts     # http://localhost:3001 (HTTP/WS)
```

## 目录结构
```
src/
  main.tsx            — 入口
  App.tsx             — 路由: / → /room/:code?online → /game/:id
  index.css           — 暖暗游戏厅设计系统
  pages/
    Index.tsx         — 首页(本地+联网入口, 登录/注册弹窗)
    Room.tsx          — 房间页(在线/本地双模式, bot补齐)
    Game.tsx          — 游戏页(~1500行, 在线/本地双模式, toast错误提示)
  network/
    NetworkGameClient.ts — WebSocket客户端单例(连接/重连/心跳/消息路由)
    types.ts             — WebSocket协议类型(15client+12server消息)
  lib/engine.ts       — 游戏引擎(纯逻辑)
  stores/gameStore.ts — zustand(auth/connection/online)
server/               — 独立Bun项目
  index.ts            — Bun.serve入口(HTTP+WS)
  src/
    app.ts            — Hono路由 + RoomManager + WS消息处理
    auth/index.ts     — bcrypt + JWT 注册/登录
    db/               — SQLite + Drizzle(schema/migrate)
    ws/handler.ts     — WebSocket连接管理 + 心跳 + 路由
    game/GameRoom.ts  — 服务端权威游戏调度器(~1050行)
    engine/           — 服务端TS版引擎(card/analyzer/deck/scoring/constants)
```

## 设计系统 — "暖暗游戏厅"
- 底色: `#1a1510` 暖棕黑
- 强调: `#f0a828` 琥珀灯黄
- 牌面: `#f5ede0` 暖奶油
- 响应式: `clamp(min, preferred, max)` 桌面+移动端自适应
- 全部 inline style + CSS 变量
- 通用类: `.btn-game` `.btn-primary` `.btn-secondary` `.tag` `.card-face-el` `.card-back-el`

## 关键架构决策
- **gameUI 单状态对象**: 镜像小程序 `this.data`，`renderGameState()` 组装所有UI数据
- **engine.ts 单文件**: 将6个引擎模块合并为1个TS文件
- **服务端权威**: 在线模式所有出牌由服务端验证(GameRoom)，客户端只发操作意图
- **独立 server/ 目录**: 不搞 monorepo，server 是独立 Bun 项目
- **双模式共存**: Game.tsx 同时处理 online/local，`isOnlineRef` 同步检查模式
- **WebSocket JSON 协议**: 15种客户端→服务端消息 + 12种服务端→客户端消息
- **视角过滤**: `getStateForPlayer(seat)` 仅发送该玩家完整手牌，对手只发 `handCount`

## 数据流
**本地模式**:
```
Index → sessionStorage('roomConfig') → Room → new GameEngine() → sessionStorage('localGame') → Game
```
**联网模式**:
```
Index → POST /api/auth/register|login → JWT → ws://host:3001/ws (auth)
  → create_room|join_room → room_state(广播) → ready → start_game
  → game_state(per-player) → play_cards|pass|che → 服务端验证 → broadcast
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
- **doPlay 5 处静默 return**: 现在全改为 `flashError('...')` toast 提示
- **服务端 action_result error**: 现在通过 `onError` 订阅展示到 UI
- **handleCheAction**: 必须防护 `!gs?.lastValidPlay` 防 null 引用

### 权限
- **ownerId**: `room_state` 消息携带，用于前端判断房主身份
- **add_bot 仅房主可调**: 服务端检查 `room.ownerId !== userId`

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
- **轮询/重渲染覆盖选区**: `renderGameState`会覆盖`myHand`，必须从旧`myHand`建立cardKey→isSelected的Map保留
- **引擎方法绕过**: 不直接调`calculateSettlement()`等内部纯函数，应通过`engine.getSettlement()`公共方法。直接调纯函数绕过`_scoresStored`和`accumulatedScores`状态管理→积分永不累计
- **`_doAction()` 后强制 `_lastTurnIndex = -1`**: 同步bot loop可能让turnIndex绕回→计时器不重启

### 配置传递
- **新配置字段6层管线**: Room state→config对象→sessionStorage→Game init(含fallback默认值)→GameUI interface→renderGameState→JSX。漏任一环节=静默失败
- engine.ts 的 Card 为 interface (非 class)，getter 不参与 JSON 序列化 → 云端场景需注意

### 游戏机制
- **自扯弹窗**: 打出3张炸弹无上轮 → 弹窗双确认(炸弹/自扯)
