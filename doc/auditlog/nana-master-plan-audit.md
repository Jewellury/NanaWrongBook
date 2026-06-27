# Nana 总纲 + 开发计划 · 审计报告

> 关联计划: `doc/plan/nana-master-plan.md`（总纲）、`doc/plan/nana-development-phases.md`（分步骤开发计划）
> 审计日期: 2026-06-27
> 这是纯设计文档审计（非代码审计）

---

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

两份文档总体质量不错：结构清晰、逻辑严谨、与已有权威文档保持一致。总纲把"什么是什么"讲清楚了，开发计划把"什么顺序做"也排得合理。

**但是有一个事实错误必须修正（见问题清单P1）：**
- 总纲在"里程碑进度"那块，说 M1 知识图谱数据层的产出是"12 张 Prisma 新表"——这不对。DECISIONS.md D-2 明确写了 M1 是"8 张新表"，其余 4 张（DiagnosisSession、ProbeRecord、ErrorRecord、Item）是 M2 和 M3a 建的。总纲第 1.2 节数据层写"12 张表"是对的（那是累计总量），但 M1 行不能写成 M1 一个人干了 12 张表。

此外还有几个微小瑕疵（见问题清单P2），不影响整体质量，但建议顺手改了。

**修正这个事实错误后，文档可以放心用。**

---

## 检查清单

### 计划一致性
- [✅] 总纲与开发计划之间无矛盾
- [✅] 总纲与 `doc/00_CURRENT.md` 的里程碑完成状态一致（M0✅ M1✅ M2✅ M3a✅ M3c✅ M3b⬜ M4⬜）
- [✅] 总纲与 `capture-to-diagnosis-closed-loop-redesign.md` 的优先级表一致（P0→P1→P2 分层完全匹配）
- [✅] 总纲与 `project-architecture-map-and-priority-plan.md` 的架构图一致（12张表、9个API、5个lib、前端全部待建）
- [✅] 总纲与 `frontend-architecture-plan.md` 的路由方案一致（`/nana`命名空间、`src/app/nana/`目录）

### 事实准确性
- [✅] **表数量**：总纲说"12 张 Prisma 新表" ✅ 从 18 个 model 中减去 6 个上游 model（User/KnowledgeTag/Subject/ErrorItem/ReviewSchedule/PracticeRecord），剩下 12 个确为 nana 新增，数字正确
- [✅] **API 路由数量**：总纲说"9 个路由" ✅ 按 URL 路径算，`/sessions`(1)/`[id]`(2)/`probes`(3)/`errors`(4)/`map`(5)/`initial`(6)/`session-items`(7)/`submit-answers`(8)/`paper-pack`(9)，正好 9 个路径
- [✅] **核心 lib 文件名**：`lib/graph.ts` `lib/kst-lite.ts` `lib/bkt.ts` `lib/session-machine.ts` `lib/diagnosis-orchestrator.ts` — 5 个文件全部真实存在，路径正确（在项目根 `lib/` 下，不是 `src/lib/`）
- [❌] **M1 里程碑产出**：说"12 张 Prisma 新表" — 见问题 P1
- [❌] **vlm-transcribe.ts 行数**：总纲写 385 行，实际 384 行 — 见问题 P2-2
- [✅] **paper-pack 行数**：总纲写 242 行 ✅ 实际一致
- [✅] **P1-P5 引用**：与 TECH_PLAN_v2 §2 一致，P4 额外引用 OPS_handbook §4（措辞细化层）— 合理
- [✅] **D-1 到 D-15 引用**：DECISIONS.md 确实有 15 个 D、4 个 Gate、2 个 TD，数字正确

### HTML Mockup 检查
- [✅] **02-home.html**：布局描述准确（行动卡+recap bar+空状态），可直接使用
- [✅] **03-capture.html**：问题诊断准确（帧4"一起点亮配方法"确实存在 P4 冲突），调整方案合理
- [✅] **01-design-foundation.html**：确有 §VOICE 表，但确实缺少"单题轻反馈"语气行，需补充的判断正确
- [✅] **04-knowledge-map.html**：描述准确，方法族不入图约束已满足 ✅
- [✅] **05-quiz.html**：描述准确，按钮措辞"记一下这道"守 P4 ✅
- [✅] **06-report.html 缺口**：正确识别了需要新建批次诊断报告 mockup

