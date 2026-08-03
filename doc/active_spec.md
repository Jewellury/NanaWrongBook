# 当前活跃任务

> 每轮替换。记录当前这一轮在做什么、做到哪了。
> 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-07-19

## 当前任务：Nana Quality OS v1 — Phase A（R1a 试点）

### 背景

r3.3 计划已冻结（commit `ca816df`，O-1~O-6 全部确认），战略方向正式冻结不再出 r3.4。
**A-0 第一次冻结已完成**（FREEZE-001，commit `29a4dfe`，14 条 R1a 主路径条款已冻结）。
Phase A 当前目标：实现 R1a 黄金闭环 + 历史缺陷回放护栏 + audit 受控盲测 + 两类受控失败演练，达成 **Pilot-ready** 成熟度。

**核心主线**：R1a 建护栏 → CL-09 验证第一个产品 Goal → CL-13 验证跨需求复制 → 真实发布和使用结果验证 → 再沉淀 Quality OS。

### 计划文档

- [nana-quality-os-v1-plan.md](plan/nana-quality-os-v1-plan.md)（r3.3 冻结版，Phase A 可执行 + B/C/D/E 只写目标）
- [nana-test-framework-plan.md](plan/nana-test-framework-plan.md)（r3.1，A-1 直接消费其 R1a 任务 2.1~2.7+2.9）
- [nana-v1-minimum-loop-acceptance.md](spec/nana-v1-minimum-loop-acceptance.md)（v1 验收契约，**FREEZE-001 已冻结 14 条**；CL-10 已拆为 CL-10a/10b）

### 上轮尾巴（P1 追踪，不阻塞 A-0）

**ASR Round 2 生产验收未完成**：

| 子项 | 状态 | 证据 |
|------|:----:|------|
| 开发完成 | ✅ | commit `8dffb6d`（Dockerfile ffmpeg + 前端 transcript/audioStatus + P3 MIME 合并） |
| 审计修复完成 | ✅ | commit `a62634d`（isPlaceholderTranscript 检查 + 注释更新 + MIME 直接单测） |
| 合入 main | ✅ | main = `10100b8`，含 `8dffb6d`/`a62634d`/`1bc6228` |
| 生产开关启用 | ❌ 未确认 | 服务器 `.env` 是否设 `NANA_AUDIO_TRANSCRIPT_ENABLED=true`——未找到确认证据 |
| 真机语音 Smoke | ❌ 未做 | 手机录音→转码→转写→前端展示端到端——文档仍标"待做" |

**处置**：作为 Phase A/R1a 的 P1 前置验收项继续追踪。R1a 的虚拟麦克风 + 假 Provider 链路不依赖此项（走本地假 Provider，不需生产开关）。但真机语音 Smoke 需在 Phase A 期间择机闭环——可借助 R1a 落地的虚拟麦克风 + Chromium fake-media 基础设施，在生产上做一次真机录音验证。

### Phase A 任务清单（A-0 ~ A-7）

| 任务 ID | 任务 | 状态 | 说明 |
|---------|------|:----:|------|
| **A-0** 第一次冻结 | 产品复核 + 冻结 14 条 CL | ✅ 完成 | FREEZE-001（commit `29a4dfe`）；A-0 契约补丁（`922045d`）修 9 条 CL；14 条 R1a 主路径条款冻结；CL-06/CL-14 显式标注 A-1 补齐项 |
| **A-1** R1a 实现 | 黄金闭环 + 护栏 | 🟡 启动中 | r3.1 任务 2.1~2.7+2.9（不含 2.8=30题规模=R1d）；假 Provider + 虚拟麦克风 + golden-path spec + 证据采集器；**+ A-0 标注的两处 UI 补齐**：① CL-06 textbookTopic=null 占位；② CL-14 audioStatus=failed 重试按钮 |
| **A-2** Evidence Summary | 最小证据摘要 | ⬜ | `scripts/quality/build-evidence-summary.ts`（只读 git+测试+性能，不读 audit，不入 Git） |
| **A-3** audit verifier 模式 | 新会话独立验证 R1a | ⬜ | `doc/auditlog/r1a-verifier-mode.md`（逻辑隔离非权限隔离） |
| **A-4** 历史缺陷回放 | HD-2+3+4+5（HD-1 对照） | ⬜ | 旧 commit/故障 fixture/characterization test，不删现有保护代码 |
| **A-5** 隔离缺陷样本 | H4 受控盲测前置 | ⬜ | 准备 1 个隔离缺陷样本交 A-3，不往 R1a 真实实现故意遗漏 |
| **A-6** 两类受控失败演练 | H7 验证 | ⬜ | ① 可恢复缺陷→自动修复；② 不可恢复条件→诚实 Blocked |
| **A-7** 结果指标 baseline | 介入统计 + H1~H7 baseline | ⬜ | `doc/quality-trial-log/r1a-goal-trial.md`；按 15 分钟粒度估算耗时 |

