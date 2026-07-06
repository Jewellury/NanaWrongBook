# Stage 3 Round 4 Hotfix · 复审报告

> 关联执行日志: doc/executionlog/stage3-revised-round4-hotfix-log.md
> 复审日期: 2026-07-06
> 复审 commit: 918a592
> 复审范围: 仅 hotfix 本身（P1 + P2-a + P2-c + P2-d + 3 新测试），不重新展开全量 Stage 3

## 复审结论（大白话）

**总体判定：✅ 通过**

Round 4 hotfix 干净利落，P1 竞态保护和 P2-a AbortController 两层防御都到位了。5 个重点检查项全部通过。Round 4 可以正式收口。

---

## 5 个复审重点逐条回答

### 重点 1：旧请求 resolve 后是否所有路径都检查 caseId ref ✅ 通过

逐路径检查：

| 路径 | 代码位置 | 检查 |
|------|----------|------|
| `handleSave` POST 成功 | 第 226 行 | `if (currentCaseIdRef.current !== caseRecord.id) return;` ✅ |
| `handleSave` POST catch | 第 232 行 | `if (currentCaseIdRef.current !== caseRecord.id) return;` ✅ |
| `handleRetryProcess` POST 成功 | 第 301 行 | `if (currentCaseIdRef.current !== savedCaseId) return;` ✅ |
| `handleRetryProcess` POST catch | 第 306 行 | `if (currentCaseIdRef.current !== savedCaseId) return;` ✅ |
| 轮询 GET 成功 | 第 261 行 | `if (currentCaseIdRef.current !== savedCaseId) return;` ✅ |
| 轮询 GET catch | 第 268 行 | catch 块不更新状态，无需检查 ✅ |

**额外发现**：catch 路径还有 `AbortError` 提前返回（第 231/305 行），AbortError 不检查 caseId 也安全——因为 abort 本身就意味着 caseId 已被清除或覆盖。

### 重点 2：handleTakeAnother / handleRetake / unmount 是否都 abort + 清空 ref ✅ 通过

| 路径 | abort | 清空 ref | 代码位置 |
|------|:-----:|:--------:|----------|
| `handleTakeAnother` | ✅ `abortControllerRef.current?.abort()` | ✅ `currentCaseIdRef.current = null` | 第 344-345 行 |
| `handleRetake` | ✅ `abortControllerRef.current?.abort()` | ✅ `currentCaseIdRef.current = null` | 第 327-328 行 |
| 轮询 useEffect cleanup (unmount) | ✅ `ac.abort()` | ⚠️ 未清空 ref | 第 284 行 |

**unmount 未清空 ref 的分析**：unmount 时组件即将销毁，`currentCaseIdRef` 本身会被 GC 回收，不会影响任何后续逻辑。清空 ref 是为了防止"旧请求 resolve 后误更新状态"，而 unmount 后没有状态可更新。所以 unmount 只 abort 不清 ref 是安全的。✅

### 重点 3：API client 的 signal 是否真的传进 fetch ✅ 通过

```typescript
// triggerCaseProcess（第 167-174 行）
export async function triggerCaseProcess(caseId: string, signal?: AbortSignal): Promise<CaseProcessResult> {
  const res = await fetch(`${NANA_BASE}/cases/${caseId}/process`, {
    method: 'POST',
    signal,              // ← ✅ 传入 fetch
  });
```

```typescript
// getCaseProcessStatus（第 181-185 行）
export async function getCaseProcessStatus(caseId: string, signal?: AbortSignal): Promise<CaseProcessResult> {
  const res = await fetch(`${NANA_BASE}/cases/${caseId}/process`, { signal });  // ← ✅ 传入 fetch
```

两个函数都把 `signal` 传给了 `fetch` 的 options。调用方传 `ac.signal` → fetch 收到 → abort 触发 fetch throw `AbortError`。✅

### 重点 4：GET pending 返回的 null 字段是否和类型一致 ✅ 通过

