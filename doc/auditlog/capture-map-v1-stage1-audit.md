# 第一版错题采集+识别+知识地图挂载 · Stage 1（动线修正）审计报告

> 关联计划: doc/plan/capture-map-v1-plan.md（§4 Stage 1 / §8 验收 / §12 技术附录）
> 执行日志: doc/executionlog/capture-map-v1-stage1-log.md
> 审计日期: 2026-07-01
> 审计范围: **仅 Stage 1** 三个 commit（`314587a`、`42cb63e`、`d5e04c1`）+ 执行日志 commit（`dd40d77`）。Stage 2/3/4 不在范围内。

---

## 审计结论（大白话）

**总体判定：✅ 通过**

这轮代码我逐文件对照计划看过了，也亲手把构建和测试都重跑了一遍：

- **计划说要做的 6 件事（S1-1～S1-6）全都做了，而且做的样子和计划一致**——首页变成 3 个干脆入口、采集页保存后有"去知识地图"按钮、知识地图能看到最近拍过的题、列表 API 只返回自己的题且不带大图、schema 只改了注释没动结构、测试也补了。
- **3 条偏离记录我逐条复核了，都是真·微调**，其中第 2 条（去掉 1.4 秒自动重置）表面像改了 Phase 1.5 的旧行为，但实际上要做"去知识地图"按钮就必须让成功态停住，这是 S1-2 的内在要求，不算大偏离。
- **安全上没问题**：没碰上游表结构（schema 真的只改了两行注释，没生成新 migration）、没泄密钥、改动全落在 nana 自己的目录里。
- **措辞合规**：用户能看到的字里没有"诊断/薄弱/掌握/得分/失败"这些禁词，只老老实实说"识别稍后接入"。
- **我重新跑了 `npm run build`（通过）和 nana 测试套件（71 个全过，含新增 2 个隔离测试）**，执行日志的声称属实。

**唯一还没关上的门是 CI 测试容器**——本地 Docker 不可用（已按新规在执行日志写明），dev 还没合到 main，所以 GitHub Actions 那道容器门禁还没跑。这道门要在"合并 dev→main"时自动触发，**通过之后才允许部署到服务器**。这是部署门禁，不是 Stage 1 代码质量问题。

**结论：Stage 1 动线修正版代码本身可以放心，建议合并 dev→main 触发 CI，CI 容器门禁通过后即可作为"动线修正版"独立上线（≠ v1 闭环）。**

---

## 检查清单

### 计划一致性

- [x] **S1-1 首页重构**：`src/app/nana/page.tsx` 恰好 3 个一级 ActionCard——拍一道题(→`/nana/capture`)、看看知识地图(→`/nana/knowledge-map`)、周末小检查(→`/nana/session`)。"补一段你当时怎么想的"已删除（diff 确认）；session 从正文 Link 提升为一级卡片（原内联 Link 已移除）；RecapBar/EmptyHint 保留并移到卡片下方；`/api/diagnosis/map` 调用逻辑（loading/hasRecords）未动。
- [x] **S1-2 采集页保存后去向**：`src/app/nana/capture/page.tsx` 成功态显示"去知识地图看看"(主按钮→`/nana/knowledge-map`) + "再拍一道"(文字按钮，`handleTakeAnother` 重置)；`SUCCESS_MSG = "已收好 · 识别稍后接入"`，无"正在识别/识别完成/已诊断"。
- [x] **S1-3 列表 API**：`src/app/api/nana/cases/route.ts` 新增 `GET`，`where:{ studentId: session.user.id }` 归属过滤，`orderBy: createdAt desc`、`take: 50`；每条返回 `id/createdAt/hasImage/hasAudio/tagCount(0)/tagStatus("untagged")/transcriptReady(false)`；`listMyCases()` + `CaseListItem` 类型已加到 `nana-api-client.ts`。
- [x] **S1-4 知识地图错题列表**：新增 `recent-cases-list.tsx`，位置在图谱**上方**（page.tsx:146，先于图例与图谱）；空态"还没拍过题 / 去拍一道 →"(→`/nana/capture`)；每条 = 图标占位 + 日期 + "未分类"chip；加载失败弱化为"暂时没拉到"，不阻断图谱。
- [x] **S1-5 注释订正**：`prisma/schema.prisma` 仅 `Artifact.type`/`content` 两行注释更新为实际白名单；**零结构改动**（见"上游兼容性"）。
- [x] **S1-6 测试**：`case-api.test.ts` 新增"Case 列表 API + 用户隔离"describe 块（列表字段断言 + A 看不到 B 的 case）。实测 14 tests passed（原 12 + 新增 2）。

