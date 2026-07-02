# Stage 2 真机验收根因分析（2026-07-02）

> 触发：用户真机验收 Stage 2 后反馈两个问题。
> 方法：systematic-debugging skill（Phase 1 根因 → Phase 2 模式 → Phase 3 假设）。
> 性质：**两个都不是 bug，是架构断点 / 功能缺失**。需回 plan-agent 决策，不应在审计里硬修。

---

## 问题 1：点错题卡片看不到原题图

### 症状
知识地图"最近拍过的题"列表里点一道题 → 展开标签面板，只看到图标占位符 + 日期 + "未分类"chip，**看不到自己拍的题图**。

### 根因（Phase 1 已确认）
- 列表 API `src/app/api/nana/cases/route.ts:55` 用 `select: { type: true }` **故意不取 content**（防 50 条 base64 爆体积，S1-3 设计如此）。
- 列表项组件 `recent-cases-list.tsx:146-150` 据此只渲染 `<ImageIcon>` 占位符。
- 想看原题必须调 `GET /api/nana/cases/[id]`（含完整 content），**但 S2-4 的 `CaseTagPanel` 只调 `listCaseTags`，从未调 getCase 拉题图**。
- 数据证据：生产库 `Case=4 / Artifact=8`，题图字节在库里（只是没被请求）。

### 性质
**功能缺失**（非 bug）。Stage 2 计划 §3/§4 S2-4 的职责是"挂载骨架 + 手动分类"，**"看题图"从未列入 Stage 2 任务**。计划 §3 知识地图职责写的是"看整理结果（知识点分布 + 历史题）"，但"历史题"的展示形态（缩略图 vs 详情页 vs 弹层）Stage 2 没定义。

### 修复方向（供 plan-agent 决策）
| 方案 | 复杂度 | 取舍 |
|------|:----:|------|
| A. 点 case 卡片 → 展开**含题图预览 + 标签面板**的详情（调 getCase 拉完整 content） | 中 | 一次 getCase 拉一条 base64（~1MB），点开才拉，不爆列表 |
| B. 独立 case 详情页 `/nana/cases/[id]`（题图 + 录音回放 + 转写 + 标签） | 高 | 最完整，但 Stage 2 未规划此页 |
| C. 列表 API 返回**极小缩略图**（服务端 resize 到 ~8KB） | 高 | 列表直接显示缩略，但需服务端图片处理 |

**推荐 A**（最小改动贴合当前 CaseTagPanel 展开交互）。

---

## 问题 2：挂了知识点但首页"光点地图"仍空

### 症状
已上传题目 + 手动关联知识点（CaseKnowledgeTag 有 1 条记录 case→BG100），但首页下方光点提示仍显示空状态（EmptyHint），知识地图图谱也全灰。

### 根因（Phase 1 已确认，证据确凿）
**两套独立的状态系统没有打通**：

| 表 | 作用 | 谁写入 | 当前生产库 |
|----|------|--------|:---------:|
| `CaseKnowledgeTag`（Stage 2 新建） | "题挂到哪个知识点" | Stage 2 `tagCaseManually`（人工） / Stage 3 VLM | 1 条 |
| `StudentNodeState`（M1 已有） | "学生该节点掌握状态（stable/gap/uncertain/untested）" | **只有 session 测评 `submit-answers` 写入** | **0 条** |

- map API `src/app/api/diagnosis/map/route.ts:39-44` 的节点 `status` **只读 `StudentNodeState`**，不读 `CaseKnowledgeTag`。
- 首页 `src/app/nana/page.tsx:73` 判定"有记录"靠 `status !== "untested"`，全 untested → `hasRecords=false` → 显示 EmptyHint。
- 数据证据：`StudentNodeState=0`，`CaseKnowledgeTag=1`（case→BG100，但 BG100 的 StudentNodeState 仍空）。
- 挂 100 次知识点，地图照样全灰——因为"点亮"在当前架构下靠**测评分数**，不靠**挂标签**。

