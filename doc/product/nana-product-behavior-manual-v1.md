# Nana 产品行为手册 v1

> 面向：开发和设计（含项目 AI agent）
> 目标：开发不要自由发挥，设计不要语义漂移
> 关联：用户说明手册见 `nana-user-manual-v1-draft.md`，技术方案见 `doc/plan/stage3-ai-integration-plan.md`
> 权威：本文档是前端文案、状态机、数据落库行为的**唯一权威**。与代码冲突时，以本文档为准并修代码。

---

## 1. 入口点

| 入口 | URL | 触发条件 | 行为 |
|------|-----|---------|------|
| 首页 | `/nana` | 登录后默认 | 三卡片（拍题/知识地图/周末小检查）+ RecapBar |
| 拍题 | `/nana/capture` | 点"拍题" | 拍照 + 录音 + 保存 + AI 整理 |
| 知识地图 | `/nana/knowledge-map` | 点"知识地图" | 节点分组列表 + 最近拍过的题 |
| 周末小检查 | `/nana/session` | 点"周末小检查" | 做题 → 报告 → 点亮节点 |

---

## 2. 状态机

### 2.1 采集页状态机（`capture/page.tsx`）

```
photoState: "empty" | "photoTaken"
saveState:  "idle" | "saving" | "saved" | "processing" | "processed" | "error"
recorderState: "idle" | "recording" | "completed"

状态转换：
  empty → photoTaken（拍照/选图）
  photoTaken → empty（重新拍一张）

  idle → saving（点"收好这道题"）
  saving → saved（POST /cases 201）
  saving → error（POST /cases 失败）

  saved → processing（自动调 POST /cases/:id/process）
  processing → processed（/process 200 返回）
  processing → error（/process 网络错误）

门禁：
  - 无照片 → 禁保存（按钮灰，提示"先拍一下这道题"）
  - 录音中 → 禁保存、禁切tab、禁换图（提示"先把话说完，再收这道题"）
  - payload > 3MB → 禁保存（提示"材料太大，请重新拍一张或录短一些"）
```

### 2.2 /process 结果状态

```
status: "success" | "failed" | "timeout"
audioStatus: "success" | "skipped" | "failed" | "timeout"

组合矩阵：
  status=success + audioStatus=success → 有转写 + 有标签（理想）
  status=success + audioStatus=skipped → 无转写 + 有标签（webm/无音频）
  status=success + audioStatus=success(空转写) → 无转写 + 有标签（WAV但AI没听出内容）
  status=failed → 无写入，UI 显示"没接上"
  status=timeout → 无写入，UI 显示"超时了"
```

### 2.3 知识地图节点分组（`knowledge-map-list-view.tsx`）

```
分组优先级（互斥完备）：stable > frontier > collected > untested

  stable → "已点亮"（绿色 #6BBF8A）
  frontier → "下一个"（蓝色 #93B8D6）
  collected → "收过题"（琥珀色 #E8A33D）
  untested → "未探索"（灰色 #D9D1C3）

判定条件：
  isStable = node.status === "stable"（来自 StudentNodeState）
  isFrontier = frontier数组包含 nodeId（来自学习前沿算法）
  hasEvidence = caseEvidenceCount > 0（来自 CaseKnowledgeTag，distinct caseId 计数）

分组规则：
  if isStable → lit
  else if isFrontier → next
  else if hasEvidence → collected
  else → untested

叠加规则：
  lit/next 组中若 hasEvidence=true → 额外显示"收过 N"琥珀小角标
  collected 组本身用琥珀色，不再重复角标
```

---

## 3. UI 文案规范

### 3.1 采集页文案

