# 统一待办台账

> 📌 **维护者**：plan-agent（新增/调整）、execute-agent（偏离记录）、audit-agent（确认关闭）
> 📌 **初始版本来源**：`doc/auditlog/audit-doc-backlog-governance-2026-07-05.md`
> 📌 **完整待办/技术债以此文件为准**。旧文档（00_CURRENT/active_spec/DECISIONS.md）中的重复条目正在逐步迁移。
> 📌 **维护规则**：见 [plan/backlog-tracking-plan.md](plan/backlog-tracking-plan.md) §4

---

## 活跃条目

| ID | 类型 | 标题 | 优先级 | 状态 | 背景/来源 | 首次记录 | 阻塞/依赖 | 关闭条件 |
|----|------|------|:------:|:----:|-----------|:--------:|:----------:|----------|
| OD-001 | Ops Debt | 实现部署后 KnowledgeNode smoke check 自动化 | P1 | open | 2026-07-02 生产事故：重新部署后 KnowledgeNode=0（图谱种子丢失），根因 Dockerfile 只跑 prisma db seed 不跑 seed_graph.ts。已手动修复但靠人工不可靠 | 2026-07-05 | 部署流程 | 实现 `scripts/post-deploy-smoke-check.ts` + 集成部署流程；检查项：KnowledgeNode≥48、KnowledgeEdge≥36、Mainline≥10、Case/Artifact 前后一致 |
| OD-005 | Ops Debt | 配置生产 Volcengine 环境变量 | P1 | open | volcengine-vision-integration-plan.md 要求 VOLCENGINE_API_KEY + VOLCENGINE_BASE_URL 生产就绪（Stage 5 前置条件） | 2026-07-05 | Stage 5 开始前 | 生产 `.env` 配置完成 + curl 验证通过 |
| OD-002 | Ops Debt | 统一 `.env` DATABASE_URL 游离 DB 配置 | P2 | open | 00_CURRENT 设计债 #4：`.env` 的 `DATABASE_URL=file:/app/data/dev.db` 是 Docker 容器内路径，本地非 Docker 运行 prisma 时解析到 `E:\app\data\dev.db`（仓库外游离 DB）。生产/CI 无影响 | 2026-07-05 | — | 本地开发显式设 DATABASE_URL 或统一配置方案（如 `.env.local` 覆盖） |
| OD-003 | Ops Debt | E2E 补"最近拍过入口按钮"路径 | P2 | open | mobile-automation-test-plan.md 标记 E2E 缺少对该入口路径的覆盖 | 2026-07-05 | — | E2E 测试覆盖该路径 |
| OD-004 | Ops Debt | 上游 5 个测试在 `.env.test` 下失败隔离 | P2 | open | progress.md 容器分层记录 + DECISIONS 开放项：config.test.ts/logger.test.ts 等上游测试对环境变量有隐含默认值假设 | 2026-07-05 | — | 开独立计划 upstream-test-env-isolation 处理 |
| OD-006 | Ops Debt | CI 迁移后本地 Docker 不可用的记录义务 | P3 | open | docker-test-gate-ci-migration-plan.md：AGENTS.md 已更新部署发布门禁，要求本地 Docker 不可用时执行日志明确注明 | 2026-07-05 | — | 执行日志持续遵守该守则 |
| PB-001 | Product Backlog | OCR v2 Spike — AI 题面文本完整识别 | P2 | open | product/nana-product-behavior-manual-v1.md §10 "v1 不做清单" | 2026-07-05 | — | Spike 完成 + 输出报告 + 决策是否进入路线图 |
| PB-002 | Product Backlog | 实现图片裁剪/旋转/涂抹 | P2 | open | product/nana-product-behavior-manual-v1.md §10 "v1 不做清单" | 2026-07-05 | — | 用户确认是否在 v1 范围内；裁剪依赖 `react-image-crop` 已存在 |
| PB-003 | Product Backlog | 实现疑似重复题识别 | P2 | open | product/nana-product-behavior-manual-v1.md §10 "v1 不做清单" | 2026-07-05 | RS-002（先调研算法可行性） | 可用的相似度算法验证 + UI 方案 |
| PB-004 | Product Backlog | 实现完整解题步骤/答案 | P2 | open | product/nana-product-behavior-manual-v1.md §10 "v1 不做清单" | 2026-07-05 | 依赖 D-8 解除（LLM 调用启用） | LLM 调用启用 + 明确"不给答案"边界 |
| PB-005 | Product Backlog | 实现音频逐句时间轴 | P2 | open | product/nana-product-behavior-manual-v1.md §10 + §v2 待办 | 2026-07-05 | 数据结构扩展 + 后端 ASR 接通（Stage 5 范围内） | 数据结构支持逐句时间戳 + 后端 ASR 接通 |
| PB-007 | Product Backlog | 扩展 TextbookTopic 覆盖范围（当前仅 16 章节） | P2 | open | product/nana-user-manual-v1-draft.md Q&A "未分类/暂未覆盖"提示 | 2026-07-05 | 教研工单完成 | 覆盖范围扩展到用户常见章节 |
| PB-006 | Product Backlog | 实现打印页简洁版/带题图版切换 | P3 | open | product/nana-product-behavior-manual-v1.md §13.8 | 2026-07-05 | — | 用户确认是否需要该功能 |
| PB-008 | Product Backlog | 方法族地图前台化 | P3 | open | plan/capture-to-diagnosis-closed-loop-redesign.md §暂缓的结论 | 2026-07-05 | 内部标签积累 + 教师一致性验证通过 | 验证通过后评估 |
| PB-009 | Product Backlog | FSRS 自适应复习排程 | P3 | open | plan/capture-to-diagnosis-closed-loop-redesign.md §暂缓的结论 | 2026-07-05 | 诊断→补救→复诊闭环稳定后 | 闭环稳定后评估 |
| PB-010 | Product Backlog | PDF 直接导出 | P3 | open | product/nana-product-behavior-manual-v1.md §10 "v1 不做清单" | 2026-07-05 | — | 用户提需求 |
| PB-011 | Product Backlog | Problem/Attempt 模型 | P3 | open | product/nana-product-behavior-manual-v1.md §10 "v1 不做清单" | 2026-07-05 | 1 Case = 1 拍题模式不够用时再评估 | 模式不够用 + 用户确认 |
| TD-003 | Tech Debt | base64 artifact 迁移到对象存储 | P1 | open | 00_CURRENT 设计债 #3：Artifact.content 以 Base64 存字节，~33% 体积开销，case 多了拖慢 SQLite 查询/备份 | 2026-07-05 | — | **触发**：case > 100 或 dev.db > 50MB（先到先触发）。**关闭**：迁移方案实施完成（对象存储 + URL 存 content + 独立清理策略） |
| TD-001 | Tech Debt | slipFlag → slipCount 字段迁移 | P2 | open | 00_CURRENT 设计债 #1 + DECISIONS TD-1：当前仅单 boolean，复诊"连续两次"判定需持久化 slipCount 字段 | 2026-07-05 | M4 一并处理 | 新字段 + 迁移已有 slipFlag 数据 |
| TD-002 | Tech Debt | /initial 一步式废弃 | P2 | open | 00_CURRENT 设计债 #2 + DECISIONS TD-2：与 submit-answers 两条初诊路径分叉，建议稳定后废弃 /initial | 2026-07-05 | submit-answers 路径稳定后 | 确认 submit-answers 路径稳定 → 废弃 /initial |
| TD-004 | Tech Debt | light-feedback magic string `__preliminary__` | P3 | open | DECISIONS TD-3：caseId 未定义时用 magic string 调用反馈 API，不引起 bug 但引入不存在的 ID 进入日志 | 2026-07-05 | Stage 3 接通真实 API | 传入真实 caseId |
| TD-005 | Tech Debt | feedback API 未校验 case 存在性 | P3 | open | DECISIONS TD-4：接收任意 caseId 返回反馈，应加入 prisma.case.findUnique 校验 | 2026-07-05 | Stage 5 | case 不存在返回 404 |
| CR-001 | Code Remnant | 清理 Stage 3 v2 废弃代码（asr-transcribe.ts / vlm-classify.ts / 对应测试） | P2 | open | DECISIONS TD-5 + product/nana-product-behavior-manual-v1.md §11：v2 双管线方案（独立 ASR + 独立 VLM）被 v3-revised 一体化 case-analyzer.ts 替代。当前加 @deprecated 保留，禁止新代码 import | 2026-07-05 | v3 case-analyzer + /process API 稳定运行 | v3 case-analyzer + /process 稳定运行无回归后，一次性删除 `src/lib/nana/asr-transcribe.ts`、`src/lib/nana/vlm-classify.ts`、`src/__tests__/unit/nana/asr-transcribe.test.ts`。`scripts/stage3-asr-format-check.ts` 保留为参考 |
| CR-002 | Code Remnant | 修复 scripts/vlm-handheld-test.ts 类型错误阻塞 build | P2 | open | nana-phase1-execution-log 偏离记录：该脚本在干净工作树复现类型错误，非本次变更引入。阻塞 `npm run build` | 2026-07-05 | — | 修复类型错误或废弃该脚本 |
| CR-003 | Code Remnant | 清理游离 DB 外部残留（E:\app\data\dev.db 含 4 张空表） | P3 | open | stage3-revised-round0-schema-log.md：首次踩坑导致游离 DB 被应用了 stage3 migration（4 张新表空表）。不影响项目本地 dev.db | 2026-07-05 | 用户确认 | 用户确认清理后执行删除 |
| UX-001 | UX Follow-up | 定稿"未分类/暂未覆盖"题目的温和提示文案 | P2 | open | product/nana-user-manual-v1-draft.md Q&A：当前用"这类题还没放进当前知识地图，先帮你收在这里" | 2026-07-05 | — | 产品行为手册更新覆盖此文案 |
| UX-002 | UX Follow-up | 验证题图缩略图打印版尺寸规范 | P3 | open | product/nana-product-behavior-manual-v1.md §13.8：已有尺寸 `max-width:180px; max-height:120px` | 2026-07-05 | — | 打印页实际验证通过 |
| UX-003 | UX Follow-up | catch 块加 abortedRef 检查 | P3 | open | active_spec.md 待选方向：P3 建议，不阻塞 | 2026-07-05 | — | 随手修，无硬性截止 |
| RS-001 | Research/Spike | OCR v2 可行性 Spike | P2 | open | product/nana-product-behavior-manual-v1.md §13.8 "OCR v2 候选" | 2026-07-05 | — | Spike 完成 + 报告 + 决策是否进入路线图 |
| RS-002 | Research/Spike | 重复题相似度算法调研 | P3 | open | product/nana-product-behavior-manual-v1.md §10 "v1 不做清单" | 2026-07-05 | — | 调研完成 + 是否纳入路线图 |
| DP-001 | Decision Pending | M3b vs M4 优先级：下一轮先做哪个 | P1 | open | DECISIONS 开放项 | 2026-07-05 | — | 用户拍板 |
| DP-002 | Decision Pending | CaseAiResult processingStatus "pending" 状态语义 —— timeout 是否写库 | P2 | open | stage3-ai-integration-plan-v3-revised.md：当前 timeout 由前端判定不写库，数据库行仍为 pending | 2026-07-05 | — | 确认 timeout 处理策略 |

