# Stage 3 录音转写（ASR）方案

> 本文件是方案设计文档，停在 plan 评审，不进入 execute。等用户确认后再进入 /execute。
> 计划者：plan-agent | 日期：2026-07-07
> 修订 r1：2026-07-07，根据评审反馈修订 5 条（见 §9 修订记录）

---

## 1. 代码盘点：涉及文件与现有音频链路

### 1.1 录音产出格式

**文件**: `src/components/nana/capture/voice-recorder.tsx`

`pickMimeType()` 探测逻辑（第 64-70 行）：

```ts
if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
return ""; // 用默认
```

实际产出：
- **Android/Chrome**: `audio/webm`（Opus 编码，WebM 容器）
- **iOS Safari (较新)**: `audio/mp4`（AAC 编码，MP4 容器）
- **其他**: 浏览器默认格式

`onstop` 回调（第 191-213 行）合成 Blob，type 继承 `mimeRef.current || recorder.mimeType || "audio/webm"`。

### 1.2 音频存储方式

**文件**: `src/app/nana/capture/page.tsx` 第 156-174 行 `buildArtifacts()`

```ts
// 1. audio_note：Data URL 格式（data:audio/webm;base64,...）
const audioBase64 = await blobToBase64(audioBlob);  // FileReader.readAsDataURL
artifacts.push({ type: "audio_note", content: audioBase64, seq });

// 2. audio_meta：分号分隔 key=val（非 JSON！）
artifacts.push({
  type: "audio_meta",
  content: `durationSec=${...};mime=${...};sizeBytes=${...}`,
  seq,
});

// 3. transcript：占位文本
artifacts.push({ type: "transcript", content: "尚未转写", seq });
```

存储到 Prisma `Artifact` 表（`content` 字段为 String，Base64 内联，约 33% 体积开销 — 已知设计债 #3）。

### 1.3 /process 音频提取逻辑

**文件**: `src/app/api/nana/cases/[id]/process/route.ts` 第 47-80 行 `extractImageAndAudio()`

```ts
// audio_note：尝试从 Data URL 提取 MIME
const match = a.content.match(/^data:(audio\/[^;]+);base64,(.+)$/);
if (match) {
  audioFormat = match[1];    // 如 "audio/webm"
  audioBase64 = match[2];
}

// audio_meta：尝试 JSON.parse（⚠️ BUG：实际存储是 key=val 格式，JSON.parse 会失败）
if (a.type === "audio_meta" && audioBase64 && !audioFormat) {
  const meta = JSON.parse(a.content);  // 永远 catch，不影响主流程
  if (meta?.mime) audioFormat = meta.mime;
}
```

**注意**：audio_meta 的 JSON.parse 实际总是失败（因为存储格式是 `key=val;key=val`），但 Data URL 已包含 MIME，所以 `audioFormat` 在有录音时仍能正确提取为 `"audio/webm"` 或 `"audio/mp4"`。

### 1.4 case-analyzer.ts 格式判定

**文件**: `src/lib/nana/case-analyzer.ts` 第 132-169 行

`MIME_TO_FORMAT` 映射表**不包含** `audio/webm` 和 `audio/mp4`（第 156 行注释明确标注）。`getAudioApiFormat()` 对 webm/mp4 返回 `null` → `audioSkipped = true` → **音频不发送给 API，只有图片+文本**。

### 1.5 已验证事实

| 格式 | 豆包 Lite 支持 | 验证来源 | 验证方式 |
|------|:---:|------|------|
| WAV | ✅ | `stage3-spike-v3.ts` + `asr-transcribe.ts` Round 0 | 程序生成的 440Hz 正弦波 |
| webm | ❌ | `asr-transcribe.ts` Round 0 注释 | API 报错 "audio format 'webm' is not supported" |
| mp4 | ❌ | `asr-transcribe.ts` Round 0 注释 | API 报错 "audio format 'mp4' is not supported" |
| mp3/flac/ogg/m4a/aac | ⚠️ 未实测 | 官方文档列出 | 未验证 |

