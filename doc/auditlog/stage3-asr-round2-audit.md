# Stage 3 ASR Round 2 · 审计报告

> 关联计划: [doc/plan/stage3-asr-round2-plan.md](../plan/stage3-asr-round2-plan.md)
> 执行日志: ⚠️ 缺失（计划要求 `doc/executionlog/stage3-asr-round2-log.md`，未创建）
> 审计日期: 2026-07-08
> 审计者: audit-agent (Claude)
> 审计范围: 6 个重点（用户指定），不铺开

---

## 审计结论（大白话）

**总体判定：⚠️ 有条件通过**

代码改动和计划一致，6 个重点中 5 个直接通过，1 个有条件通过（transcript 占位保护）。

本轮改动干净利落：Dockerfile 装了 ffmpeg、feature flag 默认关、MIME 列表合并到单一数据源、前端展示逻辑正确、越界词清零、测试无退化。

唯一需要关注的是 transcript 占位保护的"人 > AI"铁律在 `/process` API 中**从未实现**——代码不检查 `isPlaceholderTranscript` 就直接覆盖 artifact。这是**前序轮遗留问题**，不是本轮引入的，且当前 `editable={false}` 使风险处于潜伏态。但不应遗忘，建议在开启 transcript 编辑功能前修复。

另有 2 个流程问题：执行日志缺失、active_spec 未更新。不阻塞代码合并，但需补齐文档。

**可以等 CI 绿后合 main 部署。** 部署前备份、部署后真机 smoke 不能省。

---

## 检查清单（6 个重点逐条判定）

### 重点 1：ffmpeg 运行时依赖 ✅ 通过

| 检查项 | 结果 | 证据 |
|--------|:----:|------|
| Dockerfile runner 阶段安装 ffmpeg | ✅ | 第 56 行 `apk add --no-cache su-exec openssl ffmpeg` |
| builder 阶段不装 ffmpeg（正确） | ✅ | builder 只装 openssl（第 20 行），build 阶段不执行转码 |
| test container 装 ffmpeg | ✅ | docker-compose.test.yml 第 21 行 `apk add ... ffmpeg` |
| test container 中 `ffmpeg -version` 会执行 | ✅ | 第 22-23 行 `echo '=== 验证 ffmpeg ===' && ffmpeg -version` |
| ffmpeg 安装失败 → CI fail fast | ✅ | `ffmpeg -version` 在 `npm ci` 之前执行，失败则 `sh -c` 退出非零 → `--exit-code-from test` 非 0 → CI 红 |
| Alpine 基础镜像用 `apk`（非 `apt-get`） | ✅ | 全部使用 `apk add --no-cache` |

**结论**：ffmpeg 运行时依赖完整，CI 中会验证安装。通过。

---

### 重点 2：feature flag 默认安全 ✅ 通过

| 检查项 | 结果 | 证据 |
|--------|:----:|------|
| .env.example 占位为 false | ✅ | 第 70 行 `NANA_AUDIO_TRANSCRIPT_ENABLED="false"` + 注释说明 |
| .env.test.example 占位为 false | ✅ | 第 27 行 `NANA_AUDIO_TRANSCRIPT_ENABLED="false"` + 注释说明 |
| 未设 true 时仍 image-only | ✅ | case-analyzer.ts 第 250 行：`=== "true"` 严格比较，不设/设其他值都为 false |
| flag off → 不发送音频 | ✅ | 第 266 行 `if (audioProvided && audioTranscriptEnabled)` 才走音频分支；第 294 行 else if 记日志"跳过" |
| flag off → audioStatus=skipped | ✅ | 第 301 行 `audioSkipped = !sendAudioFormat`，flag off 时 sendAudioFormat=null → audioSkipped=true → 第 444 行 `finalAudioStatus = "skipped"` |
| flag off → 不调 transcodeAudio | ✅ | transcodeAudio 只在第 271 行 else 分支（flag on + 格式不支持）才调用 |

**结论**：feature flag 默认安全，未显式开启时完全 image-only。通过。

---

### 重点 3：transcript 占位保护 ⚠️ 有条件通过

