# 当前项目状态

> 📌 冷启动第一站。回答"现在在哪、卡在哪、下一步"。
> 当前轮任务详情 → [active_spec.md](active_spec.md)
> 历史叙事 → [progress.md](progress.md)
> 决策台账 → [DECISIONS.md](DECISIONS.md)

Last updated: 2026-06-27 | Updated by: plan-agent (Nana 总纲 + 阶段计划产出)

---

## Freshness Check（冷启动防陈旧）

- Latest completed milestone: **P0 阶段总纲 + 开发计划产出**（2026-06-27，审计 ✅ 通过）
- Latest commit: `5f8cea3` — `docs(plan): 第 1 阶段执行计划——采集基础壳（4 commits）`
- Current branch: `dev`（main 已同步到 M3c）
- Is current fresh: ⚠️ 已进入第 1 阶段开发——采集基础壳。详见下方当前活跃任务

---

## 全景六线（A→F 项目总览）

> 用评审 AI 的六线框架替代纯代码仓库视角。每条线有独立状态和下一步。

### A. 主代码线（三代理）

| 里程碑 | 状态 | 完成时间 | 说明 |
|--------|:--:|------|------|
| M0 环境搭建 | ✅ | 06-13 | Docker + AI切DeepSeek + Git配置 |
| M1 知识图谱数据层 | ✅ | 06-14 | 8表 + 48节点/36边/18桥 + 内存图引擎 |
| M2 归因流程骨架 | ✅ | 06-14 | 8步状态机（`lib/session-machine.ts`）+ 4 API |
| M3a 追踪骨架 | ✅ | 06-15 | 101题入库 + KST-lite + BKT + map/initial API |
| M3c 周末编排+纸质包 | ✅ | 06-15 | 编排器 + session-items/submit-answers/paper-pack API + 打印页 |
| M3b 配题灌入 | ⬜ | — | 长尾配题（数据工作，可并行） |
| M4 探针下探 | ⬜ | — | 深化诊断推理能力 |

**下一步**：第 1 阶段开发——采集基础壳（P0）。详见 `doc/plan/nana-phase1-execution-plan.md`

### B. 配题 / Item 库

| 批次 | 状态 | 说明 |
|------|:--:|------|
| batch1 共 101 题 | ✅ 已入库 | M1 A层 + M2a A层 + BG地基 |
| M1 B/C层 | ⬜ 待产 | — |
| M2a 其余 | ⬜ 待产 | — |
| M3–M8 | ⬜ 待产 | — |
| BG001-099 | ⬜ 待产 | — |

**性质**：教研持续线，不依赖代码变更，可随时推进

### C. 误解库（Misconception 表）

| 项目 | 状态 | 说明 |
|------|:--:|------|
| 表结构 | ✅ 已建 | `model Misconception`（board/errorType/crossTag/manifestation/misbelief/rootNodeId/probeCue/evidence） |
| 种子数据 | ⬜ 未灌 | 20+条四联体种子（表现→误解→根节点→追问）已设计，待导入 |

**下一步**：小活，可并入"归因轮"

### D. 真题解析

| 项目 | 状态 | 说明 |
|------|:--:|------|
| 提示词 A | ✅ 就绪 | VLM 转写流程已验证（`scripts/vlm-transcribe.ts` 385行） |
| 2024 真题转写 | 🟡 待复核 | `doc/research/transcripts/2024-verified.md`（人工核实终版已产出） |
| 2025 真题转写 | 🟡 待复核 | `doc/research/transcripts/2025-vlm-draft.md`（VLM 草稿） |
| 2026 真题转写 | 🟡 待复核 | `doc/research/transcripts/2026-vlm-draft.md`（VLM 草稿） |

**用途**：B层通法/变式参考，不是初诊弹药
**下一步**：继续转写（外部AI）→ 我方核对数字/符号 → 入库

### E. 人肉回路

