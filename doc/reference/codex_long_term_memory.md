# Codex Long-Term Memory

> 只记录长期有效、可复用、会影响后续协作的约定。临时任务状态不写入。

## 已采纳的长期约定

### 文档治理
- `doc/INDEX.md` 是文档总索引，只负责找文件和看状态，不写长叙事。
- `doc/00_CURRENT.md` 是当前状态入口，只写现在在哪、卡在哪、下一步是什么。
- `doc/DECISIONS.md` 是长期决策台账，只记录会持续影响协作和实现的取舍。
- `doc/reference/` 保留原始参考、调研和临时输入；新增 review / workorder / handoff / postmortem 类文档时，优先使用 `YYYY-MM-DD_HHMM_<artifact>_<topic>.md`。
- 新增或移动文件后更新 `doc/INDEX.md`。

### Git 收口闸门
- 每次 task / 子任务结束前先看 `git status`，再决定是否提交。
- 默认倾向提交；只要有可保留、可审计的成果就及时提交。
- 若同一轮包含多个独立意图，必须拆成多个 commit。
- 收尾必须说明：当前 `git status`、是否提交、为什么提交/不提交。
- 若暂不提交，必须说明下次满足什么条件再提。

### Git 提交格式
- commit message 使用 `<type>[(scope)]: <中文描述>`。
- type 仅允许 `feat` / `fix` / `docs` / `test`。
- scope 使用任务或轮次编号，如 `m2` / `m3` / `m3c`。
- 修改上游文件时，commit message 必须包含 `⚙️上游文件修改`。
- 不使用破坏性回滚手段，日常回退优先 `git revert`。

### 文档与审计习惯
- `/plan → /execute → /audit` 是长期有效的三代理闭环。
- 真题扫描或批处理脚本要避免覆盖历史草稿，必要时先按批次隔离，再合并去重。
- 如果扫描后发现异构输入，要先确认保存策略（`append-safe` / `batch-safe`）再扩量。
- `doc/plan/frontend-architecture-plan.md` 的默认路由命名空间是 `src/app/nana/`，配套组件放 `src/components/nana/`。
- `/nana` 是登录后的场景，低压感，收藏、采集、session 等仍然保持账号归属。
- 后续修改同类方案时，先检查：路由命名是否唯一、切片顺序是否服务主验证点、入口文档是否与鉴权前提一致。

### 双运行时加载
- Claude Code 和 OpenCode 的 agent 加载机制彼此独立，不能默认互通，也不能默认把 `.claude/agents/` 和 `.opencode/agents/` 当成同一套注册目录。
- canonical 子代理正文统一放在 `doc/agents/*.md`，运行时文件分别放在 `.claude/agents/*.md` 和 `.opencode/agents/*.md`，并且必须带各自 runtime 需要的 YAML frontmatter。
- 修改 canonical 后，先跑 `node scripts/sync-agents.js`，再跑 `node scripts/check-agent-sync.js` 验证一致性。
- 运行时 agent 没有被加载时，优先检查 frontmatter 是否符合该 runtime 的要求，而不是先怀疑正文内容。
- `CLAUDE.md` 和 `OPENCODE.md` 只做各自 runtime 的路由与补充说明，不承担跨 runtime 的统一注册职责。
- 双运行时 bootstrap 与验证细节，长期参考放在 `doc/reference/new-project-dual-runtime-bootstrap-guide.md` 和对应决策档中。

### 部署与测试门禁
- Nana 的稳定部署路线已从“服务器现场 build / 本地 Docker 验证”转为“GitHub Actions 构建测试镜像 + 生产镜像，推送 GHCR，腾讯云服务器只 pull/up 运行”。
- Windows 本地 Docker Desktop 不稳定，不能再作为上线硬门禁；本地优先跑 `npm.cmd run build`，测试容器门禁交给 GitHub Actions。
- GitHub Actions 中的 `docker-compose.test.yml` 测试容器仍是硬门禁；CI 测试失败不得合入 `main` 或部署到腾讯云。
- 禁止用生产容器或生产 SQLite 跑测试；测试只能在隔离 test.db 的测试容器里跑。
- 服务器默认只部署 `main`，镜像来自 GHCR；服务器不现场热修源码、不现场构建镜像。
- 部署/回滚/迁移前先备份生产 SQLite；备份失败不得继续。
- 本地 Codex/agent 环境可能把 DNS 劫持到 `198.18.x.x`，不能用该环境的 DNS 结果判断公网部署状态；以手机移动数据、腾讯云服务器、DNSPod/权威 DNS 为准。

