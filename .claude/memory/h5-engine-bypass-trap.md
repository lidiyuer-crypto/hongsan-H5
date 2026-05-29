---
name: h5-engine-bypass-trap
description: 直接调engine内部函数绕过状态管理 — getSettlement()管理_scoresStored和accumulatedScores
metadata:
  type: reference
  originSessionId: fcaec1c4-e605-42a6-9cbd-25699630d75a
---

# H5 引擎方法绕过陷阱

## 问题
`loadSettlement()` 直接调用 `calculateSettlement(rh, vr, players)` 计算结算数据，绕过了 `engine.getSettlement()`。

但 `engine.getSettlement()` 内部管理着关键状态：
```typescript
// engine.getSettlement() 内部
if (!game._scoresStored && settlement.results) {
  settlement.results.forEach(r => {
    game.accumulatedScores[r.playerId] = 
      (game.accumulatedScores[r.playerId] || 0) + r.netWon;
  });
  game._scoresStored = true;  // 防止重复累计
}
```

## 症状
每局结算显示正常，但积分面板显示全0 — `accumulatedScores` 从未更新，`_scoresStored` 从未设为true。

## 根因
`calculateSettlement()` 是纯函数（输入→输出，无副作用），`getSettlement()` 是有状态包装器（调用calculateSettlement + 更新accumulatedScores + 设_scoresStored标记）。

直接调纯函数 = 跳过状态管理 = 积分永不累计。

## 修复
```typescript
// ❌ 错误 — 绕过engine状态管理
const settlement = calculateSettlement(roundHistory, victoryReason, players);
loadSettlement();

// ✅ 正确 — 先让engine处理状态
engine.getSettlement();  // 触发 accumulatedScores 更新 + _scoresStored
loadSettlement();        // 然后渲染
```

## 通用原则
engine 的公共方法（`getSettlement()`, `playCards()`, `passTurn()` 等）是有状态入口。不要直接调用 engine 内部使用的纯工具函数（`calculateSettlement()`, `calculateFans()`, `generateAllValidPlays()` 等），除非你明确只想要纯计算结果且不需要修改引擎状态。

**Why:** 这是从6模块拆分到单文件engine.ts后出现的陷阱 — 原来的模块边界在单文件中变得模糊，UI代码可以直接import内部函数，绕过了engine的状态管理。

**How to apply:** Game.tsx 只应调用 `engine.xxx()` 公共方法，不直接调 `calculateSettlement` / `calculateFans` 等内部纯函数。需要结算数据时，先调 `engine.getSettlement()` 再读 `engine._state`。

[[h5-engine-architecture]]