| 检查项 | 结果 | 证据 |
|--------|:----:|------|
| PLACEHOLDER_TRANSCRIPT 常量未被修改 | ✅ | transcript-utils.ts 第 15 行 `"尚未转写"`，值不变 |
| isPlaceholderTranscript 语义未被修改 | ✅ | 第 28-31 行逻辑不变：null→true, trim==="尚未转写"→true, 空字符串→false |
| buildArtifacts 用常量替代硬编码 | ✅ | capture/page.tsx 第 174 行 `content: PLACEHOLDER_TRANSCRIPT`（从 transcript-utils import） |
| AI 成功转写时能覆盖占位 | ✅ | process/route.ts 第 169 行 `if (result.transcript)` → 第 175-178 行 `artifact.update({ data: { content: result.transcript } })` |
| **用户真实文本不会被覆盖** | ⚠️ | **见下方详析** |

#### ⚠️ "人 > AI"铁律未实现（前序轮遗留，非本轮引入）

**产品行为手册 §6.4 铁律**：
> 1. 只有 `isPlaceholderTranscript(content) === true` 时才覆盖
> 2. 空字符串不覆盖（保留占位）
> 3. 非占位不覆盖（人 > AI）

**v3 集成计划 §6.4**：
> 1. **人 > AI**：只有 `isPlaceholderTranscript(content) === true` 时才覆盖

**实际代码**（process/route.ts 第 169-184 行）：
```typescript
if (result.transcript) {
  const existingTranscript = await tx.artifact.findFirst({
    where: { caseId, type: "transcript" },
    select: { id: true },
  });
  if (existingTranscript) {
    await tx.artifact.update({
      where: { id: existingTranscript.id },
      data: { content: result.transcript },  // ← 无 isPlaceholderTranscript 检查
    });
  }
}
```

代码**不检查** `isPlaceholderTranscript(existingTranscript.content)` 就直接覆盖。如果用户编辑过 transcript artifact，重新触发 /process 会覆盖用户文本。

**为什么判定为有条件通过而非不通过**：
1. **不是本轮引入**：process/route.ts 在 v3-revised Round 2 创建，ASR Round 2 计划明确说"不改 /process API"
2. **风险处于潜伏态**：TranscriptionPanel 当前 `editable={false}`（capture/page.tsx 第 456 行），用户无法通过 UI 编辑 transcript artifact
3. **无 `transcriptEdited` 字段**：Prisma schema 中 CaseAiResult 有 `questionSummaryEdited` 和 `textbookTopicEdited`，但没有 `transcriptEdited`，说明 transcript 编辑功能从未设计为已实现
4. **本轮改动未恶化**：buildArtifacts 仍写入 `PLACEHOLDER_TRANSCRIPT`（只是从硬编码改为常量），isPlaceholderTranscript 函数未改动

**建议**：在开启 transcript 编辑功能（`editable={true}`）之前，必须修复 process/route.ts 加入 `isPlaceholderTranscript` 检查。在此之前，潜伏风险可接受。

---

### 重点 4：前端状态语义 ✅ 通过

| 检查项 | 结果 | 证据 |
|--------|:----:|------|
| status=success + audioStatus=failed → 显示题目已整理 + 语音失败提示 | ✅ | ai-result-card.tsx 第 155 行走 SuccessContent；第 80-83 行 audioStatus==="failed" → "语音没转成功，题已经整理好了" |
| 只有 status=failed/timeout 才显示整题失败 | ✅ | 第 149 行 `if (result.status === "failed" \|\| result.status === "timeout")` → FailedState |
| status=success + audioStatus=timeout → 超时提示 | ✅ | 第 84-87 行 "语音转写超时了，题已经整理好了" |
| status=success + audioStatus=skipped → 不展示 transcript 区块 | ✅ | 第 70 行 `result.audioStatus !== "skipped"` 条件过滤 |
| status=success + audioStatus=success + transcript → 展示转写文字 | ✅ | 第 76-79 行 |
| 不出现"已听懂""诊断完成"等越界词 | ✅ | 全文扫描确认（见下表） |

**越界词扫描结果**：

| 越界词 | ai-result-card.tsx | transcription-panel.tsx | voice-recorder.tsx | capture/page.tsx |
|--------|:---:|:---:|:---:|:---:|
| 已听懂 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 |
| 诊断完成 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 |
| 识别出了 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 |
| 语音识别成功 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 |
| 掌握 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 |
| 得分 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 |
| 薄弱 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 |
| 诊断 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 |

