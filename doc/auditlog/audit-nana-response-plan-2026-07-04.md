# Nana 页面响应优化计划 · 审计报告

> 关联计划: doc/plan/nana-response-plan.md
> 执行日志: 无（本轮为计划审计，尚未执行）
> 审计日期: 2026-07-04

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

计划方向正确、边界清晰、风险分级合理，4 个文件路径全部核实存在且描述与实际代码一致。但有 2 个 P1 问题需要在执行前修订：

1. **Task 1 的 unmount 保护方案太模糊**——只说"用 cancelledRef 或 abortedRef"，没写清楚在 `await getUserMedia` 之后要检查什么、怎么拦。这是整个计划唯一的中风险点，不能含糊。
2. **Task 2 没覆盖 60s 自动停止与用户手点之间的竞态**——光 disable 按钮拦不住 timer 里的 `recorder.stop()`。

修掉这 2 个 P1 后可以交 execute-agent 执行。

## 检查清单

### 计划一致性
- [x] 计划描述的当前代码行为与实际源码一致（4 个文件逐行核实）
- [x] 文件变更清单中 4 个文件路径全部存在且正确
- [x] 任务分解覆盖了概述中列出的 4 项改动
- [x] "不做"边界清晰，与 `login-link-and-feel-round2` 无重叠

### 代码质量（计划层面）
- [x] 风险分级合理（Task 1 中风险，Task 2-4 低风险）
- [x] 实施顺序合理（先中风险状态机，后低风险 CSS）
- [ ] **Task 1.5 unmount 保护方案不够具体**（P1，详见问题清单）
- [ ] **Task 2 未覆盖 60s timer 与用户点击的竞态**（P1，详见问题清单）

### 安全性（计划层面）
- [x] 无密钥相关改动
- [x] 无数据库结构改动
- [x] 无上游文件修改（4 个文件均在 `src/components/nana/` 和 `src/app/nana/` 下，属于本项目新增代码）

### 上游兼容性
- [x] 本轮不涉及上游文件，无需标注 ⚠️上游文件修改
- [x] 不修改上游已有数据库表结构

### 计划规范完整性
- [x] 有大白话概述
- [x] 有任务分解
- [x] 有文件变更清单
- [x] 有验收标准
- [x] 有风险与注意事项
- [x] 有实施顺序
- [x] 有 Git 收口（commit 拆分）
- [ ] **关联规格模糊**："源自 Nana 用户体验需求"未指向具体文档（P3）
- [ ] **未引用 TECH_PLAN_v2 / OPS_handbook**（P3）

### Agent 同步一致性
- [x] `node scripts/check-agent-sync.js` 通过（exit 0，3/3 agents in sync）

### 测试
- [ ] **未提出单元测试方案**（P2）——Task 1 新增 `requesting` 状态，建议至少补一个"权限拒绝后恢复 idle"的测试

## 问题清单

| 严重度 | 问题 | 所在位置 | 建议修复方式 |
|--------|------|----------|-------------|
| P1 | Task 1.5 unmount 保护方案太模糊。计划写"使用 cancelledRef 或现有 abortedRef 模式"，但没说具体在哪个位置检查。实际代码中 `abortedRef` 只在 `recorder.onstop` 里检查（第 173 行），`await getUserMedia` 之后没有检查——如果 requesting 态下 unmount，`abortedRef.current = true` 会被设置，但 getUserMedia promise 仍会 resolve，代码会继续创建 MediaRecorder 并调 `setStateAndNotify("recording")`，在已卸载组件上写状态。 | plan Task 1.5 / `voice-recorder.tsx` 第 149-155 行 | 计划应明确写出：在 `await getUserMedia` 之后、创建 recorder 之前，加 `if (abortedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }`。不需要新建 ref，复用现有 `abortedRef` 即可。 |
| P1 | Task 2 只说 disable 按钮，没覆盖 60s 自动停止 timer 与用户点击的竞态。当 60s timer 触发 `recorder.stop()`（第 208 行）时，如果用户几乎同时点击"我听完了"，`handleFinishRecording`（第 213 行）也会调 `recorder.stop()`。两次 `stop()` 之间 `recorder.state` 可能尚未变成 `"inactive"`，第二次 `stop()` 可能抛 `InvalidStateError`。 | plan Task 2 / `voice-recorder.tsx` 第 206-222 行 | 计划应补充：在 `handleFinishRecording` 开头加 ref 门禁（如 `isStoppingRef`），调 `recorder.stop()` 后立即设 true，防止重复调用。或改为在 `recording` 态 render 中用 state flag 拦截。 |
| P2 | Task 1 未说明 `onRecordingStateChange` 在 `requesting` 态的行为。当前 `setStateAndNotify` 通知父组件 `next === "recording"`，`requesting` 态会传 `false`。这可能正确（父组件不需要知道 requesting），但应显式写明。 | plan Task 1.2 | 在 Task 1.2 中补一句："requesting 态不触发 `onRecordingStateChange(true)`，父组件仅在 recording 态才禁用 tab 切换。" |
| P2 | Task 3 未区分两个入口按钮。知识地图页面有两个"最近拍过"入口：浮层入口按钮（第 299-307 行）和空状态按钮（第 212-219 行）。计划只提到浮层按钮的 pressed 态。另外 URL 参数 `?openCases=1` 也会自动打开抽屉（第 103-109 行），此时不应触发 pressed 态。 | plan Task 3 / `page.tsx` 第 212-219、299-307 行 | 计划应写明：`floatingBtnPressed` 仅绑定浮层入口按钮（第 299 行），空状态按钮和 URL 参数自动打开不设 pressed 态。 |
| P2 | 未提出测试方案。Task 1 新增 `requesting` 状态是状态机改动，验收标准第 2、3 条（权限拒绝恢复、离页不回写）适合写单元测试。 | plan 全局 | 建议在 Task 1 后补一个 Task 1.6：为 `requesting` 态的权限拒绝恢复和 unmount 保护写单元测试（可 mock `navigator.mediaDevices.getUserMedia`）。 |
| P3 | 关联规格写"源自 Nana 用户体验需求"，未指向具体文档。 | plan 第 3 行 | 改为指向 `doc/plan/mobile-smoothness-round2-2026-07-03.md` 或 `doc/active_spec.md`。 |
| P3 | 未引用 TECH_PLAN_v2 / OPS_handbook。 | plan 全局 | 在风险与注意事项中补一句："本计划符合 TECH_PLAN_v2 P3（采集壳）和 OPS_handbook 措辞合规要求。" |