| 项目 | 状态 | 说明 |
|------|:--:|------|
| 拍照指引 | ✅ 已产出 | `doc/guide/photo-guide-niece.md` + `photo-guide-uncle.md` + HTML打印版 |
| 错题拍照 | 🔄 已启动 | 外甥女在拍错题 |
| 素材利用 | ⬜ 待做 | 用拍照素材喂诊断流程验证 |

**下一步**：继续拍照积累素材 + 把素材用起来验证诊断链路

### F. 运营回路 / 题库健康度

| 项目 | 状态 | 说明 |
|------|:--:|------|
| Backlog | ✅ 在册 | `doc/spec/ops-feedback-loop-backlog.md`（回路A=学习闭环，回路B=题库运营） |
| 实施 | ⬜ 未来轮 | 前置：真实使用数据积累 |

---

## 当前活跃任务：CI 镜像部署——已完成 ✅

**目标**：从本地隧道切换到 CI 镜像构建 + 腾讯云香港服务器部署。**已全部完成**。
**执行方案**：`doc/plan/ci-image-deployment-plan.md`
**部署指南**：`doc/guide/deployment-guide.md`
**执行日志**：`doc/executionlog/tencent-cloud-deployment-log.md`

### 已上线
| 组件 | 状态 | 详情 |
|------|:----:|------|
| 服务器 119.28.42.208 | ✅ 运行中 | Ubuntu 22.04, Docker 29.6.1 |
| wrong-notebook 容器 | ✅ 运行中 | `ghcr.io/jewellury/nanawrongbook:latest` |
| caddy 容器 | ✅ 运行中 | HTTPS 证书已签发 |
| 域名 nana.nanatop.xyz | ✅ 可用 | DNS A 记录 → 119.28.42.208 |
| GitHub Actions CI | ✅ 通过 | push main → build + test + push GHCR |
| 镜像仓库 GHCR | ✅ 有镜像 | `sha-<短sha>` + 时间戳 + `latest` |
| 自动备份 crontab | ✅ 已安装 | 每日 2:00, 保留 14 天 |

### 修复记录
| 问题 | 修复 |
|------|------|
| `bcryptjs` standalone 缺失 | `next.config.ts` 加 `outputFileTracingIncludes` |
| `outputFileTracingIncludes` 类型错 | Next.js 16 已移出 experimental，放顶层 |
| 腾讯云防火墙缺 443 入站 | 手机移动数据访问恢复正常 |

### 下一步
进入正常开发迭代：修改代码 → push dev → 合 main → CI 自动构建 → 服务器 pull 更新。

---

## 已知限制（跨轮持续有效）

1. **KST-lite gap 只传播一层 dependents**——M4 补递归（延续 M3a 已知限制）
2. **不调 LLM**——无 AI 判分 / Newman 追问 / 解析生成（延续 M3c 已知限制）
3. **单主线诊断**——决策 D-9 延续，暂不支持多主线并行诊断

---

## 设计债（在册，待后续轮次处理）

| # | 设计债 | 说明 | 状态 |
|---|--------|------|:--:|
| 1 | slipFlag 持久化历史 | 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段 | ⬜ |
| 2 | `/initial` 一步式废弃 | 与 submit-answers 两条初诊路径分叉，建议稳定后废弃 | ⬜ |
| 3 | 二进制 artifact 以 Base64 内联 SQLite（Phase 1.5 引入） | `question_image`/`audio_note` 字节以 Base64 存进 `Artifact.content`（String），~33% 体积开销，case 多了拖慢 SQLite 查询/备份。**迁移阈值**：case > 100 条或 `dev.db` > 50 MB（先到先触发）；**迁移方向**：对象存储 + URL 存 content + 独立清理策略 | ⬜ |
| 4 | `.env` DATABASE_URL 本地游离 DB（Phase 1.5 审计登记） | `.env` 的 `DATABASE_URL=file:/app/data/dev.db` 是 Docker 容器内路径，本地非 Docker 运行 prisma 时解析到 `E:\app\data\dev.db`（仓库外游离 DB），非项目 `data/dev.db`。生产/CI 容器内路径正确无影响。本地开发走 Docker 或显式设 `DATABASE_URL=file:./data/dev.db` 绕过。后续配置治理统一 | ⬜ |
| 5 | 部署后图谱 smoke check（2026-07-02 生产事故驱动） | **事故**：2026-07-02 发现生产库 `KnowledgeNode=0`（48 节点从未灌入），根因是 Dockerfile 只跑 `prisma db seed`（admin 用户），不跑 `seed_graph.ts`（图谱数据），每次重新部署图谱数据丢失。已手动用 esbuild bundle 在容器内执行 `seed_graph.ts` 修复（48 节点/36 边/10 主线/101 题入库）。**防复发**：① 部署后检查 `KnowledgeNode.count() > 0`，为 0 立即报警停验收（见 deployment-guide §4）；② 后续实现自动化 smoke check 脚本（见 ops-feedback-loop-backlog）；③ **不**把 seed 放进 Dockerfile build（避免 build 时副作用 + 单独 graph bootstrap 更清晰） | ⬜ |

