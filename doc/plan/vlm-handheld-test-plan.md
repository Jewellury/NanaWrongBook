# VLM 手持拍照先验测试 · 测试方案

> 关联规格: [doc/plan/volcengine-vision-integration-plan.md](../plan/volcengine-vision-integration-plan.md)（§0 前置验证 + T1）
> 关联参考: [doc/reference/TECH_PLAN_v2.md](../reference/TECH_PLAN_v2.md)（§AI 管线）、[doc/reference/OPS_handbook.md](../reference/OPS_handbook.md)
> 计划日期: 2026-06-20
> 计划者: plan-agent
> 预计影响:
> - 新增: `scripts/vlm-handheld-test.ts`
> - 新增: `doc/research/vision-samples/handheld-report.md`（验收报告）
> - 不修改: `scripts/vlm-transcribe.ts`（现有真题转写脚本不动）
> - 不修改: 任何 `src/` 文件

---

## 1. 大白话概述

### 这轮要做什么

用 **20 张真实手持拍摄的数学题照片**（外甥女/外甥用手机拍的，含各种角度、光照、手写批注），逐一发给火山方舟 Pro 视觉模型去识别，看看它能不能准确读出题目内容、答案、解析等信息。

**执行顺序（和原方案不同）：**
1. execute-agent 先写测试脚本
2. 你跑脚本，AI 出结果
3. 你写一份"判定说明"——给外甥女/外甥看，教她怎么判断 AI 认没认对
4. 孩子逐张照片对照打分（她最熟这些题）
5. 你汇总 → 决策

- 如果 **≥ 80% 的图片都能准确提取** → 证明方舟 Pro 在真实场景下够用，可以正式进入开发阶段
- 如果 **60–80% 准确** → 暂停，先优化拍照指引或加图片预处理
- 如果 **< 60% 准确** → 整个接入方案的前提不成立，需要重新评估技术路线

### 为什么要做

之前"VLM 够用"的结论，是基于 **平整扫描的 PDF（150DPI）** 测试得出的——那跟手机手持拍照完全是两回事。手持拍照会有倾斜、阴影、反光、手写批注等真实干扰，必须先用真实照片验证准确率，才能放心投入开发。

---

## 2. 测试目标

### 2.1 核心验证项

1. **题面提取正确率** — VLM 能否正确读出题目正文（数字、符号、公式、文字）？
2. **答案提取正确率** — VLM 能否正确提取题目答案？
3. **解析提取质量** — VLM 能否生成有意义的解题分析（不要求百分百正确，但至少方向对）？
4. **学科/知识点分类准确率** — VLM 能否正确判断学科和涉及的知识点？
5. **结构化完整率** — VLM 的输出是否包含全部要求的 XML 字段（无缺失）？

### 2.2 判定阈值

| 场景 | 判定结果 | 后续措施 |
|------|----------|----------|
| 题面+答案综合准确率 **≥ 80%** | ✅ **通过** | 进入 T2 开发阶段 |
| 题面+答案综合准确率 **60–80%** | 🟡 **暂停** | 先优化拍照指引 / 加预处理（去阴影、纠偏）后重测 |
| 题面+答案综合准确率 **< 60%** | ❌ **不通过** | 整个 VLM 接入方案前提不成立，回 /plan 重新评估 |

### 2.3 测试前提

- 方舟 Pro 模型的 API 已开通（`scripts/vlm-transcribe.ts` 已验证可调用）
- `.env` 中已配置 `VOLCENGINE_API_KEY` / `VOLCENGINE_BASE_URL` / `PRO_ENDPOINT_ID`
- 20 张手持照片已放入 `doc/research/vision-samples/handheld/`

---

## 3. 测试数据

### 3.1 样本来源

来自 E 线外甥女/外甥拍摄的错题照片。这批照片覆盖不同学科、光照条件、纸张角度、手写批注程度。

### 3.2 文件清单

共 20 张 `.jpg` 文件，文件大小 380KB–917KB，位于 `doc/research/vision-samples/handheld/`：

