# 找兄弟(红三/坨坨牌) H5版 · 产品需求文档

> 最后更新: 2026-05-29
> 版本: v1.1
> 状态: 开发中 — UI重构完成(浮动玻璃态)、拖拽选牌完善、实时番数统计

---

## 1. 项目概览

### 1.1 产品定位
微信小程序"找兄弟"的H5移植版。保留完整游戏逻辑，适配桌面+移动端浏览器，提供单机本地对战体验。

### 1.2 技术栈
| 层 | 技术 |
|---|------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 8 + Rolldown |
| 路由 | react-router-dom v7 |
| 样式 | Tailwind CSS 4 + 自定义 CSS 变量 |
| 状态 | zustand 5 (stores) + React useState |
| 引擎 | 纯 TypeScript 移植自小程序 engine/ |

### 1.3 代码规模
- 页面: 3个 (Index/Room/Game)
- 引擎: 6个JS模块 + 1个barrel (gameEngine/analyzer/scoring/deck/victory/constants)
- Store: 1个 (gameStore.ts)
- CSS: ~600行设计系统 + 浮动玻璃态
- 总计: ~2500行 TypeScript + JSX + CSS

---

## 2. 游戏机制 (继承自小程序版，完整保留)

### 2.1 基本规则
- 4人局，2v2组队 (红三阵营 vs 黑三阵营)
- 52张牌 (4-16点，4花色，不要A/2/3)
- 红桃4首轮出牌权
- 逆时针轮转

### 2.2 阵营判定 (assignTeams)
- 手牌中持1张红三(红心3或方片3) → 红三阵营
- 持2张红三 → 业务玩家 (1v3模式)
- 无红三 → 黑三阵营

### 2.3 牌型
| 类型 | 说明 |
|------|------|
| 单张 | 1张 |
| 对子 | 2张同点 |
| 顺子 | ≥5张连续 (4-K, 最大14-16算特殊) |
| 炸弹(普通) | 3张同点 |
| 氢弹 | 4张同点 |
| 扯牌 | 2张与上轮同点的牌 — 仅出牌后首轮响应 |

### 2.4 扯牌机制
- 某人出牌后，回合中第一轮为扯牌窗口
- 其他人可用2张同点牌"扯走"出牌权
- 自扯: 打出3张炸弹时若无上轮validPlay，可选炸弹或扯牌
- 氢弹(4张)可压扯牌

### 2.5 进贡
- 1-3名同队 → 胜队 +5分
- 2-4名同队 → 胜队 +5分
- 每局开始前独立评估

### 2.6 坨坨牌 (smartShuffle)
五级分级发牌算法，让每手牌都有"战斗力":
- Lv1: 基础对子分布
- Lv2-Lv4: 递增炸弹/氢弹概率
- Lv5: 最高级别，极致炸弹密度

### 2.7 番数计算
- 普通炸弹(3张同点): +1番
- 氢弹(4张同点): +2番
- 双关: +1番
- 业务胜利: +N番 (N=被关人数)
- 三家逃脱(非业务玩家胜利): +3番
- 平翻: `base × (1 + fans)`
- 陡翻: `base × 2^fans`

### 2.8 身份揭示 (5种情况逐玩家逻辑)
不统一开关，根据视角玩家手牌和场上已打红三逐玩家计算 `revealed`:
1. 业务玩家 → 全员 revealed=true
2. 非业务看业务玩家 → 按业务打出红三数暴露
3. 红三队成员 → 只暴露已打红三的队友
4. 黑队成员 → ≥2红三成员暴露后全员
5. 自己永远可见自己

---

## 3. 项目架构

### 3.1 目录结构
```
红三-H5/
├── src/
│   ├── main.tsx           # 入口
│   ├── App.tsx            # 路由: / → /room/:code → /game/:id
│   ├── index.css          # 暖暗游戏厅设计系统 (~560行)
│   ├── pages/
│   │   ├── Index.tsx      # 首页 (~280行)
│   │   ├── Room.tsx       # 房间页 (~360行)
│   │   └── Game.tsx       # 游戏页 (~1350行)
│   ├── engine/
│   │   └── (小程序 engine/ 的 TS 复刻，挂载到 engine.ts)
│   ├── lib/
│   │   └── engine.ts      # 游戏引擎 (纯逻辑，无UI依赖)
│   └── stores/
│       └── gameStore.ts   # zustand store
├── design-demo/
│   └── warm-game-room.html # 设计原型 (视觉参考)
├── docs/
│   └── PRD.md             # 本文档
├── package.json
└── vite.config.ts
```

