# Phase 1.5 真实采集最小闭环 + 测试容器门禁迁至 CI · 审计报告

> 关联计划: doc/plan/phase1.5-real-capture-plan.md、doc/plan/docker-test-gate-ci-migration-plan.md
> 执行日志: doc/executionlog/phase1.5-real-capture-log.md
> 审计日期: 2026-07-01
> 审计代理: audit-agent
> 本轮覆盖两个独立批次（Batch 1 = 测试门禁迁移；Batch 2 = Phase 1.5 采集闭环）

---

## 审计结论（大白话）

**Batch 1（测试门禁迁移到 GitHub Actions）：✅ 通过**

这一轮只改规则文档、没碰任何代码。核心红线——"本地 Docker 不强制，CI Docker 强制；生产容器永远不能跑测试"——在四个 agent 文件和 AGENTS.md 里**每一处都成对出现**，没有出现"只写本地可跳过、漏写 CI 必须过"的半截话。DB 护栏（test.db 隔离、dev.db 保护、生产容器禁令）一道没削。sync-agents.js 跑过、check-agent-sync.js 验过 exit 0（我也重跑了一遍，仍 exit 0）。读完全部改动，**没有任何一处能被误读成"测试现在变成可选的了"**。可以放心通过。

**Batch 2（Phase 1.5 真实采集最小闭环）：⚠️ 有条件通过**

代码本身和计划高度一致，质量不错：真拍照、真录音、真存库、措辞全合规、安全铁律 3（不改上游表）和铁律 4（不泄密钥）都没碰。评审两轮挑出的状态/资源/竞态 bug 都修了，而且修得对。**两条遗留条件**（都是流程性的，不是代码质量问题）：

1. **本地测试容器没跑**——Docker Desktop 起不来。按刚迁完的新门禁规则，本地 Docker 不可用是允许的，**只要执行日志写明 + CI 门禁待跑**。这两条都满足（执行日志"遇到的问题"已写明 Docker 未运行；代码在 dev 分支，还没合 main，所以 CI 还没跑）。**所以：合并 dev→main 之前，必须让 GitHub Actions 的测试容器先跑绿。**
2. **真机验收（F2）按计划本来就归用户做**，本轮由审计代理解不了，已在"用户验证指南"列出步骤。

代码层面我给通过；合并/部署的放行权交给 CI 绿灯 + 用户真机确认。

---

## 检查清单

### Batch 1：测试容器门禁迁至 GitHub Actions

#### 计划一致性
- ✅ 计划 §2 的 9 个任务全部落地：AGENTS.md 新小节、3 个 canonical agent 文件修订、docker-troubleshooting-guide 顶部新小节、INDEX.md 描述刷新、sync-agents.js 跑过、check-agent-sync.js exit 0。
- ✅ `git show d51a906 --stat` 显示 12 个文件，全是文档 + sync 生成文件，**零源码、零 CI 配置改动**（符合计划"纯规则文档修订，零源码改动"性质）。
- ✅ 计划 §4 验收项逐条满足（见下方"措辞红线""DB 护栏""同步一致性"）。

#### 代码质量（文档质量）
- ✅ 无逻辑矛盾。每个改动的 before/after 与计划 §6 技术附录逐字一致。

#### 安全性
- ✅ 无密钥泄露（纯文档轮，无代码）。
- ✅ DB 护栏未削弱（详见"上游/部署"小节）。

#### 措辞红线（计划 §5 风险 1 — 最高优先，重点复核）
> 评审特别警告："本地 Docker 不强制，CI Docker 强制"必须成对出现，不能只写一半。

逐文件核验（每处都确认"本地可选"是否**配对**了"CI 强制"或"生产容器禁令"）：

