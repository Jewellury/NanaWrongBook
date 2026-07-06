# Stage 3 Round 4 Hotfix · 执行日志

> 关联审计报告: doc/auditlog/stage3-revised-round4-process-trigger-audit.md
> 开始时间: 2026-07-06 16:30

## 执行记录

### 任务1: P1 竞态条件修复
- 做了什么:
  - 新增 `currentCaseIdRef` 记录当前正在处理的 caseId
  - `handleSave`: createCase 成功后设 `currentCaseIdRef.current = caseRecord.id`，triggerCaseProcess 返回后检查 `currentCaseIdRef.current === caseRecord.id`，不一致则丢弃
  - `handleRetryProcess`: 同样的 caseId ref 检查
  - `handleTakeAnother` / `handleRetake`: 清除 `currentCaseIdRef.current = null`，使飞行中的旧请求返回时被丢弃
  - 轮询 useEffect: interval 回调中也检查 `currentCaseIdRef.current === savedCaseId`
- 涉及文件: `src/app/nana/capture/page.tsx`
- 结果: ✅ 完成

### 任务2: P2-a AbortController 修复
- 做了什么:
  - 新增 `abortControllerRef`
  - `triggerCaseProcess` 和 `getCaseProcessStatus` 新增 `signal?: AbortSignal` 参数
  - `handleSave` / `handleRetryProcess`: 创建新 AbortController，传 signal 给 fetch
  - `handleTakeAnother` / `handleRetake`: 调 `abortControllerRef.current?.abort()` 取消飞行请求
  - 轮询 useEffect cleanup: 调 `ac.abort()` 取消轮询 fetch
  - catch 块: AbortError 不更新状态（`err instanceof DOMException && err.name === "AbortError"` 时 return）
- 涉及文件: `src/app/nana/capture/page.tsx`, `src/lib/nana/nana-api-client.ts`
- 结果: ✅ 完成

### 任务3: P2-c API 类型对齐
- 做了什么:
  - POST handler: `undefined` → `null`（textbookTopic, transcript）
  - GET handler: `undefined` → `null`（textbookTopic, transcript, error）
  - GET handler pending 态: 补全所有字段为 `null`（之前只返回 status + audioStatus）
- 涉及文件: `src/app/api/nana/cases/[id]/process/route.ts`
- 结果: ✅ 完成

### 任务4: P2-d 计划文档更正
- 做了什么: §6.5 "mock 文案由 case-analyzer.ts 的 mock 生成" 改为 "case-analyzer.ts 无 mock 模式——测试通过 vi.mock API client 实现"
- 涉及文件: `doc/plan/stage3-revised-round4-process-trigger-plan.md`
- 结果: ✅ 完成

### 任务5: 补测试
- 做了什么: 新增 3 个测试用例
  - #11: 快速连续保存两题，第一题慢返回不覆盖第二题状态
  - #12: 点"再拍一道"后旧请求返回，不显示旧结果
  - #13: AbortController abort 后请求被取消（抛 AbortError）
- 涉及文件: `src/__tests__/integration/nana/round4-process-trigger.test.tsx`
- 结果: ✅ 13/13 通过（原 10 + 新 3）

### 任务6: 构建验证 + 回归测试
- npm run build ✅
- round4 测试 13/13 ✅
- summary-api 14/14 ✅
- process-api 18/18 ✅
- 结果: ✅ 全绿

## 偏离记录

无偏离。修复范围严格限制在审计报告列出的 P1 + P2-a + P2-c + P2-d + 补测试，未扩大到新功能。

## 完成状态
- [x] 所有任务完成
- [ ] 代码已提交（commit: 待提交）
- [x] 本地 `npm.cmd run build` 通过
- [x] 本地相关窄范围测试已运行（13+14+18=45 测试全绿）
- [x] 测试容器门禁：本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行
- [x] 确认测试在安全路径运行：使用 test.db，dev.db 未被触碰
- [x] 可进入审计阶段
