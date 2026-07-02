# Stage 2.5 接通两个"看得见摸不着"的断点 · 执行日志

> 关联计划: doc/plan/capture-map-v1-stage2.5-plan.md
> 开始时间: 2026-07-02 (execute-agent)
> 关联根因: doc/auditlog/stage2-followup-rootcause-2026-07-02.md

## 执行记录

### 任务 A — CaseTagPanel 题图懒加载（修断点 1）
- 做了什么:
  - 在 `CaseTagPanel` 的 `useEffect([caseId])` 里，与现有 `listCaseTags(caseId)` **并行**发起 `getCase(caseId)`（独立 try/catch，互不阻塞）。
  - 新增独立 `imageState`：`null`(加载中) → `{content:string}` | `'none'`(无题图) | `'failed'`(铁律 6 显式失败)。
  - 从 `getCase` 返回的 `artifacts[]` 里取 `type === "question_image"` 中 seq 最小那条，把 `content`(Base64) 渲染为面板顶部 `<img>`（max-h-[200px]）。
  - 加载中显示"题图加载中…"骨架；就绪显示图；无题图静默隐藏图区（不算错误）；失败显示"题图没拉到，标签仍可用"。
  - 从 `nana-api-client.ts` 引入 `getCase`（已存在，带 G1 归属校验）。列表 API 仍不返回 base64（体积纪律不变）。
- 涉及文件: `src/components/nana/knowledge-map/recent-cases-list.tsx`（仅 CaseTagPanel 内部）
- 结果: ✅ 完成

### 任务 B — map API caseEvidenceCount（修断点 2 · 后端）
- 做了什么:
  - 在 `map/route.ts` 现有 `stateMap` 构建后，新增**单次** groupBy：`by:['nodeId']` + `where:{case:{studentId}}` 关系过滤（跨用户隔离），输出 `Map<nodeId,count>`。
  - 在响应 `nodes[]` 每个元素上**新增** `caseEvidenceCount: evidenceMap.get(n.id) ?? 0`（与 status 正交的新字段）。
  - **未改** `status`（仍只来自 StudentNodeState）、**未改** `stats`（stable/gap/uncertain/untested 计数不变）。
- 涉及文件: `src/app/api/diagnosis/map/route.ts`
- 结果: ✅ 完成

### 任务 C — 知识地图琥珀层（修断点 2 · 地图前端）
- 做了什么:
  - `KnowledgeNodeData` 类型新增 `caseEvidenceCount: number`。
  - `knowledge-map-canvas.tsx`：`caseEvidenceCount > 0` 的节点在原三态 `<g>` 内**最底层**叠加琥珀外环（additive，不替换）。颜色 `#E8A33D`，stroke 不 fill，strokeWidth=2：
    - stable → 琥珀环半径 NODE_R+5（绿芯 + 琥珀环）
    - frontier → 琥珀环半径 FRONTIER_R+4（蓝虚线 + 琥珀环）
    - gray → 琥珀环半径 OTHER_R+5（灰芯 + 琥珀环 = "收过题但还没测"，断点 2 核心反馈）
  - `knowledge-map/page.tsx`：图例加第 4 个样块"收过题"（琥珀）；空状态判定改为 `isEmpty = litNodeCount<2 && collectedNodeCount===0`（只挂过题的孩子也看到画布）。
- 涉及文件: `src/components/nana/knowledge-map/knowledge-map-canvas.tsx`、`src/app/nana/knowledge-map/page.tsx`
- 结果: ✅ 完成

### 任务 D — 首页 hasRecords 放宽 + RecapBar 措辞
- 做了什么:
  - `src/app/nana/page.tsx`：`MapNode` 加 `caseEvidenceCount`；`hasRecords = litNodes.length>0 || collectedNodes.length>0`（放宽，只挂过题的孩子也看 RecapBar）。
  - `src/components/nana/shared/recap-bar.tsx`：3 分支。只 collected（无点亮）→ "你最近收过题的知识点有 N 个 / 还没做小检查，做完就能点亮它们 ✦"（绝不说"点亮了"，按知识点数计数 DP2）。有点亮 → 维持现状。
- 涉及文件: `src/app/nana/page.tsx`、`src/components/nana/shared/recap-bar.tsx`
- 结果: ✅ 完成

### 任务 E — 测试 + build
- 做了什么:
  - 新增 `src/__tests__/integration/nana/map-evidence.test.ts`（5 测试）：字段存在且非负整数；挂 tag 后 +1（status 不变）；同节点第二道 → 2；**跨用户隔离**（OTHER_STUDENT 的 tag 不计入 TEST_STUDENT）；stats 不受影响。
  - `npm.cmd run build` 通过（✓ Compiled successfully）。
  - nana 测试套件本地跑通：**9 文件 101 测试全通过**（含新增 5 个 map-evidence + 既有 96 个不回归）。
