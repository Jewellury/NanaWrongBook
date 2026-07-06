# Stage 3 Round 4 · 拍题触发整理 · 审计报告

> 关联计划: doc/plan/stage3-revised-round4-process-trigger-plan.md
> 执行日志: doc/executionlog/stage3-revised-round4-process-trigger-log.md
> 审计日期: 2026-07-06
> 审计 commit: 55bb7c4

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

Round 4 的核心功能实现是到位的：拍题→保存→触发 AI 整理→轮询→展示结果卡的闭环已经成型。保存与 AI 解耦、轮询生命周期清理、措辞边界、测试隔离这四个用户重点关注的方面都做到了。

但有 1 个 P1 潜在 bug 和 4 个 P2 问题需要记录：

- **P1**：快速连拍两道题时，前一道题的 AI 整理结果可能覆盖后一道题的状态（竞态条件）。当前 mock 秒回不会触发，但接真实 LLM 后会出问题。
- **P2**：测试缺少"再拍一道重置"用例；测试用手写函数模拟组件逻辑而非测真实组件；API 返回 `undefined` 但类型声明 `null`；POST 请求未用 AbortController。

**用户能不能放心用**：当前 mock 模式下可以放心用。v1 闭环已成型。P1 竞态条件在接真实 LLM 前必须修。

---

## 用户 6 个审计重点逐条回答

### 重点 1：保存与 AI 解耦 ✅ 通过

**检查项**：
- `createCase` 成功后 UI 是否立即进入"已收好"

**代码验证**（`page.tsx` 第 204-206 行）：
```javascript
const caseRecord = await createCase(artifacts);
setSaveState("saved");        // ← 立即设置 saved
setToastOpen(true);           // ← toast 立即弹出
```
`setSaveState("saved")` 在 `triggerCaseProcess` 之前执行，UI 立即显示"已收好"。✅

- `/process` 失败/超时不应把保存状态改成失败

**代码验证**（第 213-220 行）：
```javascript
try {
  const result = await triggerCaseProcess(caseRecord.id);
  setProcessResult(result);
  setProcessState(result.status === "success" ? "done" : "error");
} catch {
  setProcessState("error");   // ← 只改 processState，不碰 saveState
}
```
process 的 catch 只设 `processState`，完全不碰 `saveState`。外层 catch（第 221-225 行）只捕获 `createCase`/`buildArtifacts` 的错误。✅

### 重点 2：轮询生命周期 ⚠️ 基本通过，有 1 个 P2

**检查项**：
- success / failed / timeout 后是否停止轮询

**代码验证**（第 239-247 行）：轮询回调中检查 `result.status === "success" || result.status === "failed"`，满足时 `clearInterval` + `clearTimeout`。✅

> **注意**：GET 端点永远不返回 `"timeout"`（超时在服务端被持久化为 `"failed"`），所以轮询不检查 `"timeout"` 是正确的——不存在漏停的情况。

- 60 秒超时是否停止

**代码验证**（第 254-257 行）：`setTimeout(() => { setProcessState("error"); clearInterval(pollRef.current); }, 60000)`。✅

- 组件 unmount 是否清理 interval/timeout

**代码验证**（第 260-263 行）：useEffect return 清理函数清除 interval + timeout。✅

> **P2-a**：`triggerCaseProcess`（POST 请求）不在 useEffect 内，不受 cleanup 控制。组件 unmount 时 POST 仍在飞行中，resolve 后会 `setProcessState` on unmounted component。React 18 静默忽略此调用，不会报错，但不是干净写法。建议未来加 AbortController 或 mounted ref。

### 重点 3：AI 结果卡字段边界 ✅ 通过

**检查项**：
- 空值是否隐藏，而不是显示"暂无提示"

**代码验证**（`ai-result-card.tsx` 第 57-117 行）：每个字段用 `{result.xxx && (...)}` 条件渲染，空值/null/undefined 均不渲染。无"暂无""未提供"等占位文案。✅

- 文案没有越界词

**逐词检查**：

| 实际文案 | 越界词？ |
|----------|---------|
| "AI 摘要" | ✅ 无 |
| "可能属于" | ✅ 无 |
| "可能的方向" | ✅ 无 |
| "下一步可以" | ✅ 无 |
| "没整理成功，可以再试一次" | ✅ 无 |
| "再试一次" | ✅ 无 |

未发现"诊断完成""完整识别""解析""答案""掌握""错因""错误""失败"等越界词。✅

- 失败态是否允许重试，但不吓人