## 计划描述 vs 实际代码核实记录

| 计划描述 | 实际代码 | 一致？ |
|----------|----------|:------:|
| `RecorderState` 是三态 `idle / recording / completed` | 第 37 行：`type RecorderState = "idle" \| "recording" \| "completed"` | ✅ |
| `handleStartRecording` 无 `if (state !== "idle") return` 门禁 | 第 132 行：无此门禁 | ✅ |
| 请求期间用户可再次点击 | idle 态 render（第 225-268 行）按钮始终可点，无 disabled | ✅ |
| 权限拒绝后 `catch` 中 `setPermissionMsg` 并 return | 第 151-155 行：catch 中 setPermissionMsg + return | ✅ |
| 现有 `abortedRef` + `setStateAndNotify` | 第 86 行 `abortedRef`、第 96 行 `setStateAndNotify` | ✅ |
| "我听完了"按钮无 disabled | 第 315-333 行：无 disabled 属性 | ✅ |
| 60s 自动停止调 `recorder.stop()` | 第 206-209 行：`autoStopTimerRef` 中调 `r.stop()` | ✅ |
| `handleFinishRecording` 检查 `recorder.state !== "inactive"` | 第 215 行 | ✅ |
| 知识地图浮层入口按钮（"最近拍过"） | 第 299-307 行 | ✅ |
| `setDrawerOpen(true/false)` 控制抽屉 | 第 66 行 state、第 301 行 open、第 329 行 close | ✅ |
| `knowledge-map-list-view.tsx` 节点按钮无 `active:scale` | 第 160-213 行：className 无 `active:scale` | ✅ |
| `recent-cases-list.tsx` 关闭按钮无 `active:scale` | 第 122-129 行：className 无 `active:scale` | ✅ |
| `recent-cases-list.tsx` 案例卡片按钮无 `active:scale` | 第 230-255 行：className 无 `active:scale` | ✅ |
| `recent-cases-list.tsx` "挂上"按钮有 `disabled:opacity-50` 无 `active:scale` | 第 441-449 行 | ✅ |

## 建议的修订后执行顺序

1. **先修 P1**：在计划中补充 Task 1.5 和 Task 2 的具体实现方案
2. **可选修 P2**：补充 `onRecordingStateChange` 说明、Task 3 按钮区分、测试方案
3. **修订后交 execute-agent 执行**

## 用户验证指南

（本轮为计划审计，无代码变更。计划修订后由 execute-agent 执行时再产出验证指南。）

---

## 修订记录

### 2026-07-04 修订（修复审计 P1/P2/P3）

| 问题 | 修复内容 |
|------|----------|
| P1 Task 1.5 unmount 保护 | ✅ 补充具体方案：在 `await getUserMedia` 之后加 `abortedRef.current` 检查，释放 stream 并 return |
| P1 Task 2 竞态 | ✅ 补充 `isStopping` state + `isStoppingRef` ref 双重门禁方案，覆盖用户点击和 60s timer 两条路径 |
| P2 onRecordingStateChange 说明 | ✅ Task 1.2 补充说明：requesting 态不触发 `onRecordingStateChange(true)` |
| P2 Task 3 按钮区分 | ✅ Task 3.2 写明仅浮层入口按钮设 pressed，排除空状态按钮和 URL 参数自动打开 |
| P2 测试方案 | ✅ 新增 Task 1.6：3 个单元测试（权限拒绝恢复、unmount 保护、重复点击防护） |
| P3 关联规格 | ✅ 指向 `mobile-smoothness-round2-2026-07-03.md` |
| P3 合规依据 | ✅ 补充 TECH_PLAN_v2 P3 和 OPS_handbook 引用 |

验收标准同步追加第 9、10 项（竞态和 unmount 验收），构建验收补测试通过项，Git 收口 commit 1 补测试说明。
