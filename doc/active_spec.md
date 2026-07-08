# 当前活跃任务

> 每轮替换。记录当前这一轮在做什么、做到哪了。
> 完成后内容迁移到 doc/progress.md，本文件清空重写。

---

> 最后更新: 2026-07-08

## 当前任务：Stage 3 ASR Round 2 — ASR 生产化（审计修复完成）

### 背景

ASR Round 2 代码实现已完成（commit 8dffb6d），审计通过（⚠️ 有条件通过），
审计发现的 6 个问题已全部修复。当前等 CI 绿后合 main 部署。

### 计划文档

[stage3-asr-round2-plan.md](plan/stage3-asr-round2-plan.md)

### 执行日志

[stage3-asr-round2-log.md](executionlog/stage3-asr-round2-log.md)

### 审计报告

[stage3-asr-round2-audit.md](auditlog/stage3-asr-round2-audit.md)

### 已完成步骤

1. ✅ Dockerfile runner 阶段加 ffmpeg
2. ✅ docker-compose.test.yml 加 ffmpeg + 前置验证
3. ✅ .env.example / .env.test.example 补 NANA_AUDIO_TRANSCRIPT_ENABLED
4. ✅ P3 MIME 列表合并到 audio-utils.ts（单一数据源）
5. ✅ ai-result-card.tsx 新增 transcript + audioStatus 展示
6. ✅ capture/page.tsx transcript tab 改用 processResult.transcript
7. ✅ transcription-panel.tsx 只读态适配
8. ✅ voice-recorder.tsx 完成态文案更新
9. ✅ npm run build 通过（57/57 页面）
10. ✅ 单元测试 216/216 通过
11. ✅ 集成测试 18/18 通过
12. ✅ 审计修复：isPlaceholderTranscript 检查 + 注释更新 + 直接单测 + 执行日志 + active_spec

### 下一步

1. **GitHub Actions CI** — dev push → CI 绿（build + test container + push GHCR）
2. **dev 合 main** — CI 通过后合入 main
3. **生产部署** — 服务器 pull 镜像，.env 设 `NANA_AUDIO_TRANSCRIPT_ENABLED=true`
4. **真机 smoke test** — 手机录音 → 转码 → 转写 → 前端展示端到端验证

### 验收标准

- CI 绿色（build + test container + push GHCR）
- 服务器容器正常运行
- 手机能访问 nana.nanatop.xyz/nana
- 拍题+录音 → AI 整理结果卡正常显示
- transcript 区块按 audioStatus 展示对应内容
- 图片整理不受语音影响（语音失败图片仍正常）
- 题目汇总页能看到新题

### 安全约束

- VOLCENGINE_API_KEY 只放服务器 .env，不入 git
- 部署前必须 backup.sh 备份
- 生产开启 NANA_AUDIO_TRANSCRIPT_ENABLED=true 前确认 ffmpeg 在容器中可用

### 失败回滚

- 秒退：服务器 .env 设 `NANA_AUDIO_TRANSCRIPT_ENABLED=false` → restart → 回到 image-only
- 镜像回退：pull 指定旧 sha tag
- 代码回退：`git revert`

---

## 历史回顾：Stage 3 已完成轮次

- Round 0：4 张新表 schema + migration + seed
- Round 1：一体化 Case Analyzer lib + 33 mock 单测
- Round 2：/process API + 18 集成测试
- Round 3：题目汇总 API + 列表扩展 + 三 tab 外壳 + 14 集成测试
- Round 4：拍题触发整理 + 轮询状态 + AI 结果卡 + 10 集成测试
- Round 4 Hotfix：P1 竞态保护 + P2-a AbortController + P2-c 类型对齐 + 3 新测试
- Round 5 Provider Smoke：3 张 fixture 真实 API 验证，Conditional Go
- Stage 3 部署 r2：seed 自动化 + CI 双绿 + 生产部署验证
- ASR Round 0 Spike：真实手机录音转写验证通过
- ASR Round 1：后端 audio_meta 解析 + ffmpeg 转码 + case-analyzer 集成 + 87 单测
- ASR Round 1 Hotfix：P2 前置修复 — audioErrorReason 持久化 + deriveAudioStatus 参数语义
- ASR Round 2：ffmpeg 运行时依赖 + feature flag + 前端 transcript 展示 + P3 MIME 合并

---

## 已知限制（持续有效）

- KST-lite gap 只传播一层 dependents，M4 补递归
- 当前 case-analyzer.ts 需 VOLCENGINE_API_KEY，无 mock 模式
- 单主线诊断（决策 D-9 延续）
- 二进制 artifact 以 Base64 内联 SQLite（迁移阈值：case > 100 或 dev.db > 50MB）
- **语音转写质量未验证**（上线后单独验收）

## 设计债（在册）

1. slipFlag — 当前仅单 boolean，复诊"连续两次"判定需 slipCount 字段
2. /initial 废弃 — 与 submit-answers 两条初诊路径分叉，稳定后废弃
3. light-feedback magic string __preliminary__ — Stage 3 接通真实 API 时处理
4. feedback API 未校验 case 存在性 — Stage 3 接通真实 API 时处理
5. 二进制 artifact 以 Base64 内联 SQLite — 33% 体积开销
6. TD-006 手动改课本分类写入口径统一 — 实现手动编辑课本分类时处理
7. Seed 自动化缺口 — 已在 Stage 3 部署 r2 修复
8. transcript 编辑功能（editable=true）开启前须补 isPlaceholderTranscript 检查 — ASR Round 2 审计已修复 process/route.ts，前端 editable 仍为 false