| # | 文件名 | 大小 | 特征（待人工标注） |
|---|--------|------|-------------------|
| 01 | `微信图片_20260620133427_619_23.jpg` | 761KB | — |
| 02 | `微信图片_20260620133554_620_23.jpg` | 825KB | — |
| 03 | `微信图片_20260620133628_621_23.jpg` | 818KB | — |
| 04 | `微信图片_20260620134047_625_23.jpg` | 835KB | — |
| 05 | `微信图片_20260620134111_626_23.jpg` | 691KB | — |
| 06 | `微信图片_20260620134123_627_23.jpg` | 757KB | — |
| 07 | `微信图片_20260620134151_628_23.jpg` | 861KB | — |
| 08 | `微信图片_20260620134239_629_23.jpg` | 897KB | — |
| 09 | `微信图片_20260620134248_630_23.jpg` | 889KB | — |
| 10 | `微信图片_20260620134332_631_23.jpg` | 806KB | — |
| 11 | `微信图片_20260620134352_632_23.jpg` | 777KB | — |
| 12 | `微信图片_20260620134359_633_23.jpg` | 381KB | — |
| 13 | `微信图片_20260620134423_634_23.jpg` | 757KB | — |
| 14 | `微信图片_20260620134531_635_23.jpg` | 752KB | — |
| 15 | `微信图片_20260620134551_636_23.jpg` | 758KB | — |
| 16 | `微信图片_20260620134556_637_23.jpg` | 695KB | — |
| 17 | `微信图片_20260620134630_638_23.jpg` | 725KB | — |
| 18 | `微信图片_20260620134704_639_23.jpg` | 716KB | — |
| 19 | `微信图片_20260620134757_640_23.jpg` | 918KB | — |
| 20 | `微信图片_20260620134841_641_23.jpg` | 682KB | — |

> **注**："特征"列需要人工标注时填写（如：光照不均、倾斜严重、有手写批注、跨页中线等）。
> `.gitignore` 已包含 `/doc/research/vision-samples/handheld/`，这批图片**不入 git**。

### 3.3 数据治理

- 图片仅用于本次验收测试，不用于后续开发训练
- 测试完成后保留在本地不删除，可复用为 T5-2 集成测试的样本集
- 不 commit 到 git 仓库

---

## 4. 测试脚本设计

### 4.1 脚本定位

**新建独立脚本** `scripts/vlm-handheld-test.ts`，不修改现有 `scripts/vlm-transcribe.ts`。

理由：
- `vlm-transcribe.ts` 的 prompt 是为"真题整页转写"设计的（system prompt 长达 60+ 行，面向年份/题号/分值等字段），不适合单道题的手持照片场景
- 手持测试需要不同的 prompt 和输出格式（XML 结构化，5 个标签）
- 独立脚本的语义更清晰，职责单一
- 两套 prompt 互不干扰，后续维护不需要在同一个文件里加条件分支

### 4.2 Prompt 设计

针对手持拍照识题场景，设计专门的 prompt（与真题转写的提示词 A 独立）：

```
系统角色: 你是一个拍照识题助手。用户发来一张手持拍摄的数学/理科题目照片，
请仔细观察图片内容，输出结构化识别结果。

要求：
1. 认真看图片里的所有文字、数字、公式、图形
2. 如果图片模糊或不完整，就如实写"无法识别"
3. 不要猜，看不清就不要写
4. 只做识别提取，不做解题

请严格按照以下 XML 格式输出（不要加 markdown 代码块包裹）：

<result>
  <question_text>题目的完整文字内容，公式用 LaTeX 写在 $$ 中</question_text>
  <answer_text>题目的答案或正确选项</answer_text>
  <analysis>解题思路简要分析</analysis>
  <subject>学科（数学/物理/化学/英语/语文/生物/地理/历史/政治/未知）</subject>
  <knowledge_points>涉及的知识点，用逗号分隔</knowledge_points>
</result>
```

### 4.3 脚本工作流程

```
vlm-handheld-test.ts 工作流程:

1. 读取环境变量（VOLCENGINE_API_KEY / VOLCENGINE_BASE_URL / PRO_ENDPOINT_ID）
2. 扫描 doc/research/vision-samples/handheld/*.jpg
3. 按文件名排序得到图片列表
4. 对每张图片：
   a. 读取文件 → base64 编码
   b. 调用方舟 Pro（OpenAI SDK，chat.completions.create）
   c. 从 response 提取 XML 标签
   d. 记录 tokens 用量
   e. 输出单条结果到 stdout
5. 汇总：输出总 tokens、估算费用、成功/失败计数
6. 将全部结果写到 doc/research/vision-samples/handheld-report.md
```

