# 音频样本目录

本目录存放 E2E 测试和 Round 0 Spike 用的音频样本。

## E2E 测试音频（虚拟麦克风用）

| 文件 | 类型 | 状态 |
|------|------|------|
| `math-voice-sample.wav` | 静默 WAV 占位（3 秒，16000Hz 单声道 PCM） | ⚠️ **@TODO 真实数学口述** |

### @TODO：真实数学口述

`math-voice-sample.wav` 当前是 ffmpeg 生成的静默占位，用于让 Chromium fake-media 链路跑通
（getUserMedia → MediaRecorder → webm → ffmpeg 转码 → /process）。**不验证转写内容的真实性**。

后续若需验证真实转写质量（如 S3 音频失败场景、Provider Smoke），应替换为：
- 真实录制的脱敏数学口述，如"这道题我觉得应该先把 x 移到左边"
- 3-5 秒，16000Hz 或更高采样率，单声道
- 不能含姓名、学校等隐私信息

替换后 Chromium flag `--use-file-for-fake-audio-capture` 会自动指向新文件，无需改代码。

### 生成命令（静默占位）

```bash
ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 3 \
  -acodec pcm_s16le tests/fixtures/nana/audio/math-voice-sample.wav
```

## Spike 录音样本

本目录原本存放 Round 0 Spike 用的真实手机录音样本（如 `20260707_194923.m4a`）。

### 如何获取录音

1. 用手机浏览器打开 nana.nanatop.xyz/nana（或本地开发地址）
2. 进入采集页面，点击"说说看"录音
3. 录一段数学口述，如"这道题我觉得应该先把 x 移到左边"
4. 保存题目后，从浏览器 DevTools 或服务端获取 audio_note 的 base64 数据
5. 解码为原始文件，放到本目录

或者直接用手机自带录音 app 录制，然后转换格式。

## 支持格式

`.webm` / `.mp4` / `.m4a` / `.mp3` / `.wav` / `.aac` / `.flac` / `.ogg`

## 注意

- **Spike 录音不提交到 git**（.gitignore 已排除 *.m4a 等真实音频）
- 静默占位 WAV 可提交（不含隐私，用于虚拟麦克风链路验证）
- Spike 脚本不写数据库，不经过 /process route，只直接调 Lite API

