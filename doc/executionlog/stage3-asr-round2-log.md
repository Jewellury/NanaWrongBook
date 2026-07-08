# Stage 3 ASR Round 2 — ASR 生产化执行日志

> **轮次**: ASR Round 2（ffmpeg 运行时依赖 + feature flag + 前端 transcript 展示 + P3 MIME 合并）
> **计划**: [stage3-asr-round2-plan.md](../plan/stage3-asr-round2-plan.md)
> **日期**: 2026-07-08
> **执行者**: execute-agent (Claude)
> **状态**: build 通过 + 216/216 单元测试 + 18/18 集成测试

---

## 0. 执行范围

| 步骤 | 内容 | 状态 |
|------|------|:----:|
| 1 | Dockerfile runner 阶段加 ffmpeg | 完成 |
| 2 | docker-compose.test.yml 加 ffmpeg + 验证 | 完成 |
| 3 | .env.example / .env.test.example 补 NANA_AUDIO_TRANSCRIPT_ENABLED | 完成 |
| 4 | P3 MIME 列表合并到 audio-utils.ts（单一数据源） | 完成 |
| 5 | ai-result-card.tsx 新增 transcript + audioStatus 展示 | 完成 |
| 6 | capture/page.tsx transcript tab 改用 processResult.transcript | 完成 |
| 7 | transcription-panel.tsx 只读态适配 | 完成 |
| 8 | voice-recorder.tsx 完成态文案更新 | 完成 |
| 9 | npm run build 通过 | 通过 |
| 10 | 单元测试通过 | 216/216 通过 |
| 11 | 集成测试通过 | 18/18 通过 |

---

## 1. 变更文件清单

| 文件 | 状态 | 说明 |
|------|------|------|
| Dockerfile | 修改 | runner 阶段 `apk add` 加 `ffmpeg` |
| docker-compose.test.yml | 修改 | 加 ffmpeg 安装 + `ffmpeg -version` 前置验证 |
| .env.example | 修改 | 加 `NANA_AUDIO_TRANSCRIPT_ENABLED="false"` + 注释 |
| .env.test.example | 修改 | 加 `NANA_AUDIO_TRANSCRIPT_ENABLED="false"` |
| src/lib/nana/audio-utils.ts | 修改 | 新增 `MIME_TO_FORMAT` / `SUPPORTED_AUDIO_FORMATS` / `getAudioApiFormat`（从 case-analyzer 迁移） |
| src/lib/nana/case-analyzer.ts | 修改 | 删除本地 MIME 列表，改为 import |
| src/components/nana/capture/ai-result-card.tsx | 修改 | 新增 transcript + audioStatus 展示区块 |
| src/app/nana/capture/page.tsx | 修改 | transcript tab 用 processResult.transcript；buildArtifacts 用 PLACEHOLDER_TRANSCRIPT 常量 |
| src/components/nana/capture/transcription-panel.tsx | 修改 | 只读态适配空 text 和真实转写 |
| src/components/nana/capture/voice-recorder.tsx | 修改 | 完成态文案改为"收题时会自动整理" |
| doc/plan/stage3-asr-round2-plan.md | 新增 | 开发计划 |
| doc/executionlog/stage3-asr-round2-log.md | 新增 | 本执行日志 |

---

## 2. 审计后修复

审计发现 6 个问题，全部修复：

| # | 严重度 | 问题 | 修复 |
|---|--------|------|------|
| 1 | P2 | process/route.ts transcript 覆盖不检查 isPlaceholderTranscript（人>AI 铁律未实现） | 加入 isPlaceholderTranscript 检查：只有占位文本才覆盖，非占位跳过并记日志 |
| 2 | P2 | 执行日志缺失 | 补写本文件 |
| 3 | P2 | active_spec.md 未更新 | 更新为 ASR Round 2 状态 |
| 4 | P3 | transcription-panel.tsx 注释陈旧 | 更新注释 |
| 5 | P3 | capture/page.tsx 注释陈旧 | 更新注释 |
| 6 | P3 | 新增 MIME 导出无直接单测 | 补 20 个直接单测（SUPPORTED_AUDIO_FORMATS / MIME_TO_FORMAT / getAudioApiFormat / 互逆验证） |

### 修复详情

#### Fix 1: isPlaceholderTranscript 检查（process/route.ts）

**改动**：
- 新增 `import { isPlaceholderTranscript } from "@/lib/nana/transcript-utils";`
- transcript 回写 Artifact 时，先查 `content`，再判断 `isPlaceholderTranscript(content)`
- 占位文本 → 覆盖（AI > 占位）
- 非占位文本 → 跳过并记日志（人 > AI）
- 无 artifact → 创建（安全网）

**测试**：18/18 集成测试通过，无退化。

#### Fix 6: audio-utils 直接单测

新增 4 个 describe 块、20 个测试用例：
- `SUPPORTED_AUDIO_FORMATS`（2 tests）：6 种格式、不含 webm/mp4
- `MIME_TO_FORMAT`（5 tests）：10 种映射、变体、不含 webm/mp4
- `getAudioApiFormat`（11 tests）：各格式返回、null 返回、大写、空字符串
- `needsTranscode 与 getAudioApiFormat 逻辑互逆`（2 tests）：互逆验证

---

## 3. 构建验证

| 验证项 | 结果 |
|--------|:----:|
| npm run build | 通过（57/57 页面） |
| npx vitest run src/__tests__/unit/nana | 216/216 通过 |
| npx vitest run src/__tests__/integration/nana/process-api.test.ts | 18/18 通过 |
| 本地 Docker | 未跑（不可用，门禁交由 CI） |

---

## 4. 偏离项记录

| # | 偏离 | 级别 | 说明 |
|---|------|------|------|
| 1 | voice-recorder.tsx 文案从计划"录音收好了"改为"录音收好了，收题时会自动整理" | 微调 | 用户收口报告中确认的实际文案，比计划更友好且不过度承诺 |

---

## 5. Git 收口

| 项 | 值 |
|----|-----|
| 分支 | dev |
| commit 1 | d29b15f — plan: Stage 3 Round 2 ASR 生产化计划（修订 r1） |
| commit 2 | 8dffb6d — feat: ASR Round 2 代码实现 |
| commit 3 | 待提交 — fix: 审计修复（isPlaceholderTranscript + 注释 + 单测 + 文档） |

---

## 6. 下一步

1. GitHub Actions CI — 等待测试容器门禁通过
2. dev 合 main — CI 通过后合入 main 并推 GHCR 镜像
3. 生产部署 — 服务器 pull 镜像，.env 设 NANA_AUDIO_TRANSCRIPT_ENABLED=true
4. 真机 smoke test — 手机录音 → 转码 → 转写 → 前端展示端到端验证
