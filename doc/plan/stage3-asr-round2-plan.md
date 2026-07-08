# Stage 3 Round 2 — ASR 生产化 · 开发计划

> 关联规格: doc/plan/stage3-audio-transcript-plan.md（ASR 总方案，Round 0/1 已完成）
> 计划日期: 2026-07-08（修订 r1: 评审 P1-a/P1-b/P2 反馈合入）
> 计划者: plan-agent
> 预计影响: Dockerfile、.env.example、src/components/nana/capture/、src/lib/nana/、src/app/nana/capture/page.tsx
> 前置: Round 1 已完成（commit 4a21ada），后端 audio_meta 解析 + ffmpeg 转码 + case-analyzer 集成 + 87/87 单元测试通过，P2 前置修复已合入

---

## 1. 大白话概述

这轮要把语音转写从"后端代码写好了但生产没开"变成"生产环境真正能用、用户能看到转写文字"。

具体做五件事：
1. **Docker 镜像装 ffmpeg** — 现在镜像是 alpine 精简版，没有 ffmpeg，转码模块跑不起来
2. **生产环境打开转写开关** — 加环境变量 `NANA_AUDIO_TRANSCRIPT_ENABLED=true`，现在默认是关的
3. **前端展示转写文字和音频状态** — AI 结果卡里加一块"我说了"展示转写文本；录音完成态文案从"转写稍后接入"改成诚实但不过度承诺的措辞
4. **端到端真实验证** — 部署后用真实手机拍题+录音，看 transcript 质量
5. **合并两份重复的 MIME 列表** — case-analyzer.ts 和 audio-utils.ts 各有一份，合成一份

---

## 2. 任务分解

### 任务 1：Dockerfile 加 ffmpeg 运行时依赖（涉及文件: Dockerfile、docker-compose.test.yml）

**基础镜像确认**（评审 P1-b）：Dockerfile 第 1 行 `FROM node:22-alpine AS base`，所有阶段均基于 Alpine。Alpine 用 `apk add --no-cache ffmpeg`，**不是** `apt-get`。

- [ ] 在 Dockerfile runner 阶段 `apk add --no-cache` 行加 `ffmpeg`（确认基础镜像为 Alpine → 用 `apk`）
- [ ] builder 阶段**不需要**加 ffmpeg（build 阶段不执行转码）
- [ ] docker-compose.test.yml 测试容器镜像 `node:22-alpine` 也需装 ffmpeg（CI 中跑转码相关测试时需要）
- [ ] **CI 验证**：测试容器启动后执行 `ffmpeg -version` 确认安装成功（评审 P1-b）
- [ ] 验证：CI 构建通过，镜像体积增幅可接受（alpine ffmpeg ≈ 30-50MB）

### 任务 2：.env.example 补 NANA_AUDIO_TRANSCRIPT_ENABLED 占位（涉及文件: .env.example、.env.test.example）

- [ ] .env.example 加 `NANA_AUDIO_TRANSCRIPT_ENABLED="false"` 占位 + 注释说明
- [ ] .env.test.example 加 `NANA_AUDIO_TRANSCRIPT_ENABLED="false"` 占位

**规则**：默认 false，生产环境显式设为 true 才开启。

### 任务 3：P3 合并两份 MIME 列表（涉及文件: src/lib/nana/audio-utils.ts、src/lib/nana/case-analyzer.ts）

- [ ] 在 `audio-utils.ts` 中新增 `MIME_TO_FORMAT` 映射表（从 case-analyzer.ts 迁移）
- [ ] 导出 `getAudioApiFormat(mime: string): string | null` 函数（从 case-analyzer.ts 迁移）
- [ ] 导出 `SUPPORTED_AUDIO_FORMATS` Set（从 case-analyzer.ts 迁移）
- [ ] `case-analyzer.ts` 删除本地 `MIME_TO_FORMAT`、`SUPPORTED_AUDIO_FORMATS`、`getAudioApiFormat`，改为从 `audio-utils.ts` import
- [ ] 验证 `needsTranscode` 与 `getAudioApiFormat` 逻辑一致（`needsTranscode` 返回 true 的格式 = `getAudioApiFormat` 返回 null 的格式 + 未知 MIME）