### 开发计划合理性
- [✅] **依赖关系**：所有 5 个阶段的依赖关系逻辑自洽，没有"后一步依赖了前一步没做的事"
  - 1A→1B→1C→1D 链条正确
  - Phase 2 只依赖 Phase 1 入口 + 已有 map API ✅
  - Phase 3 依赖 Phase 1 入口 + 已有 diagnosis API ✅
  - Phase 4 依赖 Phase 3 + Phase 2 ✅
  - Phase 5 依赖 Phase 1 + D-8 解除 + Phase 3 ✅
- [✅] **任务维度划分**：前后端/数据/API 四维度覆盖完整，每个任务有明确文件和维度
- [✅] **验收标准**：可衡量、可测试、无模糊措辞
- [✅] **P4 合规检查**：附录的全局 P4 检查表完整，正确指出了 03-capture 的 P4 违规

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 所在位置 | 详情 | 建议修复方式 |
|--------|------|----------|----------|------|-------------|
| **P1** | **M1 里程碑产出写错了表数量** | `nana-master-plan.md` | §1.1 里程碑进度表，M1 行 | 写的是"12 张 Prisma 新表"，但 DECISIONS.md D-2 明确说 M1 知识图谱数据层用 **8 张新表**（KnowledgeNode/KnowledgeEdge/Mainline/NodeMainline/MainlineBridge/StudentNodeState/Misconception/MistakeNode）。剩下 4 张（DiagnosisSession/ProbeRecord/ErrorRecord/Item）是 M2 和 M3a 建的。`project-architecture-map-and-priority-plan.md` §2.1 正确写的是"M1 8 张 + M2 3 张 + M3a Item 表"。 | 将 M1 行改为"8 张 Prisma 新表（知识图谱层）+ 48 节点/36 边/18 桥 + 内存图引擎"，或保持"12 张"但改为"累计 12 张 Prisma 新表"。建议改为 8 张+标注总量 12 张更精确。 |
| **P2** | **vlm-transcribe.ts 行数少 1** | `nana-master-plan.md` | §1.6 | 写的是 385 行，实际 `wc -l` 结果是 384 行 | 改为 384 行 |
| **P2** | **frontend-architecture-plan.md §1.5 P2/P3 标注过时** | `nana-master-plan.md` | §5.1（间接相关）| frontend-architecture-plan.md 说 P2/P3 "暂无 canonical 定义"，但 TECH_PLAN_v2 §2 实际已定义。master plan 本文件引用正确，但姐妹文档有残留标注。这不是 master plan 本身的问题，但建议在总纲中提及这一残留问题。 | 在总纲 §5.1 加注："注：frontend-architecture-plan.md §1.5 标注 P2/P3 为'内部约定'需回填，但 TECH_PLAN_v2 §2 已有 canonical 定义，后续更新前端方案时一并修正。" |

---

## 一致性分项详查

### 总纲 vs 开发计划
| 检查项 | 结论 |
|--------|:----:|
| 总纲 P0/P1/P2 分层与开发计划 5 阶段对应 | ✅ 匹配 |
| 总纲"当前不做"与开发计划"暂缓项"一致 | ✅ 匹配 |
| 总纲 API 路由表与开发计划依赖图 | ✅ 匹配 |
| 总纲 HTML 文件列表与开发计划调整清单 | ✅ 匹配 |

### 总纲 vs capture-to-diagnosis-closed-loop-redesign.md
| 检查项 | 结论 |
|--------|:----:|
| P0 优先级（case API + 采集壳） | ✅ 一致 |
| P1 优先级（轻反馈/地图/批次诊断/Session UI） | ✅ 一致 |
| P2 优先级（视频推荐/复诊/Newman/方法族标签） | ✅ 一致 |
| 单题轻反馈定位（情绪闭环，非终诊） | ✅ 一致 |
| 方法族不入前台 | ✅ 一致 |
| Newman 内嵌不前台 | ✅ 一致 |
| 视频推荐+复诊成对出现 | ✅ 一致 |

### 总纲 vs project-architecture-map-and-priority-plan.md
| 检查项 | 结论 |
|--------|:----:|
| 12 张表累计（含 M1/M2/M3a） | ✅ 一致 |
| 9 个 API 路由 | ✅ 一致 |
| 5 个核心 lib | ✅ 一致 |
| 前端全部待建 | ✅ 一致 |
| API 缺口清单（case/ASR） | ✅ 一致 |