**关键事实**：浏览器 MediaRecorder 产出的 webm/mp4 两种格式，豆包 Lite **都不支持**。

### 1.6 数据落库现状

**Prisma 模型**: `CaseAiResult`（`prisma/schema.prisma` 第 376 行）

| 字段 | 类型 | 用途 |
|------|------|------|
| `transcript` | String? | 转写文字快照（从 Artifact 同步） |
| `audioStatus` | String | "success" / "skipped" / "failed" / "timeout" |

`persistAiResult()` 第 168-183 行：transcript 同时写 `CaseAiResult.transcript` 和 `Artifact(type="transcript")`。当前因为没有音频发送，`audioStatus` 恒为 `"skipped"`，`transcript` 恒为空字符串。

### 1.7 前端展示现状

**文件**: `src/components/nana/capture/ai-result-card.tsx`

AiResultCard **不展示 transcript** 和 **audioStatus**。只有 questionSummary / textbookTopic / feedback / possibleMistakeReason / nextActionSuggestion 五个字段。前端 capture page 的 transcript tab 恒显示 "尚未转写"。

---

## 2. 核心矛盾与路线分析

**矛盾**：浏览器录音产出 webm/mp4，豆包 Lite 不支持这两种格式。

### 方案 A：服务端转码为 WAV 后送 Lite

**流程**：audio_note (webm/mp4) → 服务端 ffmpeg 转码 → WAV (16kHz mono PCM) → 豆包 Lite input_audio

**优点**：
- 转写质量最有保障（WAV 是豆包实测可用格式）
- 前端不改，录音逻辑不动
- 转码后 16kHz mono WAV 体积小（60s ≈ 1.9MB raw → base64 ≈ 2.5MB，可接受）

**缺点**：
- 需要在 Docker 镜像中安装 ffmpeg（系统依赖）
- 镜像体积增加约 50-100MB
- CI 构建时间略增
- 转码增加延迟（60s 音频转码约 1-3s）
- 转码失败需要降级处理

**部署影响**：Dockerfile 需加 `apt-get install ffmpeg`，镜像体积 +50~100MB。

### 方案 B：前端录制时指定支持格式

**思路**：尝试 `MediaRecorder.isTypeSupported("audio/wav")` 或其他豆包支持的 MIME。

**现实**：浏览器 MediaRecorder **不支持** WAV 格式输出。WAV 是未压缩格式，浏览器录音不提供。可选的只有 webm（Opus/Vorbis）和 mp4（AAC），都不被豆包支持。

**结论**：方案 B **不可行**，浏览器原生不产出豆包支持的格式。

### 方案 C：v1 暂时 skipped，只保存录音，文案诚实

**流程**：维持现状 — 录音保存，audioStatus=skipped，transcript 留空，前端诚实显示"这段语音已保存，暂时还没转成文字"。

**优点**：
- 零开发成本、零部署风险
- 不阻塞图片整理
- 诚实，不假装听懂

**缺点**：
- 录音只有存储价值，不参与 AI 整理
- 用户录音了但没有转写反馈

### 路线建议：方案 A（服务端转码），方案 C 作为降级

**理由**：
1. 方案 B 技术上不可行（浏览器不产出 WAV）
2. 方案 A 是唯一能让转写真正工作的路径
3. ffmpeg 是成熟工具，Docker 安装简单
4. 转码失败时自动降级为方案 C（skipped），不阻塞图片整理
5. Feature flag 控制开关，出问题可秒退为 image-only

**不回退 v2 双大管线的理由**：v2 的 Pro VLM + ASR 双管线已废弃（TD-5）。方案 A 仍然用 v3 一体化 case-analyzer.ts，只是在调用前加一步转码预处理。不引入独立 ASR 管线。

---

## 3. 推荐架构：转码预处理 + 一体化调用

