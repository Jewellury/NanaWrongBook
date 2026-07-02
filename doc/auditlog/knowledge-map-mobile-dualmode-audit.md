# 知识地图 · 移动端双模式 · 审计报告

> 关联计划: `doc/plan/knowledge-map-mobile-dualmode-plan.md`
> 执行日志: `doc/executionlog/knowledge-map-mobile-dualmode-log.md`
> 审计日期: 2026-07-02
> 审计代理: audit-agent (OpenCode / glm-5.2)
> 审计范围: commits `13c00b7`（代码）+ `ab54f86`（日志）

---

## 1. 审计结论（大白话）

**总体判定：✅ 通过**

这轮代码干得很干净，完全按计划走。手机上知识地图的"字小看不见"老毛病从根上解决了——现在默认是一张正常字号（14px）的真实列表，节点名一眼能看清；想看全景的，顶部胶囊开关切到「图谱」还是原来的 SVG。三层语义色（绿/蓝/琥珀/灰）一个没丢，分组归类（已点亮 > 下一个 > 收过题 > 未探索）互斥完备且有单测兜底，图谱组件、数据库、API 一个字节没动。Build 通过，113 个测试全绿（含新增 8 个分组算法单测）。

唯一的微小观察：列表里"收过题"组的节点色点是灰的（chip 才是琥珀的）——这其实是对 SVG「灰芯+琥珀环」的忠实还原，不是 bug，但视觉上会和该组标题的琥珀点略有出入，留意一下即可。

**建议：可以推进 GitHub Actions 测试容器门禁，通过后部署。**

---

## 2. 检查清单

### 核心 8 项（reviewer 指定）

| # | 检查项 | 判定 | 证据 |
|---|--------|:----:|------|
| 1 | 375px 视口可读性（节点名 ≥14px，真实 DOM 列表，无 SVG 缩放） | ✅ | `knowledge-map-list-view.tsx:176` 节点名 `text-[14px]`；整列是 `<ul><li><button>` 真实 DOM，非 SVG；section 标题 `text-sm`(14px) |
| 2 | 三层语义色保留（绿/蓝/琥珀/灰 hex 一致，琥珀≠绿） | ✅ | `list-view.tsx:23-26` 四色 hex 与 canvas+图例完全一致；各组 chip 用 section.color；琥珀"收过题"非绿 |
| 3 | 分组优先级 stable > frontier > collected > untested（互斥完备） | ✅ | `list-view.tsx:56-70` if/else-if 链；单测覆盖 stable+evidence→lit、frontier+evidence→next、互斥并集无重复 |
| 4 | 措辞合规（已点亮/下一个/收过题/未探索；禁用掌握/薄弱/诊断/得分/失败） | ✅ | grep 确认用户可见字符串全部合规；禁用词仅出现在注释"禁用X"提醒中 |
| 5 | 图谱模式未被破坏（canvas.tsx 未改，graph 模式仍渲染） | ✅ | `git diff 8a30536..HEAD -- knowledge-map-canvas.tsx` = **空**；page.tsx:268-276 条件渲染 canvas |
| 6 | Schema/API 未动（无 migration、无 schema 变更、map API 不变） | ✅ | `git diff 8a30536..HEAD -- prisma/ src/app/api/` = **空** |
| 7 | segmented control 切换工作（默认 list，双向切换，复用 handleNodeClick） | ✅ | `page.tsx:64` `viewMode` 默认 "list"；两 button 切 setViewMode；list/graph 共用 handleNodeClick→KnowledgeDetailCard |
| 8 | RecentCasesList 仍在（两种模式都渲染） | ✅ | `page.tsx:155-159` 在 viewMode 条件块之外无条件渲染，两种模式都显示 |

### 计划一致性
- [x] 任务 A-E 全部落地（A 新组件 / B page 切换 / C canvas 不动 / D pinch 延后 / E 测试+build）
- [x] 文件变更清单与计划 §3 完全吻合：仅 1 新组件 + 1 改页面 + 1 新测试，其余"不动"文件零字节改动

### 代码质量
- [x] 无明显 bug（分组算法单测全覆盖优先级与互斥）
- [x] 错误处理到位（沿用 page 层既有 fetch/catch/空状态逻辑，未引入新错误路径）
- [x] 代码风格与既有 canvas/page 一致（同色板、同 className 范式、同 KnowledgeNodeData 类型）

### 安全性
- [x] 无密钥泄露（diff 中无 .env / API key）
- [x] 无 SQL 注入风险（零 API/Prisma 改动）
- [x] 用户输入有校验（纯展示组件，吃已校验数据）
- [x] 本轮未向 `./data/dev.db` 写入任何测试数据（测试在 `./data/test/test.db` 运行，guard-db 白名单内）

