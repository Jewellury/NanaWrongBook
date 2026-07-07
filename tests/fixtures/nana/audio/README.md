# 音频样本目录

本目录存放 Round 0 Spike 用的真实手机录音样本。

## 如何获取录音

1. 用手机浏览器打开 nana.nanatop.xyz/nana（或本地开发地址）
2. 进入采集页面，点击"说说看"录音
3. 录一段数学口述，如"这道题我觉得应该先把 x 移到左边"
4. 保存题目后，从浏览器 DevTools 或服务端获取 audio_note 的 base64 数据
5. 解码为原始文件，放到本目录

或者直接用手机自带录音 app 录制，然后转换格式。

## 文件命名

建议格式：`{设备}-{格式}-{序号}.{扩展名}`

示例：
- `android-webm-01.webm` — Android 手机 Chrome 浏览器录音
- `ios-mp4-01.mp4` — iOS Safari 浏览器录音
- `android-m4a-01.m4a` — Android 录音 app 导出

## 支持格式

`.webm` / `.mp4` / `.m4a` / `.mp3` / `.wav` / `.aac` / `.flac` / `.ogg`

## 注意

- **不要提交真实音频样本到 git**（.gitignore 应排除此目录下的音频文件）
- Spike 脚本不写数据库，不经过 /process route，只直接调 Lite API
- 报告中只保留 transcript 前 80 字符，不保留完整口述原文
