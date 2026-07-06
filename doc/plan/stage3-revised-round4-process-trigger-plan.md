# Stage 3 v3-revised Round 4 — 拍题触发整理 + 状态轮询 + AI 结果卡

> 关联规格: doc/plan/stage3-ai-integration-plan-v3-revised.md
> 计划日期: 2026-07-06
> 预计影响: src/app/nana/capture/page.tsx, src/lib/nana/nana-api-client.ts, src/components/nana/capture/, src/__tests__/integration/nana/

---

## 0. 前置约束（必须遵守）

### TD-006（P2 架构隐患，Round 3 审计发现）

> 手动改课本分类时，必须以 `CaseTextbookTopicTag` 为汇总页权威来源；如同步维护 `CaseAiResult.textbookTopicId`，二者必须在同一事务中更新，并设置 `textbookTopicEdited=true`，避免汇总页和 AI 卡片显示不一致。

**本轮约束**：Round 4 不做手动编辑课本分类功能，但 AI 结果卡展示的课本分类来自 `/process` GET 响应的 `textbookTopic` 字段（即 `CaseAiResult.textbookTopicId`），与 summary 页面读 `CaseTextbookTopicTag` 不同。当前两者来源都是 /process 写入，值一致，不会触发 bug。但未来实现手动编辑时必须统一写入口径（见 BACKLOG TD-006）。

### 明确不做

- ❌ 打印页
- ❌ 手动编辑课本分类
- ❌ 真实生产 smoke
- ❌ 重复题识别
- ❌ 完整 OCR / 解题答案

---

## 1. 大白话概述

孩子拍完题、点"收好这道题"后，系统自动开始帮她整理这道题（调 AI 识别）。整理需要几秒钟，期间显示"正在整理…"的状态。整理完成后，在采集页直接展示一张 AI 结果卡，里面有：AI 生成的一句话摘要、这道题属于哪个课本章节、一句鼓励的话、可能的方向、下一步建议。如果某个字段是空的就不显示。如果整理失败，诚实说"没整理成功，可以再试一次"。

**为什么要做**：Round 0-3 搭好了 AI 整理的后端（case-analyzer + /process API + summary API），但采集页还停在"识别稍后接入"。Round 4 把最后一公里接通：拍完即整理，结果即时可见，让孩子第一次拍题就能感受到"这个工具真的在帮我"。

---

## 2. 任务分解

- [ ] 任务 1：API 客户端扩展（涉及文件: `src/lib/nana/nana-api-client.ts`）
- [ ] 任务 2：AI 结果卡组件（涉及文件: `src/components/nana/capture/ai-result-card.tsx` 新建）
- [ ] 任务 3：采集页接入触发 + 轮询 + 展示（涉及文件: `src/app/nana/capture/page.tsx`）
- [ ] 任务 4：集成测试（涉及文件: `src/__tests__/integration/nana/round4-process-trigger.test.ts` 新建）

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/nana/nana-api-client.ts` | 修改 | 新增 `triggerCaseProcess(caseId)` + `getCaseProcessStatus(caseId)` + 类型定义 |
| `src/components/nana/capture/ai-result-card.tsx` | 新增 | AI 结果卡组件（摘要 + 课本分类 + 轻反馈 + 可能方向 + 下一步建议，空值隐藏） |
| `src/app/nana/capture/page.tsx` | 修改 | 保存成功后触发 process + 轮询状态 + 展示 AI 结果卡 |
| `src/__tests__/integration/nana/round4-process-trigger.test.ts` | 新增 | 集成测试 |

---

## 4. 详细设计

### 4.1 API 客户端扩展（任务 1）

在 `nana-api-client.ts` 新增：

```typescript
// ─── Case AI 整理（Round 4 新增）─────────────────────

export interface CaseProcessResult {
  status: 'pending' | 'success' | 'failed' | 'timeout';
  audioStatus: string;
  questionSummary: string | null;
  textbookTopic: { id: string; name: string; confidence: number } | null;
  feedback: string | null;           // initialFeedback
  possibleMistakeReason: string | null;
  nextActionSuggestion: string | null;
  transcript: string | null;
  error: string | null;
}

/**
 * 触发 AI 整理
 * POST /api/nana/cases/:id/process
 */
export async function triggerCaseProcess(caseId: string): Promise<CaseProcessResult> {
  const res = await fetch(`${NANA_BASE}/cases/${caseId}/process`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`triggerCaseProcess 失败: ${res.status}`);
  return res.json();
}

/**
 * 查询整理状态（轮询用）
 * GET /api/nana/cases/:id/process
 */
