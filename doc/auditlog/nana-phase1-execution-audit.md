# 第 1 阶段：采集基础壳 · 审计报告

> 关联计划: doc/plan/nana-phase1-execution-plan.md
> 执行日志: doc/executionlog/nana-phase1-execution-log.md
> 审计基线: df06c9b → a63e36a → 1de9631 → 643f954（4 个 commit）
> 审计日期: 2026-06-28

---

## 审计结论（大白话）

**总体判定：✅ 通过**

第 1 阶段 4 个 commit 的实现跟计划完全匹配，没有发现影响验收标准的质量问题。

代码质量方面：API handler 遵循了上游现有模式（鉴权、日志、错误处理），Prisma schema 追加在文件末尾没有动上游表，React 组件结构清晰。前端文案全部遵守了 P4 前台措辞铁律——没有出现"错""失败""得分""未掌握""正确率"等负面词，轻反馈区域始终标注"不是终诊·这只是初步线索"。

安全性方面：没有密钥泄露，API 路由都有鉴权守卫，用户输入有校验，测试 DB 护栏（guard-db.ts）存在且生效。

测试全部通过（Docker 容器跑全量 9 个测试套件，新增的 nana 测试 31/31 全部通过），production build 也通过了。

执行日志中有 3 条偏离记录，经复核全部属实且属于微调（不影响验收标准）。有一个上游文件修改（submit-answers/route.ts 的 pre-existing 类型错误修复），改动最小化且是阻塞 build 的必要修复。

用户可以直接使用这个阶段的成果进行采集壳交互验证。

---

## 检查清单

### 计划一致性
- [x] 实现了计划中所有任务（Commit ①→④ 全部覆盖）
- [x] 未偏离计划（所有偏离已记录且确属微调）

### 代码质量
- [x] 无明显 bug
- [x] 错误处理到位（API handler 统一 try/catch + internalError，前端有 loading/error/loaded 三态）
- [x] 代码风格一致（遵循上游 API handler 模式、Prisma schema 约定、React 组件结构）

### 安全性
- [x] 无密钥泄露（无硬编码 API Key，无 .env 文件被提交）
- [x] 无 SQL 注入风险（Prisma ORM + 参数化查询）
- [x] 用户输入有校验（artifacts 非空数组校验、transcript 非空字符串校验）
- [x] 未向生产库 `./data/dev.db` 写入任何测试数据（测试用 `./data/test/test.db`，有 guard-db.ts 白名单保护）

### 偏离复核（执行日志中 3 条偏离记录 + Commit ②/④ 的额外记录）
- [x] **偏离 1**（Commit ①）：测试在本地 vitest + test.db 运行而非 Docker — 白名单路径等价，且 Commit ② 以后 Docker 容器也验证通过
- [x] **偏离 2**（Commit ①）：Build 有已有错误 — 在干净工作树复现确认为 pre-existing，非本轮引入
- [x] **偏离 3**（Commit ③）：顺手修复 submit-answers/route.ts 类型错误 — 阻塞 build 的必要修复，改动最小化（+3 行/改 3 行）
- [x] **Commit ② 额外**：创建 capture 占位页 — 计划标注可选，合理补充
- [x] **Commit ④ 额外**：feedback-rules 抽取为独立 lib、Props 改为 auto-fetch 模式 — 更优设计，不影响验收标准
- [x] 未发现"实为大偏离"的隐藏问题

### 上游兼容性
- [x] 未修改上游已有数据库表结构（Case + Artifact 仅追加在 prisma/schema.prisma 末尾，不碰任何上游 model）
- [x] 上游文件修改已标注且最小化（`src/app/api/diagnosis/submit-answers/route.ts` — 3 行 import/type 修复，1 行 logger 格式化改进）
- [x] 新增文件全部在独立目录中（`src/app/nana/`、`src/components/nana/`、`src/lib/nana/`）
- [x] 碰不得清单中所有文件未被修改

### Agent 同步一致性
- [x] ⏭️ 跳过（已在 plan-agent 轮验证，本轮无 agents 文件变更）