**单一数据源原则**：`audio-utils.ts` 成为 MIME 类型和格式映射的唯一权威源。`case-analyzer.ts` 只消费，不维护。

### 任务 4：前端 ai-result-card.tsx 展示 transcript + audioStatus（涉及文件: src/components/nana/capture/ai-result-card.tsx）

- [ ] 在 `SuccessContent` 组件中，questionSummary 之后新增 transcript 展示区块
- [ ] 展示规则：

| audioStatus | 展示 |
|------|------|
| `success` + 有 transcript | 显示转写文本，标签"我说了" |
| `skipped` | 显示"这段语音已保存，暂时还没转成文字" |
| `failed` | 显示"语音没转成功，题已经整理好了" |
| `timeout` | 显示"语音转写超时了，题已经整理好了" |
| 无音频（audioStatus 为空或 null） | 不展示区块 |

- [ ] 措辞合规：禁用"已听懂""诊断完成""语音识别成功"

### 任务 5：前端 capture/page.tsx transcript tab 整理后展示（涉及文件: src/app/nana/capture/page.tsx）

- [ ] transcript tab 当前硬编码 `<TranscriptionPanel text="尚未转写" onChange={() => {}} />`
- [ ] 改为：AI 整理成功后，用 `processResult.transcript` 作为 text 传入 TranscriptionPanel
- [ ] 整理前/无录音时显示引导文案（如"先录一段音，整理后会在这里看到你说的话"）
- [ ] **buildArtifacts() 占位文本不改**（评审 P1-a 修订）：保留 `PLACEHOLDER_TRANSCRIPT`（"尚未转写"）作为 transcript artifact content
  - `transcript-utils.ts` 的 `isPlaceholderTranscript()` 显式判断 `isPlaceholderTranscript('')` 返回 `false`（空字符串不被视为占位）
  - 如果改为空字符串，`isPlaceholderTranscript` 会返回 false → 被当作"用户已编辑内容" → 阻断 AI 覆写（破坏"人 > AI"保护设计）
  - **正确做法**：内部保留占位 `PLACEHOLDER_TRANSCRIPT`，前端通过 `processResult.transcript`（API 返回 null 或真实转写）展示，不直接读 Artifact 占位文本
  - buildArtifacts 改为用 `PLACEHOLDER_TRANSCRIPT` 常量（从 `transcript-utils.ts` import）替代硬编码字符串

### 任务 6：前端 voice-recorder.tsx 更新完成态文案（涉及文件: src/components/nana/capture/voice-recorder.tsx）

- [ ] 完成态（第 390-392 行）当前显示"录音收好了，转写稍后接入"
- [ ] 改为"录音收好了"（去掉"转写稍后接入"——因为转写现在会自动进行）
- [ ] 副标题"已录音 {elapsed} 秒"保持不变

**措辞原则**：不过度承诺"马上转成文字"，但也不再说"稍后接入"（因为已经接入了）。保持朴素。

### 任务 7：本地构建验证

- [ ] `npm.cmd run build` 通过
- [ ] 相关窄范围单元测试可跑则跑（`npx vitest run src/__tests__/unit/nana/`）
- [ ] `git status` 干净

### 任务 8：CI 门禁

- [ ] dev push → GitHub Actions CI 绿色（build + test container + push GHCR）
- [ ] CI 中 docker-compose.test.yml 测试容器需确认 ffmpeg 可用（任务 1 已在 test image 中安装）

### 任务 9：dev 合 main + 部署

