# 第一版错题采集+识别+知识地图挂载 · Stage 1（动线修正）执行日志

> 关联计划: doc/plan/capture-map-v1-plan.md（§4 Stage 1）
> 开始时间: 2026-07-01 19:40
> 执行代理: execute-agent
> 范围: **仅 Stage 1**（动线修正，可独立上线；≠ v1 闭环）

---

## 执行记录

### S1-1 首页重构
- 做了什么:
  - 删除"补一段你当时怎么想的"ActionCard（与拍题重复跳同一 `/nana/capture`，无独立语义）。
  - 新增"看看知识地图"ActionCard → `/nana/knowledge-map`（sky 色系，Map 图标）。
  - 将 session 入口从正文 Link 提升为"周末小检查"ActionCard → `/nana/session`（amber 色系，ClipboardCheck 图标）。
  - 结果：恰好 3 个一级 ActionCard（拍题 / 知识地图 / 周末小检查）。
  - 有/无记录轻提示（RecapBar / EmptyHint）保留，移到三卡片下方；删除原正文里重复的 session Link（session 已升为一级卡片）。
  - `/api/diagnosis/map` 调用逻辑不变（只改 ActionCard 区，不影响 map 数据加载）。
- 涉及文件: `src/app/nana/page.tsx`
- 结果: ✅ 完成

### S1-2 采集页保存后去向
- 做了什么:
  - 保存成功态从原"1.4s 自动重置"改为**停留态**（用户需时间点去向按钮）。
  - 成功提示改为诚实措辞 `"已收好 · 识别稍后接入"`（Stage 1 无真 AI，不出现"正在识别/识别完成/已诊断"）。
  - 成功态显示两个去向：`去知识地图看看`（→ `/nana/knowledge-map`，主按钮）+ `再拍一道`（重置采集状态，文字按钮）。
  - 删除原 `savedResetTimerRef` timeout 句柄及其相关清理逻辑（handleImageChange 换图清 timeout、unmount cleanup effect），改由 `handleTakeAnother` 手动重置。
  - 失败态措辞不变（"没存成功，再试一次"，铁律 6 显式报错保留数据可重试）。
- 涉及文件: `src/app/nana/capture/page.tsx`
- 结果: ✅ 完成

### S1-3 新增"我的错题列表"API
- 做了什么:
  - 在 `src/app/api/nana/cases/route.ts` 新增 `GET` handler（无 [id]，与 `cases/[id]/route.ts` 的 GET 不冲突）。
  - 归属过滤：`where: { studentId: session.user.id }`（沿用 G1 思路），未授权返回 401。
  - 排序：`createdAt desc`，`take: 50`（默认最近 50 条）。
  - **体积注意（§12.2）**：`select` artifacts 只取 `type`（**不取 content**），避免列表爆 base64 体积；完整题图走 `GET /cases/[id]`。
  - 每条返回：`id / createdAt(ISO) / hasImage / hasAudio / tagCount(恒0) / tagStatus(恒"untagged") / transcriptReady(恒false)`。
  - `src/lib/nana/nana-api-client.ts` 新增 `listMyCases()` + `CaseListItem` 类型。
- 涉及文件: `src/app/api/nana/cases/route.ts`、`src/lib/nana/nana-api-client.ts`
- 结果: ✅ 完成

### S1-4 知识地图加"最近拍过的题"区
- 做了什么:
  - 新增 `src/components/nana/knowledge-map/recent-cases-list.tsx`（客户端组件）。
  - 调 `listMyCases()` 显示横向列表；位置：图谱**上方**（用户最关心"我拍的题在哪"，§12.4）。
  - 空态："还没拍过题" + "去拍一道 →"（→ `/nana/capture`）。
  - 有题：每条 = 图标占位缩略 + 拍摄日期（如"7月1日"）+ "未分类"chip（Stage 1 恒 untagged）。
  - 加载失败弱化为"暂时没拉到，下拉刷新试试"，不阻断图谱区。
  - 在 `knowledge-map/page.tsx` 顶部 import 区引入，放在图例上方。
- 涉及文件: `src/components/nana/knowledge-map/recent-cases-list.tsx`（新增）、`src/app/nana/knowledge-map/page.tsx`
- 结果: ✅ 完成

### S1-5 顺手订正（仅注释）
- 做了什么:
  - `prisma/schema.prisma` 的 `Artifact.type` 注释从过时的 `"image" | "audio" | "transcript" | "aiSummary"` 更新为实际白名单 `"question_image" | "audio_note" | "audio_meta" | "transcript"`。
  - `Artifact.content` 注释同步（URL → Base64/纯文本）。
  - `cases/route.ts` 顶部 JSDoc 同步新增 GET 端点说明 + 体积注意。
  - **零结构改动**：未改任何 model 字段、未改 migration。
- 涉及文件: `prisma/schema.prisma`（注释）、`src/app/api/nana/cases/route.ts`（注释）
- 结果: ✅ 完成（注释级）

### S1-6 测试
- 做了什么:
  - `src/__tests__/integration/nana/case-api.test.ts` 新增导入 `GET as listCases`。
  - 新增 describe 块"Case 列表 API + 用户隔离"：
    - 测试1：GET /api/nana/cases 返回当前用户 case 列表，验证必要字段（id/createdAt/hasImage/tagStatus="untagged"/tagCount=0/transcriptReady=false）。
    - 测试2：切到 OTHER_STUDENT 创建 case → 切回 TEST_STUDENT 查列表 → 列表中**不包含** OTHER 的 case（用户隔离）。
  - 测试在本地 test.db（`DATABASE_URL=file:./data/test/test.db`，guard-db 白名单内）跑通：14 tests passed（原 12 + 新增 2）。
  - 全量 nana 测试（unit + integration）71 tests passed，无回归。
