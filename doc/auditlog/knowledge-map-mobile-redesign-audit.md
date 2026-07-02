# 知识地图移动端重设计 · 审计报告

> 关联计划: doc/plan/knowledge-map-mobile-redesign-plan.md
> 执行日志: doc/executionlog/knowledge-map-mobile-redesign-log.md
> 审计日期: 2026-07-02
> 审计提交: 97b0aaf + a71838e

## 审计结论（大白话）

**总体判定：✅ 通过**

这轮实现精准落地了计划的全部任务。图谱现在用 flex-1 独占主屏（375px 下 ~700px），RecentCasesList 改成了底部抽屉浮层，48 个节点有完整手工坐标，gray底图 48 节点名 10px 淡淡可见，绿/蓝/琥珀/灰四色语义完整保留。"可以先看/下一个"动态措辞在 page → canvas → list-view → detail-card → legend 五处都对。

没有 schema/API 改动，所有变更都在 nana 自有文件。措辞合规——用户可见文字零禁用词。build 通过（56 页），12 测试文件 113 测试全过，无回归。Agent 同步一致（3/3）。

唯一的轻微瑕疵：在 375px 最窄设备上，px-4 内边距使 SVG 实际宽度 343px，viewBox 368 → 缩放 0.932 倍，节点名约 9.3px（略低于 9.5px 目标）。390px+ 设备上无此问题。属 P2 轻微偏差，不影响核心体验。

## 检查清单

### Check 1: DP5 Layout — 图谱 flex-1 独占主屏 ✅

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 图谱区域使用 flex-1 | ✅ | `page.tsx:258` — `<div className="relative flex-1">` |
| RecentCasesList 从上方常驻移除 | ✅ | `page.tsx:303-312` — 仅在 `!loading && mapData` 时条件渲染，在 flex-1 容器之外 |
| 浮动入口按钮 | ✅ | `page.tsx:280-287` — `absolute bottom-3 left-3`，带 ListFilter 图标 + "最近拍过"文字 |
| viewMode 默认 "graph" | ✅ | `page.tsx:64` — `useState<"list" | "graph">("graph")` |
| 375px 下图谱 ≥ 600px | ✅ | 顶栏 ~50px + 图例行 ~30px + flex-1 剩余 ≈ 700px（812px - 50 - 30 - 10≥600） |

### Check 2: DP5 RecentCasesList → floating drawer ✅

| 检查项 | 结果 | 证据 |
|--------|------|------|
| open/onClose props 控制 | ✅ | `recent-cases-list.tsx:66-68` — `open?: boolean; onClose?: () => void` |
| 关闭时不渲染 | ✅ | `recent-cases-list.tsx:86` — `if (!open) return null;` |
| 打开时底部抽屉 + 遮罩 | ✅ | `recent-cases-list.tsx:89-116` — `fixed inset-0 z-50` + `bg-black/20` 遮罩 + `max-h-[80vh]` 抽屉 |
| 内部 CaseTagPanel 逻辑不变 | ✅ | `recent-cases-list.tsx:248-429` — lazy getCase + cache + tags API 零改动 |
| 入口按钮文字合规 | ✅ | "最近拍过" — 无禁用词 |

### Check 3: DP1 手工坐标 — all 48 nodes have coords ✅

| 检查项 | 结果 | 证据 |
|--------|------|------|
| MOBILE_COORDS 条目数 | ✅ 48 | M1-04~M1-33: 30 节点 + M2a 系列: 13 节点 + BG 系列: 5 节点 = 48 |
| 数据结构 | ✅ | `Record<string, {x: number, y: number}>` |
| MOBILE_W / MOBILE_H | ✅ | 368 / 700（≥680） |
| 缺失坐标 fallback | ✅ | `mobile-layout-coords.ts:113-121` — `getMobileCoord()` 有 console.warn + 画布中心 fallback |
| 边缘簇用簇名非节点名 | ✅ | `CLUSTER_LABELS` 8 个簇名标签（平面向量/三角函数/导数/概率统计/立体几何/解析几何/数列/地基层） |
| 顶部注释提醒 | ✅ | `mobile-layout-coords.ts:4` — "⚠️ 手工坐标，新增节点必须手动加坐标" |

### Check 4: Canvas mobile variant — 1:1 viewBox, gray底图, color semantics ✅