### 3.2 路由设计
| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | Index | 首页 — 创建/加入房间 |
| `/room/:roomCode` | Room | 房间页 — 配置+座位+开始 |
| `/game/:gameId` | Game | 游戏页 — 核心对战 |

### 3.3 数据流 (本地单机模式)
```
Index → sessionStorage('roomConfig') → Room
Room → new GameEngine() → sessionStorage('localGame') → Game
Game → engine.getStateForPlayer(0) → renderGameState() → setGameUI()
```

### 3.4 关键设计决策
- **单文件 engine.ts**: 将小程序 engine/ 下6个模块合并为1个 TS 文件，减少模块间依赖复杂度
- **gameUI 单状态对象**: 镜像小程序的 `this.data` 模式，一个 `renderGameState()` 组装所有 UI 数据
- **inline style**: 所有组件使用 inline style + CSS 变量，避免 CSS Modules 的命名冲突和动态样式问题
- **单机本地模式**: 无后端、无数据库、无云函数，4人全是本地 (1人类 + 3 bot)

---

## 4. 设计系统 — "暖暗游戏厅"

### 4.1 品牌关键词
暖暗 / 琥珀灯 / 年轻化 / 简约 / 油圈

### 4.2 色彩体系
```
底色    #1a1510  bg-deep      (暖棕黑)
表面    #24201a  bg-surface   (暖深棕)
卡片    #2c2720  bg-card      (中棕)
悬浮    #322d26  bg-elevated  (浅棕)
主文字  #e8e0d5  ink-primary  (暖奶油)
次文字  #8a8070  ink-secondary (暖灰)
弱文字  #5c564c  ink-dim      (深暖灰)

强调    #f0a828  accent       (琥珀灯黄)
强调光  rgba(240,168,40,0.18) accent-glow
强调柔  rgba(240,168,40,0.08) accent-soft

成功    #7ab87e  green        (哑绿)
失败    #c46b6b  red          (哑红)

牌面    #f5ede0  card-face    (暖奶油)
红牌    #c0392b  card-red
黑牌    #2c2c2c  card-black
```

### 4.3 响应式策略
使用 `clamp(min, preferred, max)` 实现桌面+移动端自适应:
- 字号: `--fs-xs` ~ `--fs-xl`，`clamp(10px, 1.5vmin, 12px)` 等
- 牌宽: `--card-w: clamp(42px, 11vmin, 68px)` — 手机~42px，桌面~68px
- 牌高: `calc(var(--card-w) * 1.42)` — 保持比例
- 出牌位牌: `--play-card-w: clamp(44px, 11vmin, 64px)`
- 迷你牌: `--mini-card-w: clamp(36px, 8vmin, 54px)`

### 4.4 通用组件类
- `.btn-game` — 通用按钮 (inline-flex + transition + active缩放)
- `.btn-primary` — 琥珀渐变主按钮
- `.btn-secondary` — 卡片色次要按钮
- `.btn-ghost` — 透明幽灵按钮
- `.tag` / `.tag-red3` / `.tag-black3` / `.tag-solo` — 标签
- `.card-face-el` — 牌面渲染 (暖奶油底色, `position: relative`, 点数左上角绝对定位)
- `.card-back-el` — 牌背渲染 (深蓝灰渐变, 手牌计数嵌入牌背中央)
- `.avatar-ring` — 玩家头像环 (含 `.turn-active` 脉冲动画)
- `.opponent-cluster` — 对手信息容器 (flex row, 手牌扇面+头像+信息)
- `.opponent-hand-fan` — 对手手牌扇面 (负边距重叠, 支持 row-reverse)
- `.pot-chip` — 章子暗玻璃药丸 (`rgba(240,168,40,0.06)` 背景)
- `.counter-pill` — 桌面计数器药丸 (统一尺寸 `min-width: 90px; min-height: 28px`)
- `.table-counters` — 桌面计数器容器 (position: absolute, 左上角贴边)
- `.turn-timer-bar` — 回合计时条 (底部, 颜色分段: 金→橙→红)

