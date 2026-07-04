# Nana 页面响应优化 · 开发计划

> 关联规格: [doc/plan/mobile-smoothness-round2-2026-07-03.md](mobile-smoothness-round2-2026-07-03.md)
> 计划日期: 2026-07-04
> 预计影响: `src/components/nana/` 中的 4 个文件
> 合规依据: TECH_PLAN_v2 P3（采集壳）、OPS_handbook 措辞合规要求

## 1. 大白话概述

**要做什么：** 让手机用户在 Nana 里点按钮时，立刻看到"点了"的反馈——按钮变灰、转圈或文案变化。数据可以慢慢加载，但不能让用户觉得"我是不是没点上？"

**本计划只做 Nana 内部交互反馈**（不涉及登录、首页等已有其他计划覆盖的部分）。

### 具体 4 项改动

1. **"说说看"按钮** — 权限请求中 disabled + "请求权限中…"，防重复点击 getUserMedia
2. **"我听完了"按钮** — 点击后 disabled + "正在收…"，防重复 stop
3. **"最近拍过"按钮** — 按下立即 pressed 态
4. **节点/关闭/挂上按钮** — 加 active:scale 触摸反馈

### 不做

- 不碰 login、translations（另有 login-link-and-feel-round2 覆盖）
- 不碰首页首屏加载（同上）
- 不做 route loading.tsx（本轮只做局部按钮反馈）
- Web Worker 压图、PWA、base64→COS、架构重构、bundle 拆包

## 2. 任务分解

### Task 1: VoiceRecorder — "说说看"按钮增加 requesting 态（中风险）

当前"说说看"按钮：
- 有点击后调 `getUserMedia` 异步请求麦克风权限
- 请求期间用户可再次点击，导致重复发起权限请求
- 无中间状态文案

**改动：**

- [ ] 1.1 类型 `RecorderState` 从三态改为四态：
  ```typescript
  // 旧:
  type RecorderState = "idle" | "recording" | "completed";
  // 新:
  type RecorderState = "idle" | "requesting" | "recording" | "completed";
  ```

- [ ] 1.2 `handleStartRecording` 开头增加门禁：
  ```typescript
  if (state !== "idle") return;
  setStateAndNotify("requesting");
  ```
  注意：`setStateAndNotify("requesting")` 不会触发 `onRecordingStateChange(true)`，因为 `requesting !== "recording"`。父组件仅在 `recording` 态才禁用 tab 切换/换图/保存，`requesting` 态不需要。

- [ ] 1.3 "说说看"按钮 disabled 逻辑改为 `state !== "idle"`，文案为 `state === "requesting" ? "请求权限中…" : "说说看"`
- [ ] 1.4 权限拒绝/错误后，catch 中切回 `idle`，按钮恢复可点
- [ ] 1.5 unmount 保护——复用现有 `abortedRef`，在 `await getUserMedia` 之后插入检查：
  ```typescript
  // 现有代码（第 150 行附近）：
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // ===== 新增：await 之后检查 abort =====
  if (abortedRef.current) {
    // unmount/换图/离页发生在 getUserMedia 等待期间
    // 立即释放已拿到的 stream，不创建 recorder，不 setState
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  // ===== 新增结束 =====

  // 现有代码继续：创建 recorder...
  ```
  **原理**：现有 useEffect cleanup（第 120-129 行）在 unmount 时已设 `abortedRef.current = true` 并停 recorder。但 `requesting` 态下 recorder 尚未创建，cleanup 只设了 flag。没有这个检查的话，getUserMedia resolve 后代码会继续创建 recorder 并调 `setStateAndNotify("recording")`，在已卸载组件上写状态。
  **不需要新建 ref**——`abortedRef` 已在 cleanup 中被设为 true，这里只需要在 await 后读一次即可。

### Task 2: VoiceRecorder — "我听完了"点击后 disabled（低风险）

