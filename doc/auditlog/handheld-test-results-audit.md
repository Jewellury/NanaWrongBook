# 手持拍照 VLM 先验测试 · 审计报告

> 关联计划: doc/plan/vlm-handheld-test-plan.md + doc/plan/volcengine-vision-integration-plan.md
> 审计范围:
>   - 验收报告: doc/research/vision-samples/handheld-report.md
>   - 测试脚本: scripts/vlm-handheld-test.ts
>   - 接入计划 §6.8: doc/plan/volcengine-vision-integration-plan.md
> 审计日期: 2026-06-20

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

### 三个审计对象的整体评价：

**① 验收报告（handheld-report.md）✅ 没问题**
20 张图片全部记录在案，每张都有完整的 XML 结构化输出（题面/答案/分析/学科/知识点），格式正确。Part C 的统计数据经过逐项核对，总图片数 20、有效响应 20、失败 0、总 tokens 74057、费用 ¥0.7838——全都算对了。孩子打分区域已留空，等待外甥女/外甥打分。

**② 测试脚本（vlm-handheld-test.ts）⚠️ 有两个小问题**
代码质量整体不错：自动旋转横图的逻辑正确、超时释放干净、单张失败不影响整体、XML 解析先 strip markdown fence 再正则提取。但没有发现执行日志（doc/executionlog/），这虽然不影响测试结果本身，但不符合三代理框架的移交规范。另外 prompt 里有处自相矛盾的表述（"只做识别提取不做解题" vs 要求输出"解题思路简要分析"），虽然没有影响实际测试结果（AI 还是正常输出了分析），但建议修改措辞。

**③ 接入计划 §6.8 自动旋转规格 ✅ 没问题**
计划和实现完全一致——都是 sharp 旋转 + JPEG quality 90 + 不修改原始文件。发现背景和实测数据都已记录在案（横拍 1919×1080 超时→旋转后 20/20 通过）。§6.5 和 §6.8 的代码签名稍有出入（一个用 base64 字符串、一个用 Buffer），但核心逻辑相同，不影响理解和实现。

**安全方面：** 脚本通过 `.env` 读密钥，没有硬编码。图片未入 git。agent 同步一致性检查通过。

**整体结论：** 可以直接用这份报告启动孩子打分流程。建议在下轮 execute 前把 prompt 措辞修正一下，执行日志也补上。

---

## 检查清单

### 计划一致性
- [x] ✅ 实现了计划中所有任务（T1 先验测试脚本 + 验收报告已产出）
- [x] ✅ 未偏离计划（测试脚本设计、prompt、报告格式均与 vlm-handheld-test-plan.md 一致）
- [x] ✅ 与 volcengine-vision-integration-plan.md §6.8 的自动旋转规格一致

### 代码质量
- [x] ✅ 无明显 bug
- [x] ✅ 错误处理到位（重试退避、超时控制、单张失败跳过）
- [x] ⚠️ 代码风格一致，但 prompt 中有语义矛盾（详见问题清单 #1）

### 安全性
- [x] ✅ 无密钥泄露（API Key 从 `process.env` 读，脱敏打印）
- [x] ✅ 无 SQL 注入风险（不操作数据库）
- [x] ✅ 用户输入有校验（文件存在性检查、最小尺寸检查）
- [x] ✅ 不涉及数据库写入（测试脚本仅生成 Markdown 报告）

### 偏离复核
- [ ] 不适用（本轮为 T1 先验测试，未涉及执行日志中的偏离记录）

### 上游兼容性
- [x] ✅ 未修改任何上游文件（脚本完全独立、报告完全独立）
- [x] ✅ 未修改数据库表结构
- [x] ✅ 所有新增在独立目录中

### Agent 同步一致性
- [x] ✅ `node scripts/check-agent-sync.js` 通过（exit 0，3/3 agents in sync）