### 4.4 输出格式规范

脚本产生的 `handheld-report.md` 分为三部分：

**Part A：AI 输出逐条记录**（每张图片一条，脚本自动写入）

```markdown
## 图片 01：微信图片_20260620133427_619_23.jpg

**AI 原始响应：**
\`\`\`xml
<result>
  <question_text>...</question_text>
  <answer_text>...</answer_text>
  <analysis>...</analysis>
  <subject>...</subject>
  <knowledge_points>...</knowledge_points>
</result>
\`\`\`

**Tokens：** prompt=xxx / completion=xxx / total=xxx

**孩子打分区域（待填写）：**
- [ ] 题面提取正确（/5）
- [ ] 答案提取正确（/5）
- [ ] 分析质量达标（/5）
- [ ] 学科分类正确（/3）
- [ ] 知识点匹配（/3）
- **备注：**
```

**Part B：孩子评分表**（孩子填写）

| 图片 | 题面(5) | 答案(5) | 分析(5) | 学科(3) | 知识点(3) | 总分(21) | 备注 |
|------|---------|---------|---------|---------|-----------|----------|------|
| 01 | 5 | 5 | 4 | 3 | 2 | 19/21 | 字有点歪但AI认对了 |
| ... | | | | | | | |
| **汇总** | **avg** | **avg** | **avg** | **avg** | **avg** | **x/21** | — |

**Part C：总体统计**（自动计算）

- 总图片数：20
- 有效响应数：xx
- 失败数：xx
- 平均 tokens/图：xxx
- 总 tokens 消耗：xxx
- 估算费用：¥xxx
- **题面+答案平均准确率：xx%**
- **综合判定：🟢 通过 / 🟡 暂停 / 🔴 不通过**

### 4.5 评分标准量化

| 维度 | 满分 | 评分标准 |
|------|:----:|----------|
| 题面提取 | 5 | 5=完全正确(数字符号全部对)；4=1-2处小错；3=部分正确但有较多错误；2=大段错误；1=基本全错；0=无法识别 |
| 答案提取 | 5 | 5=完全正确；4=正确但格式不完全匹配；3=部分正确；2=错；1=相关但不对；0=无答案 |
| 分析质量 | 5 | 5=思路清晰、方向正确；4=方向正确但逻辑有瑕疵；3=勉强相关；2=方向偏离；1=完全不相关；0=无分析 |
| 学科分类 | 3 | 3=完全正确；2=大类正确但细分类略偏；1=错误；0=无 |
| 知识点匹配 | 3 | 3=全部覆盖关键知识点；2=覆盖大部分；1=覆盖少部分；0=未覆盖或无 |

**满分 21 分。单张图片通过线：≥ 17 分（给孩子参考用）。**

**总体通过判定**（最终决策依据，仅看题面+答案两维度）：
- 题面+答案综合准确率 = 所有图片的 (题面得分 + 答案得分) / (5 + 5) 的平均值
- ≥ 80% → ✅ 通过
- 60–80% → 🟡 暂停
- < 60% → 🔴 不通过

> **关于两个"通过线"的不同用途：**
> - **单张通过线（≥17/21）**：这是给孩子参考的，帮 TA 判断"这张 AI 发挥如何"。孩子打的总分包括分析、学科、知识点等主观维度。
> - **总体判定（题面+答案≥80%）**：这是最终决策依据——**只看题面和答案两个维度的平均得分**。因为分析/学科/知识点的判定比较主观，不作为硬性通过标准。
>
> **举例**：一张图片的分析/学科/知识点打低分，但题面和答案满分（10/10），最终判定仍通过。反过来，题面或答案大面积错，即使分析写得再好，也不通过。

---

## 5. 任务分解（新流程）

> **流程变化说明**：原方案要求先人工标注 ground truth 再跑脚本，现在改成**先跑脚本出结果 → 孩子对照打分**。因为孩子（外甥女/外甥）最熟这些题，她的判断比大人凭空标注更准，也更省时间。