- [ ] 2.1 新增 `isStopping` state（非 ref），防止用户点击与 60s timer 竞态导致 `recorder.stop()` 被调两次：
  ```typescript
  const [isStopping, setIsStopping] = useState(false);

  const handleFinishRecording = useCallback(() => {
    // 门禁：已在停止流程中则跳过（60s timer 或用户先点了一方）
    if (isStopping) return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setIsStopping(true); // 锁定 + 触发重渲染（按钮文案变“正在收…”）
      recorder.stop();
    } else {
      setStateAndNotify("completed");
    }
  }, [isStopping, setStateAndNotify]);
  ```
  **原理**：60s 自动停止（第 206-209 行）调 `recorder.stop()`，用户几乎同时点"我听完了"也会调 `stop()`。两次 `stop()` 之间 `recorder.state` 可能尚未变成 `"inactive"`，第二次会抛 `InvalidStateError`。`isStopping` 确保只有第一个触发者调 `stop()`。
  **用 state 而非 ref**：按钮文案需要从"我听完了"变成"正在收…"，依赖重渲染。state 天然触发重渲染，ref 不行。
  **重置时机**：`isStopping` 不需要在 onstop 中重置——一旦 `stop()` 被调用，状态会从 `recording` 变为 `completed`，组件不再渲染"我听完了"按钮。下次录音（idle → recording）时 state 自然是 false。
  **注意**：60s timer 中的 `recorder.stop()` 也需要加 `isStopping` 门禁，否则 timer 先触发时用户再点仍可能竞态。修改第 206-209 行：
  ```typescript
  autoStopTimerRef.current = setTimeout(() => {
    if (isStopping) return; // 用户已手动停止
    const r = mediaRecorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }, MAX_RECORDING_SEC * 1000);
  ```
  注意 setTimeout 闭包捕获的是 `isStopping` 的旧值，需用 ref 辅助或把 `isStopping` 加入 useCallback 依赖。**推荐方案**：用 `isStoppingRef` 做门禁判断（不触发渲染），同时用 `isStopping` state 做文案切换（触发渲染）。两者同步设置。

- [ ] 2.2 "我听完了"按钮 disabled 逻辑改为 `isStopping`，文案变为"正在收…"：
  ```typescript
  // recording 态 render 中：
  <button
    disabled={isStopping}
    onClick={handleFinishRecording}
    className="... active:scale-95"
  >
    {isStopping ? "正在收…" : "我听完了"}
  </button>
  ```

### Task 3: 知识地图 — "最近拍过"按钮 pressed 态（低风险）

- [ ] 3.1 新增 `floatingBtnPressed` 状态
- [ ] 3.2 **仅浮层入口按钮**（第 299-307 行）点击时同步 `setFloatingBtnPressed(true)`
  - 空状态按钮（第 212-219 行）不设 pressed 态（它点击后进入完全不同的视图，pressed 无意义）
  - URL 参数 `?openCases=1` 自动打开抽屉（第 103-109 行）不设 pressed 态（非用户手势触发）
- [ ] 3.3 浮层关闭回调（`setDrawerOpen(false)`）中同步 `setFloatingBtnPressed(false)`
- [ ] 3.4 pressed 态样式：`scale-95 opacity-80`

### Task 4: 知识地图节点/浮层按钮 — active:scale（低风险）

- [ ] 4.1 `knowledge-map-list-view.tsx` 节点按钮加 `active:scale-[0.98]`
- [ ] 4.2 `recent-cases-list.tsx` 关闭按钮加 `active:scale-90`
- [ ] 4.3 `recent-cases-list.tsx` 案例卡片按钮加 `active:scale-[0.98]`
- [ ] 4.4 `recent-cases-list.tsx` "挂上"按钮加 `active:scale-95`（不改已有 busy/disabled 业务逻辑）

### Task 1.6: 单元测试（与 Task 1 同提交）

- [ ] 为 `requesting` 态补单元测试（mock `navigator.mediaDevices.getUserMedia`）：
  - 权限拒绝后恢复 idle：mock getUserMedia reject → 断言 state 回到 `"idle"`
  - unmount 保护：render → 触发 handleStartRecording → 在 requesting 态 unmount → mock getUserMedia resolve → 断言未调用 `setStateAndNotify("recording")`
  - 重复点击防护：requesting 态下再调 handleStartRecording → 断言 getUserMedia 只被调一次

