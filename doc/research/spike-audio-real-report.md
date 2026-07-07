# Round 0 Spike 结果报告：真实手机录音转写验证

> 日期：2026-07-07 | 执行者：execute-agent | 状态：✅ Gate 通过

---

## 1. 执行摘要

Round 0 Spike **通过**。Android 手机录音（m4a 格式）经 ffmpeg 转码为 WAV 后，可被豆包 Lite 稳定转写，转写结果准确可用。

同时发现 m4a 格式可被 Lite **直接接收**，无需转码。但 webm（Chrome 浏览器 MediaRecorder 产出格式）仍需转码，转码方案已验证可行。

---

## 2. 测试样本

| 属性 | 值 |
|------|-----|
| 文件名 | `20260707_194923.m4a` |
| 来源 | Android 手机录音（非 nana web 应用录音） |
| 格式 | m4a (AAC LC) |
| 原始大小 | 160 KB |
| 音频时长 | ~8.6 秒 |
| 采样率 | 48000 Hz（原始） |
| 声道 | 立体声（原始） |

口述内容："这道题我先把 x 移到左边然后两边同时除以二"

---

## 3. 测试结果

### 3.1 基线测试（程序生成 WAV）

| 指标 | 值 |
|------|-----|
| API 接受 | ✅ |
| transcript | "嘟"（1 字符，440Hz 正弦波被识别为音调） |
| 耗时 | 12.4s |
| tokens | 71 in / 342 out |

基线确认 API 连接正常。

### 3.2 m4a 直送 Lite（不转码）

| 指标 | 值 |
|------|-----|
| API 接受 | ✅ |
| transcript | "这道题我先把x移到左边然后两边同时除以二"（20 字符） |
| 人工判断 | ✅ 准确，无乱码 |
| 耗时 | 3.0s |
| tokens | 117 in / 58 out |

**意外发现：Lite 原生支持 m4a 格式，不需要转码。**

### 3.3 m4a → ffmpeg → WAV 转码后送 Lite

| 指标 | 值 |
|------|-----|
| 转码成功 | ✅ |
| WAV 大小 | 269 KB（base64: 358 KB） |
| 转码耗时 | 0.1s |
| API 接受 | ✅ |
| transcript | "这道题我先把x移到左边然后两边同时除以二"（20 字符） |
| 人工判断 | ✅ 准确，与直送结果一致 |
| API 耗时 | 3.3s |
| tokens | 117 in / 50 out |

---

## 4. 关键技术发现

### 4.1 ffmpeg pipe 输出 WAV 的 chunk 大小问题（已解决）

**问题**：ffmpeg 通过 `pipe:1`（stdout）输出 WAV 时，RIFF 和 data chunk 的大小字段为 `0xFFFFFFFF`（占位符），因为流式输出无法回填正确大小。豆包 Lite 拒绝这种 WAV，返回 `400 Invalid audio track`。

**解决**：改为输出到临时文件（非 pipe），ffmpeg 能正确回填 chunk 大小。转码后读取临时文件并 base64 编码，最后清理。

### 4.2 ffmpeg WAV 元数据 chunk 问题（已解决）

**问题**：ffmpeg 默认在 WAV 中写入 `LIST/INFO` 元数据 chunk（包含编码器信息如 `Lavf62.12.101`）。豆包 Lite 拒绝带此 chunk 的 WAV。

**解决**：添加 `-bitexact -fflags +bitexact -flags +bitexact` 标志，去掉所有元数据 chunk，只保留 `RIFF/WAVE/fmt/data` 四个标准 chunk。

### 4.3 最终转码命令

```bash
ffmpeg -i input.m4a \
  -ar 16000 \        # 16kHz 采样率
  -ac 1 \            # 单声道
  -c:a pcm_s16le \   # 16bit PCM
  -f wav \           # WAV 容器
  -bitexact \        # 去元数据（必须）
  -fflags +bitexact \
  -flags +bitexact \
  -y \               # 覆盖
  output.wav         # 文件输出（非 pipe，必须）
```

### 4.4 m4a 直送可行性

Lite 的 `input_audio` 接口原生支持 m4a 格式。对于 Android 手机录音 app 产出的 m4a，可以直接发送给 Lite，无需 ffmpeg 转码。

**但对 nana web 应用**：浏览器 MediaRecorder 产出的是 webm（Chrome）或 mp4（Safari），不是 m4a。webm 不在 Lite 支持列表中，仍需转码。mp4 也需要验证。

---

## 5. Gate 判定

| 判定项 | 结果 |
|--------|------|
| 至少 1 种真实手机录音格式转 WAV | ✅ m4a → WAV |
| 转码 WAV 被 Lite 接收 | ✅ |
| transcript 非空、非乱码 | ✅ 20 字符，准确 |
| 记录耗时、大小、token | ✅ |
| 原始格式直送基线 | ✅ m4a 直送也成功（额外收获） |

**Gate 结论：✅ 通过，可进入 Round 1 开发。**

---

## 6. 对方案的影响

### 6.1 转码模块必须注意的两点

Round 1 实现转码模块时，**必须**：
1. 使用文件输出，不能用 pipe:1（否则 chunk 大小为 0xFFFFFFFF）
2. 使用 `-bitexact` 标志去掉元数据（否则带 LIST chunk 被 Lite 拒绝）

### 6.2 m4a 直送优化（可选）

方案 A（转码）已经验证可行。但 m4a 可以直送 Lite，无需转码。Round 1 可以考虑：
- m4a/aac 等 Lite 原生支持的格式 → 直送，跳过转码
- webm/mp4 等不支持的格式 → ffmpeg 转码为 WAV

这能减少转码开销和 WAV 体积膨胀（160KB m4a → 269KB WAV，膨胀 68%）。

### 6.3 未验证项（iOS mp4）

评审反馈允许 iOS mp4 后补。当前只有 Android m4a 样本。iOS Safari 的 MediaRecorder 产出 mp4，需要：
- 验证 mp4 是否能被 Lite 直接收（可能可以，因为 m4a 本质是 mp4 容器）
- 如不能，验证 ffmpeg 转码 mp4 → WAV

---

## 7. 数据脱敏说明

- 报告不含 API Key（JSON 中仅保留 `ark-f0...96a9` 脱敏预览）
- transcript 只保留完整内容（20 字符），因为内容为标准数学口述示例，无个人隐私
- 原始 m4a 文件已在 `.gitignore` 中排除，不提交到 git

---

## 8. 下一步

1. **将本报告和修订后的转码参数反馈到方案文档** `doc/plan/stage3-audio-transcript-plan.md`
2. **等待用户确认后进入 Round 1**：
   - audio_meta 分号格式解析 bug 修复
   - 转码模块实现（使用文件输出 + `-bitexact`）
   - audioStatus 空 transcript 处理
   - mock 测试
3. **iOS mp4 样本可后补**，不阻塞 Round 1
