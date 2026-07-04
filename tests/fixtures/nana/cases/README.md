# E2E 测试 Fixture — Nana 拍题图片

> 由 `scripts/prepare-e2e-fixtures.ts` 自动生成，描述部分经人工目视修正。

## 文件清单

| 文件 | 用途 | 隐私检查 |
|------|------|:--------:|
| `clear-printed.jpg` | 清晰题图（含手写解答痕迹，题面完整可识别） | ✅ 已确认 |
| `with-handwriting.jpg` | 含详细手写解答的题图（导数推导过程） | ✅ 已确认 |
| `tilted-partial.jpg` | 倾斜/不完整但可识别的题图（有空白姓名/学号栏但未填写） | ✅ 已确认 |

## 来源

- 源目录: `doc/research/vision-samples/handheld/`（不入 git）
- 原始图片: 20 张学生手持拍照数学题，由外甥女拍摄
- 挑选依据: `doc/research/vision-samples/handheld-report.md` 的 AI 逐条分析报告

## 隐私状态

**✅ 已目视确认（2026-07-04）**

三张图片经人工逐张目视检查：
- 无学生姓名
- 无学校名称 / 校徽
- 无班级信息
- 无手机号 / 微信号
- `tilted-partial.jpg` 含空白姓名/学号栏，但未填写任何内容，不构成隐私泄露

## 图片描述修正

初始挑选时基于 AI 文本分析报告做的描述，目视后修正如下：

| 文件 | 原描述（AI 报告推断） | 目视修正 |
|------|---------------------|---------|
| `clear-printed.jpg` | 清晰印刷题图（无手写） | **含手写解答痕迹**，非纯印刷，但题面完整可识别 |
| `with-handwriting.jpg` | 含手写解答的题图 | 描述准确，有详细手写推导过程 |
| `tilted-partial.jpg` | 倾斜/不完整但可识别 | 描述准确，另有空白姓名/学号栏（未填写） |

## 压缩参数

- 最大宽度: 1280px
- JPEG quality: 80（超限时自动降级）
- 单张上限: 200 KB
- 总计: 414 KB

## 重新生成

```bash
npx tsx scripts/prepare-e2e-fixtures.ts
```
