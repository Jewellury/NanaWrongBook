# 知识地图（Phase 2）· 审计报告

> 关联计划: doc/plan/nana-phase2-execution-plan.md
> 执行日志: doc/executionlog/nana-phase2-execution-log.md
> 审计日期: 2026-06-28
> 审计范围: Commit ① `fe79bd5` → Commit ② `cfc60de`（含中间 docs commit `fbe8d10`）

---

## 审计结论（大白话）

**总体判定：✅ 通过**

这轮代码质量很高。知识地图页面可以正常渲染、三态节点（绿发光/蓝虚线/灰）都正确显示、点击节点能弹出详情卡、措辞全部符合"前台不评判"的 P4 要求、没有零新依赖、没有改上游表结构、布局算法有完整的 9 个单元测试。

有两个很小的代码问题（死变量未清理）但不影响功能，建议下轮顺手修掉。

---

## 检查清单

### 计划一致性
- [x] 实现了计划中所有任务
  - Commit ①：map API 扩展（edges + mainlines + 详情卡字段）✅ | 页面框架（顶栏/图例/画布容器/空状态）✅ | API 客户端更新 ✅ | 集成测试更新 ✅
  - Commit ②：SVG 画布渲染 ✅ | 节点交互（点击弹详情）✅ | 详情卡组件 ✅ | 布局算法单元测试 9 个 ✅
- [x] 未偏离计划（偏离已记录且合理——见"偏离复核"）

### 代码质量
- [x] 无明显 bug
- [x] 错误处理到位（API 层 try-catch + 内错处理；页面层 fetch 错误 catch + 加载态 + 空状态）
- [x] 代码风格一致（与项目现有模式匹配：纯函数可测、类型定义收敛、useMemo 优化）

**发现 2 个小问题**（见"问题清单"）：

| 严重度 | 问题 | 所在文件 | 建议 |
|--------|------|----------|------|
| P2 | `isSelected` 变量声明但未使用 | `knowledge-map-canvas.tsx:157` | 删除该行 |
| P2 | `pos` 回调函数声明但从未调用 | `knowledge-map-canvas.tsx:93-96` | 删除或用于 lookup |

### 安全性
- [x] API 有 `getServerSession(authOptions)` 鉴权守卫
- [x] 无密钥泄露（PR #2 没有 .env 等敏感文件）
- [x] 用户输入有校验（studentId 必填校验）
- [x] 本轮未向生产库写入测试数据（测试均以 `DATABASE_URL=file:./data/test/test.db` 运行）

### 偏离复核（执行日志中 2 条偏离记录）

| # | 计划原内容 | 实际做了什么 | 复核结论 |
|---|-----------|-------------|----------|
| 1 | `knowledge-node.tsx` 为独立组件 | 节点渲染内联在 canvas 中 | ✅ **属实微调**。节点是纯 SVG `<g>` 组合，无独立状态/逻辑，分离反而增加 props 传递和测试复杂度 |
| 2 | 布局算法内联在 canvas 中 | 提取为独立 `knowledge-map-layout.ts` 纯函数模块 | ✅ **属实微调**。提取纯函数模块方便单元测试（9 个测试已覆盖），符合项目已有模式 |

另有一处**未记录但合理的微调**：
- 空状态判定条件：计划说"只有 0-1 个 stable 节点"，实际代码判断 `litNodeCount < 2`，其中 `litNodeCount = stable + gap + uncertain`。这比计划更合理（gap/uncertain 节点也是"已经碰过"的知识点），不影响用户体验。

**结论：所有偏离均在验收标准内，未发现"实为大偏离"的情况。**

### 上游兼容性
- [x] 未修改上游已有数据库表结构（铁律 3 恪守）
- [x] 上游文件修改已标注且最小化（仅测试文件和 API 客户端文件，且均为 nana 命名空间下的文件）
- [x] 新增文件在独立目录中（`src/app/nana/knowledge-map/`、`src/components/nana/knowledge-map/`）

### Agent 同步一致性
- [x] **已跳过**（按审计要求）

### 测试
- [x] **布局算法单元测试**：9 个测试全部通过 ✅
  - 空数据/单节点/多节点垂直/多列/节点顺序/其他列/多主线归属/主线名称/列号排序
- [x] **map API 集成测试**：17 个测试全部通过 ✅（含新增的 edges/mainlines/详情卡字段断言 + mainlineId 过滤测试）
- [x] 测试在安全路径运行：均以 `DATABASE_URL="file:./data/test/test.db"` 在测试容器环境运行
- [x] DB 护栏断言存在且已生效（测试首次运行时 guard-db 拦截了无 DATABASE_URL 的情况）
- [ ] **Docker 测试容器**：未运行（执行日志已标注跳过，不影响核心验证）

### Build
- [x] `npx.cmd next build` 通过 ✅（exit code 0，所有 54 个页面 + middleware 编译成功，包括 `/nana/knowledge-map`）

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P2 | `const isSelected = false;` 声明后从未使用 | `src/components/nana/knowledge-map/knowledge-map-canvas.tsx:157` | 删除该行（该变量是计划预留的选中态，目前由外层 `page.tsx` 通过 `selectedNodeId` 管理） |
| P2 | `const pos = useCallback((nodeId) => positions.get(nodeId), [positions])` 定义后从未被调用，`renderedEdges` 和 `renderedNodes` 均直接使用 `positions.get()` | `src/components/nana/knowledge-map/knowledge-map-canvas.tsx:93-96` | 删除该回调，或将其用于 lookup（用 `pos(nodeId)` 替换 `positions.get(nodeId)`） |

以上均为死代码，不影响功能。建议下轮开发时随手清理。

---

## P4 措辞合规专项检查