- [ ] dev 合 main → push origin main
- [ ] 等 CI 绿色
- [ **服务器操作**（由用户执行或确认后执行）]：
  - 备份生产 SQLite（`bash scripts/deploy.sh` 内置备份步骤）
  - 服务器 .env 加 `NANA_AUDIO_TRANSCRIPT_ENABLED=true`
  - `bash scripts/deploy.sh` 部署
  - 部署后只读验证：KnowledgeNode ≥ 48、KnowledgeEdge ≥ 36、TextbookTopic = 16、TextbookNodeMapping = 48（已有 entrypoint 自动 seed）

### 任务 10：真机 smoke test 端到端验证

- [ ] 手机访问 nana.nanatop.xyz/nana
- [ ] 拍一道数学题 + 录音（口述解题思路，15-30 秒）
- [ ] 点"收好这道题" → 等 AI 整理（30-60 秒）
- [ ] 验证 AI 结果卡中：
  - 图片整理结果正常（摘要/分类/反馈/下一步建议）
  - transcript 区块显示转写文字（audioStatus=success）
  - 或转写失败时显示"语音没转成功，题已经整理好了"（audioStatus=failed）
- [ ] 验证 transcript tab 展示转写后的文字
- [ ] 验证题目汇总页能看到新题

**语音质量评估标准**：
- transcript 与录音内容语义一致（不要求逐字精确，但不能是乱码/空字符串）
- 转写不影响图片整理（图片结果正常返回）
- 如质量不达标：服务器 .env 设 `NANA_AUDIO_TRANSCRIPT_ENABLED=false` 秒退 image-only

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `Dockerfile` | 修改 | runner 阶段 `apk add` 加 `ffmpeg` |
| `docker-compose.test.yml` | 修改 | 测试容器装 ffmpeg（CI 中转码测试需要） |
| `.env.example` | 修改 | 加 `NANA_AUDIO_TRANSCRIPT_ENABLED="false"` 占位 |
| `.env.test.example` | 修改 | 加 `NANA_AUDIO_TRANSCRIPT_ENABLED="false"` 占位 |
| `src/lib/nana/audio-utils.ts` | 修改 | 新增 `MIME_TO_FORMAT` + `getAudioApiFormat` + `SUPPORTED_AUDIO_FORMATS`（从 case-analyzer 迁移） |
| `src/lib/nana/case-analyzer.ts` | 修改 | 删除本地 MIME 列表，改为从 audio-utils import |
| `src/components/nana/capture/ai-result-card.tsx` | 修改 | 新增 transcript + audioStatus 展示区块 |
| `src/app/nana/capture/page.tsx` | 修改 | transcript tab 用 processResult.transcript；buildArtifacts 用 PLACEHOLDER_TRANSCRIPT 常量替代硬编码 |
| `src/components/nana/capture/voice-recorder.tsx` | 修改 | 完成态文案去掉"转写稍后接入" |
| `doc/active_spec.md` | 修改 | 替换为 Round 2 活跃任务 |
| `doc/executionlog/stage3-asr-round2-log.md` | 新增 | 执行日志 |

---

## 4. 验收标准

### 本地验证
- [ ] `npm.cmd run build` 通过
- [ ] 单元测试 `src/__tests__/unit/nana/` 通过（87/87 不退化）
- [ ] `git status` 干净

### CI 验证
- [ ] GitHub Actions ci.yml 绿色
- [ ] GitHub Actions build-and-push.yml 绿色（含测试容器门禁）
- [ ] CI 测试容器中 `ffmpeg -version` 可执行（评审 P1-b）

### 生产验证
- [ ] 服务器容器正常运行
- [ ] 手机能访问 nana.nanatop.xyz/nana
- [ ] 拍题+录音 → AI 整理结果卡正常显示
- [ ] transcript 区块按 audioStatus 展示对应内容
- [ ] 图片整理不受语音影响（语音失败图片仍正常）
- [ ] 题目汇总页能看到新题

### 整体成功但音频失败场景（评审 P2）
> 关键验收点：`status=success` + `audioStatus=failed` 时，前端必须同时展示图片整理成功内容和音频失败提示。