> 注：以上词仅在代码注释中作为"禁用词"参考出现，不在用户可见文本中。

**实际用户可见文案清单**（本轮改动涉及的）：

| 组件 | 文案 | 合规 |
|------|------|:----:|
| ai-result-card.tsx | "我说了" | ✅ |
| ai-result-card.tsx | "语音没转成功，题已经整理好了" | ✅ |
| ai-result-card.tsx | "语音转写超时了，题已经整理好了" | ✅ |
| transcription-panel.tsx | "先录一段音" / "整理后会在这里看到你说的话。" | ✅ |
| voice-recorder.tsx | "录音收好了，收题时会自动整理" | ✅ |

**结论**：前端状态语义正确，越界词清零。通过。

---

### 重点 5：MIME 单一数据源 ✅ 通过

| 检查项 | 结果 | 证据 |
|--------|:----:|------|
| case-analyzer.ts 不再维护第二套 MIME 列表 | ✅ | 第 29 行 `import { getAudioApiFormat } from "@/lib/nana/audio-utils"`；第 128 行注释"已迁移到 audio-utils.ts（单一数据源）" |
| case-analyzer.ts 无 MIME_TO_FORMAT / SUPPORTED_AUDIO_FORMATS 定义 | ✅ | grep 确认：无本地定义，只有 import |
| audio-utils.ts 成为唯一权威源 | ✅ | 包含 LITE_NATIVE_MIME_TYPES + SUPPORTED_AUDIO_FORMATS + MIME_TO_FORMAT + getAudioApiFormat + needsTranscode |
| 两套列表一致性 | ✅ | LITE_NATIVE_MIME_TYPES 的 10 个 keys = MIME_TO_FORMAT 的 10 个 keys（完全相同） |
| needsTranscode 与 getAudioApiFormat 逻辑互逆 | ✅ | needsTranscode 返回 false ⟺ getAudioApiFormat 返回非 null（对于已知 MIME） |
| 未偷偷扩大到未实测格式 | ✅ | SUPPORTED_AUDIO_FORMATS = wav/mp3/flac/ogg/m4a/aac（与合并前一致，无新增） |
| asr-transcribe.ts (TD-5 废弃) 有自己副本 | ✅ 不影响 | 标记为废弃，不被任何代码 import，是死代码 |

**结论**：MIME 单一数据源原则落实，行为未扩大。通过。

---

### 重点 6：回归测试 ✅ 通过

| 检查项 | 结果 | 证据 |
|--------|:----:|------|
| npm.cmd run build 通过 | ✅ | 报告：57/57 页面生成成功 |
| npx vitest run src/__tests__/unit/nana 通过 | ✅ | 报告：196/196 通过，无退化 |
| 本地 Docker 未跑 | ✅ 合规 | 本地 Docker Desktop 不可用，测试容器门禁交由 GitHub Actions（项目策略允许） |
| CI 门禁：测试容器在 build-and-push.yml 中 | ✅ | 第 33-44 行：`docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` + `down -v` |
| CI 测试容器中 ffmpeg 可用 | ✅ | docker-compose.test.yml 安装 ffmpeg + `ffmpeg -version` 验证 |
| CI 失败 → 不部署 | ✅ | build-and-push.yml 中 test container 在 docker build/push 之前，失败则不构建镜像 |
| 测试用 test.db 非生产库 | ✅ | .env.test.example `DATABASE_URL="file:/app/data/test.db"`；docker-compose.test.yml 挂载 `./data/test` |
| 无生产容器跑测试 | ✅ | 无 `docker exec wrong-notebook npx vitest` 记录 |

**CI 触发时机说明**：
- `ci.yml`：push to main / PR to main → unit + integration + build + e2e
- `build-and-push.yml`：push to main → build + test container + push GHCR
- **dev push 不触发 CI**——需合 main 或提 PR 才触发
- 流程：dev 合 main → CI 运行 → CI 绿 → 镜像推 GHCR → 服务器 pull 部署

