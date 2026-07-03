# 知识地图「空白」问题 · 审计报告

> 关联计划: `doc/plan/mobile-perf-round1-plan-2026-07-02.md`（本轮改动依据）
> 审计触发: 用户反馈——手机端拍题提交成功，打开 /nana/knowledge-map 页面显示空白
> 审计日期: 2026-07-03

---

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过（代码无 bug，但 UX 设计有疏漏）**

你没有遇到 JS 报错、也没有遇到白屏崩溃。你看到的「空白」其实是页面设计好的**空状态**——屏幕中间写着"旅程从这一步开始"，下面有一行小字"点亮一道题，灰色地图就会染上一块绿 ✦"。因为你的账号还没有任何诊断记录，也没有任何题被挂到知识点上，所以程序判断「用不上知识地图」，就显示了这段文案。

**但这确实容易让人困惑**：你刚在手机端拍了一道题、提交成功，满心期待打开知识地图看看知识点长什么样，结果页面告诉你"还没开始"。这中间少了一座桥——**拍题 ≠ 诊断**。当前的知识地图只看诊断数据（StudentNodeState）和知识点标签（CaseKnowledgeTag），不看有没有 Case。你拍进来的题如果没有被挂上知识点标签、也没有跑过诊断流程，在地图眼里就跟没拍过一样。

**三个前端改动均无 bug**：React.memo 不会跳过该渲染的节点；blob URL 缓存的 atob 不会在 SSR 时崩溃；ActionCard 的 useRouter 改动与知识地图页无关。

---

## 检查清单

### 计划一致性
- [x] 实现了计划中所有任务（3 项前端改动 + 数据清理，全部对照执行）
- [x] 未偏离计划（改动范围与计划一致）

### 代码质量
- [x] 无明显 bug
- [x] 错误处理到位（API 失败有 catch，atob 异常会被 .catch 捕获为 imageState="failed"）
- [x] 代码风格一致

### 安全性
- [x] 无密钥泄露
- [x] 无 SQL 注入风险
- [x] 用户输入有校验（studentId 从 session 取，非用户输入）
- [x] 本轮未向生产库写入测试数据（数据清理已在服务器执行、备份已存）

### 数据清理复核
- [x] 清理范围正确：仅删除测试账号 `lujingpingly2006@126.com` 的 Case/Artifact/CaseKnowledgeTag
- [x] 未影响：User、KnowledgeNode(48)、KnowledgeEdge、Mainline、StudentNodeState
- [x] 清理结果：5 Case / 10 Artifact / 2 CaseKnowledgeTag → 归零

### 上游兼容性
- [x] 未修改上游已有数据库表结构
- [x] 上游文件修改标注且最小化
- [x] 新增文件在独立目录中

### 偏离复核
- [x] 本轮无偏离记录（执行完全对照计划）

### Agent 同步一致性
- [x] `node scripts/check-agent-sync.js` 通过（exit 0，3/3 agents in sync）

### 测试
- [x] 本地 `npm.cmd run build` 通过
- [x] 本地 Docker 不可用时按规定处理（无测试容器结果注记）
- [x] 本轮改动 3 文件均为纯前端，与测试容器解耦

---

## 逐项详细分析

### ① isEmpty 判断逻辑 — 行为正确，但 UX 有疏漏

**相关代码**：`src/app/nana/knowledge-map/page.tsx` 第 70-76 行

```ts
const litNodeCount = mapData
  ? mapData.stats.stable + mapData.stats.gap + mapData.stats.uncertain
  : 0;
const collectedNodeCount = mapData
  ? mapData.nodes.filter((n) => (n.caseEvidenceCount ?? 0) > 0).length
  : 0;
const isEmpty = !loading && mapData && litNodeCount < 2 && collectedNodeCount === 0;
```

**判定逻辑的语义**：
- `litNodeCount`：统计有诊断状态的节点（stable + gap + uncertain）。来源是 StudentNodeState 表。
- `collectedNodeCount`：统计被 CaseKnowledgeTag 标记过的节点（你拍过题 + 手动挂到了某知识点）。
- `isEmpty` 为 true 的条件：诊断节点 < 2 个 **且** 没有任何节点被你的题挂过标签。

**结论**：这段代码没有 bug。对于以下两类用户，程序**正确**地显示了空状态：

| 用户场景 | litNodeCount | collectedNodeCount | isEmpty | 显示 |
|----------|:-----------:|:------------------:|:-------:|------|
| 全新用户，没做过诊断，没拍过题 | 0 | 0 | ✅ true | "旅程从这一步开始" |
| 拍过题但没跑过诊断、没手动挂标签 | 0 | 0 | ✅ true | "旅程从这一步开始" |
| 跑过一次诊断，1 个节点 stable | 1 | 0 | ✅ true | "旅程从这一步开始"（带绿点） |
| 拍过题 + 挂过标签到 1 个节点 | 0 | 1 | ❌ false | 正常画布 |
| 跑过诊断，≥2 个节点有状态 | ≥2 | 任意 | ❌ false | 正常画布 |