| 文件 | "本地可选"语句 | 配对的"CI 强制 / 生产容器禁令" | 判定 |
|------|---------------|-------------------------------|------|
| AGENTS.md 新小节 | "本地 Docker Desktop 不再作为上线前置门禁" | "测试容器门禁保留，但强制执行位置改为 GitHub Actions" + "GitHub Actions 测试容器失败 → 不得部署" + "禁止用生产容器或生产数据库跑测试" | ✅ 三重配对 |
| AGENTS.md dev 合入 main 块 | "如本地 Docker 可用…是加分项；如不可用，执行日志写明" | "GitHub Actions 测试容器门禁通过（CI…退出码 0）" + "部署镜像来自 GitHub Actions 成功构建" | ✅ 成对 |
| execute-agent.md 完成状态 | "本地 Docker 不可用时：…交给 GitHub Actions 执行" | "GitHub Actions 测试容器通过后，才允许部署" | ✅ 成对 |
| execute-agent.md 工作流 #5 | "本地 Docker 不可用时…把门禁交给 CI" | "但门禁交给 CI ≠ 允许用生产容器，docker exec 进 prod 容器跑测试始终禁止" | ✅ 成对（含生产容器禁令） |
| audit-agent.md 测试小节 | "本地 Docker 可用时 / 不可用时" | "GitHub Actions 日志显示…退出码 0" + "没有退回生产容器跑测试" | ✅ 成对（含生产容器禁令） |
| audit-agent.md 部署审计 | （无独立本地语句） | "部署镜像来自 GitHub Actions 成功构建" + "GitHub Actions 测试容器门禁通过" | ✅ |
| plan-agent.md 计划必需字段 | "本地 Docker **不**作为部署前置" | "CI 测试容器门禁…CI 失败即停止部署" | ✅ 成对 |
| docker-troubleshooting-guide 顶部 | "Docker Desktop…不再是部署上线的硬前置条件" | "GitHub Actions 测试容器通过前，不得部署" + "禁止用生产容器替代测试容器" | ✅ 成对（含生产容器禁令） |

**结论：8 处改动点全部成对，没有半截话。措辞红线守住。** ✅

#### 上游兼容性 / DB 护栏（计划 §5 风险 3）
- ✅ D-10（prod/test 容器分离）、D-11（test:all 聚合）、Gate-4（测试必须在测试容器跑）三项决策**逐字保留**，未削弱。
- ✅ test.db 隔离 / dev.db 保护 / 生产容器禁令在 AGENTS.md、execute-agent.md、audit-agent.md 三处均显式重申。
- ✅ `guard-db.ts`、`docker-compose.test.yml`、`package.json` 的 `test:all` 均未触碰（diff 范围内无这些文件）。

#### Agent 同步一致性
- ✅ `node scripts/check-agent-sync.js` → `OK: 3/3 agents in sync.` exit 0（审计代理本次重跑确认）。

#### 测试（文档轮无自动化测试）
- ✅ N/A（纯文档修订，无测试可跑，符合计划 §4 测试策略）。

---

### Batch 2：Phase 1.5 真实采集最小闭环

#### 计划一致性

| 任务 | 计划要求 | 实际代码 | 判定 |
|------|---------|---------|------|
| G1 GET 归属校验 | `findUnique→findFirst({where:{id,studentId}})`，跨用户→404 | `route.ts:30-37` 用 `findFirst({where:{id, studentId: session.user.id}})`，命中不到返回 404 | ✅ |
| G2 POST 校验 | type 白名单 4 项 + content ≤2MB + artifacts ≤8，违规→400 | `route.ts:23-65`：`ALLOWED_TYPES`（4 项）、`MAX_CONTENT_LEN=2MB`、`MAX_ARTIFACTS=8`，逐项 400+可读原因 | ✅ |
| A 拆 mock | 删 MOCK_*，确立状态机 | mock-data.ts 已删（git 确认）；全仓库无 MOCK_QUESTION/MOCK_TRANSCRIPT/MockAsrProvider 引用；page.tsx 状态机 empty/photoTaken + idle/saving/saved/error | ✅ |
| B 真拍照 | `<input capture="environment">` + 复用 processImageFile + 空状态"先拍一下这道题" | question-image-capture.tsx:63-87 `<input type="file" accept="image/*" capture="environment">`；调 `processImageFile`；空状态"先拍一下这道题" | ✅ |
| C 真录音 | getUserMedia + MediaRecorder + mimeType 动态探测 + 60s 自动停 + 拒权限显式提示 + 移除 MockAsrProvider（保留接口缝） | voice-recorder.tsx 全部实现：`getUserMedia`(:150)、`MediaRecorder`(:161)、`pickMimeType` webm→mp4(:63-69)、60s `setTimeout`(:206-209)、拒权限提示(:153)、AsrProvider 接口保留未实例化(:30-33) | ✅ |
| D 接 createCase | 按 §7.7 方案 A 组装 artifacts + 3MB 预检 + 成功/失败文案 + 无图禁保存 | page.tsx:134-206 `buildArtifacts`（question_image + 可选 audio_note/audio_meta + transcript="尚未转写"）；3MB 预检(:177)；成功"这道题已经收好了"(:33)/失败"没存成功，再试一次"(:34)；无图禁保存(:167-170) | ✅ |
| E 措辞合规 | 全页无诊断/薄弱/得分/掌握/失败；"帮你整理"占位不调 LightFeedback | 见下方"措辞走查"专项 | ✅ |
| G3 设计债 | 00_CURRENT.md + active_spec.md 两处各加一条 | 00_CURRENT.md:129（表第 3 行）+ active_spec.md:60（设计债 #5），含迁移阈值 100 条/50MB + 迁移方向 | ✅ |
| F1 本地构建 | npm run build 通过 | 执行日志记录 3 次 build 通过（14.5s / 16.4s / 16.8s） | ✅ |
| F2 真机/部署 | 用户真机验收 | ⬜ 延后至用户（计划本身就把 F2 归用户） | ⬠ 计划内延后 |