export async function getCaseProcessStatus(caseId: string): Promise<CaseProcessResult> {
  const res = await fetch(`${NANA_BASE}/cases/${caseId}/process`);
  if (!res.ok) throw new Error(`getCaseProcessStatus 失败: ${res.status}`);
  return res.json();
}
```

### 4.2 AI 结果卡组件（任务 2）

新建 `src/components/nana/capture/ai-result-card.tsx`：

```typescript
interface AiResultCardProps {
  result: CaseProcessResult;
  onRetry?: () => void;  // 失败时"再试一次"
}
```

**展示规则**：
- `status === "success"` → 正常展示结果卡
- `status === "failed"` → 简短失败提示 + "再试一次"按钮
- `status === "pending"` → 不显示此组件（由采集页 loading 态处理）

**结果卡字段展示（空值隐藏）**：

| 字段 | 显示条件 | 措辞 |
|------|----------|------|
| questionSummary | 非空 | 直接显示，标题"AI 摘要" |
| textbookTopic.name | 非空 | 标签样式，显示章节名 |
| feedback (initialFeedback) | 非空 | 鼓励文案，柔和底色 |
| possibleMistakeReason | 非空 | "可能的方向"（不说"错因"） |
| nextActionSuggestion | 非空 | "下一步建议" |

**措辞合规（OPS §4）**：
- 不出现"错""失败""得分""未掌握"
- "可能的方向"不说"错因"
- "下一步建议"不说"你需要"
- 失败时说"没整理成功，可以再试一次"，不说"错误"

**视觉设计**：
- 沿用项目既有暖色调（#FBF7F0 底 + 白卡 + #5E8868 绿 + #E8A33D 琥珀）
- 圆角卡片，从底部滑入（复用 `animate-slide-up`）
- 每个字段一行/一块，用细分隔线隔开
- 整体高度不超过屏幕 40%，可滚动

### 4.3 采集页接入（任务 3）

修改 `src/app/nana/capture/page.tsx`：

**新增状态**：
```typescript
const [processState, setProcessState] = useState<"idle" | "processing" | "done" | "error">("idle");
const [processResult, setProcessResult] = useState<CaseProcessResult | null>(null);
```

**流程变更**（`handleSave` 内）：

```
1. createCase(artifacts) → 获得 caseId（已有逻辑不变）
2. setSaveState("saved") + setToastOpen(true)（已有逻辑不变）
3. 【新增】setProcessState("processing")
4. 【新增】try {
     const result = await triggerCaseProcess(caseId);
     setProcessResult(result);
     setProcessState(result.status === "success" ? "done" : "error");
   } catch {
     setProcessState("error");
   }