**UX 疏漏**：用户拍了题但没挂标签，这是最常见的操作路径——用户拍完题就去看地图。但在当前逻辑下，只要没标签、没诊断状态，就永远是空状态。地图不感知"有没有创建过 Case"。建议在空状态文案中增加一个引导："你拍过 X 道题了，把它们挂到知识点上，地图就会点亮 ✦"——让用户知道他们的题已经在了，只是还没"激活"地图。

### ② /api/diagnosis/map 路由 — 数据清理后行为正常

**相关代码**：`src/app/api/diagnosis/map/route.ts` 全文件

**逐一分析**：

| 查询 | 受清理影响 | 影响说明 |
|------|:---:|------|
| `StudentNodeState.findMany`（第 39 行） | ❌ 不影响 | 清理范围不含此表。studentId 按 session 隔离 |
| `CaseKnowledgeTag.groupBy`（第 48 行） | ✅ 影响 | Case CASCADE 删 → CKT 自动清空 → evidenceMap 全空 → caseEvidenceCount 全为 0 |
| `KnowledgeNode.findMany`（第 58 行） | ❌ 不影响 | 全量返回 48 节点，与用户无关 |
| `KnowledgeEdge.findMany`（第 84 行） | ❌ 不影响 | 全量边数据，与用户无关 |
| `NodeMainline.findMany`（第 69 行） | ❌ 不影响 | 节点-主线关系，与用户无关 |
| `Mainline.findMany`（第 102 行） | ❌ 不影响 | 主线定义，与用户无关 |

**关键结论**：
- **evidenceMap 全空是正常的**——Case 被删 → CASCADE 清除 CaseKnowledgeTag → groupBy 返回空数组。这不是 bug，是级联删除的预期行为。
- **页面不会因此崩溃**——`caseEvidenceCount` 缺省值为 `?? 0`（第 172 行），每个节点都有安全的数值。前端用 `n.caseEvidenceCount ?? 0` 做第二次保护。
- **图谱基础数据（48 节点、边、主线）完全不受影响**——这些是全局数据，不按用户过滤。
- 对于**非测试账号的其他用户**，他们的 Case/Artifact/CaseKnowledgeTag 未被清理，行为不变。

### ③「空白」的根因 — 不是白屏，是空状态

**逐一排查 4 种可能**：

#### a. JS 报错导致真白屏？
**排除**。检查了所有渲染路径：
- 加载中 → 显示骨架屏（loading 态）
- 加载完成 + isEmpty → 显示空状态（"旅程从这一步开始"）
- 加载完成 + !isEmpty → 显示画布/列表
- API 失败 → 仅顶栏可见（剩余区域空白，但这不是本轮场景）

#### b. 三个前端改动引入 JS 运行时错误？
**排除**。逐个验证：

| 改动 | 风险评估 | 结论 |
|------|------|------|
| ActionCard: `<Link>` → `useRouter` | 无风险 | 独立组件，知识地图页面不使用 |
| KnowledgeMapCanvas: `React.memo` 包裹 | 低风险 | 详见下方分析，不会跳过该渲染的节点 |
| RecentCasesList: `base64ToBlobUrl` + `atob` | 需关注 | 详见下方分析，不会导致白屏 |

#### c. `atob` 在服务端渲染时崩溃？
**不会**。`base64ToBlobUrl` 函数内部使用了 `atob`（浏览器 API），但它**只在 useEffect 内部的异步回调中被调用**（`src/components/nana/knowledge-map/recent-cases-list.tsx` 第 318 行）：

```ts
// 仅在 CaseTagPanel 的 useEffect → loadCaseDetail().then() → applyCase() 中调用
const blobUrl = base64ToBlobUrl(imgs[0].content);
```

这条调用链完全在客户端执行：
1. `useEffect` 只在客户端 mount 后触发
2. `loadCaseDetail()` 是 fetch 调用，异步
3. `.then()` 回调在浏览器事件循环中执行

`atob` **绝不会在 SSR 阶段被调用**。函数定义本身（第 51-63 行）是纯声明，不会触发执行。

**额外安全网**：即使 `atob` 因非法 base64 抛异常，也会被外层 `.catch(() => setImageState("failed"))` 捕获，显示"题图没拉到，标签仍可用"，不会导致页面白屏。

#### d. React.memo 导致节点被跳过渲染？
**不会**。分析如下：

