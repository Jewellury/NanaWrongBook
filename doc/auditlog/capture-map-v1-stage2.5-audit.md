# Stage 2.5 接通两个"看得见摸不着"的断点 · 审计报告

> 关联计划: doc/plan/capture-map-v1-stage2.5-plan.md
> 执行日志: doc/executionlog/capture-map-v1-stage2.5-log.md
> 审计日期: 2026-07-02
> 审计代理: audit-agent
> 审计范围: commits `c8c819d`（代码）+ `cfb99a4`（日志回填 hash），基准 `06a9f3d`

---

## 审计结论（大白话）

**总体判定：✅ 通过**

这一轮代码干得干净。两个"做了事但界面没反应"的断点（点开题看不到原图、挂了知识点地图全灰）都按计划接通了，而且**没有踩计划反复强调的那条红线**——琥珀色"收过题"标记和绿色"已点亮"是两套独立图层，挂标签**绝不**偷偷去写 StudentNodeState 凑绿色，绿色仍然只能靠做完小检查答对得到。这对孩子是诚实的：没测过就说"掌握"是撒谎，琥珀色只告诉你"这类题收过"，不骗你"会了"。

**没有发现 P0/P1 问题。** 我把用户最担心的 7 条核心检查（红线、跨用户隔离、status 不变、列表不爆 base64、琥珀环只叠加不替换、措辞、schema 没动）逐条在代码里追了一遍，全部 ✅。101 个测试全过（含新增 5 个专门验证这条新链路的），生产构建通过，生产库 `dev.db` 没被碰过（mtime 还停在 6 月 29 日）。5 条偏离记录我逐条复核了，**全部是真微调**（其中一条还是顺手修了个死链 bug），没有"实为大偏离"的情况。

**唯一还没关上的门**是部署门禁里的测试容器那关——因为本地 Docker Desktop 坏了（Linux engine 返回 500），按 AGENTS.md 新门禁这关交给 GitHub Actions 在 push 后跑。所以结论是：**代码质量过关，可以 push 进 CI；CI 测试容器绿灯后才允许部署到腾讯云。**

---

## 检查清单

### 1. 七大核心检查（评审重点盯的，逐条带证据）