### T1-1 编写测试脚本（execute-agent 完成）

- [ ] 新建 `scripts/vlm-handheld-test.ts`（参照 `vlm-transcribe.ts` 的方舟 API 调用模式）
- [ ] 实现参数扫描、调用、XML 解析
- [ ] 实现 Markdown 报告输出（Part A AI 输出 + Part C 统计自动填写；Part B 评分表留空等孩子填）
- [ ] 验证脚本能正常跑通 1–2 张样本图
- [ ] 在脚本内输出一份**孩子用判定说明** `doc/research/vision-samples/judgment-guide.md`

**涉及文件：**
- `scripts/vlm-handheld-test.ts`（新增）
- `doc/research/vision-samples/judgment-guide.md`（新增，由脚本生成或人工补充）

### T1-2 写判定说明（人类 + execute-agent 协作）

- [ ] execute-agent 生成一份初版判定说明 `judgment-guide.md`
- [ ] 你过目修改措辞，确保孩子能看懂
- [ ] 打印或发给孩子的最终版

**判定说明的内容**（详见第 14 节）：用大白话告诉孩子"你看这张照片，再对比 AI 认出来的结果，每个维度给个分"。

### T1-3 执行测试（人类执行脚本）

- [ ] 确认 `.env` 配置齐全
- [ ] 运行 `npx tsx scripts/vlm-handheld-test.ts`
- [ ] 等待 20 张图全部跑完

**预计耗时：5–10 分钟（API 调用）**

### T1-4 孩子逐张判定（孩子完成）

- [ ] 孩子拿到 `handheld-report.md`（含 AI 输出）和 `judgment-guide.md`
- [ ] 每张照片：看原图 → 读 AI 输出 → 按判定说明打 5 维分
- [ ] 填写 Part B 评分表

**预计耗时：孩子自己 20–40 分钟（取决于题量和熟练度）**

### T1-5 汇总统计与决策（人类完成）

- [ ] 计算平均分、通过率
- [ ] 按阈值作决策：
  - 通过 → 记录到 `DECISIONS.md`，进入 T2 开发
  - 暂停/不通过 → 回 /plan 重做
- [ ] 填写 Part C 总体统计
- [ ] 提交 `handheld-report.md` + `judgment-guide.md` 到 git（图片不入库，报告入库）

### T1-6 决策记入 DECISIONS.md

- [ ] 追加一条 D-编号，记录测试结果和采用阈值

---

## 6. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/vlm-handheld-test.ts` | **新增** | 手持拍照测试脚本，独立于 `vlm-transcribe.ts` |
| `doc/research/vision-samples/handheld-report.md` | **新增** | 验收报告（AI 输出 + 人工判定 + 汇总统计） |
| `doc/DECISIONS.md` | **追加一行** | 记录先验测试决策结果 |
| `scripts/vlm-transcribe.ts` | **不动** | 现有真题转写脚本不受影响 |
| 任何 `src/` 文件 | **不动** | — |
| 任何上游文件 | **不动** | — |

---

## 7. 验收标准

- [ ] 测试脚本 `scripts/vlm-handheld-test.ts` 已编写完成，能独立运行
- [ ] `judgment-guide.md` 已生成，措辞孩子能看懂
- [ ] 20 张样本全部跑完，无 API 认证/超时等技术性失败（网络问题除外）
- [ ] `handheld-report.md` 已产出，包含三部分（AI 输出 / 评分表 / 汇总统计）
- [ ] 孩子已完成 20 张图片的各维度打分
- [ ] 总体准确率已计算
- [ ] 决策已按阈值作出
- [ ] 决策已记入 `DECISIONS.md`
- [ ] 若通过 → execute-agent 启动 T2 时，引用 `DECISIONS.md` 的对应 D-编号

---

## 8. 风险与注意事项

### 8.1 技术风险

| 风险 | 概率 | 影响 | 应对 |
|------|:----:|:----:|------|
| 方舟 API 超时或限流 | 中 | 测试中断 | 脚本加重试逻辑（退避重试 2 次）+ 跳过继续 |
| 某张图片 base64 过大超出模型上下文 | 低 | 单张失败 | 脚本应能跳过失败图片继续下一张 |
| XML 输出格式不规则（缺少标签） | 中 | 解析失败 | 脚本应有容错解析，fallback 到原文本 |
| 模型返回空响应或拒绝回答 | 低 | 单张失败 | 计入失败统计，不影响其他图片 |

