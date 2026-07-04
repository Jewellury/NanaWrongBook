# 审计报告：Nana 页面响应优化

> 审计对象: commit `56dbab6` `26f5d0a` `5f2e723`（dev 分支）
> 关联计划: [doc/plan/nana-response-plan.md](../plan/nana-response-plan.md)
> 关联执行日志: [doc/executionlog/nana-response-execution-log-2026-07-04.md](../executionlog/nana-response-execution-log-2026-07-04.md)
> 审计日期: 2026-07-04
> 审计者: audit-agent

---

## 审计范围

用户指定 5 项重点：
1. VoiceRecorder 的 requesting / isStopping 状态有没有造成按钮永久 disabled 的路径
2. unmount 保护是否只避免 setState，不吞掉真实错误
3. 地图 active:scale 是否没有造成布局抖动
4. 这轮是否确实没有混入 mobile automation / Stage 3 AI integration 的未完成文件
5. build + 相关 vitest 命令的 DATABASE_URL 设置方式写清楚

---

## 逐项审计

### 重点 1：requesting / isStopping 是否有永久 disabled 路径

**结论：✅ 无永久 disabled 路径**

#### requesting 态

`requesting` 是 `getUserMedia` 等待期间的中间态。出口路径：

| 触发条件 | 出口 | 按钮恢复 |
|----------|------|----------|
| getUserMedia resolve | → `recording` | 进入录音态，不渲染"说说看"按钮 |
| getUserMedia reject | → `idle`（catch 中 `setStateAndNotify("idle")`） | ✅ 恢复可点 |
| 组件 unmount | `abortedRef.current = true`，await 后释放 stream 并 return | 组件已卸载，无需恢复 |

**无卡死路径**：getUserMedia 要么 resolve 要么 reject，浏览器自身有权限弹窗超时机制，不会永远 pending。

#### isStopping 态

`isStopping` 防止用户点击与 60s timer 竞态。关键问题：isStopping 是否会在下一次录音时残留？

**关键发现**：父组件 `capture/page.tsx`（第 82-84 行、第 318-319 行）使用 `key={recorderKey}` 控制 VoiceRecorder 生命周期：
```tsx
// capture/page.tsx 第 82-84 行
const [recorderKey, setRecorderKey] = useState(0);
// 换图/保存成功/重拍时 setRecorderKey(n => n + 1) 强制 remount

// 第 318-319 行
<VoiceRecorder key={recorderKey} ... />
```

- completed 态无"重新录音"按钮，用户无法在同一实例中发起新录音
- 新录音必然通过 `recorderKey + 1` 触发 remount，`isStopping` 初始化回 `false`
- **无残留路径** ✅

**极端边缘情况（P3，不阻塞）**：如果 `recorder.stop()` 同步抛异常（浏览器 bug），`isStopping` 已设为 `true` 但 `onstop` 不会触发，状态卡在 `recording`。但：
- 代码在调 `stop()` 前已检查 `recorder.state !== "inactive"`，单线程 JS 中无竞态窗口
- `isStoppingRef` 门禁防止 double-stop
- `MediaRecorder.stop()` 在 `state !== "inactive"` 时不会抛异常（MDN 规范）
- 实际不可达，仅理论存在

### 重点 2：unmount 保护是否只避免 setState，不吞掉真实错误

**结论：✅ 不吞掉真实错误，有 1 项 P3 建议**

#### 成功路径（getUserMedia resolve + 已 unmount）

```typescript
// voice-recorder.tsx 第 170-175 行
if (abortedRef.current) {
  stream.getTracks().forEach((t) => t.stop());  // 释放 stream，不泄漏
  return;                                        // 不创建 recorder，不 setState
}
```

- **正确释放资源**：stream 已拿到，必须 stop tracks 防泄漏 ✅
- **不 setState**：组件已卸载，setState 无意义 ✅
- **不吞错误**：此路径是成功路径（getUserMedia resolve），无错误可吞 ✅

#### 错误路径（getUserMedia reject + 已 unmount）

```typescript
// voice-recorder.tsx 第 163-168 行
} catch {
  setStateAndNotify("idle");           // ← unmount 后仍调 setState
  setPermissionMsg("没拿到麦克风权限...");
  return;
}
```

**P3 观察**：catch 块未检查 `abortedRef.current`，在组件已卸载时仍调 `setStateAndNotify("idle")`。
- React 18+ 中 setState on unmounted component 是 no-op（仅 dev 警告）
- `onRecordingStateChangeRef.current?.()` 通过 ref 调用，父组件已清理则无副作用
- **不吞错误**：catch 块正确处理了权限拒绝，显示了用户友好消息（只是 unmount 后该消息无处显示）
- **不影响正确性**，仅 dev console 可能有警告

**建议（不阻塞，可后续优化）**：catch 块可加 `if (abortedRef.current) return;` 在 setState 前，与成功路径对称。但当前实现不会造成生产问题。

#### onstop 中的 abort 路径

```typescript
// voice-recorder.tsx 第 192-196 行
recorder.onstop = () => {
  if (abortedRef.current) {
    cleanup();   // 清理 timer/stream
    return;      // 不调 onAudioReady，不 setState
  }
  // ...正常路径：合成 blob → onAudioReady → setStateAndNotify("completed")
};
```