### 性质
**架构断点**（设计未打通，非 bug）。Stage 2 计划 §7.1 明确 `CaseKnowledgeTag` 是"挂载骨架"，`classifyCase` 是 pending（§12.6 返回 `{tags:[], status:"pending"}`）。**"挂标签 → 点亮地图"这条链路从没在 Stage 2 范围内**。它跨在 Stage 2（挂载）和 M2 测评线（点亮）之间，是一个产品决策点。

### 修复方向（供 plan-agent 决策，涉及产品语义）
**核心产品问题**：挂了标签 = 点亮吗？还是必须做完 session 测题答对才点亮？

| 方案 | 语义 | 影响 |
|------|------|------|
| A. 挂标签 = "已采集证据但未测"，新状态 `collected`（≠ stable 已掌握） | 标签 → 弱点亮（如"已收过这类的题"灰色标记，不是绿色 stable） | 诚实（没测过就说掌握是假），符合 OPS §4 |
| B. 挂标签不影响地图，地图只认测评（维持现状） | 地图全靠 session | 用户体验差（挂了题地图不动），但语义最严 |
| C. 挂标签后自动起一次"轻探针"（用 Item 表里该节点题做 1 道）→ 写 StudentNodeState | 标签 → 触发测评 → 点亮 | 链路长，跨 Stage 3 |

**推荐 A**：引入 `collected` 状态（地图显示"已收过题"的弱标记，不用 stable 绿色），既给用户反馈（挂了题地图有反应），又不撒谎说"已掌握"。但这需要 plan-agent 定义新状态 + map API 改 + UI 改。

---

## 结论：不应在审计里硬修，回 plan-agent

| 问题 | 性质 | 建议归属 |
|------|------|----------|
| 1 看不到题图 | 功能缺失（Stage 2 未定义） | 新增 Stage 2.5 或并入 Stage 3：CaseTagPanel 展开时拉题图预览 |
| 2 挂标签不点亮 | 架构断点（跨 Stage 2 测评线） | 需 plan-agent 决策"挂标签是否点亮 + 用什么状态"，可能是 Stage 3 一部分或独立小轮 |

**两个都不阻塞当前已部署的 Stage 2 功能**（挂载骨架本身可用，标签能挂上、能读出）。但**用户体验上 Stage 2 不算完整闭环**——挂标签后地图没反馈、看不到题图，孩子/舅舅会困惑。

建议：开一轮小 plan 把这两个"看得见摸不着"的断点接通，再进 Stage 3 的真实 ASR/VLM。否则 Stage 3 越接越深，这两个底层断点会一直硌脚。

---

## 附录：证据采集命令与结果

```bash
# 表行数
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM StudentNodeState;"  # → 0
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM CaseKnowledgeTag;"  # → 1
# CaseKnowledgeTag 详情：case→BG100, source=manual, confidence=1.0

# map API 节点状态采样（全部"无状态"=untested）
SELECT n.id, n.name, COALESCE(s.status, "(无状态)") FROM KnowledgeNode n LEFT JOIN StudentNodeState s ON n.id = s.nodeId LIMIT 5;
# BG100|韦达定理（根与系数关系）|(无状态)
# ... 全部无状态
```

## 附录：代码追踪路径

**问题 1**：
- 列表 API 不返回 content：`src/app/api/nana/cases/route.ts:55` (`select: { type: true }`)
- 列表项占位符：`src/components/nana/knowledge-map/recent-cases-list.tsx:146-150` (`<ImageIcon>`)
- 详情面板不拉题图：`recent-cases-list.tsx:178-201` (`CaseTagPanel` 只调 `listCaseTags`)
- 完整题图接口存在但未用：`GET /api/nana/cases/[id]` (`cases/[id]/route.ts`)

**问题 2**：
- 首页"有记录"判定：`src/app/nana/page.tsx:73` (`status !== "untested"`)
- map API status 来源：`src/app/api/diagnosis/map/route.ts:39-44,158` (`StudentNodeState`)
- 挂标签写 CaseKnowledgeTag：`src/lib/nana/case-classify.ts` (`tagCaseManually`)
- `tagCaseManually` 从不写 StudentNodeState：`case-classify.ts` 全文无 StudentNodeState 引用