| 检查项 | 结果 | 证据 |
|--------|------|------|
| variant prop（默认 mobile） | ✅ | `canvas.tsx:67,89` — `variant = "mobile"` |
| 固定 viewBox 0 0 368 700 | ✅ | `canvas.tsx:402-403` — mobile 分支用 MOBILE_W/MOBILE_H |
| Gray底图 48 节点灰圆+灰名 | ✅ | `canvas.tsx:183-229` — `renderedBaseMap`: r=6 + fill=#D9D1C3 圆, fontSize=10 + fill=#BDB3A3 文字 |
| 边缘簇装饰灰点 + 簇标签 | ✅ | `canvas.tsx:213-226` — CLUSTER_DECORATIONS 24 灰点 + CLUSTER_LABELS 8 簇名 |
| 绿/蓝/琥珀/灰四色语义 | ✅ | `canvas.tsx:232-372` — 渲染逻辑 ZERO 改动，仅换坐标源 |
| nextLabel prop 用于前沿标签 | ✅ | `canvas.tsx:319` — `{nextLabel}` 替换硬编码 "下一个" |
| 边渲染 mobile 过滤 fallback | ✅ | `canvas.tsx:124-138` — 跳过 fallback 坐标的边 |

**注**：`renderedBaseMap` 对全部 48 节点画灰名（含 stable/frontier），而计划 §8.3 说"非 stable 非 frontier"。因灰名在底层、彩色渲染覆盖上层，视觉无差异，仅多画了几层 DOM。属 P3 轻微偏离。

### Check 5: nextLabel dynamic — "可以先看" when no stable, else "下一个" ✅

| 检查项 | 结果 | 证据 |
|--------|------|------|
| page.tsx 计算逻辑 | ✅ | `page.tsx:79-80` — `stats.stable === 0 ? "可以先看" : "下一个"` |
| 传至 canvas | ✅ | `page.tsx:274` — `nextLabel={nextLabel}` |
| 传至 list-view | ✅ | `page.tsx:264` — `nextLabel={nextLabel}` |
| 传至 detail-card | ✅ | `page.tsx:298` — `nextLabel={nextLabel}` |
| legend 动态文本 | ✅ | `page.tsx:218` — `{nextLabel}` 替换硬编码 "下一个" |
| list-view 动态分组标题 | ✅ | `list-view.tsx:109` — `section.key === "next" ? nextLabel : section.title` |

### Check 6: Homepage de-duplicate ✅

| 检查项 | 结果 | 证据 |
|--------|------|------|
| RecapBar 分支一 href → /nana/session | ✅ | `recap-bar.tsx:52` — 从 `/nana/knowledge-map` 改为 `/nana/session` |
| RecapBar 分支二 href → /nana/session | ✅ | `recap-bar.tsx:82` — 同上 |
| 链接文案 | ✅ | "去做小检查，点亮它们 →" — 两个分支一致 |
| ActionCard "看看知识地图" 保留 | ✅ | `src/app/nana/page.tsx:97-109` — 文件不在本轮变更列表中，ActionCard 未动 |

### Check 7: Schema/API untouched ✅

| 检查项 | 结果 | 证据 |
|--------|------|------|
| `git diff b6ba5f8..HEAD -- prisma/ src/app/api/` | ✅ EMPTY | 零输出 |
| 变更文件全部为 nana 自有 | ✅ | 9 个文件全部在 `src/app/nana/`、`src/components/nana/`、`doc/` |

### Check 8: Wording (OPS §4) ✅

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 本轮变更文件中无禁用词（用户可见文字） | ✅ | grep 结果中所有 "诊断/掌握/薄弱/得分/失败" 均存在于注释中（如 `// 禁用"未掌握"`），非用户可见文字 |
| 绿点 "已点亮" | ✅ | `page.tsx:214`，canvas 保留 |
| 蓝点 nextLabel | ✅ | "可以先看"（零数据）/ "下一个"（有数据） |
| 琥珀 "收过题" | ✅ | `page.tsx:227`，canvas + list + detail card 一致 |
| 灰点 "未探索" | ✅ | `page.tsx:223`，canvas 底图一致 |
| detail card 日期措辞 | ✅ | "✦ 你是在 X月X日 点亮的" — 对齐设计稿 kcard |

## 交叉检查

### 安全铁律 3（不改上游表结构）✅
零 Prisma schema 变更。所有改动在 nana 自有文件。

### 安全铁律 4（密钥不入 git）✅
diff 中无 .env 或密钥泄露。

### Agent 同步一致性 ✅
```
node scripts/check-agent-sync.js → 3/3 OK
```

### Build ✅
```
npm.cmd run build → ✓ 56/56 static pages, TypeScript pass, Compile pass
```