### 验收标准（Pilot-ready 硬门禁）

- ✅ R1a golden-path 在 CI 中每次 push 自动跑通 → **H1**
- ✅ HD-2/3/4/5 被自动测试拦住（破坏红、当前绿）→ **H3**
- ✅ 实现和验证阶段无可避免之外的人工介入；安全铁律审批单独计数 → **H2**
- ✅ 试点结束审查未出现两套真相漂移 → **H6**

**受控演练（必须完成）：**
- ✅ A-5 隔离缺陷样本就位 + A-3 audit 受控盲测（零发现合法）→ **H4**
- ✅ A-6 两类受控失败演练（可恢复→修复；不可恢复→Blocked）→ **H7**

**体验目标（记录 baseline，首次不达标不否定）：**
- ✅ Evidence Summary artifact 在 CI 中可下载
- ✅ 真机抽检耗时记录（对比 Stage 3 ASR Round 2）→ **H5 baseline**
- ✅ 结果指标 baseline（`human_total_hours` / `governance_overhead_hours` / `ci_false_positive_count` / `flaky_test_count`）

### 下一步

**A-0 已完成（FREEZE-001）。立即进入 A-1（R1a 实现）**：
- 按 r3.1 任务 2.1~2.7+2.9 顺序实现（假 Provider → 虚拟麦克风 → golden-path spec → 证据采集器 → Playwright 配置升级 → 多章节 fixture → CI 集成）
- **A-1 额外两处 UI 补齐**（FREEZE-001 显式标注的待办）：① CL-06 textbookTopic=null 占位（`ai-result-card.tsx:93`）；② CL-14 audioStatus=failed 重试按钮（`ai-result-card.tsx:80-83`）
- 每个子任务完成后写执行日志，测试先红后绿，证据入 artifact

### 安全约束

- 本轮不创建 Prisma schema 变更、不修改上游表结构、不新增正式 Agent、不新增 workflow 文件
- Evidence Summary 是 CI artifact，不入 Git
- audit-agent 用新会话 + 最小输入包实现逻辑隔离（非权限隔离）

### 失败回滚

- Phase A 不通过 → 不进 Phase B → 回到 r3.1 修订 R1a 设计或重新讨论 Quality OS 假设
- 无生产部署动作（Phase A 全程在 CI/本地）

---

## 历史回顾：Stage 3 已完成轮次

- Round 0：4 张新表 schema + migration + seed
- Round 1：一体化 Case Analyzer lib + 33 mock 单测
- Round 2：/process API + 18 集成测试
- Round 3：题目汇总 API + 列表扩展 + 三 tab 外壳 + 14 集成测试
- Round 4：拍题触发整理 + 轮询状态 + AI 结果卡 + 10 集成测试
- Round 4 Hotfix：P1 竞态保护 + P2-a AbortController + P2-c 类型对齐 + 3 新测试
- Round 5 Provider Smoke：3 张 fixture 真实 API 验证，Conditional Go
- Stage 3 部署 r2：seed 自动化 + CI 双绿 + 生产部署验证
- ASR Round 0 Spike：真实手机录音转写验证通过
- ASR Round 1：后端 audio_meta 解析 + ffmpeg 转码 + case-analyzer 集成 + 87 单测
- ASR Round 1 Hotfix：P2 前置修复 — audioErrorReason 持久化 + deriveAudioStatus 参数语义
- ASR Round 2：ffmpeg 运行时依赖 + feature flag + 前端 transcript 展示 + P3 MIME 合并（**开发/审计/合入 main 完成；生产开关 + 真机 Smoke 尾巴见上方 P1 追踪段**）

---

## 已知限制（持续有效）

- KST-lite gap 只传播一层 dependents，M4 补递归
- 当前 case-analyzer.ts 需 VOLCENGINE_API_KEY，无 mock 模式
- 单主线诊断（决策 D-9 延续）
- 二进制 artifact 以 Base64 内联 SQLite（迁移阈值：case > 100 或 dev.db > 50MB）
- **语音转写质量未验证**（生产开关 + 真机 Smoke 尚未完成，见上方 P1 追踪）

## 设计债（在册）

1. slipFlag — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. /initial 废弃 — 与 submit-answers 两条初诊路径分叉，稳定后废弃
3. light-feedback magic string __preliminary__ — Stage 3 接通真实 API 时处理
4. feedback API 未校验 case 存在性 — Stage 3 接通真实 API 时处理
5. 二进制 artifact 以 Base64 内联 SQLite — 33% 体积开销
6. TD-006 手动改课本分类写入口径统一 — 实现手动编辑课本分类时处理（**CL-10b 依赖此项**）
7. Seed 自动化缺口 — 已在 Stage 3 部署 r2 修复
8. transcript 编辑功能（editable=true）开启前须补 isPlaceholderTranscript 检查 — ASR Round 2 审计已修复 process/route.ts，前端 editable 仍为 false
