# 找兄弟(红三/坨坨牌) H5版

## 项目概览
微信小程序"找兄弟"的H5移植版。React 19 + TypeScript + Vite 8，纯单机本地模式（1人类+3 bot），暖暗游戏厅设计。

## 启动
```bash
npm run dev     # http://localhost:5173
npm run build   # 类型检查 + 构建
```

## 目录结构
```
src/
  main.tsx          — 入口
  App.tsx           — 路由: / → /room/:code → /game/:id
  index.css         — 暖暗游戏厅设计系统 (~560行CSS变量+组件类)
  pages/
    Index.tsx       — 首页(弹窗化创建/加入房间, ~280行)
    Room.tsx        — 房间页(左右分栏: 设置+座位, ~360行)
    Game.tsx        — 游戏页(核心, ~1350行, 完整对战+扯牌+结算)
  lib/
    engine.ts       — 游戏引擎(纯逻辑, 从miniprogram/engine/合并移植)
  stores/
    gameStore.ts    — zustand store
design-demo/
  warm-game-room.html — 设计原型(视觉参考)
docs/
  PRD.md            — 产品需求文档
```

## 设计系统 — "暖暗游戏厅"
- 底色: `#1a1510` 暖棕黑
- 强调: `#f0a828` 琥珀灯黄
- 牌面: `#f5ede0` 暖奶油
- 响应式: `clamp(min, preferred, max)` 桌面+移动端自适应
- 全部 inline style + CSS 变量 (var(--accent) 等)
- 通用类: `.btn-game` `.btn-primary` `.btn-secondary` `.tag` `.card-face-el` `.card-back-el`

## 关键架构决策
- **gameUI 单状态对象**: 镜像小程序 `this.data`，一个 `renderGameState()` 组装所有UI数据
- **engine.ts 单文件**: 将6个引擎模块合并为1个TS文件
- **inline style**: 避免CSS Modules命名冲突，CSS变量保证一致性
- **sessionStorage**: 房间配置和游戏状态跨页面传递

## 数据流 (本地单机)
```
Index → sessionStorage('roomConfig') → Room
Room → new GameEngine() → sessionStorage('localGame') → Game
Game → engine.getStateForPlayer(0) → renderGameState() → setGameUI()
```

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
