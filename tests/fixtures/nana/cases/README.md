# E2E 测试 Fixture — Nana 拍题图片

> 由 `scripts/prepare-e2e-fixtures.ts` 自动生成，请勿手动修改。

## 文件清单

| 文件 | 用途 | 隐私检查 |
|------|------|:--------:|
| `clear-printed.jpg` | 清晰印刷题图（无手写） | ⚠️ 待确认 |
| `with-handwriting.jpg` | 含手写解答的题图 | ⚠️ 待确认 |
| `tilted-partial.jpg` | 倾斜/不完整但可识别的题图 | ⚠️ 待确认 |

## 来源

- 源目录: `doc/research/vision-samples/handheld/`（不入 git）
- 原始图片: 20 张学生手持拍照数学题，由外甥女拍摄
- 挑选依据: `doc/research/vision-samples/handheld-report.md` 的 AI 逐条分析报告

## 隐私状态

**⚠️ 待目视确认**

AI 分析报告中未提及姓名、学校、班级、手机号等个人信息，
但文本分析无法替代视觉检查。使用前请逐张目视确认。

如发现隐私信息：
1. 优先更换为同类无隐私图片
2. 如必须使用，先打码处理

## 压缩参数

- 最大宽度: 1280px
- JPEG quality: 80（超限时自动降级）
- 单张上限: 200 KB
- 总计: 414 KB

## 重新生成

```bash
npx tsx scripts/prepare-e2e-fixtures.ts
```
