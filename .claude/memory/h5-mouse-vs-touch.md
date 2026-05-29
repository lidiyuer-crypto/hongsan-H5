---
name: h5-mouse-vs-touch
description: H5版需同时处理鼠标和触控事件 — 小程序仅触控，H5桌面用户用鼠标
metadata:
  type: reference
  originSessionId: fcaec1c4-e605-42a6-9cbd-25699630d75a
---

# H5 鼠标 vs 触控事件陷阱

## 问题
微信小程序只有触控事件（`touchstart/touchmove/touchend`），移植到H5后，桌面端用户用鼠标操作，但代码里只有 `onTouchStart/onTouchMove/onTouchEnd`。

桌面端点击牌 → 无反应（没有对应的鼠标事件处理器）。

## 修复方案
为所有触控事件补充对应的鼠标事件：

```typescript
// 触控（小程序原始）
onTouchStart → onHandTouchStart(e, idx)
onTouchMove  → onHandTouchMove(e)
onTouchEnd   → onHandTouchEnd(e)

// 鼠标（H5桌面端新增）
onMouseDown  → onCardMouseDown(e, idx)  // 对应touchstart
onMouseMove  → onHandMouseMove(e)      // 对应touchmove, 需检查 e.buttons & 1
onMouseUp    → onHandMouseUp(e)         // 对应touchend
onMouseLeave → onHandMouseUp(e)         // 鼠标移出=松手
```

## 关键差异

| 维度 | Touch | Mouse |
|------|-------|-------|
| 坐标 | `e.touches[0].pageX` | `e.pageX` |
| 按压状态 | 手指离开=结束 | `e.buttons & 1` 检测左键是否按下 |
| 取消 | touchcancel 事件 | mouseLeave 事件 |
| 多点 | `e.touches[]` 数组 | 单点（无多点鼠标） |

## 鼠标特有处理
```typescript
// mouseMove中必须检测左键是否仍按下
const onHandMouseMove = (e: React.MouseEvent) => {
  if (!(e.buttons & 1)) {  // 左键已松开 → 取消
    t._mouseActive = false;
    t.startIdx = null;
    return;
  }
  // ... 正常滑动选择逻辑
};
```

**Why:** 小程序只有触控场景，H5同时服务桌面和移动端。这是从原生小程序移植到H5的第一个"思维模式切换"——每处触控事件都要问"鼠标等效是什么？"

**How to apply:** 移植小程序触控逻辑到H5时，始终同时实现 touch 和 mouse 两套事件处理器。用 `_mouseActive` 标志区分当前是鼠标还是触控操作。`mousemove` 必须检查 `e.buttons & 1` 避免无按压状态下滑动。

[[h5-react-bubbling-selection]]