| 状态 | 文案 | 备注 |
|------|------|------|
| 按钮初始（无照片） | "先拍一下这道题" | 灰色禁用 |
| 按钮初始（有照片） | "收好这道题" | 绿色 |
| 保存中 | "正在收…" | 不说"正在保存""正在上传" |
| 保存成功→processing | "正在整理这题…" | 不说"正在识别""正在诊断" |
| success + 有转写 + 有标签 | "转写好了 · 可能属于：XXX" | "可能"留余地 |
| success + 无转写 + 有标签 | "可能属于：XXX" | 不提转写 |
| success + 有转写 + 无标签 | "转写好了 · 这题不太好分类" | |
| success + 都无 | "整理好了，但不太好分类，可以手动挂" | 给出路 |
| failed | "识别没接上，可以手动整理" | 不说"失败" |
| timeout | "整理超时了，可以重试或手动整理" | 不说"超时失败" |
| 低置信候选 | "不太确定，先放未分类" | 不硬塞 |
| 录音中禁保存 | "先把话说完，再收这道题" | |
| payload 超限 | "材料太大，请重新拍一张或录短一些" | |

### 3.2 知识地图文案

| 元素 | 文案 | 备注 |
|------|------|------|
| 分组标题 | "已点亮" / "下一个" / "收过题" / "未探索" | 不变 |
| 收过题计数 | "收过 N" 或 "N 道" | |
| AI 标签角标 | "AI 候选" | 区分来源 |
| 手动标签角标 | "手动" | 区分来源 |
| 无标签 | "未分类" | 不说"待分类""未识别" |
| 首页回顾条（有点亮） | "上次你点亮了：XXX" / "你的地图上已经有 N 个光点了 ✦" | |
| 首页回顾条（只收过题） | "你最近收过题的知识点有 N 个" / "还没做小检查，做完就能点亮它们 ✦" | 不说"点亮了" |

### 3.3 转写面板文案

| 状态 | 文案 | 备注 |
|------|------|------|
| 占位（未转写） | "尚未转写" | createCase 恒写入 |
| 占位提示 | "转写稍后接入，录音已经收好。" | 当前 Stage 1 |
| 转写成功 | 显示转写文字 + "转写仅供参考，原音为准" | editable=true |
| 音频格式不支持 | "语音暂未转写" | webm/mp4 |
| 转写为空 | 保留"尚未转写"占位 | 不覆盖 |

### 3.4 禁用词清单

| 禁用词 | 替代 | 理由 |
|--------|------|------|
| 诊断 | 整理 / 看看 | OPS §4：术语清零 |
| 已诊断 | 已整理 | |
| 薄弱 | 还没点亮 | 不做负向判断 |
| 得分 | — | 不出现 |
| 掌握 | 点亮 | "掌握"暗示绝对状态，"点亮"更直观 |
| 未掌握 | 还没点亮 | |
| 失败 | 没接上 | 不怪用户 |
| 错误 | 没接上 / 再试一次 | 不出现技术术语 |
| 已识别 | 可能属于 | 不做确定性承诺 |
| 已分类 | 可能属于 | |
| 超时失败 | 超时了 | 去"失败"字 |
| 网络错误 | 没接上 | 不说技术术语 |
| 服务器错误 | 没接上 | |

---

## 4. 数据落库规范

### 4.1 落库表

| 表 | 何时写 | 写什么 | source | 持久化 |
|----|--------|--------|--------|:------:|
| `Artifact` (question_image) | createCase | Base64 题图 | — | ✅ |
| `Artifact` (audio_note) | createCase | Base64 录音 | — | ✅ |
| `Artifact` (audio_meta) | createCase | durationSec/mime/sizeBytes | — | ✅ |
| `Artifact` (transcript) | createCase | "尚未转写" 占位 | — | ✅ |
| `Artifact` (transcript) 更新 | /process 成功 + 转写非空 + 原内容是占位 | 转写文字 | — | ✅ |
| `CaseKnowledgeTag` | /process 成功 + confidence ≥ 0.5 | nodeId, confidence, note | "vlm" | ✅ |
| `CaseKnowledgeTag` | 用户手动挂载 | nodeId, confidence=1.0 | "manual" | ✅ |
| `StudentNodeState` | 周末小检查做对 | status="stable" | — | ✅ |

### 4.2 不落库

| 数据 | 为什么不落库 |
|------|-------------|
| 低置信候选 (confidence < 0.5) | v1 不持久化，只在 /process 即时响应中返回 |
| questionSummary | v1 只即时展示，不持久化（后续可加表存储） |
| studentFacingFeedback | v1 只即时展示，不持久化 |
| AI 原始输出 (rawOutput) | 只写日志，不入库 |
| token 用量 (usage) | 只写日志，不入库（后续可加成本追踪表） |