### 3.1 数据流

```
浏览器录音 (webm/mp4)
  ↓ blobToBase64 → Data URL
存储 Artifact(audio_note, data:audio/webm;base64,...)
  ↓ /process POST
extractImageAndAudio()
  ↓ 提取 audioBase64 + audioFormat="audio/webm"
转码预处理 (新增 transcode-audio.ts)
  ↓ ffmpeg webm→wav (16kHz mono PCM)
  ↓ 返回 wavBase64 + audioFormat="audio/wav"
analyzeCase()
  ↓ 图片 + WAV + 提示词 → 豆包 Lite
  ↓ 返回 7 字段 JSON
persistAiResult()
  ↓ transcript → CaseAiResult.transcript + Artifact(transcript)
  ↓ audioStatus → CaseAiResult.audioStatus
```

### 3.2 转码预处理模块

**新增文件**: `src/lib/nana/transcode-audio.ts`

职责：
- 输入：`{ audioBase64: string, mime: string }`
- 输出：`{ wavBase64: string, mime: "audio/wav" }` 或 throw `TranscodeError`
- 实现：用 Node.js child_process 调用系统 ffmpeg，将输入写到 stdin，从 stdout 读 WAV
- 参数：`-ar 16000 -ac 1 -c:a pcm_s16le`（16kHz 单声道 16bit PCM，ASR 最佳格式）
- 超时：10s（60s 音频转码不会超过 3s，10s 是安全余量）
- Feature flag：`NANA_AUDIO_TRANSCRIPT_ENABLED`（**默认 `false`**，生产环境显式设为 `true` 开启；未设或设为 `false` 时跳过转码直接 skipped）

### 3.3 case-analyzer.ts 改动

`analyzeCase()` 内部，在 `audioSkipped` 判定后增加转码逻辑：
- 如果 `audioApiFormat === null`（webm/mp4 等不支持的格式）且 `NANA_AUDIO_TRANSCRIPT_ENABLED === "true"`（**显式开启**）：
  - 调用 `transcodeAudio()` 转码为 WAV
  - 转码成功：`audioApiFormat = "wav"`，`audioBase64 = wavBase64`
  - 转码失败：保持 `audioSkipped = true`，log warn，不 throw（不阻塞图片）
- 如果 `NANA_AUDIO_TRANSCRIPT_ENABLED` 未设或不为 `"true"`：保持 `audioSkipped = true`（默认关闭）

### 3.4 /process route 改动

- **`extractImageAndAudio()` 必须修复 audio_meta 解析 bug**（评审 r1 提升为 P0）：
  - 当前代码用 `JSON.parse(a.content)` 解析 audio_meta，但实际存储格式是 `durationSec=10;mime=audio/webm;sizeBytes=12345`
  - 修复为分号分隔解析：`a.content.split(';').map(kv => kv.split('=')).reduce(...)`
  - **兼容旧数据**：同时尝试 JSON.parse（旧数据可能是 JSON）和分号解析，两者都失败则 fallback 到 Data URL 中的 MIME
  - 虽然当前 Data URL 已携带 MIME 使主流程不受影响，但此 bug 会导致没有 Data URL 前缀的旧格式音频无法提取 MIME
- catch 逻辑不变：`deriveAudioStatus()` 已能正确推导

### 3.5 数据落库策略

| 场景 | transcript 写入 | audioStatus | Artifact(transcript) |
|------|------|------|------|
| 无音频 | `null` | `skipped` | 保持 "尚未转写" |
| 有音频 + 转码成功 + Lite 返回非空 transcript | AI 返回值 | `success` | 覆写为 AI transcript |
| 有音频 + 转码失败 | `null` | `skipped` | 保持 "尚未转写" |
| 有音频 + 转码成功 + Lite 超时 | `null` | `timeout` | 保持 "尚未转写" |
| 有音频 + 转码成功 + Lite 返回**空** transcript | `null` | `failed`（**评审 r1 修订**：不得标 success） | 保持 "尚未转写" |
| 用户已手动编辑 transcript | **不覆盖** | 正常写 | **不覆盖** |

