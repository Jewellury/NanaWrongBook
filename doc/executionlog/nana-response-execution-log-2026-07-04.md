# Nana 页面响应优化 · 执行日志

> 关联计划: [doc/plan/nana-response-plan.md](../plan/nana-response-plan.md)
> 关联审计: [doc/auditlog/audit-nana-response-plan-2026-07-04.md](../auditlog/audit-nana-response-plan-2026-07-04.md)
> 执行日期: 2026-07-04
> 执行者: execute-agent

## 背景

用户反馈手机端点击按钮后缺乏即时反馈，导致"我是不是没点上？"的困惑。
本轮聚焦 Nana 内部交互反馈：录音按钮请求态/停止态、知识地图浮层和节点按钮触摸反馈。

## 执行内容

### Task 1+2: VoiceRecorder 状态机改造（中风险）

**文件**: `src/components/nana/capture/voice-recorder.tsx`

| 改动 | 说明 |
|------|------|
| 三态→四态 | `idle → requesting → recording → completed`，新增 `requesting` 态 |
| requesting 门禁 | `handleStartRecording` 开头 `if (state !== "idle") return` + `setStateAndNotify("requesting")` |
| requesting 按钮 | `disabled={isRequesting}`，文案 "请求权限中…" |
| 权限拒绝恢复 | catch 中 `setStateAndNotify("idle")`，按钮恢复可点 |
| unmount 保护 | `getUserMedia` await 后检查 `abortedRef.current`，为 true 则释放 stream 并 return，不创建 recorder、不 setState |
| isStopping 防竞态 | 新增 `isStopping` state + `isStoppingRef` ref，防止用户点击与 60s timer 同时调 `recorder.stop()` |
| 60s timer 门禁 | setTimeout 回调中检查 `isStoppingRef.current`，已停止则跳过 |
| "我听完了"按钮 | `disabled={isStopping}`，文案变为 "正在收…" |

**关键设计决策**:
- `isStopping` 用 state（非 ref）做按钮文案切换，因为需要触发重渲染
- `isStoppingRef` 用 ref 做 setTimeout 闭包中的门禁判断，因为闭包捕获的是旧 state 值
- 两者同步设置：`isStoppingRef.current = true; setIsStopping(true)`
- `isStopping` 不在 onstop 中重置——一旦 stop() 被调用，状态会从 recording 变为 completed，下次录音时 state 自然是 false

### Task 3: 知识地图浮层按钮 pressed 态（低风险）

**文件**: `src/app/nana/knowledge-map/page.tsx`

| 改动 | 说明 |
|------|------|
| `floatingBtnPressed` state | 仅绑定浮层入口按钮，不含空状态按钮和 URL 参数自动打开 |
| 按下时 | `setFloatingBtnPressed(true)` |
| 关闭时 | `setFloatingBtnPressed(false)`（在 onClose 回调中） |
| pressed 样式 | `scale-95 opacity-80` |

### Task 4: 知识地图按钮 active:scale（低风险）

**文件**: 3 个组件

| 文件 | 按钮 | scale |
|------|------|-------|
| `knowledge-map-list-view.tsx` | 节点按钮 | `active:scale-[0.98]` |
| `recent-cases-list.tsx` | 关闭按钮 | `active:scale-90` |
| `recent-cases-list.tsx` | 案例卡片 | `active:scale-[0.98]` |
| `recent-cases-list.tsx` | "挂上"按钮 | `active:scale-95`（不改已有 busy/disabled 逻辑） |

### Task 1.6: 单元测试

**文件**: `src/__tests__/unit/nana/voice-recorder.test.tsx`

4 个测试覆盖用户行为和副作用：
1. 重复点击不重复 `getUserMedia` — 验证 disabled + state 门禁双重拦截
2. 权限拒绝后恢复 idle — 验证 `onRecordingStateChange` 未收到 `true`
3. unmount 后 getUserMedia resolve 不回写状态 — 验证不触发 `onRecordingStateChange(true)`
4. `recorder.stop` 不重复调用 — 验证用户点击后 60s timer 不再触发

## 验证

### 单元测试

```powershell
# 必须设置 DATABASE_URL，否则 guard-db.ts 会拦截
cd e:\nana
cmd /c "set DATABASE_URL=file:./data/test/test.db && npx vitest run src/__tests__/unit/nana/voice-recorder.test.tsx"
```

结果：4 passed (4)

**注意**: vitest 的 `guard-db.ts` setup 文件要求 `DATABASE_URL` 在白名单中。
白名单值为 `file:/app/data/test.db`（Docker 测试容器）和 `file:./data/test/test.db`（本地）。
PowerShell 不会自动加载 `.env.test`，需手动设置环境变量。
用 `cmd /c "set ... && ..."` 是因为 PowerShell 的 `$env:` 在某些情况下被 CatPaw 终端代理吞掉。

**不修改 vitest.config.ts 自动加载 .env.test** — 避免为本地命令便利改测试基础设施。

### Build

```powershell
cd e:\nana
npm.cmd run build
```

结果：通过，无错误。

## Git 提交

3 个 commit，已推送到 origin/dev：

| Commit | 类型 | 说明 |
|--------|------|------|
| `56dbab6` | `fix(capture)` | 录音按钮请求态和停止态反馈 — 四态状态机+防竞态+单元测试 |
| `26f5d0a` | `fix(map)` | 地图浮层和节点按钮触摸反馈 — pressed态+active:scale |
| `5f2e723` | `docs` | nana-response 计划和审计报告 |

### 未混入本轮的文件

以下文件属于其他任务，未纳入本轮提交：
- `doc/plan/mobile-automation-test-plan.md`（modified）
- `playwright.config.ts`（modified）
- `doc/plan/stage3-ai-integration-plan.md`（untracked）
- `e2e/ci/`（untracked）
- `tests/`（untracked）

## 偏离记录

无偏离。按计划和审计修订版执行，无额外改动。