- [ ] AiResultCard 走 SuccessContent 分支（status=success）→ 展示 questionSummary / textbookTopic / feedback / nextActionSuggestion
- [ ] 同一张卡片中 transcript 区块显示"语音没转成功，题已经整理好了"（audioStatus=failed）
- [ ] 不走 FailedState 分支（整体不是 failed，只是音频失败）
- [ ] 不阻塞用户操作（"再拍一道" / "去知识地图" 按钮正常可用）
- [ ] 真机验证：录音但 Lite 返回空 transcript 时应触发此场景（audioStatus=failed）

### 降级验证（如需）
- [ ] 服务器 .env 设 `NANA_AUDIO_TRANSCRIPT_ENABLED=false` → 重启 → 回到 image-only

---

## 5. 风险与注意事项

| 风险 | 概率 | 影响 | 缓解 |
|------|:--:|:--:|------|
| alpine ffmpeg 包体积大 | 低 | 镜像 +30-50MB | 可接受，ASR 生产化必须依赖 |
| CI 测试容器无 ffmpeg | 中 | 转码相关测试失败 | docker-compose.test.yml 装 ffmpeg |
| 转写质量差 | 中 | transcript 不可用 | feature flag 秒退 image-only |
| Lite API 超时（图片+音频一体化调用比纯图片慢） | 中 | audioStatus=timeout | 60s 超时已有，前端显示"超时了" |
| P3 合并后 case-analyzer import 路径变化 | 低 | 构建失败 | 本地 build 验证 |
| transcript tab 展示逻辑与 AI 结果卡重复 | 低 | 信息冗余 | 两个位置展示同一 transcript 是合理的（tab 是专注视图，结果卡是概览） |

### 注意事项
1. **不改 voice-recorder.tsx 录音逻辑** — pickMimeType、MediaRecorder、onstop 等全部保持不变，只改完成态展示文案
2. **不改 /process API** — 后端 Round 1 已完整实现 transcript/audioStatus 持久化和返回，本轮不改后端 API
3. **不改 Prisma schema** — CaseAiResult.transcript 和 audioStatus 字段已存在
4. **buildArtifacts 占位文本不改**（评审 P1-a 修订）— 保留 `PLACEHOLDER_TRANSCRIPT`（"尚未转写"）作为 transcript artifact content。`isPlaceholderTranscript('')` 返回 false，改为空字符串会破坏"人 > AI"覆盖保护设计。前端通过 `processResult.transcript`（API 返回 null 或真实转写）展示，不直接读 Artifact 占位

---

## 6. 部署计划

### 部署目标分支
- 目标：`main`（稳定版本）
- 开发在 `dev`，验证通过后合 main

### 构建验证命令
- `npm.cmd run build`（本地生产构建）
- CI 中 `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test`

### 本地 Docker 是否必需
- **不必需**。本地 Docker Desktop 不稳定，不作为部署前置。测试容器门禁交由 GitHub Actions。

### CI 测试容器门禁
- GitHub Actions 中必须运行 `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` + `down -v`
- CI 失败 → 不得部署

### 生产环境变量清单
服务器 `/opt/nana/.env` 需包含：
```
VOLCENGINE_API_KEY=<已有>
VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
LITE_ENDPOINT_ID=<已有>
NANA_AUDIO_TRANSCRIPT_ENABLED=true   ← 本轮新增
```

### 数据备份方案
- `bash scripts/deploy.sh` 内置备份步骤（备份到 `/opt/nana/backups/`）
- 备份失败不得继续部署

### 回滚方案
1. **秒退（推荐）**：服务器 .env 设 `NANA_AUDIO_TRANSCRIPT_ENABLED=false` → `docker compose -f docker-compose.prod.yml restart` → 回到 image-only
2. **镜像回退**：`docker compose -f docker-compose.prod.yml pull` 指定旧 sha tag
3. **代码回退**：`git revert` 本轮 commit → 重新 CI → 部署