#### 代码质量
- ✅ 状态机清晰（page.tsx 注释 + §7.6 契约一致）。
- ✅ 错误处理到位：拍照失败显式提示（question-image-capture.tsx:51）、拒麦克风显式提示（voice-recorder.tsx:153）、保存失败显式提示（page.tsx:204）、浏览器兼容探测（voice-recorder.tsx:136-146）。符合铁律 6（显式失败不掩盖）。
- ✅ 代码风格与现有 capture 组件一致（同套配色、Tailwind 任意值、LXGW 手写体）。

#### 安全性
- ✅ 无密钥泄露：grep `sk-|api_key|secret|password|token|Bearer` 在 capture 目录零匹配。
- ✅ 用户输入有校验：G2 后端白名单 + 体积/条数上限（前端不可全信，后端兜底，符合 §7.11）。
- ✅ 本轮未向 `./data/dev.db` 写测试数据：所有测试在 test.db 测试容器跑（本轮本地未跑，CI 待跑）；采集页 createCase 写的是登录用户自己的 case，非测试注入。

#### 措辞走查（守 OPS §4 前台措辞铁律）
> OPS §4：不出现"错""失败""得分""未掌握"等负向词；口语化。

全 capture 目录 grep `诊断|已诊断|薄弱|得分|掌握` 仅 2 处命中，**均为代码注释**（page.tsx:17 注释"全页无'诊断…'"、page.tsx:395 注释"不用'诊断'词"），**非用户可见文案**。

用户可见文案走查（全部合规）：
- 空状态："先拍一下这道题" ✅
- 录音 idle："说说看" / 副标题"想到哪说到哪，不用完整。最长录 60 秒。" ✅
- 录音中："正在听你说" + 计时 ✅
- 录音完成："录音收好了，转写稍后接入" ✅（无 mock 逐字稿）
- 保存成功："这道题已经收好了，可以再拍一道" ✅
- 保存失败："没存成功，再试一次" ✅（用"没存成功"避开了"失败"一词）
- 体积超限："材料太大，请重新拍一张或录短一些" ✅
- 录音中拦截："先把话说完，再收这道题" ✅
- 计数："已收 X 道" ✅
- "帮你整理"tab："先把材料收好，等多拍几道再一起看规律" ✅（不调 LightFeedback）
- 引导："回首页看看" ✅（非"开始诊断"）
- 拒麦克风："没拿到麦克风权限，可以在浏览器设置里打开。不录音也能保存这道题。" ✅

**结论：措辞铁律全部守住。** ✅

#### 偏离复核（执行日志偏离记录 #1–11）
> 审计核心：逐条判断"真微调"还是"伪装成微调的大偏离"。重点看 #8–11（评审第二轮新增项）。