### 总纲 vs frontend-architecture-plan.md
| 检查项 | 结论 |
|--------|:----:|
| `/nana` 路由命名空间 | ✅ 一致 |
| `src/app/nana/` 目录结构 | ✅ 一致 |
| `src/components/nana/` 组件目录 | ✅ 一致 |
| P1-P5 引用（除 P2/P3 标注过时问题见上） | ✅ 基本一致 |

### 总纲 vs DECISIONS.md
| 检查项 | 结论 |
|--------|:----:|
| D-1 不改上游表结构 | ✅ 引用正确 |
| D-8 不调 LLM | ✅ 引用正确 |
| D-9 单主线诊断 | ✅ 引用正确 |
| TD-1/TD-2 设计债 | ✅ 描述一致 |
| Gate-1~4 门禁 | ✅ 隐含引用正确 |

---

## 附录：事实核查数据

### Prisma 模型计数
```
总计: 18 个 model
上游 (wrong-notebook): 6 个 (User, KnowledgeTag, Subject, ErrorItem, ReviewSchedule, PracticeRecord)
Nana 新增: 12 个 (KnowledgeNode, KnowledgeEdge, Mainline, NodeMainline, MainlineBridge,
                    StudentNodeState, Misconception, MistakeNode, DiagnosisSession,
                    ProbeRecord, ErrorRecord, Item)
结论: 12 张新表 ✅ 数字正确
```

### API 路由计数（实际 route.ts 文件）
```
src/app/api/diagnosis/initial/route.ts              → /api/diagnosis/initial
src/app/api/diagnosis/map/route.ts                   → /api/diagnosis/map
src/app/api/diagnosis/paper-pack/route.ts             → /api/diagnosis/paper-pack
src/app/api/diagnosis/session-items/route.ts          → /api/diagnosis/session-items
src/app/api/diagnosis/sessions/route.ts               → /api/diagnosis/sessions (POST+GET)
src/app/api/diagnosis/sessions/[id]/route.ts          → /api/diagnosis/sessions/[id]
src/app/api/diagnosis/sessions/[id]/probes/route.ts   → /api/diagnosis/sessions/[id]/probes
src/app/api/diagnosis/sessions/[id]/errors/route.ts   → /api/diagnosis/sessions/[id]/errors
src/app/api/diagnosis/submit-answers/route.ts         → /api/diagnosis/submit-answers
结论: 9 个唯一 URL 路径 ✅ 总纲数字正确
```

### 核心 lib 文件（实际位置）
```
lib/graph.ts                     → 存在 ✅
lib/kst-lite.ts                  → 存在 ✅
lib/bkt.ts                       → 存在 ✅
lib/session-machine.ts           → 存在 ✅
lib/diagnosis-orchestrator.ts    → 存在 ✅
结论: 5 个核心 lib 全部存在 ✅ 总纲路径正确
```

### 文件行数核查
```
src/app/diagnosis/paper-pack/page.tsx  → 242 行 ✅ 与总纲一致
scripts/vlm-transcribe.ts              → 384 行 ❌ 总纲写 385，差 1
```

### HTML Mockup 核查
```
doc/research/前端设计/ 下共有 5 个 HTML 文件 (01~05) ✅ 与总纲 §6 列表一致
tutor-app-design-proposal.md 是附加分析文档 ✅
```

---

## 用户验证指南

以下是你手动核验这份审计结论的方法：

1. **核对 P1 问题**：打开 `doc/DECISIONS.md` 看 D-2 行，再看 `doc/plan/project-architecture-map-and-priority-plan.md` §2.1 第 1 行，确认 M1 是 8 张表而不是 12 张。

2. **核实行数问题**：在终端跑 `wc -l scripts/vlm-transcribe.ts` 看结果是 384 还是 385。

3. **验证 API 路由数**：在终端跑 `ls src/app/api/diagnosis/*/route.ts src/app/api/diagnosis/sessions/*/route.ts src/app/api/diagnosis/sessions/\*/\\*/route.ts`，看是不是 9 个 route.ts。

4. **验证模型数**：在终端跑 `grep "^model " prisma/schema.prisma`，数一下 nana 新增的是不是 12 个（减去 User/KnowledgeTag/Subject/ErrorItem/ReviewSchedule/PracticeRecord 这 6 个上游的）。

5. **验证 HTML mockup 的 P4 冲突**：打开 `doc/research/前端设计/03-capture.html` 搜索"一起点亮"，确认帧 4 确实有诊断结论式措辞。