**评审 r1 修订说明**：Lite 返回空 transcript 意味着转写未成功产出，不应标 `success`。改为标 `failed`，并在 CaseAiResult.error 字段记录原因（如 "Lite 返回空 transcript"）。前端对应显示"语音没转成功，题已经整理好了"。

**关键规则**：
- `transcript-utils.ts` 的 `isPlaceholderTranscript()` 守护"人 > AI"规则 — 已有，继续用
- 语音失败/超时/skipped **不阻塞**图片整理 — `analyzeCase()` 只在图片也失败时 throw
- `CaseAiResult.transcript` 和 `Artifact(transcript)` 双写 — 保持现状

### 3.6 前端展示

**AiResultCard 新增 transcript 展示区块**（在 questionSummary 之后）：

| audioStatus | 展示 |
|------|------|
| `success` + 有 transcript | 显示转写文本，标签"我说了" |
| `success` + 空 transcript | 不应出现（评审 r1：空 transcript 不标 success，改为 failed） |
| `skipped` | 显示"这段语音已保存，暂时还没转成文字" |
| `failed` | 显示"语音没转成功，题已经整理好了" |
| `timeout` | 显示"语音转写超时了，题已经整理好了" |
| `null`（无音频） | 不展示区块 |

**capture page transcript tab**：保持现状（占位文本），AI 整理成功后可展示从 CaseAiResult 读回的 transcript（后续轮次，本轮不做）。

**措辞铁律**：
- 禁用"已听懂""诊断完成""语音识别成功"
- 用"我说了""这段语音已保存""暂时还没转成文字"

---

## 4. Round 0 Spike 设计

### 4.1 目标

用真实手机录音样本验证：
1. webm/mp4 → ffmpeg 转 WAV 后，豆包 Lite 是否接受
2. 转写质量是否可接受（不是乱码/空字符串）
3. mp3/m4a/aac 等未实测格式是否直接可用（如果手机能产出）

### 4.2 Spike 脚本

**新增**: `scripts/stage3-audio-spike-real.ts`

测试矩阵：

| # | 输入 | 转码 | 预期 |
|---|------|------|------|
| 1 | 真实手机 webm 录音 | 不转码，直接送 | API 拒绝（已知） |
| 2 | 真实手机 webm 录音 | ffmpeg → WAV | API 接受 + 转写文本 |
| 3 | 真实手机 mp4 录音（iOS） | 不转码，直接送 | API 拒绝（已知） |
| 4 | 真实手机 mp4 录音（iOS） | ffmpeg → WAV | API 接受 + 转写文本 |
| 5 | 程序生成 WAV（已验证，基线） | 不转码 | API 接受（已知基线） |

**音频样本**：需要用户提供真实手机录音（Android webm 优先，iOS mp4 可后补），内容为数学口述，如"这道题我觉得应该先把 x 移到左边"。样本放 `tests/fixtures/nana/audio/` 目录。

**验证标准**（评审 r1 修订）：
- **Gate 条件**：至少一种真实手机录音格式转 WAV 后可被 Lite 稳定转写（非空、非乱码）
- iOS mp4 可后补，不阻塞 Round 0 Gate 通过
- transcript 内容与录音内容语义一致（不要求逐字精确，但不能是乱码）
- 转码耗时 < 5s
- 不写生产 DB（脚本直接调 API，不经过 /process route）

### 4.3 ffmpeg 可用性验证

**评审 r1 修订**：ffmpeg 正式依赖只放 Docker/生产运行环境，不要求所有本地开发环境安装。
- **Docker 镜像（生产 + CI）**：`apt-get install -y ffmpeg`（runner 阶段）
- **本地开发**：Round 0 Spike 需要本地有 ffmpeg（用于验证转码链路）；Round 1+ 单元测试必须 mock ffmpeg 子进程，不依赖真实 ffmpeg
- **本地 Windows**：`ffmpeg.exe`（需安装或 portable，仅 Spike 需要）
- **CI**：在 Dockerfile runner 阶段安装，测试容器内自动可用

