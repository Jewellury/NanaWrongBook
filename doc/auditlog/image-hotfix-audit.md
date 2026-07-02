# 题图加载 hotfix（问题 1，3 改动）· 审计报告

> 关联根因: doc/auditlog/stage2.5-followup-rootcause-2026-07-02.md §问题1
> 执行日志: doc/executionlog/capture-map-v1-stage2.5-log.md（hotfix 段，行 100–195）
> 审计日期: 2026-07-02
> 审计 commit: `2c317d1`（代码）+ `1d256f1`（日志回填 hash）
> 范围: 仅问题 1（题图加载慢）的最小修复，不涉问题 2（地图手机可读性）

---

## 审计结论（大白话）

**总体判定：✅ 通过**

这轮 hotfix 干净利落，3 个改动都打在根因上，没扩大范围。核心 bug（小图绕过压缩直入库）已修死，新拍的题图会被压到 ~200–400KB；同一道题关掉再点不再重拉 ~1MB；加载时有 200px 骨架不再像卡死。改动文件只 4 个（1 上游文件已标注 + 2 新测试 + 1 nana 组件），列表 API 纪律没破，schema 没动。11 文件 105 测试全过，build 通过。

**唯一需要用户知道的限制**：库里已有的 4 张 ~1.2MB 老图不会被自动压缩（执行日志已写明）。首次打开老题仍偏慢，骨架+缓存缓解体感；要彻底压老图需另写迁移脚本（本轮不做）。

可以推 CI、可以部署。

---

## 检查清单（reviewer 指定的 6 项 + 横切）

### Check 1 — 新图是否所有路径都走压缩 ✅

- `src/lib/image-utils.ts:92-95`：`processImageFile` 已删掉 `if (fileSizeMB > threshold)` 分支，**无 "skip if small" 残留**。diff 确认（`git diff ddee4c0..1d256f1 -- src/lib/image-utils.ts`）。
- 参数正确：`compressImage(file, 1 /*maxSizeMB*/, 1280 /*maxWidth*/, 0.7 /*quality*/)`，与 reviewer 规格（maxWidth=1280, quality=0.7）一致。
- 全仓 grep `processImageFile|compressImage`：**3 个调用方**——`app/page.tsx`、`app/notebooks/[id]/add/page.tsx`、`components/nana/capture/question-image-capture.tsx`，均只 `await processImageFile(file)` 取 base64。nana 侧唯一写入点是 `question-image-capture.tsx:47`，走的就是 `processImageFile`。无第二条 FileReader 直通路径。

### Check 2 — 列表 API 是否仍不返回完整 base64 ✅

- `git diff ddee4c0..1d256f1 -- src/app/api/nana/cases/route.ts` = **空**（未改动）。
- `src/app/api/nana/cases/route.ts:52-56`：GET 仍 `select: { id, createdAt, artifacts: { select: { type: true } } }`，**不 select content**。`hasImage` 由 type 集合推断（行 60–61），列表体积纪律不变。

### Check 3 — caseDetailCache 是否不会串用户、不会显示旧 case ✅

**实现**（`recent-cases-list.tsx:44-55`）：模块级 `Map<string, CaseResponse>`，按 caseId 键，命中直返，未命中 `getCase` 后写入。

- **跨用户风险（理论→实际）**：缓存是模块级，同页面会话内驻留。但实际无法串用户，原因有三：
  1. `getCase` API 有 G1 归属校验（`cases/[id]/route.ts:30-33` `findFirst({where:{id, studentId}})`）——只有 case 的主人才能 fetch 成功，缓存里只会装"当前登录用户自己的 case"。
  2. caseId 全局唯一（uuid/cuid）。用户 B 不可能拥有与用户 A 相同 id 的 case。
  3. `RecentCasesList` 的 case 列表来自 `listMyCases`（GET `/api/nana/cases`，按 `studentId` 过滤），用户 B 的列表里不会出现 A 的 caseId，所以 B 根本不会触发 `loadCaseDetail(A 的 id)`。
  - 结论：v1 安全。