**类型定义**（`CaseProcessResult`）：
```typescript
questionSummary: string | null;
textbookTopic: { id: string; name: string; confidence: number } | null;
feedback: string | null;
possibleMistakeReason: string | null;
nextActionSuggestion: string | null;
transcript: string | null;
error: string | null;
```

**GET pending 返回**（第 416-426 行）：
```json
{
  "status": "pending",
  "audioStatus": "skipped",
  "questionSummary": null,      // ✅
  "textbookTopic": null,        // ✅
  "feedback": null,             // ✅
  "possibleMistakeReason": null, // ✅
  "nextActionSuggestion": null,  // ✅
  "transcript": null,           // ✅
  "error": null                 // ✅
}
```

**GET 已有结果返回**（第 429-445 行）：所有 `undefined` 已改为 `null`，与类型声明一致。✅

**POST 成功返回**（第 355-372 行）：`undefined` 已改为 `null`，与类型声明一致。✅

### 重点 5：3 个新增测试是否覆盖竞态/再拍一道/abort ✅ 通过

| # | 测试名 | 覆盖场景 | 验证点 |
|---|--------|----------|--------|
| 11 | "快速连续保存两题" | 题 A 慢返回 + 题 B 快返回 | processResult 是题 B 的，不是题 A 的 ✅ |
| 12 | "再拍一道后旧请求返回" | 保存 A → 再拍一道 → A 旧请求返回 | processState 保持 idle，processResult 保持 null ✅ |
| 13 | "AbortController abort 后请求被取消" | abort → fetch reject | 抛出 `DOMException` name=`AbortError` ✅ |

**测试 #11 细节**：题 A 的 `triggerCaseProcess` 用 `setTimeout(r, 100)` 模拟延迟，题 B 立即返回。测试验证 `currentCaseIdRef` 覆盖后，题 A 的 `.then()` 回调被 ref 检查拦截。✅

**测试 #12 细节**：保存后清 `currentCaseIdRef = null`，模拟"再拍一道"。旧请求 `.then()` 回调检查 `currentCaseIdRef !== recordA.id` 为 true（null !== 'case-A'），直接 return，不更新状态。✅

**测试 #13 细节**：创建真实 `AbortController`，mock `triggerCaseProcess` 返回一个在 abort 事件触发时 reject 的 Promise。验证 abort 后抛出的是 `AbortError`。✅

---

## 检查清单

### Hotfix 范围一致性
- [x] 只修了 P1 + P2-a + P2-c + P2-d + 补测试，未扩大到新功能
- [x] 无偏离记录（执行日志确认"无偏离"）

### 代码质量
- [x] 无明显 bug
- [x] caseId ref 检查覆盖所有 POST/GET resolve 路径
- [x] AbortError 在 catch 中被正确识别和提前返回
- [x] abort + 清空 ref 在所有"离开"路径都执行

### 安全性
- [x] 无密钥泄露
- [x] 无生产库写入

### Agent 同步一致性
- [x] `node scripts/check-agent-sync.js` 通过（3/3 agents in sync）

### 测试
- [x] `npm run build` 通过
- [x] round4 测试 13/13 通过（原 10 + 新 3）
- [x] summary-api 14/14 通过（无回归）
- [x] process-api 18/18 通过（无回归）
- [x] 测试全部 mock，不依赖 VOLCENGINE_API_KEY

## 问题清单

无问题。所有 5 个复审重点全部通过。

---

## Round 4 正式收口

Round 4 闭环：
- **Round 4 主体**（commit `55bb7c4`）：拍题触发整理 + 轮询 + AI 结果卡 + 10 测试
- **Round 4 hotfix**（commit `918a592`）：P1 竞态保护 + P2-a AbortController + P2-c 类型对齐 + P2-d 文档更正 + 3 测试

**v1 最小 AI 闭环已成型且竞态安全**：拍题 → 保存 → AI 整理 → 卡片反馈 → 汇总页可见

### 下一步建议

用户倾向先做**真实 provider smoke**，验证真实 LLM 接上后的表现。这是 v1 闭环最后也是最大的不确定性。