---

## 5. 执行轮次拆分

### Round 0：Spike 验证（前置门禁）

- [ ] 用户提供真实手机录音样本（Android webm 优先，iOS mp4 可后补）
- [ ] 编写 `scripts/stage3-audio-spike-real.ts`
- [ ] 本地安装 ffmpeg（仅 Spike 需要）
- [ ] 跑测试矩阵（webm 优先，mp4 可后补）
- [ ] 记录结果到 `doc/research/spike-audio-real-results.json`
- [ ] **Gate**（评审 r1 修订）：至少一种真实手机录音格式转 WAV 后可被 Lite 稳定转写（非空、非乱码） → 继续；否则停在此轮，走方案 C
- [ ] iOS mp4 可在 Round 0 后补，不阻塞 Gate 通过

### Round 1：转码模块 + case-analyzer 集成

- [ ] 新增 `src/lib/nana/transcode-audio.ts`（ffmpeg 子进程 + 超时 + feature flag）
- [ ] 修改 `src/lib/nana/case-analyzer.ts`：在 audioSkipped 分支插入转码逻辑
- [ ] **修复 `extractImageAndAudio()` audio_meta 解析 bug**（评审 r1 P0）：
  - 改为分号分隔解析，兼容 JSON 格式旧数据
  - 两者都失败则 fallback 到 Data URL 中的 MIME
- [ ] 单元测试：transcode-audio（**必须 mock ffmpeg**，不依赖真实 ffmpeg）、格式判定、audioStatus 推导
- [ ] 集成测试：有音频/无音频/转码失败/不支持格式/图片成功语音失败互不阻塞
- [ ] 集成测试：Lite 返回空 transcript → audioStatus=failed（不是 success）

### Round 2：前端展示 + Dockerfile

- [ ] 修改 `ai-result-card.tsx`：新增 transcript + audioStatus 展示区块
- [ ] 修改 `capture/page.tsx`：transcript tab 整理后展示
- [ ] Dockerfile 加 `apt-get install -y ffmpeg`
- [ ] docker-compose.test.yml 确认 ffmpeg 可用
- [ ] 集成测试：前端展示各 audioStatus 状态
- [ ] 本地 `npm.cmd run build` 通过

### Round 3：真实 smoke + 部署

- [ ] 用真实手机录音在测试环境验证端到端
- [ ] CI 绿色
- [ ] 服务器 .env 显式加 `NANA_AUDIO_TRANSCRIPT_ENABLED=true`（默认 false，生产显式开启）
- [ ] 部署到生产
- [ ] 真机验收：拍题+录音 → 看 transcript 质量
- [ ] 如果质量不达标：设 `NANA_AUDIO_TRANSCRIPT_ENABLED=false` 秒退 image-only

---

## 6. 风险与回滚

### 6.1 风险

| 风险 | 概率 | 影响 | 缓解 |
|------|:--:|:--:|------|
| ffmpeg 转码失败 | 低 | 语音 skipped，不阻塞图片 | catch → skipped，feature flag 关闭 |
| 豆包 Lite 转写质量差 | 中 | transcript 不可用 | feature flag 关闭，走 image-only |
| 镜像体积增大 | 低 | CI 变慢 ~30s | 可接受，ffmpeg 是必须依赖 |
| ffmpeg 在 CI 容器中不可用 | 低 | 转码失败 | docker-compose.test.yml 安装 ffmpeg |
| 转码超时 | 低 | 语音 timeout | 10s 超时 → timeout 状态 |
| 音频 base64 体积过大 | 中 | API 请求慢/超时 | 16kHz mono WAV 60s ≈ 1.9MB raw → base64 ≈ 2.5MB，可接受；必要时缩短录音上限 |