### 测试
- [x] **Docker 容器全量测试全部通过** ✅ — `docker compose -f docker-compose.test.yml up --abort-on-container-exit` exit code 0
  - graph:unit 19 ✓ | graph:integration 7 ✓ | m2:unit 15 ✓ | m2:integration 16 ✓
  - m3:unit 18 ✓ | m3c:unit 24 ✓ | m3c:integration 11 ✓
  - **nana:unit 20/20 ✓** | **nana:integration 11/11 ✓**
  - **全量 141 测试全部通过**
- [x] **Production build 通过** ✅ — `npm run build` exit code 0（Turbopack，16.1s 编译）
- [x] 确认测试在安全路径运行：Docker 容器使用 `file:/app/data/test.db`，guard-db.ts 白名单生效
- [x] DB 护栏断言（`src/__tests__/setup/guard-db.ts`）存在且生效（2 条白名单条目：Docker + 本地）

### P4 措辞合规（全局检查）
- [x] 首页问候："嗨，今天想从哪开始？" + "不急，挑一个就好。"
- [x] 行动卡："拍一下这道题" / "补一段你当时怎么想的"
- [x] Recap bar："上次你点亮了：XX" / "你的地图上已经有 X 个光点了"
- [x] 空状态："你的光点地图还空着，第一道题，会点亮第一个光点。"
- [x] 录音："说说看" / 正在听你说" / "我听完了"
- [x] 逐字稿："轻点任意一句就能改，改好会自动存。"
- [x] 轻反馈："不是终诊 · 这只是初步线索"（始终显示）
- [x] 未出现"错"/"失败"/"得分"/"未掌握"/"正确率"等负向词

---

## 文件变更审计（commit 范围 df06c9b → 643f954）

### 新增文件（全部在计划清单中）
| 文件 | Commit | 状态 |
|------|:--:|:--:|
| `prisma/schema.prisma`（末尾追加 Case + Artifact） | ① | ✅ |
| `src/app/api/nana/cases/route.ts` | ① | ✅ |
| `src/app/api/nana/cases/[id]/route.ts` | ① | ✅ |
| `src/lib/nana/nana-api-client.ts` | ① | ✅ |
| `src/app/nana/layout.tsx` | ② | ✅ |
| `src/app/nana/page.tsx` | ② | ✅ |
| `src/components/nana/shared/action-card.tsx` | ② | ✅ |
| `src/components/nana/shared/recap-bar.tsx` | ② | ✅ |
| `src/components/nana/shared/empty-hint.tsx` | ② | ✅ |
| `src/app/nana/capture/page.tsx` | ②(占位)→③(完整) | ✅ |
| `src/components/nana/capture/question-image-viewer.tsx` | ③ | ✅ |
| `src/components/nana/capture/voice-recorder.tsx` | ③ | ✅ |
| `src/components/nana/capture/transcription-panel.tsx` | ③ | ✅ |
| `src/components/nana/capture/light-feedback.tsx` | ③→④ | ✅ |
| `src/components/nana/capture/mock-data.ts` | ③ | ✅ |
| `src/app/api/nana/cases/[id]/feedback/route.ts` | ④ | ✅ |
| `src/lib/nana/feedback-rules.ts` | ④ | ✅ |
| `src/__tests__/unit/nana/case-api.test.ts` | ① | ✅ |
| `src/__tests__/unit/nana/feedback-rules.test.ts` | ④ | ✅ |
| `src/__tests__/integration/nana/case-api.test.ts` | ① | ✅ |
| `src/__tests__/integration/nana/feedback-api.test.ts` | ④ | ✅ |