**观察（非阻塞）**：
- 新增的 `getAudioApiFormat` / `MIME_TO_FORMAT` / `SUPPORTED_AUDIO_FORMATS` 无直接单测，但通过 case-analyzer.test.ts 的 m4a/aac/wav 直送测试间接覆盖
- 建议后续补直接单测（不阻塞本轮）

**结论**：回归测试通过，CI 门禁到位。通过。

---

## 问题清单

| 严重度 | 问题 | 所在文件 | 说明 | 建议修复方式 |
|--------|------|----------|------|-------------|
| P2 | "人 > AI"铁律未实现：transcript 覆盖不检查 isPlaceholderTranscript | `src/app/api/nana/cases/[id]/process/route.ts` 第 169-184 行 | **前序轮遗留**，非本轮引入。当前 editable=false 风险潜伏。产品手册 §6.4 列为铁律 | 在开启 transcript 编辑功能前，加入 `isPlaceholderTranscript` 检查 |
| P2 | 执行日志缺失 | `doc/executionlog/stage3-asr-round2-log.md` | 计划 §3 要求新增，实际未创建 | 补写执行日志 |
| P2 | active_spec.md 未更新 | `doc/active_spec.md` | 计划 §3 要求替换为 Round 2 活跃任务，当前仍是旧内容 | 更新 active_spec.md |
| P3 | transcription-panel.tsx 注释陈旧 | `src/components/nana/capture/transcription-panel.tsx` 第 5、14 行 | 仍写"转写稍后接入"，ASR 已接入 | 更新注释 |
| P3 | capture/page.tsx 注释陈旧 | `src/app/nana/capture/page.tsx` 第 461 行 | 仍写"transcript 恒为'尚未转写'"，实际已改为动态值 | 更新注释 |
| P3 | 新增 MIME 导出无直接单测 | `src/__tests__/unit/nana/audio-utils.test.ts` | getAudioApiFormat 等通过 case-analyzer 间接覆盖，无直接测试 | 后续补直接单测 |

---

## Agent 同步一致性

- `node scripts/check-agent-sync.js` → exit 0，3/3 agents in sync ✅

---

## 用户验证指南

### 本地验证（已由执行者完成）
1. `npm.cmd run build` → 57/57 页面生成 ✅
2. `npx vitest run src/__tests__/unit/nana` → 196/196 通过 ✅

### CI 验证（待执行）
1. dev 合 main → push origin main
2. 等 GitHub Actions `ci.yml` 绿色（unit + integration + build + e2e）
3. 等 GitHub Actions `build-and-push.yml` 绿色（build + test container + push GHCR）
4. CI 中测试容器 `ffmpeg -version` 执行成功

### 生产验证（部署后）
1. 服务器 .env 设 `NANA_AUDIO_TRANSCRIPT_ENABLED=true`
2. 备份生产 SQLite（`bash scripts/deploy.sh` 内置备份）
3. 手机访问 nana.nanatop.xyz/nana
4. 拍题 + 录音 → 点"收好这道题" → 等 AI 整理
5. AI 结果卡中验证：
   - 图片整理结果正常（摘要/分类/反馈/下一步建议）
   - transcript 区块显示转写文字（audioStatus=success）
   - 或语音失败时显示"语音没转成功，题已经整理好了"（audioStatus=failed）
6. transcript tab 展示转写后的文字
7. 题目汇总页能看到新题

### 降级验证（如转写质量不达标）
1. 服务器 .env 设 `NANA_AUDIO_TRANSCRIPT_ENABLED=false`
2. `docker compose -f docker-compose.prod.yml restart`
3. 回到 image-only，录音仅保存不转写

---

## 部署审计补充

| 检查项 | 结果 |
|--------|:----:|
| 本轮不涉及直接部署（代码在 dev，待合 main） | ✅ |
| 本地生产构建已通过 | ✅ |
| CI 测试容器门禁待执行（dev 合 main 后触发） | ⏳ |
| 部署镜像将来自 GitHub Actions（不来自本地 Docker） | ✅ |
| 部署前须备份 SQLite | ⏳ 待执行 |
| .env 未入 git | ✅ |
| 回滚方案可执行（flag 秒退 / 镜像回退 / git revert） | ✅ |

---

> 审计完成。总体判定 ⚠️ 有条件通过。建议补齐执行日志和 active_spec 后，等 CI 绿合 main 部署。