| # | 内容 | 性质判定 | 理由 |
|---|------|---------|------|
| 1 | question-image-viewer.tsx 拆分后删除（dead code） | ✅ 真微调 | 拆分计划本就允许；保留无引用文件才是隐患 |
| 2 | completed 文案改为 §C3 指定文案 | ✅ 真微调（实为遵计划） | 计划 §C3 明确要求该文案，备注性质 |
| 3 | 选择新增独立组件而非就地改 viewer | ✅ 真微调 | 计划 §B1/§3 明确"二选一" |
| 4 | recorderKey 强制 remount | ✅ 真微调（bug 修复） | 评审 P1-a：保存后录音组件内部 state 不重置。属状态一致性修复，不改变验收标准 |
| 5 | handleImageChange 清 audio | ✅ 真微调（bug 修复） | 评审 P1-b：新题图+旧录音错配。属数据一致性修复 |
| 6 | setState("completed") 移进 onstop | ✅ 真微调（状态机分支补全） | 评审 P2-a：60s 自动停不走 handleFinishRecording。属分支补全 |
| 7 | TranscriptionPanel 加 editable prop | ✅ 真微调 | 评审 P2-b：无 ASR 时 contentEditable 误导。组件仍通用（保留可编辑分支），未来 ASR 传 true 即恢复 |
| 8 | VoiceRecorder unmount cleanup + abortedRef | ✅ 真微调（资源/数据安全 bug 修复） | 评审第二轮 P1：录音中切 tab/换图/保存卸载组件，旧 recorder 后台继续→60s 后 onstop 回写已重置的父 state→"下一题图+上一段录音"错配 + 麦克风资源泄漏。**纯防御性修复，不新增功能，不改验收标准** |
| 9 | onRecordingStateChange 回调 + 父组件 UI 禁用 | ✅ 真微调（#8 的主动防护层） | #8 是被动兜底（卸载时清理），#9 是主动防护（录音中不让用户触发卸载场景）。双层防御，仍是 robustness 范畴，非新功能 |
| 10 | savedResetTimerRef + 换图 clearTimeout | ✅ 真微调（竞态修复） | 评审第二轮 P2：保存成功 1400ms 延迟内用户重拍→新图被旧 timeout 清空。纯竞态 bug 修复 |
| 11 | QuestionImageCapture 加 disabled prop | ✅ 真微调（#10 的 UI 防护层） | saving/saved/录音中禁止换图，与 #10 同源，UI 防护 |

**#8–11 重点判定**：这四项是评审 AI 第二轮发现的真实 bug（资源泄漏、数据错配、竞态），修复方式是**防御性加固**（卸载清理、UI 禁用、timer 句柄管理），**没有引入任何新功能、没有改变验收标准、没有扩大范围**。验收标准（§4.1–4.4）全部围绕"真拍照/真录音/真存库/措辞合规/后端校验"的快乐路径，这些修复让快乐路径更稳健、让边界路径不崩，属于"微调记录后继续"的正确处置，**不需要回 plan-agent**。

**偏离复核结论：11 条全部确认为真微调，无"伪装成微调的大偏离"。** ✅

#### 上游兼容性
- ✅ 铁律 3 守住：`prisma/schema.prisma` 未改（git diff 5dd284c..HEAD 对该文件零变更）。
- ✅ `src/lib/image-utils.ts` 未改（只读复用，git diff 零变更）——符合计划 §3/§5.1。
- ✅ 所有代码改动落在 nana 自有目录：`src/app/nana/capture/`、`src/components/nana/capture/`、`src/app/api/nana/cases/`、`src/__tests__/integration/nana/`。无上游文件修改。
- ✅ 新增文件在独立目录中。

#### 部署审计
- ✅ 本地生产构建通过（执行日志 3 次 build，退出码 0）。
- ⬠ GitHub Actions 测试容器门禁**尚未跑**（代码在 dev，未合 main，CI 未触发）。**这是合并/部署的前置硬门禁**。
- ✅ 本地 Docker 不可用已在执行日志"遇到的问题"明确记录（符合 Batch 1 新规则）。
- ⬜ 服务器部署未发生（本轮不涉及，待 CI 绿 + 用户确认后再部）。
- N/A SQLite 备份、commit 一致性、热修检查（本轮未部署，不适用）。
- ✅ `.env` 未进 git（git status 干净）。
- ✅ 生产构建不依赖不稳定外部资源（无 Google Fonts/外部 CDN 新增）。