| # | 检查项 | 判定 | 证据 |
|:-:|--------|:----:|------|
| **1** | **琥珀层 ≠ 绿色点亮（产品红线）**：琥珀只读 CaseKnowledgeTag，绝不写 StudentNodeState；绿色 stable 仍只来自 StudentNodeState | ✅ | `map/route.ts:48-52` groupBy 是**只读**查询；`status` 字段 `route.ts:169` 仍 `stateMap.get(n.id)?.status ?? 'untested'`（stateMap 来自 StudentNodeState `route.ts:39-44`）。全 Stage 2.5 diff 里 **0 处** `studentNodeState.create/upsert/update`（grep 命中全在 M1 旧文件 `submit-answers`/`initial` 和测试 cleanup，均非本轮改动）。挂 tag 走的是 Stage 2 已有的 `tagCaseManually`，从不碰 StudentNodeState |
| **2** | **caseEvidenceCount 跨用户隔离**：groupBy 必须 `where:{case:{studentId}}` | ✅ | `map/route.ts:48-52` 明确 `where: { case: { studentId } }`。测试 `map-evidence.test.ts:209-243` 用 OTHER_STUDENT 挂 tag 后查 TEST_STUDENT 的 map，断言 nodeB 计数仍为 0、nodeA 仍为 2（隔离生效） |
| **3** | **map API status 字段语义不变**：status 仍只来自 StudentNodeState，caseEvidenceCount 是正交新字段 | ✅ | `route.ts:169` status 只读 stateMap；`route.ts:172` caseEvidenceCount 是独立字段。测试 `map-evidence.test.ts:179-183` 挂 tag 后断言 `target.status==='untested'` 且 `stats.untested` 不变、`stats.stable===0`——证明 caseEvidenceCount>0 不会把 status 变成别的 |
| **4** | **列表 API base64 纪律**：`GET /api/nana/cases` 仍 `select:{type:true}` 不返回 content | ✅ | `cases/route.ts:52-56` 仍 `artifacts: { select: { type: true } }`，未改。该文件**不在** Stage 2.5 改动清单内（`git diff --name-only` 确认）。只有点开的那一条走 `cases/[id]/route.ts` 拉完整 base64 |
| **5** | **琥珀环是 additive（叠加），不替换绿/蓝/灰芯** | ✅ | `knowledge-map-canvas.tsx`：琥珀 `<circle>` 是**单独一层**，`fill="none"`（只描边不填充）、`strokeWidth=2`、半径大于芯色（stable: `NODE_R+5`、frontier: `FRONTIER_R+4`、gray: `OTHER_R+5`），画在各分支 `<g>` 内**最前**位置（z 序最底，所以芯色盖在环上、环露在芯外成"光环"）。三态分支各自独立加环，互不影响 |
| **6** | **措辞合规（OPS §4）**：琥珀层只说"收过题/有错题记录"，绝不说"点亮/掌握/薄弱/诊断"；绿色"已点亮"语义不变 | ✅ | 用户可见文案：图例"收过题"（`page.tsx:175`）、RecapBar "你最近收过题的知识点有 N 个 / 还没做小检查，做完就能点亮它们"（`recap-bar.tsx:42-50`）。grep 全 diff：禁用词"诊断/已诊断/薄弱/得分/掌握"仅出现在**自检注释**（recap-bar 顶部列出禁用词清单提醒自己），"失败"仅出现在题图状态机的内部注释（`'failed'=拉取失败`），**无一处用户可见**。"点亮"只在绿色分支（有点亮时）和未来时态（"做完就能点亮"）出现，未偷绿色话术 |
| **7** | **schema 未触动**：`prisma/schema.prisma` diff 为空，无新迁移 | ✅ | `git diff 06a9f3d..HEAD -- prisma/` **完全空输出**；`prisma/migrations/` 无改动。本轮只对 Stage 2 已有的 CaseKnowledgeTag 做只读 groupBy |

### 2. 计划一致性（任务 A–E）

- [x] **任务 A（CaseTagPanel 题图懒加载）**：`recent-cases-list.tsx:192-229` `useEffect([caseId])` **并行**发起 `listCaseTags` + `getCase`，各自独立 try/catch；`imageState` 四态机（null/`{content}`/`'none'`/`'failed'`）与计划 §6.1 完全一致；取 `question_image` 中 seq 最小那条（`:213-215`）；加载中骨架"题图加载中…"、失败"题图没拉到，标签仍可用"文案与计划一字不差；`getCase` 用的是**已存在**的 `nana-api-client.ts` 封装，后端 `cases/[id]/route.ts:30-32` 带 G1 归属校验（`findFirst({where:{id,studentId}})`），未新开端点 ✅
- [x] **任务 B（map API caseEvidenceCount）**：`map/route.ts:46-55` 单次 groupBy `by:['nodeId']`+`where:{case:{studentId}}`，输出 `evidenceMap`；`:172` 每节点加 `caseEvidenceCount: evidenceMap.get(n.id) ?? 0`；status/stats 未改。与计划 §6.2 契约逐行对应 ✅
- [x] **任务 C（琥珀层前端）**：`KnowledgeNodeData` 加 `caseEvidenceCount: number`（`canvas.tsx:38`）；三态分支叠加琥珀外环（见核心检查 5）；图例加第 4 样块"收过题"琥珀色（`page.tsx:173-176`，`bg-[#E8A33D]/30 ring-2 ring-[#E8A33D]`）；空状态判定 `isEmpty = litNodeCount<2 && collectedNodeCount===0`（`page.tsx:65-71`）与计划 §6.3 代码示例完全一致 ✅
- [x] **任务 D（首页 hasRecords + RecapBar）**：`page.tsx:77-80` `hasRecords = litNodes.length>0 \|\| collectedNodes.length>0`；`recap-bar.tsx` 三分支（有点亮 / 只 collected / 都不渲染），只 collected 分支说"收过题"不说"点亮了"（DP2 落地）✅
- [x] **任务 E（测试 + build）**：新增 `map-evidence.test.ts` 5 测试覆盖字段存在/挂 tag+1/同节点 2/跨用户隔离/stats 不变；build 通过；101 测试全过 ✅