- unmount 后 onstop 触发：清理资源，不回写父组件 ✅
- **不吞错误**：onstop 是正常事件回调，非错误处理路径 ✅

### 重点 3：active:scale 是否造成布局抖动

**结论：✅ 无布局抖动**

所有 scale 改动均使用 CSS `transform: scale()`：

| 文件 | 按钮 | class |
|------|------|-------|
| `knowledge-map-list-view.tsx:163` | 节点按钮 | `active:scale-[0.98]` |
| `recent-cases-list.tsx:125` | 关闭按钮 | `active:scale-90` |
| `recent-cases-list.tsx:239` | 案例卡片 | `active:scale-[0.98]` |
| `recent-cases-list.tsx:445` | "挂上"按钮 | `active:scale-95` |
| `page.tsx:304` | 浮层入口 | `floatingBtnPressed ? 'scale-95 opacity-80'` |

**原理**：
- `transform: scale()` 是 compositor-only 属性，不触发 layout reflow
- `active:` 伪类仅在按下期间生效，松开即恢复
- `floatingBtnPressed` 是持续态，但同样使用 `transform` + `opacity`，不影响布局

**`floatingBtnPressed` 持续态审查**：
- 点击浮层入口 → `setDrawerOpen(true)` + `setFloatingBtnPressed(true)` → 抽屉打开覆盖按钮
- 关闭抽屉 → `setDrawerOpen(false)` + `setFloatingBtnPressed(false)` → 按钮恢复
- 按钮在 pressed 态时被抽屉遮罩覆盖，用户看不到 pressed 视觉，但按下瞬间有过渡反馈
- `?openCases=1` URL 参数自动打开抽屉时不设 pressed（非用户手势），正确 ✅

### 重点 4：是否混入 mobile automation / Stage 3 文件

**结论：✅ 未混入**

3 个 commit 涉及的文件清单：

| Commit | 文件 |
|--------|------|
| `56dbab6` | `src/components/nana/capture/voice-recorder.tsx` |
| | `src/__tests__/unit/nana/voice-recorder.test.tsx` |
| `26f5d0a` | `src/app/nana/knowledge-map/page.tsx` |
| | `src/components/nana/knowledge-map/knowledge-map-list-view.tsx` |
| | `src/components/nana/knowledge-map/recent-cases-list.tsx` |
| `5f2e723` | `doc/plan/nana-response-plan.md` |
| | `doc/auditlog/audit-nana-response-plan-2026-07-04.md` |

提交后工作区剩余未提交文件（均属其他任务）：
- `doc/plan/mobile-automation-test-plan.md`（modified）— mobile automation 任务
- `playwright.config.ts`（modified）— mobile automation 任务
- `doc/plan/stage3-ai-integration-plan.md`（untracked）— Stage 3 AI 任务
- `e2e/ci/`（untracked）— mobile automation 任务
- `tests/`（untracked）— mobile automation 任务
- `doc/executionlog/nana-response-execution-log-2026-07-04.md`（untracked）— 本轮执行日志，刚创建

**未混入** ✅

### 重点 5：build + vitest 命令的 DATABASE_URL 设置方式

**结论：✅ 已在执行日志中写清**

执行日志 `doc/executionlog/nana-response-execution-log-2026-07-04.md` 记录了完整命令：

```powershell
# 单元测试（必须设置 DATABASE_URL，否则 guard-db.ts 拦截）
cd e:\nana
cmd /c "set DATABASE_URL=file:./data/test/test.db && npx vitest run src/__tests__/unit/nana/voice-recorder.test.tsx"

# Build
cd e:\nana
npm.cmd run build
```

关键说明：
- `guard-db.ts` 白名单：`file:/app/data/test.db`（Docker）、`file:./data/test/test.db`（本地）
- PowerShell 不自动加载 `.env.test`，需手动设置
- 用 `cmd /c "set ... && ..."` 是因为 PowerShell 的 `$env:` 在 CatPaw 终端代理中不稳定
- **不改 vitest.config.ts** — 遵评审指示，不为本地便利改测试基础设施

---

## 偏离记录复核

审计报告 `audit-nana-response-plan-2026-07-04.md` 中的偏离记录：
- 无偏离。执行完全按计划修订版进行。

---

## 总体判定

### ✅ 通过

5 项审计重点全部通过：
1. requesting / isStopping 无永久 disabled 路径 ✅
2. unmount 保护只避免 setState，不吞错误 ✅
3. active:scale 无布局抖动 ✅
4. 未混入其他任务文件 ✅
5. DATABASE_URL 命令已写清 ✅

### P3 建议（不阻塞，可后续优化）

| # | 位置 | 观察 | 建议 |
|---|------|------|------|
| P3-1 | `voice-recorder.tsx:163-168` | getUserMedia reject 的 catch 块未检查 `abortedRef.current`，unmount 后仍调 setState | 可加 `if (abortedRef.current) return;` 在 catch 块开头，与成功路径对称。当前 React 18+ no-op，不影响生产。 |

### 合 main 前置条件确认

- [x] `npm run build` 通过
- [x] 单元测试 4/4 通过
- [x] 未混入其他任务文件
- [x] git 已拆 3 个 commit 并推送到 origin/dev
- [ ] 执行日志已创建（`doc/executionlog/nana-response-execution-log-2026-07-04.md`），需补提交
- [ ] 合 main + CI 绿灯后可部署