### Phase 1.5 真实采集壳
- `/nana/capture` 的首期真实闭环边界是：真拍照、可选真录音、不做 ASR/VLM/诊断，只把 `case = 题图 + 原音 + 转写占位 + AI 提要占位` 存入现有 Case/Artifact API。
- Phase 1.5 暂用 Base64 内联 SQLite 保存题图/录音，属于已登记设计债；当 case 数超过 100 或 `dev.db` 超过 50 MB 时优先迁移对象存储。
- 采集壳前台措辞不得暗示“诊断已完成”；保存后只说“收好了”，诊断闭环留给后续采集到诊断重设计。
- 录音组件涉及 MediaRecorder 时必须处理 unmount cleanup：录音中切 tab/换图/保存/离页不能让旧 recorder 后台回写到新题图。
- 若本地 Docker 不可用，Phase 1.5 这类前端状态修复可先用 `npm.cmd run build` 做本地验证，但最终仍需 GitHub Actions 测试容器绿灯后才能部署。

### Nana v1 闭环与 AI 边界
- 用户侧“v1 闭环”不是动线修正版；必须包含真实 ASR、题图/VLM 理解、初步分类、Case 挂到知识地图、用户能在知识地图看到整理结果。未接真 AI 的阶段只能称为动线修正或骨架版。
- ASR/VLM 进入 v1 必需范围，但产品措辞仍要诚实：识别未完成时只能说“识别稍后接入”或“已收好”，不得暗示已诊断。
- Stage 3 类异步 AI 处理不要只写“201 后不阻塞”而不说明机制；应明确保存后如何触发处理、失败如何记录、前端如何展示“识别中/失败/已分类”。在没有队列前，可优先采用保存后由前端触发 `process` 接口的显式方案。
- Stage 3 v3-revised 的 AI 路线是豆包 Lite 一体化 Case Analyzer：一次调用处理题图和可支持格式音频，返回结构化 JSON。不要回退到 v2 的 Lite ASR + Pro VLM 双管线，也不要在 Case Analyzer 中默认使用 Pro；Pro 已验证不适合作为带音频的一体化路径。
- v1 的 AI 错题卡片只承诺“AI 摘要、课本分类、轻反馈、下一步建议”，不承诺完整 OCR、完整解题、答案、深度诊断或绿色点亮。前台禁用“AI 初步诊断”“薄弱”“掌握”“得分”等会让孩子误解为已诊断的说法。
- `nextActionSuggestion` 在 v1 只能写“回看课本章节 + 一个检查动作”，不得承诺视频链接，除非系统已有真实资源库。
- Stage 3 的学生可见分类以 `TextbookTopic` 为主，内部系统分类仍为 `KnowledgeNode`。`CaseAiResult` 持久化 AI 摘要、转写快照、课本分类、轻反馈、可能方向和下一步建议；`CaseTextbookTopicTag` 存课本分类挂载，`CaseKnowledgeTag` 继续只存内部系统节点挂载。
- Round 2 `/process` API 必须保证重复处理时的状态一致：若用户已编辑摘要或课本分类，数据库和 POST 响应都必须返回用户编辑后的实际持久化值；若用户未编辑，本次低置信或空候选必须清理旧的 `source="vlm"` 标签和旧 AI 分类，避免保留过期证据。

### 知识地图与标签语义
- `CaseKnowledgeTag` 表示题目和系统知识点的采集/分类证据，不等于掌握，不得直接写成 `StudentNodeState.stable`，也不得让节点变绿色。
- 绿色“已点亮”只来自测评或诊断状态；琥珀色 evidence layer 表示“收过题/有错题记录”；蓝色 frontier 表示“下一个/可以先看”。无测评数据时，应优先用“可以先看/起点”而不是强说“下一个”。
- 孩子手工挂标签时不应直接面对 48 个内部 KnowledgeNode；学生可见层应按课本章节/日常叫法组织。孩子标签是“我认为这题跟 X 有关”的证据，不是系统诊断结论。
- 学生课本目录标签与系统 KnowledgeNode 应分层保存并通过映射表连接；后续新增表时优先考虑 `TextbookTopic`、`TextbookTopicKnowledgeNode`、`CaseStudentTopicTag`，并继续保留 `CaseKnowledgeTag` 作为系统/AI/管理员内部标签。
- 孩子标签和系统标签不一致时，前台应温和共存，例如“你收在 X，它可能还和 Y 有关”，不要说“你选错了”。

