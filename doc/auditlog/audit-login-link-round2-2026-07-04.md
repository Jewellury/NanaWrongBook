# 审计报告：登录链路专项 + 低风险体感修复

> 审计日期：2026-07-04
> 审计范围：dev 分支 3 个 commit（e62f5a1, 22b1235, fcc9e4e）
> 审计依据：用户评审反馈 5 项重点

---

## 审计结论：✅ 通过（含 1 项需处理）

| # | 审计项 | 结论 | 说明 |
|:---:|------|:---:|------|
| 1 | login/page.tsx 上游修改最小性 | ✅ 通过 | 改动集中在 handleSubmit + 按钮 text，未触碰结构 |
| 2 | useRef 锁失败后释放 | ✅ 通过 | error + catch 两条失败路径都释放，成功路径不释放（正确） |
| 3 | performance.now 日志仅开发环境 | ✅ 通过 | 3 处 console.log 全部包裹 `NODE_ENV === "development"` |
| 4 | /nana mapData===null 不误导 + 三入口可点 | ✅ 通过 | 三入口在 mapData 条件外，始终渲染 |
| 5 | bundle analyzer 配置可复现性 | ⚠️ 需处理 | 与 Turbopack 不兼容，配置无实际效果，建议移除 |

---

## 逐项审计

### 1. login/page.tsx 上游修改最小性 ✅

**diff 统计**：1 file changed, 20 insertions(+), 3 deletions(-)

**改动范围**：
- `import` 行：`useState` → `useState, useRef`（+1 个 import）
- `handleSubmit` 函数内：加 `submitLock` 锁 + 耗时埋点 + `router.push("/nana")`
- 按钮文字：`t.auth?.login?.loggingIn || 'Logging in...'` → `"正在进入…"`

**判定**：改动全部集中在 `handleSubmit` 逻辑和按钮 text，未触碰 JSX 结构、CSS、其他函数。属于最小增量修改。

**commit message**：`fix(login): 登录后直跳 nana 并补即时反馈 ⚠️上游文件修改` — ✅ 包含 `⚠️上游文件修改` 标注。

**小观察**（非阻塞）：按钮文字从 i18n key（`t.auth?.login?.loggingIn`）改为硬编码中文 `"正在进入…"`。项目当前面向中文用户，不影响功能，但丢失了该文案的 i18n 支持。后续如需多语言可恢复。

---

### 2. useRef 锁失败后释放 ✅

逐路径检查 `submitLock.current`：

| 路径 | 锁状态 | 正确? |
|------|:---:|:---:|
| 入口：`submitLock.current` 为 true → `return` | 保持锁定 | ✅ 防双击 |
| `result?.error`（密码错误） | `submitLock.current = false`（第 46 行） | ✅ 释放，允许重试 |
| `catch`（网络异常） | `submitLock.current = false`（第 56 行） | ✅ 释放，允许重试 |
| `finally` | 不触碰锁 | ✅ 正确——finally 只管 `setLoading(false)` |
| 成功路径（跳转 /nana） | 锁保持 true | ✅ 正确——用户即将离开页面，无需释放 |

**判定**：所有失败路径都正确释放锁，用户可以重试。成功路径不释放是正确行为（防止跳转动画期间触发二次提交）。

---

### 3. performance.now 日志仅开发环境 ✅

3 处 `console.log` 检查：

| 行号 | 内容 | 包裹条件 |
|:---:|------|------|
| 29-31 | `[login-timing] signIn start` | `process.env.NODE_ENV === "development"` ✅ |
| 40-42 | `[login-timing] signIn took XXXms` | `process.env.NODE_ENV === "development"` ✅ |
| 48-50 | `[login-timing] router.push("/nana") called` | `process.env.NODE_ENV === "development"` ✅ |

`const t0 = performance.now()`（第 28 行）在生产环境也执行，但这只是一个变量赋值（取时间戳），无副作用，无 I/O，可忽略。

**判定**：所有日志输出严格限制在开发环境。

---

### 4. /nana mapData===null 留白不误导 + 三入口可点 ✅

**三入口可点性**：
- 三个 `ActionCard`（第 95-120 行）在 `mapData` 条件块**之外**，无条件渲染
- `mapData === null` 时底部渲染 `null`（空白），不影响上方三入口的可见性和可点击性

**不误导检查**：

| 状态 | 底部显示 | 误导? |
|------|------|:---:|
| mapData === null（数据未知/加载中/API失败） | 留白（null） | ✅ 不误导——不显示任何提示 |
| mapData !== null && hasRecords | recap 提示 | ✅ 正确 |
| mapData !== null && !hasRecords | EmptyHint | ✅ 正确——确认无记录才显示 |

**loading 状态**：初始值改为 `false`，useEffect 中 `setLoading(true)` 仍保留但不再控制渲染（渲染由 `mapData === null` 驱动）。`loading` 变量在 render 中已不被读取，属于死代码，但无害，不影响功能。

**判定**：mapData===null 时不显示 EmptyHint 也不显示骨架，避免"先告诉你没记录、然后又说有"的误导。三入口始终可点。

---

### 5. Bundle analyzer 配置可复现性 ⚠️ 需处理

**当前状态**：
- `next.config.ts` 加了 `withBundleAnalyzer` wrapper，仅在 `ANALYZE=1` 启用
- `package.json` 加了 `@next/bundle-analyzer` devDependency
- 实际运行 `ANALYZE=1 npm run build` 时，构建输出明确提示：**"The Next Bundle Analyzer is not compatible with Turbopack builds, no report will be generated"**
- 不会生成 HTML 可视化报告，不影响正常构建

**问题**：
1. 配置存在但**无实际效果**——Turbopack 是 Next.js 16 默认构建器，analyzer 无法工作
2. 保留它会误导后续开发者以为 `ANALYZE=1` 能产出报告
3. 额外增加 1 个 devDependency + next.config.ts 的复杂度

**审计建议**：移除 analyzer 配置和依赖，保留手动分析报告（`doc/research/bundle-analysis-2026-07-04.md`）。报告已包含完整数据和分析结论，工具本身不可用不应长期保留。

**处理方式**：新增 1 个 commit 移除 analyzer，不混入已有 3 个 commit。

---

## 附：本轮不做项确认

- ❌ PWA / Service Worker — 未触碰
- ❌ COS 对象存储 — 未触碰
- ❌ Web Worker 压图 — 未触碰
- ❌ 上传进度 — 未触碰
- ❌ 大规模 Server/Client 拆分 — 未触碰
- ✅ `nana-response-plan.md` 未混入本轮 commit（仍为 untracked）