### 代码质量

- [x] 无明显 bug：GET handler 错误走 `try/catch` + `logger.error` + `internalError()`（铁律 6 不静默）；前端 `listMyCases` 失败有 catch 弱化；`useEffect` 带 `cancelled` 防竞态。
- [x] 错误处理到位：列表 API 401/500 分流；采集页失败态保留数据可重试。
- [x] 代码风格一致：沿用既有 ActionCard / Tailwind 色板 / 中文注释 + JSDoc 约定；`recent-cases-list.tsx` 的 `setLoading` 模式与既有页面一致（执行日志"遇到的问题#3"已说明并保持干净）。

### 安全性

- [x] 无密钥泄露：`git diff` 全量扫 `sk-/api_key/secret/password/token/VOLCENGINE_API_KEY=` → 零命中。
- [x] 无 SQL 注入风险：全部走 `prisma.*` 参数化查询，无裸 SQL。
- [x] 用户输入有校验：列表 GET 无 body（只读 session）；POST 校验沿用 Phase 1.5 G2。
- [x] 本轮测试在 `./data/test/test.db` 运行（`DATABASE_URL=file:./data/test/test.db`，guard-db 白名单内），**未向生产 `./data/dev.db` 写入测试数据**。

### 偏离复核（执行日志 3 条偏离记录）

- [x] **偏离 #1（不返回 imageThumb，用图标占位）**：计划 §12.2 把 `imageThumb` 标注为"**可选**：小缩略 base64"。Stage 1 不做服务端 resize、避免 50 条 base64 爆体积，验收标准（列表返回自己的题 + 隔离 + 措辞）不依赖缩略。**判定：真·微调，不影响验收。**
- [x] **偏离 #2（移除 1.4s 自动重置，改停留态 + 手动"再拍一道"）**：⭐ 重点复核项。计划 S1-2 要求"保存成功态加'去知识地图'按钮"。原 1.4s 自动重置会在用户读到按钮前清屏，**使新按钮无法被点击**——因此移除自动重置是实现 S1-2 去向按钮的**必要前提**，与计划意图一致。这是对采集页"保存后去向"流程的整体重做（S1-2 本就是改这块），属 Stage 1 范围内，不触碰 v1 闭环的 ASR/VLM/挂载逻辑。旧 `savedResetTimerRef` 及 unmount cleanup 一并删除，新 `handleTakeAnother` 完整复刻原重置动作（setImageBase64(null)+resetAudioAndRecorder+setSaveState idle+切 tab），**无内存泄漏、无状态残留**。**判定：合理实现选择，非大偏离**（但它确实改变了 Phase 1.5 已接受的自动重置体验，建议在 progress.md 备注此行为变化，供未来回溯）。
- [x] **偏离 #3（listMyCases 补 hasAudio 字段）**：§12.2 契约本就含 `hasAudio`，补齐是对齐契约。**判定：真·微调。**

### 上游兼容性（铁律 3）

- [x] **未修改上游表结构**：`git diff 127ce0a..HEAD -- prisma/schema.prisma` 仅 2 行注释变化（`type`/`content` 的 `//` 注释），无任何 model 字段增删、无 relation 改动。Artifact 是 nana 自有 model，且本次仅注释级。
- [x] **无新 migration**：`prisma/migrations/` 最新仍是 `20260627124550_add_case_artifact`（Phase 1.5），本轮无新增。
- [x] **只动 nana 自有目录**：`git diff --name-only` 全部落在 `src/app/nana/`、`src/components/nana/`、`src/app/api/nana/cases/`、`src/lib/nana/`、`src/__tests__/`、`prisma/schema.prisma`(注释)、`doc/executionlog/`。无上游 wrong-notebook 文件。

### Agent 同步一致性

- [x] `node scripts/check-agent-sync.js` → `OK: 3/3 agents in sync.`（exit 0）。Stage 1 未触碰 `doc/agents/` canonical，符合预期。

### 测试