### Backlog 与技术债治理
- `doc/BACKLOG.md` 是统一待办、技术债、残留代码和后续功能台账的权威入口；`00_CURRENT.md` 只保留当前驾驶舱信息，不再承载完整债务清单。
- Backlog 条目使用类型前缀管理：`PB` 产品后续、`TD` 技术债、`CR` 残留代码、`OD` 运维债、`UX` 体验跟进、`RS` 调研/Spike、`DP` 待拍板决策。
- Backlog 应物理区分“活跃 backlog”和“停车场”。每轮 plan 阶段只从活跃区挑 1-2 个任务；停车场条目进入开发前必须先移入活跃区并补齐目标窗口、触发条件和关闭条件。
- 触发型技术债（如 Base64 artifact 迁移）应保持 `watching` / `Triggered`，只有触发条件满足时才进入执行计划；不要因为在台账中存在就提前做迁移。
- Stage 3 v2 残留（如 `asr-transcribe.ts`、`vlm-classify.ts` 和对应测试）先标记为 `CR`，不移动不删除、不允许新 import；等 v3 `case-analyzer` + `/process` 稳定后再单独清理。

### 知识地图移动端体验
- 手机端知识地图应是地图优先的整屏体验，不应让最近题图或错题列表常驻占据上半屏。题图预览和最近题列表适合放在底部抽屉、浮层或按需展开入口中。
- 移动端图谱不能把 2460px 桌面 SVG 强缩到 375px；若要接近设计稿，应使用手机尺寸 viewBox 和手工/专门布局，让节点名 1:1 可读。列表模式可以作为可访问备选，但不能替代“知识地图”的地图心智。
- RecapBar 更适合作为状态回顾，不宜再承担和首页 ActionCard 重复的导航入口；首页已有一级入口时，避免多个按钮跳同一页面造成“点了没反应”的体感。

### 生产图谱数据与种子脚本
- 生产库可能出现 admin seed 已跑但图谱 seed 未跑的状态，因为 Prisma `db seed` 和 `npm run seed` 可能指向不同脚本。若 KnowledgeNode/Mainline 为空，知识地图和挂标签会整体不可用。
- 不要把生产图谱 seed 放进 Dockerfile build。静态图谱数据应通过幂等部署后 bootstrap、一次性运维脚本或 smoke check 保障；执行前必须备份，执行后明确报 KnowledgeNode/KnowledgeEdge/Mainline 等行数。
- 部署后 smoke check 应包含图谱数据非空检查，例如 `KnowledgeNode.count() > 0`；为 0 时应停止验收并报警。

### 移动端性能与题图处理
- 题图列表 API 不应返回完整 Base64；列表只返回轻量标志，单题详情按需懒加载，并缓存已拉取的 case detail。
- 手机拍照原图即使文件小于 1 MB，也可能因 Base64 膨胀和尺寸过大造成加载慢；新题图应统一走压缩流程，而不是只按原始 file.size 判断是否压缩。
- 旧测试图或测试 case 清理属于生产数据删除，必须按账号范围备份、报数、确认后执行；优先删除整套测试 case/artifact/tag，避免留下半残数据。
- 手机“点击慢/不顺畅”要先测量再修，重点看路由点击反馈、KnowledgeMapCanvas 重绘、旧 Base64 图、bundle/hydration、浮层动画和 API waterfall。不要凭感觉把多个性能改动揉成一个大改。