### 4.3 覆盖规则

**transcript artifact 覆盖守则**（铁律）：
1. 只有 `isPlaceholderTranscript(content) === true` 时才覆盖
2. 空字符串不覆盖（保留占位）
3. 非占位不覆盖（人 > AI）
4. 无 transcript artifact 不创建（createCase 恒创建，理论不会缺失）

### 4.4 caseEvidenceCount 计数规则

```
按 distinct(caseId, nodeId) 计数，不按行数计数。

同一 case 的 manual + vlm 双 source 指向同一 nodeId → 只算 1 道题（不是 2 道）。
不同 case 指向同一 nodeId → 算多道。

实现：findMany + distinct(['nodeId', 'caseId']) → Map 聚合
```

---

## 5. 七个场景（技术视角）

### 场景 1：清晰题，无录音

| 维度 | 内容 |
|------|------|
| 用户行为 | 拍照 → "收好这道题" |
| 请求序列 | POST /cases（artifacts: question_image + transcript 占位）→ 201 → POST /cases/:id/process |
| /process 输入 | imageDataUrl=题图, audioBase64=无, audioFormat=无 |
| /process 输出 | status=success, audioStatus=skipped, transcript=无, tags=[vlm标签], questionSummary=即时展示, feedback=即时展示 |
| UI 文案 | "可能属于：用定义判断单调性" |
| 落库 | Artifact(transcript) 不更新（无转写）; CaseKnowledgeTag(source=vlm) ×N |
| 不落库 | questionSummary, feedback, lowConfidenceCandidates |
| 误解风险 | "可能属于"被理解为"确定属于" |
| 防误解 | "可能"措辞 + "AI 候选"角标 |

### 场景 2：拍题 + 讲思路，AI 成功

| 维度 | 内容 |
|------|------|
| 用户行为 | 拍照 → "讲讲思路"tab → 录音 → "收好这道题" |
| 请求序列 | POST /cases（artifacts: question_image + audio_note + audio_meta + transcript 占位）→ 201 → POST /cases/:id/process |
| /process 输入 | imageDataUrl=题图, audioBase64=WAV纯Base64, audioFormat="wav" |
| /process 输出 | status=success, audioStatus=success, transcript=转写文字, tags=[vlm标签], questionSummary=即时展示, feedback=即时展示 |
| UI 文案 | "转写好了 · 可能属于：求函数值 f(a)" |
| 落库 | Artifact(transcript) 更新为转写文字; CaseKnowledgeTag(source=vlm) ×N |
| 不落库 | questionSummary, feedback |
| 误解风险 | 转写文字被理解为标准答案 |
| 防误解 | "转写仅供参考，原音为准" |

### 场景 3：照片歪，AI 低置信

| 维度 | 内容 |
|------|------|
| 用户行为 | 拍了歪照 → "收好这道题" |
| 请求序列 | POST /cases → 201 → POST /cases/:id/process |
| /process 输入 | imageDataUrl=歪题图, audioBase64=无 |
| /process 输出 | status=success, audioStatus=skipped, tags=[], lowConfidenceCandidates=[{nodeId, confidence=0.3, reason}] |
| UI 文案 | "整理好了，但不太好分类，可以手动挂" 或 "不太确定，先放未分类" |
| 落库 | Artifact(transcript) 不更新; CaseKnowledgeTag 不写 |
| 不落库 | lowConfidenceCandidates（刷新即失） |
| 误解风险 | "不好分类"被理解为"题太差" |
| 防误解 | "不太好分类"不说"题不清晰"; "可以手动挂"给出路 |

### 场景 4：AI 挂错，手动改