### 8.2 流程风险

| 风险 | 应对 |
|------|------|
| 人工判定主观性强 | 每题固定 5 维度评分标准，量化减少主观偏差 |
| 20 张不够代表所有场景 | 先验阶段 20 张已大幅超过原定 5-10 张要求，通过后再用更多样本做集成测试 |
| 某张图恰好是极难情况导致通过率偏低 | 按综合平均值判定，单张 outlier 影响有限 |

### 8.3 注意事项

- **不要在容器内跑测试脚本**：方舟 API 调用直接从宿主机运行，无需 Docker 容器。`scripts/vlm-transcribe.ts` 的调用模式已证实这一点。
- **图片不入 git**：`.gitignore` 已配好，提交前确认 `git status` 无 handheld 目录下的图片。
- **测试脚本不含敏感信息**：从 `.env` 读密钥，不硬编码。
- **不影响现有真题转写工作流**：`vlm-transcribe.ts` 不动，两套 prompt 不混用。

---

## 9. 时间 / 成本估算

### 9.1 时间估算

| 步骤 | 执行者 | 预计耗时 |
|------|--------|:--------:|
| T1-1 编写测试脚本 | execute-agent | 20–30 分钟 |
| T1-2 写判定说明（初稿+你过目） | 协作 | 15–20 分钟 |
| T1-3 执行测试（API 调用） | 你 | 5–10 分钟 |
| T1-4 孩子逐张判定打分 | 孩子 | 20–40 分钟 |
| T1-5 汇总统计与决策 | 你 | 10 分钟 |
| T1-6 记入 DECISIONS.md | 你 | 5 分钟 |
| **合计** | | **约 1–2 小时**（比原方案少一次人工标注） |

### 9.2 Tokens 消耗估算

参考 `scripts/vlm-transcribe.ts` 中的定价数据：

```
doubao-seed-2-0-pro-260215: input ¥3.2 / 百万 tokens, output ¥16 / 百万 tokens
```

**单张图片估算：**
- 图片 base64 编码 ≈ 原始大小 × 1.37（base64 膨胀率）
- 380KB–917KB 的原图 → 约 520KB–1,256KB base64
- Prompt tokens ≈ 图片 tokens + 文本 prompt（约 500 tokens）
  - 图片 tokens：方舟 Pro 的视觉编码效率，一张 500KB–1MB 的图约消耗 **500–1,500 tokens**
- Completion tokens ≈ XML 输出（约 200–400 tokens）
- **单张总计约 1,000–2,500 tokens**

**20 张总计估算：**

| 项目 | 估算值 |
|------|--------|
| 总 prompt tokens | 20,000–50,000 |
| 总 completion tokens | 4,000–8,000 |
| 总 tokens | **24,000–58,000** |
| 输入费用（¥3.2/百万） | ¥0.064–¥0.16 |
| 输出费用（¥16/百万） | ¥0.064–¥0.128 |
| **总费用** | **< ¥0.3（不到 3 毛钱）** |

> 即使以最高估算（58K tokens），总费用也不超过 0.3 元。如果模型采用更经济的 endpoint 定价，可能更低。**成本可忽略不计。**

---

## 10. 测试前提检查清单

在执行测试前，逐项确认以下条件已满足：

### 10.1 环境变量（`.env` 文件）

- [ ] `VOLCENGINE_API_KEY` 已配置且有效（可在终端 `echo $VOLCENGINE_API_KEY` 验证是否有值）
- [ ] `VOLCENGINE_BASE_URL` 已配置（推荐值：`https://ark.cn-beijing.volces.com/api/v3`）
- [ ] `PRO_ENDPOINT_ID` 已配置（方舟 Pro 视觉模型的 Endpoint ID，如 `doubao-seed-2-0-pro-260215` 或用户创建的接入点）
- [ ] `.env` 未被 git 追踪（`git status` 确认无 `.env`）
- [ ] `.env` 已在 `.gitignore` 中