---

## 5. 页面功能清单

### 5.1 首页 (Index.tsx)
- [x] Logo 标题 — 渐变文字 (暖金 → 琥珀 → 深铜)
- [x] 头像昵称设置 — 本地存储到 sessionStorage
- [x] 创建房间 — 弹窗配置 (底注/翻法/坨坨牌/局数)
- [x] 加入房间 — 输入4位房号
- [x] 开发者模式 — 8/16/24局快速测试

### 5.2 房间页 (Room.tsx)
- [x] 顶部栏 — 房号(琥珀色大字) + 钻石余额
- [x] 左侧设置卡片 — 底注Stepper / 翻法切换 / 坨坨牌Toggle+级别 / 局数Grid / 消耗
- [x] 右侧座位网格 — 2×2圆形头像 + Ready状态 + 房主/Bot标签
- [x] 操作按钮 — 添加电脑 / 开始游戏 / 离开
- [x] 配置500ms防抖保存 (本地 sessionStorage)

### 5.3 游戏页 (Game.tsx) — ~1500行
- [x] 完整flex分区布局: top-zone / middle-zone / bottom-zone
- [x] **浮动玻璃态玩家信息** — 3个对手统一 `renderOpponent` 渲染，头像光环+手牌扇面+章子芯片
- [x] 手牌扇面 — 负边距重叠排列, 左侧玩家(A)手牌在右(row-reverse), 计数嵌入牌背中央
- [x] 4个出牌位 (play-slots) — 绝对定位，含"不要"/"扯!"标签
- [x] 对手手牌 — mini卡面 / 牌背切换, `--mini-card-w: clamp(36px, 8vmin, 54px)`
- [x] 手牌区 — 重叠排列 + **touch/mouse toggle拖拽选牌** (从选中牌拖→取消选中, 从未选中牌拖→加选)
- [x] 控制栏 — 出牌/过牌/提示/托管按钮
- [x] 扯牌阶段 — 倒计时条 + 抢扯/不抢扯按钮 + 自扯弹窗
- [x] **回合计时器** — 30秒底部计时条, 颜色分段: ≥50%金色 / 20-50%橙色 / <20%红色
- [x] 托管模式 — 自动出牌 (最小可用牌型)
- [x] 提示系统 — generateAllValidPlays循环提示
- [x] **实时番数统计** — 左上角 `🔥 N 番` 计数器, 从 roundHistory 实时计算 (炸弹+1, 氢弹+2), 始终显示含0番
- [x] **桌面张子计数** — 左上角 `🂠 N 桌上张子` 计数器, 牌背图标
- [x] 历史牌堆 — 中心区域显示已完成回合的牌
- [x] pass闪烁 — pendingCollect阶段的"不要"动画
- [x] **牌面点数左上角布局** — 绝对定位, `calc(var(--xxx-w) * 比例)` 等比缩放适配窗口
- [x] 结算弹窗 — 双栏布局 (战况 + 结算明细 + 番数拆解)
- [x] 积分面板 — 累积积分排名
- [x] 多局制 — 准备→下一局→最终结算 完整流程
- [x] 身份徽章 — 红三队/黑三队/业务/未知 标签
- [x] 排名徽章 — 1-4名渐变色 + 被关红色
- [x] 选中牌琥珀光晕 — `boxShadow: 0 6px 18px var(--accent-glow)` + `translateY(-8px)`

---

## 6. 引擎模块 (engine.ts)

从微信小程序 `miniprogram/engine/` 完整移植:

| 源文件 | 功能 | 移植状态 |
|--------|------|---------|
| constants.js | 牌型/权重常量 | ✅ 完整 |
| card.js | Card类 (含 isH4/isRed3) | ✅ 完整 |
| analyzer.js | 牌型判定 + canBeat + generateAllValidPlays | ✅ 完整 |
| deck.js | 发牌 + smartShuffle + assignTeams | ✅ 完整 |
| gameEngine.js | 核心引擎 (回合/扯牌/进贡/多局制) | ✅ 完整 |
| scoring.js | 番数/金额计算 | ✅ 完整 |