### 6.2 回滚方案

1. **秒退**：服务器 .env 删除或设 `NANA_AUDIO_TRANSCRIPT_ENABLED=false` → 重启容器 → 回到 image-only（默认就是 false）
2. **代码回退**：`git revert` 转码相关 commit → 重新 CI → 部署
3. **Docker 回退**：镜像回退到转码前的 sha tag

### 6.3 不做的事（边界）

- 实时语音 / 语音对话
- 逐句时间轴
- 完整解题 / 答案
- 深度诊断
- 语音失败阻塞图片整理
- 回退 v2 双大管线（Pro VLM + 独立 ASR）

---

## 7. 产品原则声明

1. 图片整理是主链路，语音是增强信息
2. 语音失败不能让整题整理失败
3. 格式不支持时诚实显示"这段语音已保存，暂时还没转成文字"
4. 第一版宁可慢一点、朴素一点，也不假装听懂
5. 文案禁用"已听懂""诊断完成""语音识别成功"等越界词

---

## 8. 涉及文件清单

| 文件 | 改动类型 | 说明 |
|------|------|------|
| `src/lib/nana/transcode-audio.ts` | 新增 | ffmpeg 转码模块 |
| `src/lib/nana/case-analyzer.ts` | 修改 | 插入转码逻辑 |
| `src/app/api/nana/cases/[id]/process/route.ts` | 修改 | 修复 audio_meta 解析 |
| `src/components/nana/capture/ai-result-card.tsx` | 修改 | 新增 transcript 展示 |
| `src/components/nana/capture/voice-recorder.tsx` | 不改 | 录音逻辑不动 |
| `src/app/nana/capture/page.tsx` | 小改 | transcript tab 展示（可选） |
| `scripts/stage3-audio-spike-real.ts` | 新增 | Round 0 spike 脚本 |
| `Dockerfile` | 修改 | 加 ffmpeg |
| `docker-compose.test.yml` | 可能修改 | 确保 ffmpeg 可用 |
| `.env.example` | 修改 | 加 NANA_AUDIO_TRANSCRIPT_ENABLED 占位 |
| `src/__tests__/nana/transcode-audio.test.ts` | 新增 | 单元测试 |
| `src/__tests__/nana/case-analyzer.test.ts` | 修改 | 增加转码路径测试 |

---

> 本方案停在 plan 评审，不进入 execute。等用户确认后再进入 /execute。
>
> **当前状态**：评审 r1 反馈已修订，先执行 Round 0 Spike，不进入 Round 1 开发。

---

## 9. 修订记录

### r1（2026-07-07，评审反馈修订）

| # | 评审意见 | 修订内容 |
|---|------|------|
| 1 | Lite 返回空 transcript 时不得标 audioStatus=success | 改为标 `failed`，记录原因到 CaseAiResult.error；§3.5 落库表和 §3.6 前端展示同步修改 |
| 2 | NANA_AUDIO_TRANSCRIPT_ENABLED 默认 false | §3.2、§3.3 改为默认 false，生产显式设 true 才开启；§5 Round 3 和 §6.2 回滚同步修改 |
| 3 | Round 0 Gate 改为至少一种真实手机录音格式转 WAV 后可被 Lite 稳定转写，iOS mp4 可后补 | §4.2 验证标准和 §5 Round 0 Gate 条件修改；音频样本从"2 段必须"改为"webm 优先，mp4 可后补" |
| 4 | ffmpeg 正式依赖只放 Docker/生产运行环境，单元测试必须 mock | §4.3 修改 ffmpeg 可用性验证策略；§5 Round 1 单元测试明确标注 mock ffmpeg |
| 5 | Round 1 必须修复 audio_meta 分号格式解析 bug，并兼容旧数据 | §3.4 从"低优先级"提升为 P0；修复方案改为分号解析 + JSON fallback + Data URL fallback 三级兼容 |