### 10.2 样本数据

- [ ] `doc/research/vision-samples/handheld/` 目录存在
- [ ] 目录内有 20 张 `.jpg` 文件
- [ ] 图片**不在 git 追踪中**（`.gitignore` 已排除）

### 10.3 API 连通性

- [ ] `npx tsx scripts/vlm-transcribe.ts` 可正常调用方舟 API（可选验证，用已有真题转写验证 API 可达性）
- [ ] 火山方舟控制台确认 `PRO_ENDPOINT_ID` 对应的推理接入点状态正常

### 10.4 依赖

- [ ] `openai` npm 包已安装（`vlm-transcribe.ts` 依赖它，确认 `node_modules/openai` 存在）
- [ ] `tsx` 已安装（`npx tsx` 可用）

### 10.5 网络

- [ ] 终端/宿主机可以访问 `https://ark.cn-beijing.volces.com`（无代理/防火墙拦截）

---

## 11. 决策记录模板

### 11.1 通过 → 进入 T2 开发

如果测试通过（≥ 80%），在 `doc/DECISIONS.md` 中追加：

```markdown
| D-16 | 2026-06-20 | gate | **T1 先验通过：手持场景 VLM 准确率达标** — 20 张真实手持照片测试，
题面+答案综合准确率 xx%（≥ 80% 阈值），进入 T2 方舟视觉服务开发阶段。
样本报告: [handheld-report.md](research/vision-samples/handheld-report.md) | accepted |
```

### 11.2 暂停 → 先优化后重测

如果测试结果在 60–80%，在 `doc/DECISIONS.md` 中追加：

```markdown
| D-16 | 2026-06-20 | gate | **T1 先验暂停：手持场景 VLM 准确率不足** — 20 张真实手持照片测试，
题面+答案综合准确率 xx%（60–80% 区间）。暂停 T2 开发，先优化拍照指引 / 加预处理后重测。
样本报告: [handheld-report.md](research/vision-samples/handheld-report.md) | proposed |
```

### 11.3 不通过 → 方案回炉

如果测试结果 < 60%，在 `doc/DECISIONS.md` 中追加：

```markdown
| D-16 | 2026-06-20 | gate | **T1 先验不通过：手持场景 VLM 准确率严重不足** — 20 张真实手持照片测试，
题面+答案综合准确率 xx%（< 60%）。整个 VLM 接入方案前提不成立，回 /plan 重评技术路线。
样本报告: [handheld-report.md](research/vision-samples/handheld-report.md) | superseded |
```

---

## 12. 脚本技术附录

### 12.1 脚本签名与流程（草案）

```typescript
// scripts/vlm-handheld-test.ts
// 手持拍照 VLM 先验测试脚本
// 用法: npx tsx scripts/vlm-handheld-test.ts

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// --- 配置常量 ---
const HANDHELD_DIR = 'doc/research/vision-samples/handheld';
const OUTPUT_REPORT = 'doc/research/vision-samples/handheld-report.md';
const PROMPT = `
你是一个拍照识题助手。用户发来一张手持拍摄的数学/理科题目照片，
请仔细观察图片内容，输出结构化识别结果。

要求：
1. 认真看图片里的所有文字、数字、公式、图形
2. 如果图片模糊或不完整，就如实写"无法识别"
3. 不要猜，看不清就不要写
4. 只做识别提取，不做解题

请严格按照以下 XML 格式输出（不要加 markdown 代码块包裹）：

<result>
  <question_text>题目的完整文字内容，公式用 LaTeX 写在 $$ 中</question_text>
  <answer_text>题目的答案或正确选项</answer_text>
  <analysis>解题思路简要分析</analysis>
  <subject>学科（数学/物理/化学/英语/语文/生物/地理/历史/政治/未知）</subject>
  <knowledge_points>涉及的知识点，用逗号分隔</knowledge_points>