---

## 文档治理

三件套已落地：
- [INDEX.md](INDEX.md) — 文档索引看板
- [00_CURRENT.md](00_CURRENT.md) — 本文件（冷启动第一站）
- [DECISIONS.md](DECISIONS.md) — 技术决策台账（15 项 D + 4 项 Gate + 2 项 TD）

双运行时 Agent 架构已落地：
- `doc/agents/` = canonical 正文 → `scripts/sync-agents.js` 同步到 `.claude/agents/` + `.opencode/agents/`
- `scripts/check-agent-sync.js` 验证一致性（exit 0 = 一致）

近期新增参考文件（`doc/reference/`）：
- `codex_long_term_memory.md` — Codex 长期记忆入口（长期协作约定 + Git 收口规则）
- `codex_memory_decisions/` — Codex 记忆决策记录
- `fof-semantic-mvp-dual-runtime-audit-notes.md` — fof-semantic 双运行时审计笔记
- `installed-skills-catalog.md` — 已安装 Skill 清单

---

## 下一步

**当前状态**：CI 镜像部署已完成。恢复正常开发迭代。

**核心流程**：修改代码 → push dev → 合 main → CI 自动构建 → 服务器 `git pull && docker compose pull && up -d`

**并行保持**：真题转写复核（D 线）可继续推进。
- 2024/2025/2026 三年 draft 已产出，待核对数字/符号/公式后入库

**后续阶段候选**：
- 第 2 阶段：知识地图（P1）
- 第 3 阶段：批次诊断报告 + Session UI（P1）
- 第 4 阶段：视频推荐 + 复诊验证（P2）
- 第 5 阶段：Newman-lite + 方法族标签 + ASR/VLM 接通（P2）

---

## Handoff（模型切换冷启动）

- **先读**：本文件 → [DECISIONS.md](DECISIONS.md)（末尾开放项速查）→ [active_spec.md](active_spec.md)
- **必读权威参考**：[reference/TECH_PLAN_v2.md](reference/TECH_PLAN_v2.md) + [reference/OPS_handbook.md](reference/OPS_handbook.md)
- **运行规则**：见 CLAUDE.md（安全铁律 + 三代理框架 + Git 规范）
- **部署指南**：`doc/guide/deployment-guide.md`（发布流程/回滚/备份/故障排查）
- **测试**：`npm run test:all`（需 Docker 测试容器），110/110 退出码 0

---

## Do Not Reopen Unless Needed

- M1 图谱 8 表结构（已稳定，见 [DECISIONS.md](DECISIONS.md) D-2）
- M2 诊断会话 8 步状态机（已稳定，见 [DECISIONS.md](DECISIONS.md) D-4）
- 容器分层方案（生产/测试分离，已稳定）
- 三分支模型（main/dev/sync-upstream）
- 三代理协作框架（/plan → /execute → /audit）
- 所有新表追加挂接、不改上游 model（安全铁律 3）