### 测试
- [ ] ⚠️ 无相关自动化测试（`vlm-handheld-test.ts` 是一次性测试脚本，不是单元测试；volcengine-vision.ts 尚未实现）
- [ ] ⚠️ DB 护栏检查不适用（脚本不操作数据库）
- [ ] ⚠️ 手动验证步骤见下方"用户验证指南"

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 建议修复方式 |
|--------|------|----------|-------------|
| **P2** | **Prompt 语义矛盾：要求4说 "只做识别提取，不做解题"，但 XML 模板要求输出 `<analysis>解题思路简要分析</analysis>`。这自相矛盾——"解题思路分析"本质上就是解题行为。** 实际运行中 AI 选择了忽略"不做解题"（20/20 全部输出了分析内容），但这套措辞对 AI 行为不一致，建议统一。 | `scripts/vlm-handheld-test.ts:44-61`（PROMPT 常量） | 删掉第 49 行"只做识别提取，不做解题"，改为"如需解题分析请简要说明思路"。或者保留"不做解题"但删掉 `<analysis>` 标签要求。二者只能选一个。 |
| **P3** | **发现执行日志缺失**：按三代理框架规范，测试执行后应在 `doc/executionlog/` 生成对应的执行日志。当前测试没有对应的执行日志文件。虽然测试脚本已成功运行且生成了报告，但移交规范上少了一步。 | 缺少 `doc/executionlog/volcengine-vision-log.md` | 补充一份简要的执行日志，记录脚本运行时间、指令、关键输出和偏离情况（如有）。 |
| **P3** | **Plan 文档 §6.5 与 §6.8 的 `ensurePortrait` 签名不一致**：§6.5 是 `(base64: string) => Promise<string>`，§6.8 是 `(imageBuffer: Buffer) => Promise<Buffer>`。核心逻辑相同（都是 sharp rotate 90 + JPEG q90），但接口设计有出入，开发者对照参考时可能困惑。 | `doc/plan/volcengine-vision-integration-plan.md` §6.5 vs §6.8 | 统一两段的函数签名。建议以 §6.5 为准（base64-in → base64-out，因为调用方传入的就是 base64 字符串），§6.8 对齐到同一签名。 |
| **P3** | **AI 持续忽略"不要加 markdown 代码块包裹"指令**：`extractXMLTags` 正确 strip 了 fence 所以功能正常，但 20/20 张的 AI 输出都用了 ````xml` 包裹，说明 prompt 措辞对模型约束力不够。不影响测试结果，但如果希望输出不包裹，需加强措辞（如加粗强调或放末尾再次提醒）。 | `scripts/vlm-handheld-test.ts` PROMPT（行 53） | 非必修复。如果希望减少 fencing，可以改为 "**重要：不要在 XML 外层加任何 markdown 代码块（\`\`\`）包裹**"。当前 strip 逻辑已兜底，不修也没问题。 |

---

## 详细审查记录

### 审查项 1：验收报告 Part A（AI 输出完整性）

**方法**：逐张核对 20 张图片记录，确认 XML 标签完整、格式正确。

| 图片 | question_text | answer_text | analysis | subject | knowledge_points | 判定 |
|:----:|:-------------:|:-----------:|:--------:|:-------:|:----------------:|:----:|
| 01 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 02 | ✅ | ✅ 内容为"无法识别" | ✅ 内容为"无法识别" | ✅ | ✅ | ✅ 通过 |
| 03 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 04 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 05 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 06 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 07 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 08 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 09 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 10 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 11 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 12 | ✅ | ✅ 标签存在但内容为空 | ✅ 标签存在但内容为空 | ✅ | ✅ | ✅ 通过（空内容也是有效输出） |
| 13 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 14 | ✅ | ✅ | ✅ 标签存在但内容为空 | ✅ | ✅ | ✅ 通过（选择题无分析合理） |
| 15 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 16 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 17 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 18 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 19 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 通过 |
| 20 | ✅ | ✅ | ✅ 标签存在但内容为空 | ✅ | ✅ | ✅ 通过（选择题无分析合理） |

**结论：** 20/20 全部通过 ✅

### 审查项 2：验收报告 Part C（统计准确性）

逐项验证数值：

| 报告字段 | 报告值 | 验算结果 |
|----------|:------:|:--------:|
| 总图片数 | 20 | ✅ 20 张记录 |
| 有效响应数 | 20 | ✅ 全部 success |
| 失败数 | 0 | ✅ 无失败 |
| 总 prompt tokens | 31340 | ✅ 20 × 1567 = 31340 |
| 总 completion tokens | 42717 | ✅ 逐项求和 42717 |
| 总 tokens | 74057 | ✅ 31340 + 42717 = 74057 |
| 平均 tokens/图 | 3703 | ✅ 74057 / 20 = 3702.85 ≈ 3703 |
| 估算费用 | ¥0.7838 | ✅ 31340/1e6×3.2 + 42717/1e6×16 = 0.100288 + 0.683472 = 0.78376 ≈ 0.7838 |

**结论：** 所有统计数据准确 ✅

### 审查项 3：测试脚本 — 自动旋转逻辑

```ts
// imageToBase64 (scripts/vlm-handheld-test.ts:141-151)
const img = sharp(filePath);
const metadata = await img.metadata();
if (metadata.width && metadata.height && metadata.width > metadata.height) {
  const rotated = await img.rotate(90).jpeg({ quality: 90 }).toBuffer();
  return rotated.toString('base64');
}
```

| 检查点 | 结果 |
|--------|:----:|
| 横图（宽>高）→ 旋转 90° | ✅ `rotate(90)` |
| 旋转后 JPEG quality 90 | ✅ `.jpeg({ quality: 90 })` |
| 竖图不旋转 | ✅ 走 `fs.readFileSync` 直接返回原始 base64 |
| 不修改原始文件 | ✅ 旋转结果只在内存，不写盘 |
| 与 §6.8 规格一致 | ✅ sharp → 检查宽高 → rotate(90) → JPEG(Q90) |

### 审查项 4：测试脚本 — AbortController 超时

```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 120000);
const response = await client.chat.completions.create(..., { signal: controller.signal });
clearTimeout(timeoutId);
```

| 检查点 | 结果 |
|--------|:----:|
| 超时后正确 abort | ✅ `controller.abort()` in timeout callback |
| 正常完成时 clearTimeout 释放 | ✅ `clearTimeout(timeoutId)` 紧跟 await 之后 |
| 超时导致抛异常 → 被外层 catch 捕获 | ✅ try-catch 捕获后走重试或记录失败 |
| **竞态问题**：clearTimeout 在 await 之后才执行 | ✅ JavaScript 事件循环保证——await 完成后的微任务中 `clearTimeout` 先于已到期的 timeout 回调执行，无竞态 |

### 审查项 5：测试脚本 — 单张失败跳过

```ts
for (let i = 0; i < files.length; i++) {
  // ... 文件存在性检查
  try {
    // 读取 → 调用 → 解析
  } catch (err: unknown) {
    // 记录失败
    // continue 到下一张
  }
}
```

- 每张图片独立 try-catch ✅
- 失败时记录 `success: false` + error 信息到 results 数组 ✅
- 循环不中断 ✅

### 审查项 6：测试脚本 — XML 解析

```ts
function extractXMLTags(raw: string): ExtractedFields | null {
  let cleaned = raw.trim();
  // Step 1: Strip markdown fence
  const fenceMatch = cleaned.match(/^```(?:xml)?\s*\n?([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  // Step 2: Extract <result>...</result>
  const resultMatch = cleaned.match(/<result>([\s\S]*?)<\/result>/);
  // Step 3: Extract individual tags
  // ...
}
```

| 检查点 | 结果 |
|--------|:----:|
| 先 strip markdown fence 再正则 | ✅ 正确顺序 |
| 同时支持 ` ```xml ` 和 ` ``` ` | ✅ 正则 `^```(?:xml)?\s*\n?` |
| 标签提取兜底：空字符串 | ✅ `extractTag` 返回 `''`（空串）当匹配不到 |
| 至少一个核心字段非空判定 | ✅ 检查 `!questionText && !answerText && !analysis` |

### 审查项 7：接入计划 §6.8 自动旋转规格

| 规格要求 | §6.8 内容 | 判定 |
|----------|-----------|:----:|
| 旋转逻辑 | `sharp → metadata → width>height → rotate(90)` | ✅ |
| 编码质量 | `jpeg({ quality: 90 })` | ✅ |
| 不修改原始文件 | 明确写"仅在发送给 VLM 前旋转，**不修改原始文件**" | ✅ |
| 发现背景 | 记录横拍 1919×1080 超时、旋转后 20/20 全过 | ✅ |
| sharp 依赖 | 已确认是项目依赖（test:all 已验证） | ✅ |
| 与测试脚本实现一致 | 核心逻辑一致（sharp → 检查宽高 → rotate → jpeg） | ✅ |

---

## 用户验证指南

当前阶段不需要启动应用验证。以下是在让孩子打分前的确认步骤：

### 测试脚本运行确认
1. 确认脚本无报错退出（exit 0，控制台输出 `✅ 测试完成。请让孩子对照原图逐张打分后填写 Part B。`）
2. 确认 `doc/research/vision-samples/handheld-report.md` 已生成，Part A 有 20 张记录、Part C 统计已自动计算
3. 如有需要补执行日志，可运行：
   ```bash
   # 查看 git 中报告是否已提交
   git status doc/research/vision-samples/handheld-report.md
   ```

### 孩子打分流程验证
1. 打印或展示 `handheld-report.md` 给外甥女/外甥
2. 对照原图（在手机/电脑相册中），逐张判断 AI 输出是否正确
3. 填写 Part B 评分表（每张 5 个维度：题面/答案/分析/学科/知识点）
4. 填完后计算平均分，按阈值决策（≥80% 通过 → 进 T2；60-80% 暂停；<60% 不通过）
5. 决策结果记入 `doc/DECISIONS.md`

### 关于 prompt 修正（下轮执行前建议）
如果决定修改 prompt 措辞，可以在下轮 execute 前修复问题清单 #1（删掉"不做解题"或统一语义），不影响孩子先打分。

---

## 附录

### A. Part C 完成度 tokens 逐项验算

| 图片 | prompt | completion | 验算 |
|:----:|:------:|:----------:|:----:|
| 01 | 1567 | 1824 | 3391 ✅ |
| 02 | 1567 | 1767 | 3334 ✅ |
| 03 | 1567 | 1709 | 3276 ✅ |
| 04 | 1567 | 1508 | 3075 ✅ |
| 05 | 1567 | 2226 | 3793 ✅ |
| 06 | 1567 | 1521 | 3088 ✅ |
| 07 | 1567 | 2492 | 4059 ✅ |
| 08 | 1567 | 2321 | 3888 ✅ |
| 09 | 1567 | 2782 | 4349 ✅ |
| 10 | 1567 | 2190 | 3757 ✅ |
| 11 | 1567 | 2838 | 4405 ✅ |
| 12 | 1567 | 1022 | 2589 ✅ |
| 13 | 1567 | 3580 | 5147 ✅ |
| 14 | 1567 | 1162 | 2729 ✅ |
| 15 | 1567 | 2347 | 3914 ✅ |
| 16 | 1567 | 1991 | 3558 ✅ |
| 17 | 1567 | 2280 | 3847 ✅ |
| 18 | 1567 | 1311 | 2878 ✅ |
| 19 | 1567 | 4172 | 5739 ✅ |
| 20 | 1567 | 1674 | 3241 ✅ |
| **合计** | **31340** | **42717** | **74057** ✅ |

费用验算：
- 输入：31340 / 1_000_000 × 3.2 = ¥0.100288
- 输出：42717 / 1_000_000 × 16 = ¥0.683472
- 总计：¥0.78376 → 报告值 ¥0.7838 ✅

### B. 脚本代码行关键注释（供参考）

```
scripts/vlm-handheld-test.ts
├── 1-20:  头注释 + import
├── 22-36: 配置常量（IRL 图片目录、输出路径、重试参数）
├── 38-42: 定价常量（input ¥3.2, output ¥16 / 百万 tokens）
├── 44-61: PROMPT（含问题清单 #1 所述语义矛盾）
├── 63-96: 类型定义
├── 102-138: 辅助函数（printHelp, scanImages）
├── 141-151: imageToBase64（自动旋转逻辑 ✅）
├── 154-166: isRetryable
├── 169-217: callWithRetry（AbortController 超时 ✅）
├── 220-248: extractXMLTags（strip fence → 正则提取 ✅）
├── 250-367: 报告生成
├── 372-564: main 主函数（env 检查 ✅ → 逐张处理 ✅ → 汇总 → 写报告）
```

### C. 安全确认

- `git status` 确认 `.env` 未被 tracking ✅（预期）
- 无硬编码 API Key ✅
- 图片目录在 `.gitignore` 中 ✅
- 不修改任何上游文件 ✅
