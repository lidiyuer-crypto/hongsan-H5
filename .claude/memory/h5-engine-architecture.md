---
name: h5-engine-architecture
description: H5版引擎架构 — 单文件engine.ts整合6模块 + gameUI单状态对象模式 + 自扯弹窗双确认
metadata: 
  node_type: memory
  type: reference
  originSessionId: fcaec1c4-e605-42a6-9cbd-25699630d75a
---

# H5 引擎架构

## engine.ts 结构
从微信小程序 `miniprogram/engine/` 6个独立JS模块合并为一个 TypeScript 文件:

| 源模块 | 功能 | engine.ts中位置 |
|--------|------|---------------|
| constants.js | 牌型/权重常量 | 顶部 enum/const |
| card.js | Card 接口定义 | Card interface |
| analyzer.js | analyze/canBeat/generateAllValidPlays | 独立函数 |
| deck.js | createFullDeck/smartShuffleDeal/assignTeams | 独立函数 |
| gameEngine.js | GameEngine 类 | GameEngine class |
| scoring.js | calculateFans/calculateSettlement | 独立函数 |

## gameUI 单状态对象模式
镜微信小程序的 `this.data` 模式:
```typescript
interface GameUI {
  // 玩家信息
  myHand, myPot, myName, myTeamText, myTeamClass
  p1Name, p1Pot, p1TeamText, p1TeamClass, p1Rank, p1RankLabel
  // (p2, p3 同理)
  faceDownP1, faceDownP2, faceDownP3

  // 出牌位
  playSlots: [{cards, playerId, passed, isChe}]

  // 控制
  showControls, showCheControls, canChe
  showTimer, turnTimePercent, cheTimerPercent
  passFlashSlot

  // 结算
  showSettlement, settlementData
  showScorePanel, scorePanelPlayers
  isManaged, managedEnabled
}
```

## 关键设计模式

### renderGameState() 单函数组装
```typescript
function renderGameState() {
  const gs = engine.getStateForPlayer(0);
  const data = {
    myHand: mergePreserveSelection(gs.players[0].hand, prevUI.myHand),
    // ... 组装所有 UI 需要的衍生数据
  };
  setGameUI(prev => ({ ...prev, ...data }));
}
```

### 选区保留 (关键陷阱)
`renderGameState` 会覆盖 `myHand`，必须从旧 `myHand` 建立 key map 保留 `isSelected`:
```typescript
const prevSelected = new Map(
  (prevUI.myHand || []).filter(c => c.isSelected).map(c => [cardKey(c), true])
);
newHand.forEach(c => {
  if (prevSelected.has(cardKey(c))) c.isSelected = true;
});
```

### 自扯弹窗 (self-che dialog)
打出3张炸弹时若无上轮有效出牌 → 弹窗问"炸弹"还是"自扯":
- 炸弹: 正常出牌
- 自扯: 选2张同点牌 → 第一轮扯牌响应期

## 触摸选牌 (Game.tsx)
与小程序版完全对应的 DOM touch/mouse 事件:
- `touchstart` → 仅高亮被触摸牌
- `touchend` (无移动) → 追加式切换
- `touchmove` → 绝对坐标滑动选择
- `initHandMetrics()` → 从 DOM computed style 读取 cardStep/firstCardLeft

## 与小程序引擎的差异
1. TypeScript 强类型 vs JS 弱类型
2. 单文件 vs 6模块 — 减少 import 复杂度，但模块边界模糊可能导致绕过引擎公共方法
3. Card 为 interface 而非 class — JSON 序列化天然支持
4. onChange 回调异步触发 — 无云函数延迟
5. **★引擎方法绕过陷阱**: 单文件结构让 UI 代码可直接 import 内部纯函数（calculateSettlement等），绕过 engine 公共方法 → 状态管理被跳过。只调 `engine.xxx()` 公共方法，不直接调内部函数。详见 [[h5-engine-bypass-trap]]