### 偏离复核（逐条）
| # | 偏离描述 | 复核结论 |
|---|----------|----------|
| 1 | Props 字段名 `frontier` 保持 | **非偏离**——与 canvas 一致，计划本就要求复用数据契约 |
| 2 | 未探索折叠展开文案「展开/收起」+ 计数 | ✅ 真微调，展示细节，不影响验收 |
| 3 | 用临时 launcher 设 env 跑 vitest（测完已删） | ✅ 真微调，本机 bash 中继不支持 inline env（与 stage2.5 同根因）；临时工具不入库 |

**结论：3 条均为真微调，无"实为大偏离"需回 plan-agent。**

### 上游兼容性
- [x] 未修改上游数据库表结构（铁律 3：零 Prisma 改动）
- [x] 仅改 nana 自有文件（`src/app/nana/`、`src/components/nana/`），无上游文件触碰
- [x] 新增文件在 `src/components/nana/knowledge-map/` 独立目录

### Agent 同步一致性
- [x] `node scripts/check-agent-sync.js` → exit 0（3/3 agents in sync）

### 测试
- [x] 本地 `npm.cmd run build` 通过（exit 0，56 静态页）
- [ ] 本地 Docker 测试容器：**未跑**——本地 Docker Desktop 不可用（daemon 未启动）。执行日志已明确记录"测试容器门禁交由 GitHub Actions 执行"（符合 AGENTS.md 测试门禁规则）
- [ ] GitHub Actions 测试容器门禁：**待 CI 执行**（本轮尚未 push，门禁待 CI 验证）
- [x] 测试使用 `DATABASE_URL=file:./data/test/test.db`（guard-db 白名单内），`./data/dev.db` 未被触碰
- [x] 无"退回生产容器跑测试"记录
- [x] 新增 8 单测覆盖分组优先级 + 互斥完备（含 stable/frontier 优先、并集无重复）

---

## 3. 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| P2（观察，非阻塞） | "收过题"组的**节点色点**是灰 `#D9D1C3`（`isCollectedChip → COLOR_UNTESTED`），而该组**标题色点**和 **chip** 是琥珀 `#E8A33D`。组内节点点和组标题点颜色不一致，视觉上可能略让人疑惑。 | `knowledge-map-list-view.tsx:166-168` | **可不改**——这是对 SVG「灰芯+琥珀环」的忠实还原（节点本体是未探索=灰芯，琥珀只是环）。若想视觉更统一，可把 collected 组节点点也改成琥珀。属美学取舍，不影响语义正确性。 |

> 无 P0、无 P1。唯一一条是 P2 级观察，不影响功能、安全、验收，可由用户自行决定是否让 execute-agent 微调。

---

## 4. 用户验证指南

部署到腾讯云后，用手机打开 `/nana/knowledge-map`：

1. **默认看到列表**：页面打开后默认是「列表」视图，看到 4 组分段卡片（已点亮 / 下一个 / 收过题 / 未探索），节点名清晰可读（14px）。
2. **三层语义色核对**：
   - 已点亮组 → 绿色色点（`#6BBF8A`，带淡绿光晕）
   - 下一个组 → 蓝色色点（`#93B8D6`）
   - 收过题组 → 琥珀 chip（`#E8A33D`）+ 灰色节点点
   - 未探索组 → 灰色色点（`#D9D1C3`，默认折叠，点「展开 N 个未探索知识点」可见）
3. **点节点弹详情卡**：点已点亮/下一个节点 → 弹出原来的 `KnowledgeDetailCard`（与图谱模式行为一致）。
4. **切换到图谱**：点顶部胶囊开关「图谱」→ 看到 SVG 全景图（手机上仍较密集，是"看一眼整体形状"用的，精读回列表）。
5. **切回列表**：点「列表」→ 回到列表，状态不残留。
6. **最近拍过的题仍在**：顶部「最近拍过的题」列表在两种模式下都显示（没丢功能）。
7. **空状态**：新用户（litNodeCount<2 且没收过题）看到「旅程从这一步开始」，不显示空的列表/图谱。

---

## 附录：验证命令结果

| 命令 | 结果 |
|------|------|
| `node scripts/check-agent-sync.js` | exit 0（3/3 agents in sync） |
| `git diff 8a30536..HEAD --stat` | 4 文件 +497/-10（1 新组件、1 改页面、1 新测试、1 日志） |
| `git diff 8a30536..HEAD -- knowledge-map-canvas.tsx` | **空**（canvas 未改） |
| `git diff 8a30536..HEAD -- prisma/ src/app/api/` | **空**（schema/API 未动） |
| `git diff 8a30536..HEAD --name-only` | 4 文件，全部 nana 自有 |
| grep 禁用词（掌握/薄弱/诊断/得分/失败/学会） | 仅出现在注释"禁用X"提醒，无用户可见串 |
| `npm.cmd run build` | exit 0 |
| vitest nana 套件（test.db） | 12 文件 / 113 测试全通过 |
| `git status` | 干净（工作区无残留） |