- **陈旧风险**：全仓 grep `app.patch|router.patch|app.put|router.put` → **无 PATCH/PUT 端点**。`cases/[id]/route.ts` 只有 GET，case 创建后不可变。缓存无过期也安全。
- **未来风险（须登记）**：Stage 3 若加入 transcript 更新 / 题图替换等可变操作，**必须**给 `caseDetailCache` 加失效（更新后 `caseDetailCache.delete(id)` 或版本号）。当前代码注释（行 42–43）已写明"本轮 case 创建后不可变"，执行日志也提到。建议在 Stage 3 计划里显式列为前置任务。

### Check 4 — 加载骨架是否覆盖慢网场景 ✅

**渲染逻辑**（`recent-cases-list.tsx:295-312`）：
- `imageState === null`（加载中）→ **200px 高** `animate-pulse` 占位盒 + 居中 `ImageIcon`（size-8）+ "题图加载中…" 文字。骨架即主视觉。✅
- 面板打开（`useEffect` 跑 `setImageState(null)` 行 220）→ 骨架**立即**可见（getCase 未 resolve 前）。✅
- 成功（`{content}`）→ 显示 `<img max-h-[200px]>`，骨架消失。✅
- `'none'`（无题图）→ 图区不渲染（条件 `!== 'none'`），不算错误。✅
- `'failed'` → "题图没拉到，标签仍可用"（铁律 6 显式失败，标签独立不拖）。✅
- 缓存命中：`caseDetailCache.get(caseId)` 同步命中 → `applyCase` → `setImageState({content})`。技术上骨架会闪一帧（effect 在首渲后跑），但同步命中使下一次 paint 即出图，**肉眼不可感**（~16ms）。满足 reviewer "instant image" 期望（实务上）。

### Check 5 — image-utils.ts 上游文件修改标注 ✅

- `git log -1 --format=%B 2c317d1`：commit message 第 6 行明确含 **`⚠️上游文件修改: src/lib/image-utils.ts (签名不变，仅小文件也压缩)`**。✅
- 执行日志「上游文件修改」表（行 152–155）：同样标注 `⚠️上游文件修改`，说明"签名/返回类型不变，仅行为变化，compressImage 函数体未动"。✅
- 符合 AGENTS.md §目录原则。

### Check 6 — 旧图不迁移的限制是否写入执行日志 ✅

执行日志行 170–173 专设一节 **「⚠️ 旧图不会被自动压缩（重要限制）」**，明确：
- 只对新拍题图生效；
- 生产库 4 张 ~1.2MB 老图保持原样；
- 缓存对老图首次仍拉 1.2MB（骨架+缓存仅缓解体感）；
- 迁移脚本本轮不做，已登记后续优化。

`image-utils.ts:87` 注释也同步写了"只影响新拍的题图"。

---

### 横切检查