### 6.1 引擎关键API
```typescript
class GameEngine {
  createGame(players, config)      // 初始化游戏
  playCards(playerId, cards, ...)  // 出牌
  passTurn(playerId)               // 过牌
  endChePhase()                    // 扯牌超时
  getStateForPlayer(playerId)      // 获取玩家视角状态
  nextRound()                      // 下一局
  onChange(callback)               // 注册状态变更回调
}
```

---

## 7. UI交互系统

### 7.1 拖拽选牌 (Touch + Mouse 双事件)
- **Toggle拖拽**: 从选中牌拖起→范围内取消选中; 从未选中牌拖起→范围内选中
- **cardStep计算**: 通过 `getBoundingClientRect()` 取第1、2张牌真实像素差
- **防合成click误清**: touchend后 ~300ms 合成click → `dragEndTime` + 400ms guard
- **加选保护**: 拖拽范围外保持 `c.isSelected`, 不覆盖之前的选区

### 7.2 牌面点数缩放
- 字体使用 `calc(var(--xxx-w) * 比例)` 与牌面等比缩放
- mini: rank `0.28`, suit `0.18`; normal: rank `0.28`, suit `0.18`; large: rank `0.32`, suit `0.20`
- 窗口缩小时点数保持清晰可辨

### 7.3 计时器
- 位置: 底部 (`bottom: 0`), 高度 4px
- 颜色: ≥50%金色 → 20-50%橙色 → <20%红色 (0.3s过渡动画)
- 超时自动 pass 或出最小可用牌型

### 7.4 实时番数统计
- 数据源: `gameState.roundHistory`, 遍历累加 BOMB(+1) / H_BOMB(+2)
- 位置: 左上角 `table-counters` 容器内
- 始终显示 (含 0 番), 与桌面张子计数器并排

---
## 8. 已知限制 & 待开发

### 8.1 当前限制
- **纯单机模式**: 无后端、无网络同步、无多人对战
- **Bot AI**: 基础AI (单张最小压/最大保、对子顺序搜索、炸弹级联)
- **无经济系统**: 无虚拟币、无充值、无消耗扣除
- **无账号系统**: 头像昵称仅存储于 sessionStorage

### 8.2 计划中的功能
- [ ] 联网版后端 (Node.js/WebSocket)
- [ ] 房间码真随机 + 房间管理
- [ ] 用户系统 (注册/登录/积分)
- [ ] Bot AI升级 (蒙特卡洛/胜率评估)
- [ ] 音效系统 (出牌/炸弹/扯牌)
- [ ] 动画增强 (牌飞行动画/粒子特效)
- [ ] PWA 支持 (离线可用/添加到桌面)
- [ ] NAS 部署方案

---

## 9. 开发环境

```bash
# 安装
npm install

# 开发服务器 (http://localhost:5173)
npm run dev

# 类型检查 + 构建
npm run build

# 预览构建产物
npm run preview
```

---

## 10. 与小程序版的差异

| 方面 | 微信小程序 | H5版 |
|------|----------|------|
| 框架 | 原生 WXML/WXSS/JS | React 19 + TypeScript |
| 后端 | 微信云开发 (云函数+DB) | 无 (纯前端单机) |
| 联网 | 云DB watch实时同步 | 无 |
| 支付 | 微信支付 | 无 |
| 样式 | rpx/vmin 横屏适配 | CSS clamp() 响应式 |
| 引擎 | 6个独立JS模块 | 1个合并TS文件 |
| 设计 | 绿色金边暗色 | 暖暗棕琥珀色 |
| 选牌 | 微信touch事件 | DOM touch+mouse事件 |
| 组件 | playing-card 自定义组件 | React inline style |

---

## 11. 相关文档索引

- 微信小程序版 PRD: `../红三/docs/superpowers/specs/2026-05-25-zhaoxiongdi-app-design.md`
- 微信小程序版 Plan: `../红三/docs/superpowers/plans/2026-05-25-zhaoxiongdi-app-plan.md`
- 小程序 CLAUDE.md: `../红三/CLAUDE.md`
- 设计原型: `design-demo/warm-game-room.html`
- Memory 系统: `~/.claude/projects/f-------Vibecoding---/memory/`