### CI 门禁维护
- 即使一次变更看似纯前端，只要 CI 红灯就不得直接部署。若 CI 因环境变量如 `DATABASE_URL` 缺失而长期红灯，应先修复 CI 门禁，再继续发布。
- CI 修复应作为独立 `fix` commit，不写入密钥，确保 `guard-db.ts` 白名单、测试数据库路径和 workflow env 一致。
- 遇到 E2E 红灯时，不能先假定是历史遗留。必须对比本次失败签名和最近成功/失败记录；若失败指向本轮改动页面或登录/鉴权路径，应停止部署并修测试或代码。
- 登录成功后的落点是产品契约，也是 E2E 契约。若 `/login` 从跳 `/` 改为跳 `/nana`，所有依赖旧落点的 E2E 必须同步更新；非 Nana 测试应登录后显式导航到自己的目标页，而不是隐式依赖登录默认落点。
- 多 workflow 并存时，部署硬门禁要写清职责边界。`build-and-push` 的测试容器绿灯不能自动覆盖另一个 workflow 中由本轮变更引起的 E2E 红灯。

### 性能诊断工具
- Bundle 分析属于测量工具，不应把不可复现或与当前 Next/Turbopack 不兼容的 analyzer 配置长期留在生产代码路径。报告可保留，但配置和依赖应能在普通 build 下无副作用，且分析方法要写清。
- 移动端性能优化优先做低风险“点了有反馈、慢了有解释、不能重复提交”的交互响应层，再进入 Web Worker、PWA、对象存储、Server/Client 拆分等高风险工程。

### 孩子视角的闭环测试治理
- 用户希望自动化测试替代大部分重复手机点测，但评价目标不是“页面能打开”，而是“孩子能否顺利得到一份可复习的错题集”。测试设计应围绕用户结果，而不是围绕现有按钮和路由固化实现。
- 测试框架长期分为五层：确定性 CI 功能闭环、性能与毛刺证据采集、真实 Provider Smoke、AI 孩子视角评审、少量真机抽检。程序负责硬断言；AI 只做有截图/步骤/指标引用的语义体验评审，初期且默认不作为发布硬门禁。
- 孩子侧分类和系统侧分类是双层契约：孩子查看、纠正、汇总和打印使用 `TextbookTopic`；内部 `KnowledgeNode` 用于系统标签和知识地图琥珀证据。自动化需要同时验证两层一致性，但不能让孩子直接面对 48 个内部节点。
- “手动改课本分类”是 AI 分类不准时的纠错/恢复路径，不应成为每道题完成闭环的必经动作。幸福路径应依靠 AI 自动整理；测试另设手动纠错场景。
- 真实豆包不能通过浏览器拦截 `/process` 来假装测试后端。确定性 E2E 应把 `VOLCENGINE_BASE_URL` 指向本地兼容假 Provider，让真实 `/process`、音频转码、解析、事务和落库代码完整执行。
- GitHub 托管 runner 上的绝对性能耗时不宜直接成为硬门禁。应先积累稳定基线，再按趋势告警；硬门禁优先限制无点击反馈、保存失败、关键 API 失败、未处理异常和布局溢出。
- 生产写入型 Smoke 必须使用专用测试账号，并在具备经审计的精确清理能力后才能周期运行；不得让自动化测试数据长期污染生产库。
- 相机选择器、真实麦克风授权、iOS Safari、微信内置浏览器和实际打印仍需真机抽检，浏览器仿真不能宣称完全替代。

## 待持续观察
- 项目 AI 是否稳定执行“task 结束后先做 git 收口”的流程。
- 扫描类脚本是否已经统一成批次隔离或合并去重，避免覆盖写。
- 如果后续再次出现“只总结不收口”的情况，需要继续强化收尾闸门提示。
- 真机验收继续以手机实际体感为准：拍照、录音权限、保存 case、题图加载、知识地图可读性、浮层可关闭、无“诊断完成”暗示。
- 后续应补 MediaRecorder/jsdom 单测，至少覆盖“录音中 unmount 不回写父组件并清理 stream/timer”。
- Stage 3 增加 transcript 或 case 更新端点时，需要补充前端 case detail 缓存失效机制，例如更新后 `caseDetailCache.delete(id)`。
- 待用户最终确认：在测试框架进入代码实现前，是否先冻结 `Nana v1 最小错题集闭环验收契约`。建议契约明确核心闭环、纠错恢复、辅助解释三层功能，并把每个产品能力映射到确定性 CI、真实 Provider、AI 评审或真机抽检。