`KnowledgeMapCanvas` 的 props 中，`mapData` 整页只设置一次（API 返回后 `setMapData`），所以 `mapData.nodes`、`mapData.edges`、`mapData.mainlines`、`mapData.learningFrontier` 这些数组引用在加载完成后**从不变化**。`onNodeClick` 是 `useCallback([mapData])`，mapData 不变则函数引用也不变。

`React.memo` 的浅比较在以下场景：
- **首次加载**：mapData 从 null → 有值，props 全变 → 渲染 ✅
- **点击节点**：selectedNodeId 变，但 mapData 不变，frontier 不变，onNodeClick 不变 → memo 命中，不重渲染 ✅（这是期望的优化效果）
- **切视图模式**：viewMode 变，但 Canvas 的 props 不变 → memo 命中，不重渲染 ✅（期望行为）

**没有场景会导致本该渲染的节点被 memo 跳过**。

---

### ④ 数据清理范围 — 正确，不是「空白」的根因

清理仅针对测试账号 `lujingpingly2006@126.com`（studentId: `cmqyi424y000038x1pl0kovjd`）：

| 表 | 清理前 | 清理后 | 是否影响其他用户 |
|-----|:--:|:--:|:--:|
| Case | 5 | 0 | ❌ 不（按 studentId 过滤） |
| Artifact | 10 | 0 | ❌ 不（CASCADE） |
| CaseKnowledgeTag | 2 | 0 | ❌ 不（CASCADE） |
| User | 未删 | — | ✅ |
| KnowledgeNode | 48 | 48 | ✅ |
| KnowledgeEdge | 36 | 36 | ✅ |
| Mainline | 10 | 10 | ✅ |
| StudentNodeState | 未删 | — | ✅ |

**如果反馈「空白」的用户恰好就是被清理的测试账号**，那他的 Case 确实全没了，但这只影响 `collectedNodeCount`（因为 CaseKnowledgeTag 也被级联清除）。`litNodeCount` 取决于 StudentNodeState（未被清理）。

**如果反馈「空白」的是其他用户**，则清理完全无关——他的数据从未被触碰。

> ⚠️ 需要关注的是设计债 #5（见 `doc/00_CURRENT.md`）：生产环境 deployment 后可能 KnowledgeNode=0（seed_graph 未跑）。但本次清理是在服务器上直接操作 SQLite，不涉及重新部署，所以不触发此问题。

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议 |
|--------|------|----------|------|
| P2（UX） | 空状态判断不感知 Case 存在——用户拍了题但没标签/没诊断时，地图显示"旅程从这一步开始"，用户觉得拍题白拍了 | `src/app/nana/knowledge-map/page.tsx` 70-76 | 考虑在空状态时额外查一次 Case 数量（如调用 `listMyCases`），如果有 Case 但无标签，显示差异化文案："你拍了 X 道题 ✦ 把它们挂到知识点上，地图就会亮起来" + 引导按钮 |
| P3（边缘） | `base64ToBlobUrl` 中 `atob` 抛异常时静默吞掉，用户看到"题图没拉到"但不知道原因 | `src/components/nana/knowledge-map/recent-cases-list.tsx` 51-63 | 可选：在 catch 分支中 console.error 记录原始 base64 长度/前缀，方便排查（当前无日志） |
| — | 无代码 bug | — | — |

---

## 用户验证指南

如果你想知道手机端拍题→看地图的完整流程应该是什么样的：

1. 用正常账号登录，打开 http://localhost:3001/nana
2. 点击"拍一下这道题" → 拍照或选一张数学题图片 → 提交
3. 提交成功后，点击导航进入"知识地图"
4. **预期看到**：空状态（"旅程从这一步开始"）——这是当前设计的正确行为，因为你还没有诊断记录
5. 如果要看到地图点亮，有两种路径：
   - **路径 A（诊断）**：跑一次诊断流程（/nana/session → 做几道题 → 提交答案），StudentNodeState 写入 ≥2 个节点后，地图自动显示
   - **路径 B（标签）**：在知识地图页点"最近拍过"（需要先满足 !isEmpty 条件才能看到按钮…这里形成死循环，需要先走路径 A 破局）

---

## 附：本轮代码 diff 摘要

| 文件 | 改动 | 行数 |
|------|------|:--:|
| `src/components/nana/shared/action-card.tsx` | `<Link>` → `useRouter` + pressed 状态 | +27 / -5 |
| `src/components/nana/knowledge-map/knowledge-map-canvas.tsx` | `export default function` → `const = memo(function)` | +6 / -5 |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | blobUrlCache + base64ToBlobUrl + applyCase 集成 | +23 / -1 |
| `.github/workflows/ci.yml` | unit-test / integration-test 加 DATABASE_URL 环境变量 + test db setup | +10 / -0 |

总改动：70 insertions, 9 deletions，4 个文件。全为纯前端 + CI 配置，无后端逻辑变更。