#### Agent 同步一致性
- ✅ `node scripts/check-agent-sync.js` → exit 0（本轮代码未改 agent canonical 文件，同步一致性由 Batch 1 保证）。

#### 测试
- ✅ 本地 `npm.cmd run build` 通过（执行日志 3 次）。
- ⬠ 本地 Docker 不可用 → 本地测试容器**未跑**（执行日志已记录 Docker Desktop 守护进程未运行）。
- ⬠ GitHub Actions 测试容器**未跑**（dev 未合 main）——**合并前置**。
- ✅ 测试使用 test.db（docker-compose.test.yml 配置未改，护栏 `guard-db.ts` 仍在）。
- ✅ 无生产容器跑测试记录（执行日志明确"不退回 prod 容器"）。
- ✅ 集成测试 `case-api.test.ts` 已为 G1/G2 同步更新：
  - G1 跨用户读取→404（test:254）
  - G2 非白名单 type→400（test:153）、旧 type image→400（test:165）、content>2MB→400（test:177）、content 非字符串→400（test:190）、条数>8→400（test:202）、合规全量 201（test:215）
  - 覆盖计划 §4.3 全部验收点。
- ⬠ 计划 §4.5「建议非强制」的 VoiceRecorder 单测、保存门禁单测**未补**（计划标为非强制，不阻塞，记为 P2 观察）。

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P1 | **合并 dev→main 前必须让 GitHub Actions 测试容器跑绿**。本轮本地测试容器因 Docker Desktop 未运行而未跑，CI 是当前唯一未跑过的门禁。 | （流程，非代码） | 把 dev 合入 main（或推 dev 触发 CI）→ 确认 `docker-compose.test.yml` 在 CI 退出码 0 → 再部署。CI 红则回 dev 修，不在服务器热修。 |
| P2 | 执行日志"完成状态"小节与实际状态不同步：勾选项写"代码已提交（待执行）""可进入审计阶段——待测试容器验证通过后"，但代码**实际已提交**（ea38002…153bd17 共 5 个 commit）。 | doc/executionlog/phase1.5-real-capture-log.md:115-120 | 把 `[ ] 代码已提交` 改为 `[x] 代码已提交（ea38002…153bd17）`；"可进入审计阶段"按新门禁规则改述为"测试容器门禁交由 CI"。不影响验收，纯文档准确性。 |
| P2 | 执行日志"完成状态"用的是**迁门禁前**的旧措辞（`test:all 通过` BLOCKED），与本轮同步迁过的新规则（本地 Docker 不可用→记录+CI 兜底）口径不一致。 | doc/executionlog/phase1.5-real-capture-log.md:117-118 | 按 execute-agent.md 新"完成状态"模板的二选一分支重述（内容已满足，仅标签过时）。 |
| P2 | 计划 §4.5 标为「建议非强制」的组件单测（VoiceRecorder 状态机、保存门禁）未补。 | src/components/nana/capture/voice-recorder.tsx（无对应 *.test.ts） | 可选：后续轮补最小单测覆盖 idle/recording/completed 分支与 getUserMedia 失败分支。本轮不阻塞。 |

> 说明：未发现 P0 问题。P1 是流程门禁（CI 待跑），不是代码缺陷。

---

## 用户验证指南

> 本轮核心是**真机行为**，自动化测试覆盖不到浏览器 getUserMedia/MediaRecorder/相机调起的真实表现，须用手机真机走完整流程。以下步骤对应计划 §4.1 真机清单 + §4.2 措辞走查 + §4.3 后端加固。

### 前置：合并 dev→main 并部署到生产（按新 CI 门禁）
1. 确认 GitHub Actions 测试容器门禁绿（`docker-compose.test.yml` 退出码 0）。
2. 服务器跑 `bash backup.sh` 备份 SQLite（备份失败则停止）。
3. 服务器 `docker compose -f docker-compose.prod.yml pull && up -d`。
4. 确认服务器镜像 tag = 本次 commit。