### Tests ✅
```
DATABASE_URL=file:./data/test/test.db vitest run
→ 12 test files passed, 113 tests passed
→ 与执行日志记录一致，无回归
→ test.db 使用正确，未触碰 dev.db（DB 护栏通过）
```

### 本地 Docker Desktop
执行日志已记录："本地 Docker Desktop 不可用，测试容器本地未跑；门禁交由 GitHub Actions 执行"。符合门禁规则。

## 偏离复核

执行日志记录了 1 条偏离：

| # | 偏离内容 | 原因 | 影响验收？ | 审计判断 |
|---|---------|------|:---------:|----------|
| 1 | 边缘簇节点使用装饰性灰点 + 簇标签，无对应 DB 节点 | DB 中不存在 M3-M8 节点，纯视觉占位 | 否 | ✅ 微调。计划 §7 风险 #3 已预见此情形，且验收标准无边缘簇需有 DB 节点的硬性要求。装饰灰点 + 簇名对齐设计稿 mockup。 |

**偏离结论**：1 条偏离均为微调，不影响验收标准，无需回 plan-agent。

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P2 | 375px 最窄设备上节点名约 9.3px（略低于 9.5px 目标） | `page.tsx:258` | px-4 padding 使 SVG 容器宽度 = 375-32=343px，viewBox=368 → 缩放 0.932 倍。可将图例行和内容区的 px-4 改为 `px-2` 或让 SVG 负边距扩展至父容器边缘（如 `-mx-4`），使 SVG 宽度回到 ~359px（缩放 0.976→9.76px）。390px+ 设备无此问题。 |
| P3 | `renderedBaseMap` 对所有 48 节点画灰名（含 stable/frontier），计划 §8.3 说"非 stable 非 frontier"。灰名被上层彩色渲染覆盖，视觉无差异但多画 ~15-20 层 DOM | `canvas.tsx:197-209` | 可选优化：gray底图只渲染 `!isStable && !isFrontier` 的节点（过滤稳定节点和前沿节点）。非必要，性能影响可忽略。 |
| P3 | `computeLayout` 在 mobile 模式下仍执行 | `canvas.tsx:94-97` | 可选优化：`variant === "mobile"` 时跳过 `useMemo(computeLayout,...)`，节省 ~5ms 初次渲染。非必要。 |
| P3 | detail-card 的 unexplored 分支不可达 | `detail-card.tsx:105-107` + `page.tsx:113` | page.tsx 中 `handleNodeClick` 已拦截 unexplored 节点（`if (!isStable && !isFrontier) return`），detail card 的 `isUnexplored` 分支永远不触发。可选清理死代码。 |

## 用户验证指南

打开 Chrome DevTools → 切换 375px 移动端视口，访问 `/nana/knowledge-map` 后逐项确认：

1. **图谱占满主屏**：顶栏下是整张图谱，基本看不到页面底部，地图高度一屏以上。不是半屏被列表挤住。
2. **1:1 节点名可读**：绿点和蓝点的名字肉眼能看清（不是蚂蚁字）。选一个节点右键 Inspect → Computed → font-size 应为 9.5px 左右（缩放后）。
3. **Gray底图可见**：没点亮的地方有灰色小圆点和淡淡灰名，48 个全部铺满画布。
4. **"可以先看"措辞**（零数据态）：如果一个都没点亮，蓝色圈上方写的应是"可以先看"而非"下一个"。确认后，如果有些已点亮则蓝圈应显示"下一个"。
5. **浮层抽屉**：左下角有"最近拍过"按钮，点击弹出底部抽屉（~80% 高度 + backdrop 遮罩），有题显示题卡片和标签面板，关闭回到图谱。
6. **详情卡片**：点绿点或蓝色圈，底部弹出详情卡——grip 条 + 节点名 + 状态圆点 + 描述 + 判定标准/例题 + "✦ 你是在 X月X日 点亮的" + 收过题计数（如有）。无"关闭"按钮，点遮罩关闭。
7. **图谱默认**：进入页面直接看到图谱（不是列表）。右上角有"图谱 | 列表"切换按钮，切到列表再切回正常。
8. **首页去重**：首页底部 RecapBar 链接应为"去做小检查，点亮它们 →"，跳 `/nana/session`。ActionCard"看看知识地图"仍在，是唯一知识地图入口。

## 最终汇总

- **总体判定**: ✅ 通过
- **8 项检查**: 全部 ✅
- **偏离**: 1 条，均为微调，不影响验收标准
- **测试**: 113/113 通过，无回归
- **Build**: 通过
- **建议**: 可进入 CI + 部署流程（待 GitHub Actions 测试容器通过后部署）