- **铁律 3（不改上游表结构）** ✅：`prisma/schema.prisma` 未改；只动了 1 个上游工具文件（已标注）+ nana 自有文件。
- **铁律 4（密钥不入 git）** ✅：改动文件 grep `API_KEY|SECRET|PASSWORD|TOKEN` 无命中（其它命中均为**未改动**的既有文件如 `config.ts`/`auth.ts`）。`.env` 未 staged。
- **范围最小** ✅：`git diff --name-only` 共 6 项（2 doc + 2 test + recent-cases-list.tsx + image-utils.ts）。未触 map API、未触 case 创建/列表端点、未触 schema。
- **措辞合规（OPS §4）** ✅：改动文件中"诊断/薄弱/得分/掌握/失败"全部命中均在**代码注释**（行 15、137、209、294，内部技术说明）或既有 Error 内部消息（image-utils.ts 行 67/71 的 Error 被 question-image-capture.tsx:51 catch 后替换为"图片没读取成功"）。用户可见文案仅"题图加载中…"，无禁用词。
- **测试** ✅：
  - `npm.cmd run build` → ✓ Compiled successfully in 25.1s。
  - `DATABASE_URL=file:./data/test/test.db npx vitest run src/__tests__/unit/nana src/__tests__/integration/nana` → **11 文件 105 测试全通过**（基线 9 文件 101 + 新增 2 文件 4 测试，零回归）。
  - 测试断言有效性：`image-utils.test.ts` mock `canvas.toDataURL` 返回固定串，断言 100KB/500KB 小文件 `result === COMPRESSED_OUTPUT` 且 `toDataURL` 被调用 → 证明走压缩路径非直通；`case-detail-cache.test.ts` mock `fetch`，断言同 caseId 第二次 `fetch` 调用 1 次、不同 id 各 1 次 → 证明缓存契约。**断言对**。
- **测试库安全** ✅：本地跑 test.db（`./data/test/test.db`），`./data/dev.db` mtime 仍为 6月29 09:50（基线一致，未被触碰）。
- **Agent 同步一致性** ✅：`node scripts/check-agent-sync.js` → OK 3/3 agents in sync。
- **偏离复核（hotfix 段 4 条）**：逐条复核均属微调，不影响验收标准（详见下表）。

| # | 偏离 | 复核结论 |
|---|------|----------|
| 1 | Change 2 抽成模块级 `loadCaseDetail` + `__clearCaseDetailCacheForTests` | ✅ 微调。项目未装 @testing-library/react，抽函数是测试落地手段；语义与"CaseTagPanel 内联缓存"等价 |
| 2 | 命名 `caseDetailCache`（计划未指定名） | ✅ 微调（纯命名） |
| 3 | image-utils 测试未 mock FileReader（jsdom 原生支持） | ✅ 微调。仍是行为级断言（小文件走压缩路径），不降约束 |
| 4 | 临时 launcher 脚本，测完删除 | ✅ 微调（临时工具，未入库；`git diff` 不含该文件） |

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P2 | 缓存命中时骨架理论上闪一帧（~16ms，肉眼不可感） | recent-cases-list.tsx:244-247 | 可选优化：在 `CaseTagPanel` 初始 state 用 lazy initializer 读缓存（`useState(() => peekCachedImage(caseId))`），消除那一帧。非阻塞。 |
| P2 | 缓存无失效机制，依赖"case 不可变"前提 | recent-cases-list.tsx:44 | Stage 3 加 transcript/题图可变端点时，**必须**在该端点成功后 `caseDetailCache.delete(id)`。建议在 Stage 3 plan 里列为前置检查项。当前不可变，v1 安全。 |

无 P0 / P1。

---

## 用户验证指南（部署到生产后）

1. **新拍题更小更快**：手机拍一道新题提交 → 进数据库看 `SELECT length(content) FROM Artifact WHERE type='question_image' ORDER BY createdAt DESC LIMIT 1;`，应 **~200–400KB**（不再 ~1.2MB）。重新打开该题，题图加载应明显快于旧题。
2. **重开同一题瞬时**：知识地图 → 点一道题展开 → 关掉 → 再点同一道 → 题图**几乎瞬时**出现（命中缓存，无网络请求；可在浏览器 Network 面板确认第二次无 `/api/nana/cases/[id]` 请求）。
3. **骨架可见**：首次点开一道**老题**（库里 4 张 ~1.2MB 之一）→ 应立即看到 **200px 高的灰色脉冲骨架 + 相机图标 + "题图加载中…"**，而非空白；数秒后出图。
4. **失败态**（可选）：断网后点题 → 显示"题图没拉到，标签仍可用"，标签区仍可独立操作。
5. **老题首次仍慢**：4 张老图首次打开仍需数秒（骨架缓解体感），这是已知限制，非回归。
