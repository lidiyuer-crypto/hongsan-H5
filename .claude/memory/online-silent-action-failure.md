---
name: online-silent-action-failure
description: 前端出牌静默失败 — doPlay 静默 return + 服务端错误不展示
metadata:
  type: project
---

# 前端出牌静默失败

## 现象
选牌 → 点"确认出牌" → 按钮零反应 → 用户以为卡死 → 30s 后服务端 auto pass → 循环。

## 根因

### doPlay() 5 处静默 return
```ts
if (sel.length === 0) return;                // 没选牌
if (!info) return;                            // 无效牌型
if (firstTurn && !valid) return;             // 首回合违规
if (lastValidPlay && !canBeat) return;       // 打不过场上牌
// ...submitPlay
```
每条路径都无反馈，用户完全不知道失败原因。

### 服务端 error 仅 console.warn
```ts
case 'action_result':
  console.warn(msg.error);  // 用户看不见
```

## 修复

### flashError toast
- 新增 `[toastMsg, setToastMsg]` state + `flashError(msg)` 函数
- toast UI: 浮动红色药丸 + toastIn 动画，2.5s 自动消失
- `doPlay` 每处 return 改为 `flashError('提示信息')`

### 服务端 Error 订阅
- `NetworkGameClient`: 新增 `errorListeners` Set + `onError()` 方法
- `action_result` error 触发 `errorListeners`
- `Game.tsx` 订阅 `networkClient.onError(msg => flashError(msg))`

### 防御
- `handleCheAction`: 加 `if (!gs?.lastValidPlay) return` 防 null

**Why:** 静默失败是游戏 UX 大忌。所有失败路径必须视觉反馈。
**How to apply:** 用户操作回调中，失败路径一律 toast/震动，不得静默 return。