| 位置 | 使用的措辞 | 结果 |
|------|-----------|:----:|
| 图例 | "已点亮" / "下一个" / "未探索" | ✅ |
| 标题 | "你已经点亮了 N 个光点 ✦" | ✅ |
| 空状态标题 | "旅程从这一步开始" | ✅ |
| 空状态副标题 | "点亮一道题，灰色地图就会染上一块绿 ✦" | ✅ |
| 详情卡 - 前沿提示 | "下一个要攻克的知识点" | ✅ |
| 详情卡 - 未探索提示 | "还没走到这里" | ✅ |
| 详情卡 - 日期前缀 | "最近一次确认是在..." | ✅ |
| 详情卡 - masteryProb | 不显示（接口传入但渲染不输出） | ✅ |
| SVB 节点标签 - 前沿 | "下一个"（SVG 中 blue node 上方） | ✅ |
| 禁用词出现情况 | 未出现"掌握概率""未掌握""薄弱点""正确率""错""失败""得分" | ✅ |

---

## 文件级审查要点

### `src/app/api/diagnosis/map/route.ts`
- edges 来自 `prisma.knowledgeEdge.findMany()` 直接查询 ✅（不经过 `KnowledgeGraph`，符合计划要求）
- mainlineId 过滤 edges 使用两端均在 nodes 集合内的过滤逻辑 ✅
- 响应包含 edges + mainlines + 详情卡字段（judgeCriteria/sampleItem/teachingNotes/lastEvidence）✅
- 鉴权守卫 `getServerSession(authOptions)` ✅
- 节点 `masteryProb` 虽然返回但前端不展示（前端传递但不渲染）✅

### `src/app/nana/knowledge-map/page.tsx`
- 三态图例正确 ✅
- 空状态检测含绿点 + 文案 ✅
- 节点点击事件：稳定→弹出；前沿→弹出"下一个"提示；未探索→静默忽略 ✅
- `selectedDetail` 传递 `masteryProb` 给 `KnowledgeDetailCard`，但卡片不渲染——不影响 P4

### `src/components/nana/knowledge-map/knowledge-map-canvas.tsx`
- 主线列布局算法通过 `computeLayout` 纯函数计算 ✅
- 三态渲染：绿发光（glow filter）/ 蓝虚线（dasharray）/ 灰实心 ✅
- 边颜色逻辑：两端 stable → 绿色 `#9CCBA6`；前沿入边 → 蓝色虚线 `#9FC3DE`；其他 → 灰色 `#E7DFD0` ✅
- 贝塞尔曲线路径 ✅
- SVG glow filter `stdDeviation="6"` ✅
- **问题**：`isSelected` 死变量（157行）+ `pos` 死回调（93行）

### `src/components/nana/knowledge-map/knowledge-detail-card.tsx`
- 底部弹出 + grip 拖动条 ✅
- 描述截取 teachingNotes 前 60 字 ✅
- 判定标准 / 例题 / 确认日期 ✅
- 前沿提示 "下一个要攻克的知识点" ✅
- 未探索提示 "还没走到这里" ✅
- 不显示 masteryProb ✅
- `date-fns` 用于格式化——已在 `package.json` 依赖中 ✅（非新依赖）

### `src/components/nana/knowledge-map/knowledge-map-layout.ts`
- 纯函数，无 React 依赖 ✅
- 10 列映射（M0-M7 + M2a/M2b 子列）✅
- 列宽 180px + 40px 间距 ✅
- 多主线节点归入最左侧列 ✅
- 无归属节点落入"其他"列 ✅

### `src/__tests__/unit/nana/knowledge-map-layout.test.ts`
- 9 个测试覆盖全面（空数据/单节点/多节点/多列/顺序/孤儿/多归属/名称映射/列号）✅
- 纯函数测试（无 mock 需求）✅

### `src/__tests__/integration/diagnosis-api.test.ts`
- map 测试新增 edges/mainlines/judgeCriteria/sampleItem/lastEvidence 断言 ✅
- mainlineId 过滤测试（只返回 M1 + edges 两端在 nodes 内）✅

---

## 用户验证指南

1. **打开页面**：访问 `http://localhost:3001/nana/knowledge-map`
2. **鉴权跳转**：未登录时应跳转到 `/login`
3. **空状态**：首次登录（无做题数据）应看到灰底 + "旅程从这一步开始" + "点亮一道题，灰色地图就会染上一块绿 ✦"
4. **有数据态**（已有节点状态记录）：
   - 顶栏显示 "你已经点亮了 N 个光点 ✦"
   - 图例显示：● 已点亮  下一个（蓝色虚线圆圈）  ○ 未探索
   - 图谱按主线列布局（多列），每列底部显示主线名称
   - 已稳定节点：绿色圆形 + 光晕 + 名称
   - 前沿节点：蓝色虚线边框 + "下一个"标签 + 名称
   - 其他节点：灰色圆形 + 灰色名称
   - 绿色路径线 = 两端 stable；蓝色虚线 = 前沿入边；灰色 = 其他
5. **交互**：
   - 点击稳定节点 → 底部弹出详情卡（含描述/判定标准/例题/最近确认日期）
   - 点击前沿节点 → 底部弹出详情卡 + "下一个要攻克的知识点"
   - 点击未探索节点 → 无反应
   - 点击遮罩层或"关闭"按钮 → 详情卡关闭
6. **检查无 P4 违规**：页面上不出现"掌握概率"、"未掌握"、"薄弱点"、"正确率"、"错"等词

---

## 审计结论

**✅ 总体判定：通过**

两个 commit 的实现与计划高度一致。代码质量可靠、测试覆盖充分、P4 措辞全线合规、零上游破坏、零新依赖。两个代码小问题（死变量）可在下轮随手清理，不影响当前验收。