</result>
`;

interface ImageResult {
  fileName: string;
  fileSizeKB: number;
  success: boolean;
  xmlText: string;
  extracted: {
    questionText: string;
    answerText: string;
    analysis: string;
    subject: string;
    knowledgePoints: string;
  } | null;
  error?: string;
  promptTokens: number;
  completionTokens: number;
}

// --- 核心函数 ---

/** 从目录扫描所有 jpg 文件，按文件名排序 */
function scanImages(): string[] { /* ... */ }

/** 读取图片并转为 base64 */
function imageToBase64(filePath: string): string { /* ... */ }

/** 调用方舟 Pro 进行识别 */
async function callVisionAPI(
  client: OpenAI,
  model: string,
  base64: string
): Promise<{ text: string; usage: any }> { /* ... */ }

/** 从响应文本中提取 XML 标签 */
function extractXMLTags(xml: string): {
  questionText: string;
  answerText: string;
  analysis: string;
  subject: string;
  knowledgePoints: string;
} | null { /* 正则提取 <tag>...</tag> */ }

/** 生成 Markdown 报告 */
function generateReport(results: ImageResult[]): string { /* ... */ }

async function main() {
  // 1. 读取环境变量
  // 2. 创建 OpenAI client
  // 3. 扫描图片目录
  // 4. 逐张调用 API（带重试）——每张独立 try-catch，失败跳过不中断
  const results: ImageResult[] = [];
  for (const file of files) {
    const filePath = path.join(HANDHELD_DIR, file);
    try {
      const base64 = imageToBase64(filePath);
      const { text, usage } = await callWithRetry(client, model, base64);
      // 解析 XML、记录结果...
    } catch (err) {
      console.error(`  ❌ ${file} 失败（已跳过）: ${(err as Error).message}`);
      results.push({ fileName: file, success: false, error: (err as Error).message, ... });
      continue;  // 关键：跳过当前张，继续下一张
    }
  }
  // 5. 生成报告并写入文件
  // 6. 输出汇总统计到 console
}

main().catch(err => { /* ... */ });
```

### 12.2 方舟 API 调用参考

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.VOLCENGINE_API_KEY,
  baseURL: process.env.VOLCENGINE_BASE_URL,
});