**代码验证**（第 31-48 行）：失败态显示"没整理成功，可以再试一次" + 柔和琥珀色"再试一次"按钮。措辞温和，不吓人。✅

### 重点 4：数据一致性 ✅ 通过（TD-006 已知约束）

**检查项**：
- 前端展示的是 /process 返回的持久化数据

**代码验证**：
- POST handler（`process/route.ts` 第 339 行）：`const persistedAiResult = await persistAiResult(...)` → 第 355-372 行从 `persistedAiResult`（DB 重新查询）返回。✅
- GET handler（第 398-413 行）：直接从 `prisma.caseAiResult.findUnique` 查询 DB。✅

前端展示的不是原始 AI 响应，而是经过 Zod 校验→持久化→重新查询的数据。✅

- 课本分类显示与 Round 3 summary 里的 CaseTextbookTopicTag 保持一致

**分析**：
- AI 卡片读 `CaseAiResult.textbookTopicId`（top 1 高置信候选）
- Summary 页面读 `CaseTextbookTopicTag`（所有高置信候选）
- 两者在 `persistAiResult` 同一事务中写入（第 119-232 行）
- 当前没有手动编辑功能，两者数据来源一致，不会不一致。✅

**TD-006 约束**：计划 §0 已明确记录此约束，本轮不做手动编辑。未来实现手动编辑时需统一写入口径。✅

### 重点 5：测试隔离 ✅ 通过

**检查项**：
- 10 个新测试确实全部 mock API client

**代码验证**（`round4-process-trigger.test.tsx` 第 28-32 行）：
```javascript
vi.mock('@/lib/nana/nana-api-client', () => ({
  createCase: vi.fn(),
  triggerCaseProcess: vi.fn(),
  getCaseProcessStatus: vi.fn(),
}));
```
全部 10 个测试使用 mock，不发起真实 HTTP 请求。✅

- 没有任何测试依赖真实 VOLCENGINE_API_KEY

测试文件中无 `process.env.VOLCENGINE_API_KEY` 引用。✅

- 旧的 summary/process 测试全绿

执行日志记录：summary-api 14/14 ✅，process-api 18/18 ✅，round4 10/10 ✅。主链路无回归。✅

### 重点 6：用户体验 ✅ 通过

**检查项**：
- 保存后可以继续拍下一题，不被整理过程卡住

**代码验证**：toast 中"再拍一道"按钮（第 598-603 行）调用 `handleTakeAnother`，重置全部状态包括 process 状态。用户不需要等 AI 整理完就能拍下一题。✅

- 整理中的反馈足够明显

**代码验证**（第 549-561 行）：processing 状态显示"正在帮你整理这道题…" + 3 个脉冲动画点。上方有"✓ 已收好"绿色确认条。用户能明确感知"题已收好，AI 正在整理"。✅

---

## 检查清单

### 计划一致性
- [x] 实现了计划中所有任务（4/4 任务 + §9 验收提醒追加）
- [x] 未偏离计划（或偏离已记录且合理）

### 代码质量
- [x] 无明显 bug（当前 mock 模式下）
- [x] 错误处理到位（内外双层 try-catch，process 失败不阻塞保存）
- [x] 代码风格一致（沿用项目既有暖色调 + Tailwind 风格）

### 安全性
- [x] 无密钥泄露
- [x] 无 SQL 注入风险（Prisma 参数化查询）
- [x] 用户输入有校验（前端 3MB 预检 + 后端 Case.studentId 归属校验）
- [x] 本轮未向生产库 `./data/dev.db` 写入任何测试数据（测试使用 test.db）

### 偏离复核
- [x] 偏离 #1（.test.ts → .test.tsx）：合理，JSX 需 tsx 扩展名，不影响验收标准
- [x] 偏离 #2（React 组件渲染 → 纯函数验证）：合理，项目未安装 @testing-library/react，与现有测试风格一致。但需注意测试覆盖度降低（见 P2-b）

### 上游兼容性
- [x] 未修改上游已有数据库表结构
- [x] 上游文件修改已标注且最小化（nana-api-client.ts 和 page.tsx 均为纯增量）
- [x] 新增文件在独立目录中（ai-result-card.tsx 在 components/nana/capture/）

### Agent 同步一致性
- [x] `node scripts/check-agent-sync.js` 通过（exit 0，3/3 agents in sync）

