---
name: h5-config-passthrough-pipeline
description: H5配置字段传递管线 — 新配置字段必须触及6个位置，漏任一环节即静默失败
metadata:
  type: reference
  originSessionId: fcaec1c4-e605-42a6-9cbd-25699630d75a
---

# H5 配置字段传递管线

## 数据流
```
Room state  →  config对象  →  sessionStorage  →  Game init读取  →  GameUI interface  →  renderGameState()  →  JSX渲染
  ①             ②              ③                 ④                  ⑤                    ⑥                     ⑦
```

## 新增配置字段 checklist

以 `showHandCount` 为例，每一层都必须添加：

| # | 位置 | 文件 | 具体操作 |
|---|------|------|---------|
| ① | Room state | Room.tsx | `useState(savedConfig.showHandCount !== false)` |
| ② | config对象 | Room.tsx startGame() | `const config = { ..., showHandCount }` |
| ③ | sessionStorage | Room.tsx (自动) | `sessionStorage.setItem('roomConfig', ...)` 在Index.tsx中 |
| ④ | Game读取+默认值 | Game.tsx init | 读取sessionStorage + fallback: `showHandCount: true` |
| ⑤ | GameUI interface | Game.tsx | 添加字段类型定义 |
| ⑥ | renderGameState | Game.tsx | `data.showHandCount = gs.config?.showHandCount !== false` |
| ⑦ | JSX渲染 | Game.tsx | `{ui.showHandCount && ...}` 条件渲染 |

## 实际案例: showHandCount

```typescript
// ① Room.tsx — 状态
const [showHandCount, setShowHandCount] = useState(savedConfig.showHandCount !== false);

// ② Room.tsx — config对象
const config = { baseAmount, doubleType, smartShuffle, smartShuffleLevel, 
                 totalRounds: roundCount, showHandCount };

// ④ Game.tsx — 初始化读取(sessionStorage已存)
const savedConfig = JSON.parse(sessionStorage.getItem('roomConfig') || '{}');
// fallback在createGame config中:
engine.createGame(players, { ..., showHandCount: true });

// ⑤ Game.tsx — interface
interface GameUI { showHandCount: boolean; p1CardCount: number; ... }

// ⑥ Game.tsx — renderGameState
data.showHandCount = gs.config?.showHandCount !== false;
data.p1CardCount = p?.hand?.length || 0;

// ⑦ Game.tsx — JSX
{ui.showHandCount && p.cardCount > 0 && <span>{p.cardCount}</span>}
```

## 常见漏掉的位置
- **最易漏 #④**: 忘记在 fallback 默认值中添加新字段 → sessionStorage 无数据时字段为 undefined → 静默失败
- **次易漏 #⑤**: 忘记更新 interface → TypeScript 编译通过（inline style不检查）但值不渲染
- **易漏 #⑥**: renderGameState 忘记从 engine state 读取新字段填充到 UI

**Why:** 小程序版有云DB + setData的集中数据流，新字段只需加1-2处。H5版的sessionStorage管线分散在3个页面文件中，新字段需要手动在每个环节添加，漏任何一环都导致静默失败（不报错，功能不生效）。

**How to apply:** 每次在Room.tsx中新增配置项时，走完上面①②③④⑤⑥⑦的checklist。完成后在浏览器验证：清除sessionStorage → 创建房间 → 检查默认值 → 修改设置 → 进游戏 → 检查功能生效。

[[h5-project-overview]]