- [x] 本地 `npm.cmd run build` 通过（审计复跑，exit 0，路由表正常输出 `/nana`、`/nana/capture`、`/nana/knowledge-map`）。
- [x] 本地窄范围测试复跑：`npx vitest run src/__tests__/integration/nana src/__tests__/unit/nana` → **7 files / 71 tests passed**，`case-api.test.ts` 14 tests（含新增 2）。执行日志声称属实。
- [x] 测试使用 `./data/test/test.db`（guard-db 白名单内），未触碰 `./data/dev.db`。
- [ ] 本地 Docker 不可用 → 本地测试容器未跑（**执行日志已按新 CI 规则明确记录**："本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行"）。符合新规，不阻塞。
- [ ] GitHub Actions 测试容器门禁**尚未触发**（dev 未合 main）——**部署前必须通过**。
- [x] DB 护栏断言 `src/__tests__/setup/guard-db.ts` 存在并生效（测试在白名单 test.db 下正常运行）。
- [x] 无"退回生产容器跑测试"记录。

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P2 | 列表 API 的 `total` 返回的是"本次返回条数"（`result.length`，受 `take:50` 截断），而非用户在库里的真实总数。§12.2 契约只写 `total: number` 未严格定义。Stage 1 量小（<50）无影响，但若未来单用户超 50 条，`total` 会恒为 50 造成"还有更多"误判。 | `src/app/api/nana/cases/route.ts:73`（`total: result.length`） | 非本 Stage 必修。建议 Stage 2/3 起若做分页，用 `prisma.case.count({where:{studentId}})` 返回真实总数；或在契约注释里写明 `total = 返回条数（≤50）`。 |
| P2 | 偏离 #2 改变了 Phase 1.5 已接受的"1.4s 自动重置"体验，属行为变更。代码实现正确，但应在项目轨迹里留痕，避免未来回溯时困惑。 | `src/app/nana/capture/page.tsx`（handleTakeAnother） | 在 `doc/progress.md` 追加 Stage 1 记录时，备注"采集页保存后由自动重置改为停留态+手动再拍"，与执行日志偏离 #2 呼应。 |

> 无 P0 / P1 问题。两条 P2 均为"记录性/未来项"，不阻塞 Stage 1 上线。

---

## 用户验证指南（Stage 1 动线修正，建议合并 dev→main、CI 通过后部署到服务器，用手机验）

**前置**：确认 CI（GitHub Actions）测试容器门禁已通过，再部署。

1. **首页三入口**：手机打开 `/nana` → 应看到**恰好 3 个一级卡片**："拍一道题"（绿）、"看看知识地图"（蓝）、"周末小检查"（琥珀）。**不应再有**"补一段你当时怎么想的"。三卡片下方才是有/无记录的轻提示。
2. **采集页保存后去向**：点"拍一道题" → 拍/选一张图 → 点"收好这道题" → 成功后应显示**"已收好 · 识别稍后接入"** + 两个按钮：绿色主按钮"去知识地图看看"、下方文字"再拍一道"。点"去知识地图看看"应跳到 `/nana/knowledge-map`。**确认没有"正在识别/识别完成/已诊断"字样。**
3. **知识地图最近拍过的题**：在 `/nana/knowledge-map` → 图谱**上方**应有"最近拍过的题"区。刚拍的题应出现（图标占位 + 日期 + "未分类"chip）。新用户/清空后应显示"还没拍过题 / 去拍一道 →"。
4. **列表 API 归属隔离（关键安全项）**：用 A 账号拍几道题；切到 B 账号进知识地图 → B 的"最近拍过的题"**不应看到 A 的题**（自动化测试已覆盖，建议再人工抽验一次）。
5. **体积无爆**：浏览器 DevTools Network 看 `GET /api/nana/cases` 响应体应很小（KB 级，**不含 base64 大图**）；完整题图走 `GET /api/nana/cases/[id]`。
6. **措辞全扫**：在首页/采集/知识地图三页肉眼检查，不应出现"诊断/薄弱/掌握/得分/失败"等词。

---

## 附录：审计执行的命令与证据

- `node scripts/check-agent-sync.js` → `OK: 3/3 agents in sync.`
- `git diff 127ce0a..HEAD --name-only` → 9 文件，全部 nana 自有目录 + schema 注释 + 执行日志。
- `git diff 127ce0a..HEAD -- prisma/schema.prisma` → 仅 2 行注释（`type`/`content`），零结构。
- `git diff 127ce0a..HEAD -- src/app/api/nana/cases/route.ts` → GET handler 含 `where:{studentId}` + `select:{artifacts:{select:{type:true}}}`（不取 content）。
- `DATABASE_URL=file:./data/test/test.db npx vitest run src/__tests__/integration/nana src/__tests__/unit/nana` → 7 files / 71 tests passed。
- `npm.cmd run build` → exit 0，路由表含 `/nana`、`/nana/capture`、`/nana/knowledge-map`。
- 禁词 grep（诊断/已诊断/薄弱/得分/掌握/失败/正在识别/识别完成/已识别）于 `src/app/nana` + `src/components/nana` → 命中**全部在 JSDoc/代码注释**（合规声明或"禁用XX"说明），用户可见字符串零命中。
- 密钥 grep（`sk-/api_key/secret/password/token`）于改动文件 → 零命中。