- 涉及文件: `src/__tests__/integration/nana/map-evidence.test.ts`（新增）
- 结果: ✅ 完成

## 偏离记录（如有）
> 记录所有在执行中对计划做的微调。审计代理会逐条复核这些微调是否真属微调。

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | RecapBar `latestNodeName` 传 `latestLitNode.name` | 改为 `latestLitNode?.name ?? ""`（容空）+ RecapBar 新增 `hasLitNodes`/`collectedNodeCount` props | 无点亮分支时 `latestLitNode` 为 undefined；需安全访问 + 三分支需分支判据 | 否（验收标准是 3 分支措辞，props 扩展是落地手段） |
| 2 | RecapBar 链接 href 保持原样 | 把原 `/nana/map` 修正为 `/nana/knowledge-map`（正确路由） | 原代码 `/nana/map` 是已存在的死链 bug（知识地图页在 `/nana/knowledge-map`），顺手修正 | 否（修 bug，不影响验收） |
| 3 | map-evidence 测试用 TEST_STUDENT= `test-nana-user` | 改用独立用户 `test-nana-map-user` / `test-nana-map-other` | vitest 默认并行跑集成文件；与 case-api.test.ts 共用 `test-nana-user` 时双方 beforeAll/afterAll cleanup 互相删数据 → 404 串扰。独立用户消除并行串扰 | 否（测的是同一契约，换用户名不降约束） |
| 4 | map-evidence 测试导入路径 | 路径校正为 `../../../app/...`（3 级，同目录其它测试同款） | 文件在 `integration/nana/`，需 3 级回到 `src/app` | 否（纯路径修正） |
| 5 | 计划未提及 `run-nana-tests.cjs` | 临时新建一个 launcher 脚本设 `DATABASE_URL` 跑 vitest，**测完已删除** | 本机 bash 中继不支持 `export`/`inline env` 语法；vitest 不自动加载 `.env.test`（容器路径）。launcher 用 vitest Node API 设白名单内的本地测试库路径 | 否（临时工具，已删除，不入库） |

## 上游文件修改（如有）
| 文件 | 改了什么 | 原因 |
|------|----------|------|
| （无） | — | 本轮全部修改 nana 自有文件（`src/components/nana/`、`src/app/nana/`、`src/app/api/diagnosis/`、`src/__tests__/`），未触 prisma/schema、未改 wrong-notebook 已有 model |

## 遇到的问题
| 问题 | 解决方式 |
|------|----------|
| 本机 bash 中继报 `execvpe(/bin/bash) failed`，不支持 `export`/`VAR=val cmd` 语法 | 用临时 launcher 脚本（vitest Node API）设环境变量，已删除 |
| 新增 map-evidence.test.ts 与 case-api.test.ts 并行时 404 串扰 | 改用独立测试用户（偏离记录 #3） |
| Docker Desktop Linux engine 返回 500（不健康） | 本地 Docker 不可用。按 AGENTS.md 新门禁：测试容器门禁交由 GitHub Actions 执行，不阻塞 commit/push |

## 完成状态
- [x] 所有任务完成（A–E）
- [x] 代码已提交（commit: `c8c819d` on dev，未 push）
- [x] 本地 `npm.cmd run build` 通过（✓ Compiled successfully in 12.2s）
- [x] 本地相关窄范围测试已运行：nana 套件 9 文件 101 测试全通过（`DATABASE_URL=file:./data/test/test.db`，guard-db 白名单内）
- [ ] 测试容器门禁通过（二选一）：
  - 本地 Docker 可用时：本地运行 `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` 退出码 0
  - 本地 Docker 不可用时：执行日志写明"本地 Docker Desktop 不可用（Linux engine 返回 500），测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行" ✅ 本项
- [ ] GitHub Actions 测试容器通过后，才允许部署
- [x] 确认测试在安全路径运行：CI 或本地测试容器使用 test.db（`./data/test/test.db`），`./data/dev.db` 未被触碰（mtime 仍为 6月29 09:50）
- [x] 可进入审计阶段

## 措辞合规自检（OPS §4）
- 全页扫描新增/改动文案：**不出现** 诊断/已诊断/薄弱/得分/掌握/失败（命中均为代码注释里的禁用清单说明 / 铁律 6 错误处理内部注释，非用户可见文案）。
- 琥珀层相关措辞只用："收过题"、"有错题记录"（图例"收过题"；RecapBar"你最近收过题的知识点有 N 个"）。
- 绿色"已点亮"语义**不变**（仍只代表测评 stable；琥珀层不偷绿色话术）。

## Schema 未触动确认
- `prisma/schema.prisma` 未修改。
- 未写 `StudentNodeState`（绿色点亮仍只走测评）。
- 仅新增 `CaseKnowledgeTag.groupBy` **读** 查询（Stage 2 已有表），无新 model、无新迁移。