- 涉及文件: `src/__tests__/integration/nana/case-api.test.ts`
- 结果: ✅ 完成

---

## 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | 列表 API 契约含 `imageThumb?: string`（可选小缩略） | **不返回 imageThumb**，仅返回 `hasImage` 标志；知识地图用图标占位代替真实缩略 | 真实缩略需服务端 resize（Stage 2+ 复杂度），且加载 50 条 base64 会爆体积。契约中 `imageThumb` 标注为"可选"，省略不影响验收（验收只要求列表返回自己的题 + 隔离 + 措辞合规） | 否 |
| 2 | S1-2 采集页保存后"加"去知识地图"按钮 | 同时**移除 1.4s 自动重置**（改为停留态 + 手动"再拍一道"重置） | 自动重置会在用户读到按钮前清屏，无法点击去向按钮。移除自动重置是实现 S1-2 去向按钮的必要前提，与计划意图一致 | 否 |
| 3 | `listMyCases` 客户端封装按 §12.3 模板 | 与模板一致，仅类型名补充了 `hasAudio` 字段（§12.2 契约本就含 hasAudio） | 对齐 §12.2 契约完整性 | 否 |

---

## 上游文件修改

> 无。所有改动落在 nana 自有目录（`src/app/nana/`、`src/components/nana/`、`src/app/api/nana/cases/`、`src/lib/nana/`、`src/__tests__/`）+ `prisma/schema.prisma` 的**注释级**订正（nana 自有 model Artifact，且零结构改动）。未触碰任何 wrong-notebook 上游 model/文件。

| 文件 | 改了什么 | 原因 |
|------|----------|------|
| `prisma/schema.prisma` | 仅 Artifact.type/content **注释**订正 | 旧注释过时（白名单已收敛），无结构改动 |

---

## 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| `git commit -m` 带 smart-quote（"…"）时被 shell 拆成多个 pathspec | 改用 `git commit -F <文件>` 从临时文件读 commit message |
| 本地 vitest 默认 `DATABASE_URL` 为空，被 guard-db 拦截 | 显式设 `DATABASE_URL=file:./data/test/test.db`（白名单内，指向 test.db 非 dev.db），窄范围测试本地跑通 |
| 新增 `recent-cases-list.tsx` 触发 `react-hooks/set-state-in-effect`（effect 内 setLoading(true)） | 该规则在现有 nana 页面已普遍存在（page.tsx/knowledge-map page.tsx 均有）。新文件中 loading 初值已为 true、effect 仅跑一次，故移除冗余 `setLoading(true)` 调用，保持新代码干净（未改既有文件的同款模式） |

---

## 完成状态

- [x] 所有任务完成（S1-1 ~ S1-6）
- [x] 代码已提交（3 个 commit）：
  - `314587a` feat(nana): S1-1/S1-2 homepage 3 entry cards + capture post-save destination
  - `42cb63e` feat(nana): S1-3/S1-5/S1-6 list API + schema comment + tests
  - `d5e04c1` feat(nana): S1-4 knowledge-map recent-cases list section
- [x] 本地 `npm.cmd run build` 通过（exit 0）
- [x] 本地相关窄范围测试已运行：
  - `npx vitest run src/__tests__/integration/nana src/__tests__/unit/nana` → **71 tests passed**（7 files），含新增 2 个列表/隔离测试，无回归
  - 测试在 `DATABASE_URL=file:./data/test/test.db`（guard 白名单内）运行，未触碰 `./data/dev.db`
- [ ] 测试容器门禁通过（二选一）：
  - 本地 Docker 可用时：本地运行 `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` 退出码 0
  - **本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行**
- [ ] GitHub Actions 测试容器通过后，才允许部署（待 dev→main 合并触发 CI）
- [x] 确认测试在安全路径运行：本地用 test.db（`./data/test/test.db`），`./data/dev.db` 未被触碰
- [x] 可进入审计阶段

---

## 措辞合规自检（OPS §4）

用户可见字符串扫描（homepage / capture / knowledge-map / recent-cases-list）：
- **禁用词检查**：诊断 / 已诊断 / 薄弱 / 得分 / 掌握 / 失败 → 用户可见文案中**均无出现**（仅存在于代码注释/JSDoc 合规声明与开发侧 `throw new Error` 中）。
- Stage 1 诚实措辞：采集页保存后显示 `"已收好 · 识别稍后接入"`，不出现"正在识别/识别完成/已诊断"。
- 知识地图沿用既有已批准措辞（"已点亮"/"下一个"/"未探索"/"光点"）。

---

## schema 结构确认

- S1-5 为**注释级**改动，未改任何 Prisma model 字段、未新增/删除 model、未跑 migration。
- 未触碰任何 wrong-notebook 上游 model（User / ErrorItem / KnowledgeTag / …）。

---

## 下一步

- 本 Stage 1 = "动线修正版"，可独立上线（合并 dev → main 触发 CI 测试容器门禁）。
- Stage 2 需先确认 DP1（CaseKnowledgeTag migration SQL 内容）后才能启动。
- Stage 3（真实 ASR + VLM）是 v1 闭环必需项，依赖 Stage 2。