### Task 5: 测量验收（5 分钟）

- [ ] 5.1 手机 375px 视口或真机验证
- [ ] 5.2 点击到视觉反馈 < 100ms
- [ ] 5.3 每个异步操作有明确的状态指示
- [ ] 5.4 `npm run build` 通过

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/nana/capture/voice-recorder.tsx` | 修改 | 三态→四态，"说说看" requesting 态，"我听完了" disabled 文案 |
| `src/app/nana/knowledge-map/page.tsx` | 修改 | "最近拍过"按钮 pressed 态 |
| `src/components/nana/knowledge-map/knowledge-map-list-view.tsx` | 修改 | 节点按钮加 `active:scale-[0.98]` |
| `src/components/nana/knowledge-map/recent-cases-list.tsx` | 修改 | 关闭/案例/"挂上"按钮加 active scale |

## 4. 验收标准

| # | 验收项 | 操作步骤 | 预期结果 |
|---|--------|----------|----------|
| 1 | "说说看"请求中不可重复点 | 点"说说看"，在权限弹窗出现前快速再点一次 | 第二次点击无效，按钮 disabled + "请求权限中…" |
| 2 | "说说看"权限拒绝后恢复 | 拒绝麦克风权限 | 按钮切回"说说看"，可再次点击 |
| 3 | "说说看"离页不回写状态 | requesting 状态下切换 tab 或离页 | 无 getUserMedia 回调执行 |
| 4 | "我听完了"点击后反馈 | 录音中点"我听完了" | 按钮立即 disabled + "正在收…" |
| 5 | "最近拍过"按下反馈 | 点浮层入口按钮 | 按钮立即 scale 缩小 |
| 6 | 节点按钮触摸反馈 | 点地图列表中的知识点 | 按钮有缩放动效 |
| 7 | 浮层关闭按钮反馈 | 点浮层 X 关闭 | 关闭按钮有缩放动效 |
| 8 | "挂上"按钮反馈 | 选知识点点"挂上" | 按钮 busy 逻辑不变，额外有 active:scale |
| 9 | "我听完了"与 60s 自动停止竞态 | 录音中等到 60s 自动停止，同时在最后 1 秒点"我听完了" | `recorder.stop()` 只被调一次，无 `InvalidStateError` |
| 10 | "说说看"unmount 后不创建 recorder | requesting 态下切换 tab/换图 | getUserMedia resolve 后不创建 recorder、不 setState |

### 构建验收
- [ ] `npm.cmd run build` 通过，无错误
- [ ] Task 1.6 单元测试通过

### Git 收口
- commit 1: `fix(capture): 录音按钮请求态和停止态反馈`（voice-recorder.tsx + 测试）
- commit 2: `fix(map): 地图浮层和节点按钮触摸反馈`（km-page, list-view, recent-cases）

## 5. 风险与注意事项

### 中风险：VoiceRecorder 状态机改动
- `requesting` 是新增状态，unmount 保护必须到位（Task 1.5 已给出具体方案）
- 当前 useEffect cleanup 已有 `abortedRef.current = true` + 停止 recorder，需确保覆盖 requesting 态
- 权限拒绝后必须切回 idle，不能卡死在 requesting
- Task 2 的 `isStopping`/`isStoppingRef` 防竞态必须与 Task 1 同提交

### 低风险：其余改动
- Task 3/4 均为纯 CSS（active:scale）或简单 state，不涉及业务逻辑变更
- Task 3 的 `floatingBtnPressed` 仅绑定浮层入口按钮，不影响空状态按钮和 URL 参数自动打开

## 6. 实施顺序

```
Round 1（Task 1+2）: VoiceRecorder 状态机 → 中风险，优先
Round 2（Task 3+4）: 知识地图按钮反馈 → 低风险
Round 3（Task 5）: 测量验收 → 收尾
```
