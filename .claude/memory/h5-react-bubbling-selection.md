---
name: h5-react-bubbling-selection
description: React click事件冒泡导致选区被清除 — H5版等效于小程序catchtap="noop"
metadata:
  type: reference
  originSessionId: fcaec1c4-e605-42a6-9cbd-25699630d75a
---

# H5 React 事件冒泡与选区清除陷阱

## 问题
用户在牌上点击(mousedown)选中牌 → 牌弹起(selected状态生效) → 紧接着click事件冒泡到父容器 → 触发父容器的清空选区回调 → 牌缩回去。

时序：
```
mousedown on card → 选中牌, isSelected=true → UI弹出
click on card → 冒泡到 hand-scroll → onClick → onHandBgTap() → 清空所有isSelected
结果：牌弹起后立即缩回
```

## 根因
React 的 `click` 事件会沿DOM树冒泡。父容器 `hand-scroll` 上有 `onClick={onHandBgTap}` 用于点击手牌空白处清空选区。子元素 `card-wrapper` 上的 `mousedown` 选中牌后，随后的 `click` 冒泡触发了父容器的清空逻辑。

## 小程序对比
小程序用 `catchtap="noop"` 阻止事件冒泡：
```html
<!-- 小程序 — catchtap阻止冒泡 -->
<view class="hand-scroll" bindtap="onHandBgTap">
  <playing-card catchtap="noop" />  <!-- catchtap阻止冒泡到hand-scroll -->
</view>
```

H5 React 等效写法：
```jsx
// H5 React — stopPropagation阻止冒泡
<div className="hand-scroll" onClick={onHandBgTap}>
  <div className="card-wrapper" onClick={(e) => e.stopPropagation()}>
    {/* 牌内容 */}
  </div>
</div>
```

## 修复
在 `card-wrapper` 上加 `onClick={(e) => e.stopPropagation()}`：
```jsx
<div key={i} className={`card-wrapper ${isSel ? 'selected' : ''}`}
  onTouchStart={(e) => onHandTouchStart(e, i)}
  onMouseDown={(e) => onCardMouseDown(e, i)}
  onClick={(e) => e.stopPropagation()}>  {/* 阻止冒泡到hand-scroll的onClick */}
```

## 通用原则
小程序 `catchtap` 模式 → H5 等效：
| 小程序 | H5 React |
|--------|----------|
| `catchtap="noop"` | `onClick={e => e.stopPropagation()}` |
| `catchtap="handler"` | `onClick={e => { e.stopPropagation(); handler(); }}` |
| `bindtap="handler"` | `onClick={handler}` (正常冒泡) |

**Why:** 这是从WXML事件系统(catch/bind双机制)移植到React事件的"翻译陷阱"。小程序天然有catch(阻止冒泡)和bind(允许冒泡)两种绑定，H5 React只有onClick一种，需要手动stopPropagation模拟catch。

**How to apply:** 移植小程序WXML到H5 JSX时，检查所有 `catchtap` → 替换为 `onClick + stopPropagation`。特别检查：牌面、按钮、弹窗内部 — 这些通常需要阻止冒泡到父容器的清空选区或关闭弹窗逻辑。

[[h5-mouse-vs-touch]] [[polling-selection-conflict]] [[wechat-touch-event-pitfalls]]