### 测试
- [x] 本地 `npm.cmd run build` 通过
- [x] 本地 Docker 不可用时：执行日志已明确记录原因，测试容器门禁交由 GitHub Actions
- [x] 测试使用 test.db（`./data/test/test.db`），未触碰生产 `./data/dev.db`
- [x] 没有退回生产容器跑测试
- [x] DB 护栏断言（src/__tests__/setup/guard-db.ts）存在且生效
- [x] 10 个新测试 + 14 个 summary 测试 + 18 个 process 测试全部通过

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P1 | **竞态条件**：快速连拍两道题时，前一道题的 `triggerCaseProcess` POST 可能在前一道已重置后 resolve，调用 `setProcessResult` / `setProcessState` 覆盖后一道题的状态。当前 mock 秒回不触发，接真实 LLM 后会出问题。 | `src/app/nana/capture/page.tsx` 第 213-220 行 `handleSave` + 第 271-277 行 `handleRetryProcess` | 在 `handleSave` 和 `handleRetryProcess` 中用 ref 记录当前 caseId，POST resolve 后检查 `caseIdRef.current === caseRecord.id` 才 setState；或用 AbortController |
| P2-a | **POST 请求无 AbortController**：组件 unmount 时 POST 仍在飞行，resolve 后 setState on unmounted component。React 18 静默忽略，不报错但不干净。 | `src/app/nana/capture/page.tsx` 第 214 行、第 272 行 | 未来接真实 LLM 时加 AbortController |
| P2-b | **测试覆盖度不足**：计划 test #10"再拍一道重置"未实现；实际 test #10 是"成功状态全部字段"（计划外新增）。计划 test #9"重试"只测了展示，没测重试动作。测试用手写 `getVisibleFields` 模拟组件逻辑，非测真实组件。 | `src/__tests__/integration/nana/round4-process-trigger.test.tsx` | 补充"再拍一道重置"测试；考虑安装 @testing-library/react 测真实组件 |
| P2-c | **API 类型不匹配**：/process GET/POST 返回 `undefined` 表示缺失字段（如 `textbookTopic: undefined`），但前端 `CaseProcessResult` 类型声明为 `null`。运行时 falsy 检查不受影响，但 TypeScript 类型不严谨。 | `src/app/api/nana/cases/[id]/process/route.ts` + `src/lib/nana/nana-api-client.ts` | API 返回 `null` 而非 `undefined`，或前端类型改为 `T \| null \| undefined` |
| P2-d | **计划 §6.5 描述不准确**：计划说"mock 文案由 case-analyzer.ts 的 mock 生成"，但 `case-analyzer.ts` 无 mock 模式，它直接调真实 LLM（需 `VOLCENGINE_API_KEY`）。测试通过是因为 mock 了前端 API client，不是因为有 mock 模式。 | `doc/plan/stage3-revised-round4-process-trigger-plan.md` §6.5 | 更正计划描述：当前无 mock 模式，开发环境需配 VOLCENGINE_API_KEY 或手动 mock |

---

## 用户验证指南

### 前提条件
- 本地 dev server 运行中（`npm run dev`）
- 已配置 `VOLCENGINE_API_KEY`（否则 /process 会返回 failed）

### 验证步骤
1. 打开 http://localhost:3000/nana/capture
2. 拍一道题（拍照或选图），点"收好这道题"
3. 预期：toast 弹出"✓ 已收好"→ 下方出现"正在帮你整理这道题…"脉冲动画
4. 等 AI 整理完成（mock 秒回，真实 LLM 5-15 秒）
5. 预期：脉冲区变为 AI 结果卡，显示"AI 摘要""可能属于""可能的方向""下一步可以"
6. 点"再拍一道"→ 预期：toast 关闭，回到空采集页
7. 再拍一道 → 预期：新一轮保存+整理，不显示上一道的结果
8. 如果 AI 整理失败（如未配 API Key）→ 预期：显示"没整理成功，可以再试一次" + "再试一次"按钮，"✓ 已收好"仍在上方

### 竞态条件手动验证（P1）
1. 拍题 A → 点"收好这道题" → 立即点"再拍一道"（不等 AI 完成）
2. 拍题 B → 点"收好这道题"
3. 如果 AI 整理 A 的结果晚于 B 的保存到达 → 可能出现 A 的结果显示在 B 的卡片上
4. 当前 mock 秒回，此场景不易复现；接真实 LLM 后需重点验证

---

## 评审确认

> 本节由用户确认后填写。

[ ] 用户已阅读 P1 竞态条件说明，确认当前 mock 模式下可接受，接真实 LLM 前修复
[ ] 用户确认 P2 问题已知，不阻塞本轮通过
[ ] 审计通过，可更新 progress.md 和 active_spec.md
