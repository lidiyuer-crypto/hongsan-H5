---
name: online-che-phase-loop
description: 扯牌阶段无限循环 — roundHasCheHappened旗标管理 + bot穿透出牌
metadata:
  type: project
---

# 扯牌阶段无限循环 Bug

## 现象
Bot 出单张 → 3s 扯牌 → 全 pass → 收章子 → Bot 又出单张 → 扯牌又触发… 往复感知为死循环。

## 4 个根因
| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 1 | `endChePhase()` | 没设 `roundHasCheHappened = true` | 加设，阻止同轮重复触发 |
| 2 | `collectPot()` | 没重置 `roundHasCheHappened` | 加 `= false`，允许新一轮 |
| 3 | `executeBotMove()` | `chePhase && !canChe` 穿透出牌 | 加 `if (g.chePhase) return` 守卫 |
| 4 | `cheAction()` | 人类扯后没调 `startTurnTimer` | 加 `this.startTurnTimer()` |

## 优化
`activateChePhase`: 无人类能扯牌时 timeout 降为 800ms (原 3000ms)。

## 关键旗标生命周期
```
单张出牌 → activateChePhase(chePhase=true)
  ↓ 3s/0.8s 超时
endChePhase() → roundHasCheHappened=true → advanceTurn
  ↓ 全部 pass
collectPot() → roundHasCheHappened=false → 新一轮
```

**Why:** 扯牌是核心机制，服务端多个边界场景未覆盖导致死循环。
**How to apply:** 修改扯牌逻辑时检查 roundHasCheHappened 的 set/reset 配对。