| 维度 | 内容 |
|------|------|
| 用户行为 | 知识地图 → 最近拍过的题 → 点开详情 → 选知识点 → "挂上" |
| 请求序列 | GET /cases/:id/tags → POST /cases/:id/tags { nodeId } |
| UI 变化 | 标签列表新增一条 "手动"角标; AI 标签保留 "AI 候选"角标 |
| 落库 | CaseKnowledgeTag(source=manual, confidence=1.0) |
| 不删除 | AI 标签(source=vlm) 保留 |
| 误解风险 | "AI 挂错了"被理解为"AI 不好用" |
| 防误解 | "AI 候选"角标暗示可改; 不说"纠错"说"手动挂" |

### 场景 5：收了题但没变绿

| 维度 | 内容 |
|------|------|
| 用户行为 | 拍多道题 → 去知识地图看 |
| 数据状态 | CaseKnowledgeTag 有记录; StudentNodeState 无记录 |
| UI 表现 | 节点在"收过题"琥珀色分组; 不在"已点亮"绿色分组 |
| 首页回顾条 | "你最近收过题的知识点有 N 个，还没做小检查，做完就能点亮它们" |
| 落库 | 只有 CaseKnowledgeTag; 没有写 StudentNodeState |
| 误解风险 | "收了这么多题怎么不亮" |
| 防误解 | 回顾条明确提示"做完小检查才能点亮"; 颜色区分琥珀vs绿色 |

### 场景 6：小检查后点亮

| 维度 | 内容 |
|------|------|
| 用户行为 | 周末小检查 → 做对题 |
| 请求序列 | POST /api/diagnosis/submit-answers → 系统判定对错 → 更新 StudentNodeState |
| 数据状态 | StudentNodeState.status = "stable" |
| UI 表现 | 知识地图节点从"收过题"移到"已点亮"绿色分组 |
| 首页回顾条 | "上次你点亮了：用定义判断单调性" / "你的地图上已经有 N 个光点了" |
| 落库 | StudentNodeState(status=stable); CaseKnowledgeTag 保留不删 |
| 误解风险 | "点亮了是不是永远亮" |
| 防误解 | "已点亮"不说"已掌握"; v1 阶段点亮了就是点亮了 |

### 场景 7：网络慢/没接上

| 维度 | 内容 |
|------|------|
| 用户行为 | 拍题 → "收好这道题" → 等很久 |
| 请求序列 | POST /cases → 201（题图已存）→ POST /cases/:id/process → 超时/报错 |
| /process 输出 | status=timeout 或 status=failed, error=原因 |
| UI 文案 | "整理超时了，可以重试或手动整理" 或 "识别没接上，可以手动整理" |
| 落库 | Artifact(question_image) 已保存; Artifact(transcript) 保留占位; CaseKnowledgeTag 不写 |
| 误解风险 | "没接上是不是题没存" |
| 防误解 | "可以手动整理"暗示题已存; 不说"失败""错误" |

---

## 6. 颜色语义

| 颜色 | Hex | 语义 | 用于 |
|------|-----|------|------|
| 绿色 | `#6BBF8A` | 已点亮 | 节点 status=stable; 保存成功确认; 主操作按钮 |
| 蓝色 | `#93B8D6` | 下一个 | 学习前沿节点 |
| 琥珀色 | `#E8A33D` | 收过题 | caseEvidenceCount > 0 的节点; AI 候选角标; "挂知识点"按钮 |
| 灰色 | `#D9D1C3` | 未探索 | 无证据无状态的节点; 禁用按钮 |
| 暖白 | `#FBF7F0` | 背景 | 采集页背景 |
| 深褐 | `#403A33` | 主文字 | 标题、正文 |
| 浅褐 | `#8C857B` | 次文字 | 提示、说明 |

**颜色铁律**：
- 绿色 **只** 表示"已点亮"（StudentNodeState status=stable）
- 琥珀色 **只** 表示"收过题"（CaseEvidenceCount > 0）
- 不得用绿色表示"AI 成功"——AI 成功用文字"转写好了""可能属于"表达
- 不得用红色表示"失败"——用浅褐文字 + "没接上"文案

---

## 7. 即时展示 vs 持久化