### 修改文件
| 文件 | Commit | 修改内容 | 状态 |
|------|:--:|----------|:--:|
| `package.json` | ① | 追加 `test:nana:unit` + `test:nana:integration` 脚本，更新 `test:all` | ✅ 最小增量 |
| `prisma/migrations/20260627124550_add_case_artifact/migration.sql` | ① | Case + Artifact 迁移文件 | ✅ |
| `src/app/api/diagnosis/submit-answers/route.ts` | ③ | 修复 finalStates 类型 + lastEvidence 补齐 + logger 格式化 | ✅ 最小修复 |

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P3 | `light-feedback.tsx` 中 `caseId` 为 undefined 时使用 magic string `"__preliminary__"` 调用反馈 API。当前反馈 API 不校验 case 是否存在，不引起 bug，但引入了一个不存在的 ID 进入日志。 | `src/components/nana/capture/light-feedback.tsx:138` | 第 5 阶段接入真实 API 时，需确保 case 创建后传递真实 caseId。当前阶段可忽略。 |
| P3 | feedback API handler 不校验 case 是否存在（不查询 DB），接收任意 caseId 返回反馈。 | `src/app/api/nana/cases/[id]/feedback/route.ts` | 第 5 阶段应加入 `prisma.case.findUnique` 校验，case 不存在返回 404。当前 mock 阶段不阻塞。 |
| P3 | `tsconfig.json` 和 `scripts/gen-report-html.ts` 也在变更范围中 | `tsconfig.json`、`scripts/gen-report-html.ts` | 经检查这些变更在 commit ①前的 `2d2d875 fix(build)` 中引入（排除 scripts/ 目录解决 sharp 未安装报错），非本轮变更引入。已确认与阶段范围无关。 |

**说明**：以上 P3 问题均为非阻塞型，不影响验收标准。均在"当前阶段可接受"范围内。

---

## 上游文件修改详情

### `src/app/api/diagnosis/submit-answers/route.ts`（Commit ③）
```
变更：4 处修改（+3 行导入/类型修复 + 1 行 logger 格式化）
1. 导入 NodeStateOutput 类型（第 22 行）
2. finalStates 类型从内联改为 NodeStateOutput（第 128 行）
3. finalStates 合并到 allStates 时补 lastEvidence: null（第 182 行）
4. logger.error 从位置参数改为结构化参数（第 239 行）

原因：Pre-existing 类型错误阻塞 build，最小修复
影响：不影响原有功能逻辑，只是类型补全
```

**结论：改动最小化、必要性可验证、不改变原功能语义。** ✅

---

## 用户验证指南

1. **启动开发服务器**：`npm run dev`
2. **采集壳完整流程验证**：
   - 打开 http://localhost:3001/nana（需要已登录）
   - 看到首页两个行动卡 + 空状态/有记录态
   - 点击"拍一下这道题"→ 进入 `/nana/capture`
   - 看到题图固定在上半屏（"已知函数 f(x) = x² − 2x − 3"）
   - 点击录音按钮 → 看到波形动画 + mock 转写文字逐行出现
   - 点击"我听完了" → 自动切换到"帮你整理"tab → 看到轻反馈文案（带 0.3s fade-in）
   - 轻反馈区域显示"不是终诊 · 这只是初步线索"
   - 点击"再拍一道" → 状态重置，已拍计数递增
   - 连续拍 3 道 → 出现"开始诊断？"链接
3. **API 验证**（curl 或 Postman）：
   - `POST /api/nana/cases` 带 `{ artifacts: [{ type: "image", content: "url" }] }` → 201 + id
   - `GET /api/nana/cases/:id` → 200 + case + artifacts
   - `POST /api/nana/cases/:id/feedback` 带 `{ transcript: "我配方配到一半" }` → 200 + hint
4. **P4 措辞检查**：
   - 确认所有前台文案中没有"错""失败""得分""未掌握""正确率"
   - 确认"不是终诊 · 这只是初步线索"在每次轻反馈中可见

---

## 附件：验证命令执行结果

| 验证项 | 结果 |
|--------|:----:|
| `docker compose -f docker-compose.test.yml up --abort-on-container-exit` | ✅ exit 0（全量 141 测试通过） |
| `npx next build`（增量构建） | ✅ 编译成功，0 错误 |
| `git diff prisma/schema.prisma`（检查上游 model 未被修改） | ✅ 仅末尾追加 Case + Artifact |
