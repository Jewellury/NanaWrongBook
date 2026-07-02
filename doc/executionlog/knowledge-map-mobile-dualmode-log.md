# 知识地图 · 移动端双模式 · 执行日志

> 关联计划: doc/plan/knowledge-map-mobile-dualmode-plan.md
> 开始时间: 2026-07-02 (execute-agent)

## 执行记录

### 任务 A: 新增 `KnowledgeMapListView` 组件
- 做了什么:
  - 新增 `src/components/nana/knowledge-map/knowledge-map-list-view.tsx`
  - 导出纯函数 `groupNodesByStatus`（分组算法，便于单测）+ 默认组件 `KnowledgeMapListView`
  - 4 组分组：已点亮(green #6BBF8A) / 下一个(blue #93B8D6) / 收过题(amber #E8A33D) / 未探索(gray #D9D1C3)
  - 优先级：stable > frontier > collected > untested（互斥完备，无重复）
  - 节点名字号 14px（满足 375px 可读性核心要求）
  - 未探索组默认折叠（可展开），其余三组默认展开
  - 已点亮/下一个 组的节点若 caseEvidenceCount>0 显示琥珀小角标（additive，对应 SVG 里绿芯+琥珀环）
  - 点击节点 → onNodeClick(nodeId)（page 层 handleNodeClick 决定是否弹卡，与图谱模式同入口）
- 涉及文件: `src/components/nana/knowledge-map/knowledge-map-list-view.tsx`（新增）
- 结果: ✅ 完成

### 任务 B: page.tsx 响应式切换 + segmented control
- 做了什么:
  - 加 `mode` state: `useState<"list" | "graph">("list")`，默认 list（DP1）
  - 顶部加 segmented control「列表 | 图谱」（胶囊二选一，DP3）
  - 条件渲染：list → `<KnowledgeMapListView>`；graph → 现有 `<KnowledgeMapCanvas>`（不动）
  - isEmpty / loading / 空状态 / 详情卡逻辑全部保留，对两种模式都生效
- 涉及文件: `src/app/nana/knowledge-map/page.tsx`（修改）
- 结果: ✅ 完成

### 任务 C: 保留 `KnowledgeMapCanvas` 不动
- 做了什么: 未修改 `knowledge-map-canvas.tsx`，图谱模式直接复用
- 涉及文件: 无改动
- 结果: ✅ 完成

### 任务 D: pinch-zoom/pan 延后 (DP2)
- 做了什么: 不实现任何手势/缩放代码。列表模式已从根本上解决可读性。
- 涉及文件: 无
- 结果: ✅ 完成（按计划延后）

### 任务 E: 测试 + build
- 做了什么:
  - 新增单测 `src/__tests__/unit/nana/knowledge-map-list-view.test.ts`，覆盖：
    - 四组分组正确
    - stable+caseEvidenceCount>0 → lit 组（stable 优先，非 collected）
    - frontier+caseEvidenceCount>0 → next 组（frontier 优先）
    - 互斥完备（并集 = 全部节点，无重复）
    - 空组隐藏
  - 运行 `npm.cmd run build`
  - 运行 nana vitest 套件
- 涉及文件: `src/__tests__/unit/nana/knowledge-map-list-view.test.ts`（新增）
- 结果: 见下方"测试结果"

## 偏离记录

> 无大偏离。以下为微调，均不影响验收标准。

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | 计划§6.1契约里 Props 字段名 `frontier` | 保持 `frontier` | 与 canvas Props 一致，无偏离 | 否 |
| 2 | 计划未明确"未探索"折叠后的展开按钮文案 | 用「展开 / 收起」+ 节点计数 | 计划只说"默认折叠可展开"，文案是展示细节 | 否 |

## 上游文件修改

> 无。仅改 nana 自有文件（`src/app/nana/`、`src/components/nana/`），不碰 wrong-notebook 上游文件。

## 测试结果

- **`npm.cmd run build`**：✅ 通过（Next.js 16.0.10 Turbopack，Compiled successfully in 21.8s，56 静态页生成成功）
- **nana vitest 套件**（`DATABASE_URL=file:./data/test/test.db`，guard-db 白名单内）：✅ **12 文件 / 113 测试全通过**（基线 11 文件 105 测试 + 新增 `knowledge-map-list-view.test.ts` 8 测试，零回归）
  - 新增 `knowledge-map-list-view.test.ts` 8 测试覆盖：四组分组正确、stable 优先（非 collected）、frontier 优先、互斥完备无重复、空组返回空、空列表、caseEvidenceCount=0 进 untested、frontier 节点非 stable 时进 next
- **本地 Docker**：不可用（Docker Desktop 未启动，daemon 连接失败）。**本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行**（`docker-compose.test.yml` 在 CI build-and-push.yml 中执行）
- **测试安全路径确认**：所有测试在 `DATABASE_URL=file:./data/test/test.db`（guard-db 白名单内）运行，`./data/dev.db` 未被触碰

## 偏离记录（追加）

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 3 | 计划用 `DATABASE_URL=... npx vitest` 命令行跑测试 | 临时新建 `run-nana-tests.cjs` launcher 设 env 后跑 vitest，**测完已删除** | 本机 bash 中继不支持 inline env 语法（与上一轮 stage2.5 偏离 #4/#5 同根因）；guard-db 要求 DATABASE_URL 设置 | 否（临时工具，已删除，不入库） |

## 完成状态
- [x] 所有任务完成
- [x] 代码已提交（commit: `13c00b7` 代码 + `82723b0` 日志）
- [x] 本地 `npm.cmd run build` 通过
- [x] 本地相关窄范围测试已运行：nana 套件 12 文件 113 测试全通过（`DATABASE_URL=file:./data/test/test.db`，guard-db 白名单内）
- [ ] 测试容器门禁（二选一）：
  - [ ] 本地 Docker 可用：本地运行 docker-compose.test.yml 退出码 0
  - [x] 本地 Docker 不可用：**本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行**
- [ ] GitHub Actions 测试容器通过后，才允许部署
- [x] 确认测试在安全路径运行：CI/本地均用 `DATABASE_URL=file:./data/test/test.db`（guard-db 白名单内），`./data/dev.db` 未被触碰
- [x] 可进入审计阶段