| 数据 | 即时展示 | 持久化 | 历史可见 | 说明 |
|------|:--------:|:------:|:--------:|------|
| transcript (转写文字) | ✅ | ✅ | ✅ | 回写 Artifact，后续打开 case 可见 |
| knowledgeCandidates (confidence≥0.5) | ✅ | ✅ | ✅ | 写 CaseKnowledgeTag，知识地图/标签面板可见 |
| knowledgeCandidates (confidence<0.5) | ✅ | ❌ | ❌ | 只在 /process 响应中返回，刷新即失 |
| questionSummary (题目摘要) | ✅ | ❌ | ❌ | v1 只即时展示，不落库。**后续版本如需历史可见，需新增字段或表** |
| studentFacingFeedback (鼓励文案) | ✅ | ❌ | ❌ | v1 只即时展示，不落库。**后续版本如需历史可见，需新增字段或表** |
| tags (已有标签列表) | ✅ | ✅ | ✅ | 从 CaseKnowledgeTag 查，含 manual + vlm |

### 设计决策：questionSummary 和 feedback 为什么 v1 不持久化？

1. **最小闭环原则**：v1 只做"转写 + 轻分类"，额外输出是加分项不是必须项
2. **表结构不变**：不新增字段/表，降低 v1 复杂度
3. **后续路径**：如果产品验证有价值，v2 可在 Case 表加 `questionSummary`/`feedback` 字段，或新增 `CaseAiResult` 表
4. **用户影响**：即时展示时用户能看到（"可能属于：XXX"已经包含了摘要的核心信息），刷新后消失不影响核心功能

---

## 8. 失败分支汇总

| 场景 | status | audioStatus | UI 文案 | 数据写入 | 用户出路 |
|------|--------|-------------|---------|----------|---------|
| 正常+转写+标签 | success | success | "转写好了 · 可能属于：XXX" | transcript + vlm tag | 查看/手动改 |
| 正常+无转写+标签 | success | skipped | "可能属于：XXX" | vlm tag | 查看/手动改 |
| 正常+转写+无标签 | success | success | "转写好了 · 这题不太好分类" | transcript | 手动挂 |
| 正常+都无 | success | skipped | "整理好了，但不太好分类，可以手动挂" | 无 | 手动挂 |
| 超时 | timeout | timeout | "整理超时了，可以重试或手动整理" | 无 | 重试/手动挂 |
| 报错 | failed | failed | "识别没接上，可以手动整理" | 无 | 重试/手动挂 |
| JSON 解析失败 | failed | failed | "识别没接上，可以手动整理" | 无 | 重试/手动挂 |
| 无题图 | failed | skipped | "缺少题图，无法分析" | 无 | 拍照 |
| 无音频 | success | skipped | "可能属于：XXX" | vlm tag | 查看/手动改 |
| webm/mp4 格式 | success | skipped | "可能属于：XXX" | vlm tag | 查看/手动改 |
| 跨用户访问 | 404 | — | — | — | — |

---

## 9. v2 遗留文件标注

以下文件在 v2 Round 1 创建，**v3 不再进入主路径**，但保留文件不删除（避免 git 历史混乱）：

| 文件 | v2 用途 | v3 状态 | 处置 |
|------|---------|---------|------|
| `src/lib/nana/asr-transcribe.ts` | 独立 ASR 管线 | **废弃** | 保留文件，不 import，不引用 |
| `src/lib/nana/vlm-classify.ts` | 独立 VLM 管线 | **废弃** | 保留文件，不 import，不引用 |
| `src/__tests__/unit/nana/asr-transcribe.test.ts` | ASR 单测 | **废弃** | 保留文件，不运行 |
| `scripts/stage3-asr-format-check.ts` | Round 0 格式验证 | **保留参考** | 保留文件，结论已写入 v3 方案 |
| `src/lib/nana/transcript-utils.ts` | isPlaceholderTranscript | **复用** | v3 仍使用 |
| `src/lib/nana/case-classify.ts` | source 白名单 | **复用** | v3 仍使用（source 收窄为 manual+vlm） |

> **注意**：execute-agent 在 v3 Round 1 中应新建 `case-analyzer.ts`，不修改 `asr-transcribe.ts` 和 `vlm-classify.ts`。如果 build 时这两个文件有 lint 错误（如 unused import），可加 `// @ts-nocheck` 或直接删除，不尝试修复。