### 3. 代码质量
- [x] 无明显 bug：状态机四态完备（含 'none' 不报错）、并行请求独立失败不拖全局、`latestLitNode?.name ?? ""` 容空避免 undefined 崩溃
- [x] 错误处理到位：题图失败显式提示（铁律 6）、挂 tag 409 友好提示、map fetch 失败静默降级不挡行动卡
- [x] 代码风格一致：沿用 nana 既有调色板（`#E8A33D` 与计划一致）、注释体例与既有文件一致、SVG 渲染沿用既有 `<g>`+`<circle>` 结构

### 4. 安全性
- [x] 无密钥泄露（grep `api_key/secret/password/token/sk-` 在 diff 中 0 命中）
- [x] 无 SQL 注入风险（全部 Prisma 参数化查询）
- [x] 用户输入有校验（getCase G1 归属、map API studentId 必填校验）
- [x] **本轮未向生产库 `./data/dev.db` 写入任何数据**：dev.db mtime 仍为 `6月29 09:50`（本轮工作在 7 月 2 日），未被动过；测试只连白名单内 `./data/test/test.db`

### 5. 偏离复核（5 条，逐条）

| # | 偏离内容 | 判定 | 理由 |
|:-:|----------|:----:|------|
| 1 | RecapBar 加 `latestNodeName ?? ""` 容空 + 新增 `hasLitNodes`/`collectedNodeCount` props | ✅ 微调 | 计划 §6.4 要求三分支，**必须**知道 hasLitNodes 和 collectedNodeCount 才能分流；DP2 明确要"只 collected 说收过题"，这俩 props 是落地的唯一手段。容空是修潜在 undefined（只 collected 时 latestLitNode 为空）。不改验收标准 |
| 2 | RecapBar 链接 `/nana/map` → `/nana/knowledge-map` | ✅ 微调（实为 bug 修复） | 原 `/nana/map` 是**死链**（实际路由是 `/nana/knowledge-map`）。这是修 bug 不是偏离，反而提升正确性。不影响验收 |
| 3 | 测试用独立用户 `test-nana-map-user`/`test-nana-map-other` | ✅ 微调 | 计划未指定测试用户名。vitest 默认并行跑集成文件，与 `case-api.test.ts` 共用 `test-nana-user` 会互相 cleanup 删数据导致 404 串扰。独立用户消除串扰，测的是**同一契约**，不降约束 |
| 4 | 测试导入路径 `../../../app/...`（3 级） | ✅ 微调 | 文件在 `integration/nana/`，回 3 级到 `src/app` 是机械路径修正，与同目录其它测试同款 |
| 5 | 临时 launcher 脚本已删 | ✅ 确认未入库 | `git ls-files` 查 `run-nana`/`launcher` 0 命中；工作区干净。这是本机 bash 中继不支持 inline env 的本地变通，已删除不入库 |

**结论：5 条全部是真微调，无"实为大偏离"需回 plan-agent 修订的情况。**

### 6. 上游兼容性
- [x] 未修改上游数据库表结构（schema diff 空）
- [x] 无上游文件修改（执行日志登记"本轮全部 nana 自有文件"）
- [x] 新增文件在 nana 独立目录（`src/__tests__/integration/nana/`）

### 7. Agent 同步一致性
- [x] `node scripts/check-agent-sync.js` 通过：`OK: 3/3 agents in sync.`