const response = await client.chat.completions.create({
  model: process.env.PRO_ENDPOINT_ID,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${base64}` },
        },
      ],
    },
  ],
  max_tokens: 8192,
});

const text = response.choices[0]?.message?.content || '';
const usage = response.usage;
```

### 12.3 容错与重试逻辑

```typescript
async function callWithRetry(
  client: OpenAI,
  model: string,
  base64: string,
  maxRetries = 2
): Promise<{ text: string; usage: any }> {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await callVisionAPI(client, model, base64);
    } catch (err: any) {
      if (attempt <= maxRetries && isRetryable(err)) {
        console.log(`  ⚠️ 第 ${attempt} 次失败 (${err.message})，等待后重试...`);
        await new Promise(r => setTimeout(r, 2000 * attempt)); // 退避
        continue;
      }
      throw err;
    }
  }
  throw new Error('重试耗尽');
}

function isRetryable(err: any): boolean {
  const msg = (err.message || '').toLowerCase();
  const status = err.status || 0;
  // 429 (限流)、5xx (服务端)、网络超时可重试
  return status === 429 || (status >= 500 && status < 600)
    || msg.includes('timeout') || msg.includes('fetch failed');
}
```

---

## 13. 脚本与现有代码的关系

```
vlm-transcribe.ts              vlm-handheld-test.ts（新增）
───────────────────────────    ─────────────────────────────
用途：真题整页转写             用途：手持单拍照片识别测试
输入：doc/research/extracted/  输入：doc/research/vision-samples/handheld/
输出：doc/research/transcripts/ 输出：doc/research/vision-samples/handheld-report.md
Prompt：长系统 prompt（60+行）   Prompt：简短 task prompt（15 行）
输出格式：Markdown（YAML 字段）  输出格式：XML（5 标签）
调用方舟：✅ 相同方式           调用方舟：✅ 相同方式
共享代码：无（独立文件不 import） 共享代码：无（独立文件不 import）
```

两者共享方舟 API 的 OpenAI SDK 调用方式，但 prompt、输出格式、目录完全不同，互不依赖。

---

## 14. 判定说明 — 给孩子看的内容

> 这一节是为外甥女/外甥准备的。execute-agent 会把它生成独立文件 `judgment-guide.md`，可以直接打印出来，让 TA 对着手机/电脑上的照片和结果逐张打分。

```markdown
# 🧐 AI 认题测试 · 你来当裁判！

嗨 XX，帮小姨/小舅一个忙好不好？

我们做了一个 AI，它想学"看照片认题目"——就是你平时拍的那些数学错题照片。
现在拍了 20 张你的题，AI 都看了一遍，它认出来的结果写在那份报告里了。
**需要你来当裁判，看看 AI 认对了没有。**

**很简单，就三步：**

---

## 第一步：看照片

打开手机（或电脑），找到对应的那张照片，自己先看一遍题目长什么样。

## 第二步：看 AI 认出来的

打开报告，看 AI 认出了什么：
- **题面**：AI 写的题目文字对不对？数字、公式、符号有没有看错？
- **答案**：AI 写的答案对不对？
- **分析**：AI 写的解题思路说得在不在理？（不用抠细节，大致方向对就行。如果你自己这道题还不懂，可以空着不评）
- **学科**：AI 说这是哪科（数学／物理／化学……）对不对？
- **知识点**：AI 说这题考什么，比如考的是"解方程"还是"三角公式"？沾不沾边？

## 第三步：打分

每个项目打一个分，写在报告里的评分表上：

| 项目 | 满分 | 怎么打 |
|------|:----:|--------|
| 题面认对了没？ | 5 分 | 5＝完全对，4＝有一两处小错，3＝对了一半，2＝大部分错，1＝基本全错，0=AI说看不清 |
| 答案认对了没？ | 5 分 | 同上 |
| 分析靠不靠谱？ | 5 分 | 5=思路对，4=方向对但有小问题，3=沾边但不准，2=方向偏了，1=完全不沾边，0=没写。<br>**如果这题你自己还不太会，可以空着** |
| 学科说对了没？ | 3 分 | 3=完全对，2=大类对了但细分不对，1=错了，0=没写 |
| 知识点沾边不？ | 3 分 | 3=全说中了，2=说中了大头，1=只沾一点边，0=没写或完全不对 |

**满分 21 分。你觉得 17 分以上就算 AI 表现不错。**

---

📌 **举个例子**

假设照片上是一道题：*"2x + 5 = 13，求 x"*。

AI 认出：
- 题面 → "2x + 5 = 13" ← ✅ 全对，**5 分**
- 答案 → "x = 4" ← ✅ 完全正确，**5 分**
- 分析 → "移项得 2x = 8，两边除以 2……" ← ✅ 思路对，**4 分**（有小瑕疵但不影响）
- 学科 → "数学" ← ✅ 对，**3 分**
- 知识点 → "一元一次方程" ← ✅ 全中，**3 分**

总分：5 + 5 + 4 + 3 + 3 = **20 分 / 21 分** ✅ 不错！

你就照这个思路，20 张题逐张来就行。👇

---

## 注意

- **AI 看错了很正常**，你如实打分就好，不用客气！
- 如果 AI 说"无法识别"（图片太糊看不清），题面和答案就给 0 分
- 打分全靠你的感觉，没有标准答案——**你觉得对就是对，你觉得不对就是不对**
- 弄完了喊一声，就 OK 啦！谢谢帮忙～😊
```

---

## 15. 附：测试执行速查

### 执行步骤（更新版 — 孩子打分流程）

```bash
# 0. 先确认 .env 配置完整
node -e "require('dotenv').config(); ['VOLCENGINE_API_KEY','VOLCENGINE_BASE_URL','PRO_ENDPOINT_ID'].forEach(k => process.env[k] ? console.log(k, '✅') : console.log(k, '❌'))"

# 1. 运行测试脚本（自动生成 AI 输出 + 判定说明）
npx tsx scripts/vlm-handheld-test.ts

# 2. 你过目 judgment-guide.md，改措辞 → 发给孩子

# 3. 孩子打开 handheld-report.md，对照原图逐张打分
#    （Part A 有 AI 输出，Part B 评分表等 TA 填）

# 4. 孩子打分完毕 → 你汇总 → 按阈值决策

# 5. 如果通过 → 记入 DECISIONS.md → 执行 execute-agent 启动 T2
```

---

> 计划产出者：plan-agent
> 等待用户确认后，方可进入 /execute 阶段。