### 外部状态变更清单
- 服务器 `/opt/nana/.env` 新增 `NANA_AUDIO_TRANSCRIPT_ENABLED=true`
- 无 DNS/Caddy/证书/防火墙变更

### 失败停止条件
- 本地 build 失败 → 停，修代码
- CI 失败 → 停，修代码
- 部署后容器异常 → 回滚镜像
- 真机验证图片整理失败 → 回滚镜像（语音失败不回滚，只关 flag）

---

## 7. 技术附录

### 7.1 Dockerfile 改动细节

**基础镜像确认**（评审 P1-b）：`FROM node:22-alpine AS base`（第 1 行），所有阶段基于 Alpine → 使用 `apk add --no-cache ffmpeg`，**不使用** `apt-get`。

**当前**（runner 阶段第 56 行）：
```dockerfile
RUN apk add --no-cache su-exec openssl \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
```

**改为**：
```dockerfile
RUN apk add --no-cache su-exec openssl ffmpeg \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
```

**CI 验证 ffmpeg 可用**（评审 P1-b）：docker-compose.test.yml 的 command 中加 `ffmpeg -version` 前置检查：
```yaml
command: >
  sh -c "apk add --no-cache openssl sqlite ffmpeg &&
         ffmpeg -version &&
         npx prisma generate &&
         ..."
```

### 7.2 docker-compose.test.yml 改动细节

**当前**：
```yaml
services:
  test:
    image: node:22-alpine
    ...
    command: >
      sh -c "apk add --no-cache openssl sqlite &&
             npx prisma generate &&
             ...
```

**改为**（在 apk add 行加 ffmpeg）：
```yaml
    command: >
      sh -c "apk add --no-cache openssl sqlite ffmpeg &&
             npx prisma generate &&
             ...
```

### 7.3 P3 MIME 列表合并方案

**audio-utils.ts 新增导出**：
```ts
/** 豆包 Lite input_audio.format 支持的格式标签 */
export const SUPPORTED_AUDIO_FORMATS = new Set([
  "wav", "mp3", "flac", "ogg", "m4a", "aac",
]);

/** MIME → 豆包 format 标签映射 */
export const MIME_TO_FORMAT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  // webm 和 mp4 不映射（Lite 不支持，需转码）
};

/** 获取豆包支持的 format 标签。不支持的 mime 返回 null。 */
export function getAudioApiFormat(mime: string): string | null {
  const format = MIME_TO_FORMAT[mime.toLowerCase()];
  if (format && SUPPORTED_AUDIO_FORMATS.has(format)) {
    return format;
  }
  return null;
}
```

**case-analyzer.ts 改动**：
- 删除 `SUPPORTED_AUDIO_FORMATS`、`MIME_TO_FORMAT`、`getAudioApiFormat` 本地定义
- 新增 `import { getAudioApiFormat } from "@/lib/nana/audio-utils";`
- 其余逻辑不变

**一致性验证**：
- `LITE_NATIVE_MIME_TYPES`（audio-utils 已有）= `MIME_TO_FORMAT` 的 keys（audio-utils 新增）
- `needsTranscode(mime)` 返回 true ⟺ `getAudioApiFormat(mime)` 返回 null（对于已知 MIME）
- 对于未知 MIME：`needsTranscode` 返回 true（保守策略），`getAudioApiFormat` 返回 null — 一致

### 7.4 ai-result-card.tsx transcript 区块设计

在 `SuccessContent` 组件中，questionSummary 之后、textbookTopic 之前插入：

```tsx
{/* 转写文字 */}
{result.audioStatus && result.audioStatus !== "skipped" && (
  <div>
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8C857B]">
      <MicIcon className="size-3 text-[#5E8868]" />
      我说了
    </div>
    {result.audioStatus === "success" && result.transcript ? (
      <p className="mt-1 text-[14px] leading-[1.7] text-[#403A33]">
        {result.transcript}
      </p>
    ) : result.audioStatus === "failed" ? (
      <p className="mt-1 text-[13px] leading-[1.7] text-[#8C857B]">
        语音没转成功，题已经整理好了
      </p>
    ) : result.audioStatus === "timeout" ? (
      <p className="mt-1 text-[13px] leading-[1.7] text-[#8C857B]">
        语音转写超时了，题已经整理好了
      </p>
    ) : null}
  </div>
)}
```