```

注意：`createCase` 返回 `CaseResponse`，其中 `id` 就是 caseId。

**轮询逻辑**：

如果 `triggerCaseProcess` 因为网络超时等原因没返回，需要轮询兜底：
```typescript
// 触发后如果 15 秒未返回，切换为轮询模式
useEffect(() => {
  if (processState !== "processing") return;
  const caseId = savedCaseId;
  if (!caseId) return;

  const interval = setInterval(async () => {
    try {
      const result = await getCaseProcessStatus(caseId);
      if (result.status === "success" || result.status === "failed") {
        setProcessResult(result);
        setProcessState(result.status === "success" ? "done" : "error");
        clearInterval(interval);
      }
    } catch {
      // 轮询失败不立即报错，继续轮询
    }
  }, 3000); // 每 3 秒查一次

  // 60 秒超时
  const timeout = setTimeout(() => {
    clearInterval(interval);
    setProcessState("error");
  }, 60000);

  return () => {
    clearInterval(interval);
    clearTimeout(timeout);
  };
}, [processState, savedCaseId]);
```

**UI 变更**：

保存成功后的 toast 浮动卡中，增加 AI 整理状态区域：

1. **processing 状态**：在成功确认条下方显示"正在帮你整理这道题…" + 动画指示器（脉冲点或 spinner）
2. **done 状态**：在成功确认条下方渲染 `AiResultCard`，原来的"给这道题挂个知识点"等按钮移到卡片下方
3. **error 状态**：显示"没整理成功，可以再试一次" + 重试按钮

**"再拍一道"时重置**：
```typescript
const handleTakeAnother = useCallback(() => {
  // 已有重置逻辑
  // 【新增】重置 process 状态
  setProcessState("idle");
  setProcessResult(null);
  setSavedCaseId(null);
}, [...]);
```

**关键约束**：
- `createCase` 返回的 `caseId` 必须存入 state（`savedCaseId`），供触发 process 和轮询使用
- process 触发失败不阻塞保存成功——题目已存好，只是 AI 整理没跑起来，用户可手动重试
- "再拍一道"时彻底重置 process 状态，避免新题看到旧题的 AI 结果

### 4.4 集成测试（任务 4）

新建 `src/__tests__/integration/nana/round4-process-trigger.test.ts`：

| # | 场景 | 验证点 |
|---|------|--------|
| 1 | API 客户端 triggerCaseProcess | 返回 CaseProcessResult 类型正确 |
| 2 | API 客户端 getCaseProcessStatus | 返回 CaseProcessResult 类型正确 |
| 3 | 保存→触发→成功 | createCase 返回 id → triggerCaseProcess 成功 → status=success |
| 4 | 保存→触发→失败 | triggerCaseProcess 返回 failed → processState=error |
| 5 | 轮询查到 success | getCaseProcessStatus 返回 success → 停止轮询 |
| 6 | 轮询查到 failed | getCaseProcessStatus 返回 failed → 停止轮询 |
| 7 | 轮询超时 | 60 秒后 processState=error |
| 8 | 空值隐藏 | questionSummary=null 时不显示该字段 |
| 9 | 重试 | error 状态点"再试一次" → 重新触发 process |
| 10 | 再拍一道重置 | processState 回到 idle，processResult 清空 |

> 注：测试方式以 mock fetch 为主（单元测试层面），不重复测 /process API 本身（Round 2 已有 18 个集成测试覆盖）。

---

## 5. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 拍题保存成功后自动触发 /process | 手动验证 + 测试 #3 |
| 2 | 整理中显示"正在整理…"状态 | 手动验证 |
| 3 | 整理成功展示 AI 结果卡（5 字段，空值隐藏） | 手动验证 + 测试 #8 |
| 4 | 整理失败显示"没整理成功" + 重试按钮 | 手动验证 + 测试 #4, #9 |
| 5 | 轮询正确停止（成功/失败/超时） | 测试 #5, #6, #7 |
| 6 | "再拍一道"彻底重置 process 状态 | 测试 #10 |
| 7 | npm run build 通过 | 构建验证 |
| 8 | 集成测试通过 | 测试验证 |
| 9 | 措辞合规（无"错/失败/得分/未掌握"） | 审计检查 |

---

## 6. 风险与注意事项

### 6.1 process API 同步等待时间

`POST /process` 内部调用 `analyzeCase`（case-analyzer.ts），当前是 mock 实现（不调真实 LLM），返回很快。但未来接真实 API 后可能需要 5-15 秒。设计上需要：
- 前端不等 POST 返回，直接进轮询模式
- 或者 POST 设短超时（10 秒），超时后自动切轮询

**本轮选择**：POST 等待返回（mock 很快），同时启动轮询兜底（防网络问题）。未来接真实 API 时再调整策略。

### 6.2 保存成功但 process 触发失败

场景：`createCase` 成功（题目已存库），但 `triggerCaseProcess` 网络失败。处理：不阻塞保存成功提示，process 状态设为 error，用户可手动重试。题目不会丢。

### 6.3 caseId 传递

`createCase` 返回 `CaseResponse`，其中 `id` 字段就是 caseId。需要新增 `savedCaseId` state 存这个值。

### 6.4 不改 /process API

本轮不改 `/process` API（Round 2 已审计通过），只改前端调用方式。

### 6.5 措辞合规

AI 结果卡展示的文案来自 /process 返回的 `questionSummary`、`feedback`、`possibleMistakeReason`、`nextActionSuggestion`。这些字段由 `case-analyzer.ts` 的 mock 生成。需确认 mock 文案不含违禁词。如果 mock 文案有问题，在本轮直接修 mock（属于 Round 1 范围的微调，不是新功能）。

---

## 7. 执行顺序

1. 新增 `triggerCaseProcess` + `getCaseProcessStatus` 到 API 客户端
2. 新建 `AiResultCard` 组件
3. 修改采集页：保存成功 → 触发 process → 轮询 → 展示/失败
4. 新建集成测试
5. `npm run build` + 集成测试全绿
6. Git 收口

---

## 8. 回滚方案

- API 客户端扩展：新函数，不影响已有功能
- AiResultCard 组件：新文件，`git revert` 即可
- 采集页修改：`git revert` 回退到 Round 3 状态
- 无 schema 变更，无 migration，无数据迁移风险

---

## 9. 用户验收提醒（execute-agent 必须遵守）

### 9.1 保存 case 本身不能被 AI 阻塞

- `createCase` 成功后就立即显示"题已收好"
- `/process` 慢、失败、超时，都不能让用户以为保存失败
- process 的任何错误状态都不能回退 saveState

### 9.2 轮询要有明确停止条件

- `status === "success"` 或 `status === "failed"` → 停止轮询
- 60 秒总超时 → 停止轮询，设为 error
- 组件 unmount 时清除 interval + timeout（`useEffect` cleanup），避免页面离开后继续 setState

### 9.3 AI 卡片措辞守边界

- 不写"诊断完成""识别出了完整题目""解析/答案"
- 用"AI 摘要""可能属于""可能的方向""下一步可以"
- 失败时说"没整理成功，可以再试一次"，不说"错误"

### 9.4 测试别打真实豆包

- 10 个测试全部 mock /process 或 mock API client
- CI 不能依赖 VOLCENGINE_API_KEY
- 测试不发起任何真实 HTTP 请求到 AI provider