### A. 真机采集闭环（手机访问 https://nana.nanatop.xyz/nana/capture ，已登录）
1. 打开页面 → 应看到**"先拍一下这道题"**占位（不再有写死的"第 3 题"文字卡）。
2. 点拍照入口 → 手机调起**后置相机或相册**（`capture="environment"` 生效）。
3. 选/拍一张题图 → 题图区显示**真实照片**（不是文字）。
4. 切到"讲讲思路"tab → 点绿色按钮 → 系统**弹出麦克风授权对话框**。
5. 授权后 → 显示**"正在听你说"** + 波形动画 + 计时（最长 60s）。
6. 点"我听完了" → 显示**"录音收好了，转写稍后接入"**（不再播 mock 逐字稿）。
7. 点"收好这道题" → Network 面板看到 `POST /api/nana/cases` 返回 **201**。
8. 页面显示**"这道题已经收好了，可以再拍一道"**，计数变"已收 1 道"，状态重置可再拍。
9. 拒绝麦克风授权时 → 显示"没拿到麦克风权限…不录音也能保存这道题"，**保存仍可用**。
10. 未拍照时点保存 → 按钮 disabled / 提示"先拍一下这道题"。

### B. 数据库落库确认
11. 用 prisma studio 或 SQL 查 `Case`/`Artifact` 表 → 确认有新 case，artifacts 含 `question_image`，可选含 `audio_note`/`audio_meta`，`transcript`="尚未转写"。

### C. 后端加固验收（§4.3）
12. **GET 归属校验**：A 账号建 case，换 B 账号请求 `GET /api/nana/cases/{A的id}` → 返回 **404**（非 200、非 403）。
13. **POST 类型白名单**：用 curl/Postman 发 `type:"evil"` → 返回 **400**。
14. **POST 体积上限**：发 content > 2MB 的 artifact → 返回 **400**，数据库无写入。
15. **POST 正常不回归**：合规 artifacts（图+音+meta+transcript）→ 仍 **201**。

### D. 录音边界场景（评审第二轮修复点，建议测）
16. 录音中切"我的话"/"帮你整理"tab → 应被**禁用**（点击无反应，按钮变灰）。
17. 录音中点"收好这道题"/"重新拍一张" → 应提示**"先把话说完，再收这道题"**。
18. 录音中直接关闭页面/切走 → 麦克风指示灯应**熄灭**（recorder 已被 unmount cleanup 停掉，不泄漏）。
19. 保存成功后 1.4 秒延迟内**立刻重拍** → 新图应**保留**（不被旧 timeout 清空）。

### E. 措辞终检
20. 全页扫一遍：**无**"诊断/已诊断/薄弱/得分/掌握/失败"。"帮你整理"tab 是"先把材料收好…"占位，不假装已分析。

---

## 附录：本轮审计执行的操作

1. `git log --oneline -15` — 核对 commit 序列（ea38002…153bd17 Phase 1.5；d51a906 测试门禁迁移）。
2. `node scripts/check-agent-sync.js` — exit 0，3/3 一致。
3. `git show d51a906 --stat` / `-- AGENTS.md` / `-- doc/agents/*.md` — 核对测试门禁迁移文件范围与措辞。
4. `git diff 5dd284c..HEAD --stat` / `--name-only` — 核对 Phase 1.5 改动范围（仅 nana 自有目录 + 文档）。
5. `git diff ea38002~1 -- src/lib/image-utils.ts prisma/schema.prisma` — 零变更（铁律 3 守住）。
6. 逐文件 read：`cases/[id]/route.ts`、`cases/route.ts`、`page.tsx`、`voice-recorder.tsx`、`question-image-capture.tsx`、`transcription-panel.tsx`、`case-api.test.ts`。
7. grep 措辞：capture 目录 `诊断|已诊断|薄弱|得分|掌握` → 仅注释命中；`MOCK_QUESTION|MockAsrProvider` → 零命中。
8. grep 密钥：capture 目录 `sk-|api_key|secret|token` → 零命中。
9. grep 设计债：00_CURRENT.md / active_spec.md → 两处均有 Base64 内联条目。
10. `git status --short` — 工作区干净，在 dev 分支。

> 审计代理声明：本轮仅审查、未修改任何代码或文档（本审计报告除外）。