### 8. 测试
- [x] 本地 `npm.cmd run build` 通过（✓ Compiled successfully）
- [x] 本地 nana 测试套件：**9 文件 101 测试全通过**（`DATABASE_URL=file:./data/test/test.db`，guard-db 白名单内）。新增 `map-evidence.test.ts` 5 测试全绿
- [x] DB 护栏 `guard-db.ts` 存在且生效（白名单 `file:./data/test/test.db` / `file:/app/data/test.db`）
- [x] 测试用 test.db，未碰生产 dev.db
- [N/A] 本地 Docker 测试容器：**本地 Docker Desktop 不可用**（Linux engine 返回 500）。按 AGENTS.md 新门禁，测试容器门禁**交由 GitHub Actions 执行**，不阻塞 commit/push。执行日志已明确记录 ✅
- [ ] GitHub Actions 测试容器门禁：**push 后由 CI 跑，尚未执行**（这是部署前最后一道门，未通过不得部署）

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|:------:|------|----------|-------------|
| — | （无 P0/P1/P2 问题） | — | — |

**说明**：本轮代码未发现需要修复的问题。唯一"待办"是部署门禁里的 CI 测试容器（非代码缺陷，是流程门禁，push 后自然触发）。

---

## 用户验证指南（部署后在真机走一遍）

> 以下 3 项对应计划 §4.1 真机验收清单的核心断点，部署到测试环境后请逐条人工验。

### 断点 1：点开题能看到原图
1. 打开知识地图页（`/nana/knowledge-map`），下拉到"最近拍过的题"
2. 点一道**拍过题图**的题卡片 → 展开面板
3. **期望**：面板顶部出现这道题的**原题图**（不是图标占位符）；加载中有"题图加载中…"骨架
4. 关掉再点**另一道**题 → 题图正确切换（不残留上一道）
5. 点一道**只有录音没题图**的题 → 面板不显示破图、不报错，标签区正常可用

### 断点 2：挂了知识点地图有琥珀反馈
1. 在题面板里给一道题**手动挂**一个知识点（例如"韦达定理"）→ 回知识地图
2. **期望**：对应节点上出现**琥珀色描边环**（不是绿色！）
3. 若该节点已被测评点亮（绿色）→ 显示为**绿芯 + 琥珀环**（两层并存，绿芯还在）
4. 看图例区：应出现第 4 个"收过题"琥珀色样块，跟"已点亮/下一个/未探索"并列
5. 一个**只挂过题、从没测过**的孩子：知识地图**不再全灰空状态**，画布照常显示，挂过的节点亮琥珀环

### 首页提示
1. 只挂过题没测过的账号 → 首页应显示 RecapBar（不是 EmptyHint 空状态）
2. **期望措辞**：是"你最近收过题的知识点有 N 个 / 还没做小检查，做完就能点亮它们"——**绝不能**说"点亮了"（没测过不能说点亮）
3. 点过测评的账号 → RecapBar 仍说"上次你点亮了：X"（绿色语义不变）

---

## 附录：审计执行命令与结果

| 命令 | 结果 |
|------|------|
| `node scripts/check-agent-sync.js` | `OK: 3/3 agents in sync.` ✅ |
| `git diff 06a9f3d..HEAD --stat` | 8 文件 +516/-11（2 doc + 6 src）|
| `git diff 06a9f3d..HEAD -- prisma/` | **空**（schema 未动）✅ |
| `git diff 06a9f3d..HEAD --name-only` | 全部 nana 自有目录（`src/components/nana/`、`src/app/nana/`、`src/app/api/diagnosis/`、`src/__tests__/`）+ 2 doc |
| grep StudentNodeState 写操作 in diff | 0 处（命中全为注释/测试 cleanup）✅ |
| grep 禁用词 in diff | 仅自检注释，无用户可见 ✅ |
| grep secrets in diff | 0 命中 ✅ |
| `git ls-files \| grep run-nana/launcher` | 0 命中（临时 launcher 未入库）✅ |
| `npm.cmd run build` | ✓ Compiled successfully ✅ |
| `vitest run unit/nana integration/nana` | 9 文件 101 测试全通过 ✅ |
| dev.db mtime | `6月29 09:50`（本轮 7/2，未被动）✅ |