---

## 已完成/已关闭

*（暂空——初始版本无已关闭条目）*

---

## 维护规则

### plan 阶段
- 开始 `/plan` 时打开 BACKLOG.md，查看 open 条目，决定本轮处理哪些
- 选中条目 → 状态改为 `in-progress`，注明关联 plan 文件
- 新发现的产品功能/债务/残留 → 新增 open 条目
- 调整优先级或状态

### execute 阶段
- 实际偏离计划时在 executionlog 中记录偏离
- 如果发现新的残留代码或技术债，新增 CR/TD 条目
- 执行日志末尾注明"本轮新增 BACKLOG 条目：XXX-XXX"

### audit 阶段
- 审计报告中增加检查项：`[ ] 所有新发现的 follow-up 是否已入 BACKLOG.md`
- 确认已完成的条目：验证关闭条件 → 标记 `closed` 并写关闭证据
- 发现遗漏 → 新增条目
- 检查旧文档中的重复条目状态

### 条目生命周期
```
[发现] → open → in-progress → closed（写关闭证据）
                     ↓
                blocked（标记阻塞原因）
                     ↓
                unblocked → in-progress

open → cancelled（明确决定不做或已过时）
```

### 更新频率
- **每轮 plan**：必看
- **每轮 audit**：必检查
- **发现新 item**：随时追加（不限阶段）
- **每 3-5 轮**：整体 review 所有 open 条目，标记过时或已自动解决的

---

> 最后更新：2026-07-05 | 初始版本来源：`doc/auditlog/audit-doc-backlog-governance-2026-07-05.md`