**skipped 的特殊处理**：skipped 意味着无音频或 flag 关闭。简化策略：`audioStatus === "skipped"` 时不展示 transcript 区块（无论是否有录音，结果卡中不强调 skipped 状态）。用户在 transcript tab 中仍能看到引导文案。

**整体成功但音频失败**（评审 P2）：`status=success` + `audioStatus=failed` 时，AiResultCard 走 SuccessContent 分支展示图片整理内容，同时 transcript 区块显示"语音没转成功，题已经整理好了"。不走 FailedState（整体不是 failed）。

### 7.5 capture/page.tsx transcript tab 改动

**当前**（第 452-454 行）：
```tsx
{currentTab === "transcript" && (
  <TranscriptionPanel text="尚未转写" onChange={() => {}} />
)}
```

**改为**：
```tsx
{currentTab === "transcript" && (
  <TranscriptionPanel
    text={processResult?.transcript || ""}
    editable={false}
  />
)}
```

TranscriptionPanel 只读态逻辑需微调：text 为空时显示"先录一段音，整理后会在这里看到你说的话"；text 非空时展示 text 内容。

**注意**：`processResult.transcript` 来自 API 响应（CaseAiResult.transcript），值为 null 或真实转写文本，不含占位文本。前端不直接读 Artifact 占位文本，无需过滤 `PLACEHOLDER_TRANSCRIPT`。

### 7.6 buildArtifacts 占位文本不改（评审 P1-a 修订）

**当前**（第 173 行）：
```ts
artifacts.push({ type: "transcript", content: "尚未转写", seq });
```

**改为**（用常量替代硬编码字符串，不改变占位值）：
```ts
import { PLACEHOLDER_TRANSCRIPT } from "@/lib/nana/transcript-utils";
// ...
artifacts.push({ type: "transcript", content: PLACEHOLDER_TRANSCRIPT, seq });
```

**不改占位值的理由**（评审 P1-a）：
- `transcript-utils.ts` 的 `isPlaceholderTranscript(content)` 判断逻辑：`content == null` 返回 true；`content.trim() === "尚未转写"` 返回 true；**空字符串返回 false**
- 如果改为空字符串，`isPlaceholderTranscript("")` 返回 false → 被当作"用户已编辑内容" → 阻断 AI 覆写（破坏"人 > AI"保护设计）
- 产品行为手册（`doc/product/nana-product-behavior-manual-v1.md` §6.4）明确："只有 `isPlaceholderTranscript(content) === true` 时才覆盖"
- **正确做法**：内部保留占位 `PLACEHOLDER_TRANSCRIPT`，前端通过 `processResult.transcript`（API 返回 null 或真实转写）展示

### 7.7 voice-recorder.tsx 文案改动

**当前**（第 390-392 行）：
```tsx
<p className="text-[13.5px] text-[#8C857B]">
  录音收好了，转写稍后接入
</p>
```

**改为**：
```tsx
<p className="text-[13.5px] text-[#8C857B]">
  录音收好了，收题时会自动整理
</p>
```

---

## 8. 不做的事（边界）

- 不改录音逻辑（pickMimeType / MediaRecorder / onstop 全部不动）
- 不改 /process API 后端逻辑（Round 1 已完整实现）
- 不改 Prisma schema（字段已存在）
- 不做实时语音 / 逐句时间轴
- 不做 transcript 编辑功能（TranscriptionPanel editable 保持 false）
- 不回退 v2 双管线（TD-5 保持现状）
- 不改 asr-transcribe.ts / vlm-classify.ts（TD-5 废弃代码，不动）

---

> 本计划停在 plan 评审，不进入 execute。等用户确认后再进入 /execute。
