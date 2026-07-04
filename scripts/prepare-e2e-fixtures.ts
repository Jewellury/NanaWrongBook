/**
 * prepare-e2e-fixtures.ts
 *
 * 从 doc/research/vision-samples/handheld/ 挑选 3 张代表性图片，
 * 压缩后输出到 tests/fixtures/nana/cases/ 作为 E2E 测试 fixture。
 *
 * 用法：
 *   npx tsx scripts/prepare-e2e-fixtures.ts
 *
 * 前置：
 *   npm install -D sharp
 *   （或检查 node_modules/.package-lock.json 中是否已有 sharp，Next.js 可选依赖）
 *
 * ⚠️ 运行前请先目视检查源图片，确认无隐私信息（姓名、学校、班级、手机号）。
 *    如含隐私，请先打码或更换图片。
 */

import { promises as fs } from 'fs';
import path from 'path';

// 动态导入 sharp（可能是可选依赖）
let sharp: typeof import('sharp');
try {
  sharp = require('sharp');
} catch {
  console.error('❌ sharp 未安装。请先运行: npm install -D sharp');
  process.exit(1);
}

// ─── 配置 ────────────────────────────────────────

const SOURCE_DIR = path.join(process.cwd(), 'doc', 'research', 'vision-samples', 'handheld');
const OUTPUT_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'nana', 'cases');

// 候选图片映射（基于 handheld-report.md 的 AI 分析报告挑选）
const FIXTURES = [
  {
    source: '微信图片_20260620133628_621_23.jpg',
    output: 'clear-printed.jpg',
    description: '清晰印刷题图（无手写）',
    reportNote: '报告标注"图片未提供标准答案"，纯印刷题面，题面完整可识别',
  },
  {
    source: '微信图片_20260620134151_628_23.jpg',
    output: 'with-handwriting.jpg',
    description: '含手写解答的题图',
    reportNote: '报告标注有详细手写解答（含导数推导过程），题面+手写共存',
  },
  {
    source: '微信图片_20260620134556_637_23.jpg',
    output: 'tilted-partial.jpg',
    description: '倾斜/不完整但可识别的题图',
    reportNote: '报告标注"只拍到大题一部分，题号+(1)在画面外"——采集不完整',
  },
] as const;

// 压缩参数
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 80;
const MAX_SIZE_KB = 200;

// ─── 主流程 ────────────────────────────────────────

async function main() {
  console.log('=== E2E Fixture 准备脚本 ===\n');

  // 1. 检查源目录
  try {
    await fs.access(SOURCE_DIR);
  } catch {
    console.error(`❌ 源目录不存在: ${SOURCE_DIR}`);
    console.error('   请确认 doc/research/vision-samples/handheld/ 目录存在且有图片。');
    process.exit(1);
  }

  // 2. 创建输出目录
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`输出目录: ${OUTPUT_DIR}\n`);

  // 3. 逐个处理
  const results: Array<{ name: string; originalKB: number; compressedKB: number; }> = [];

  for (const fixture of FIXTURES) {
    const sourcePath = path.join(SOURCE_DIR, fixture.source);
    const outputPath = path.join(OUTPUT_DIR, fixture.output);

    try {
      await fs.access(sourcePath);
    } catch {
      console.error(`❌ 源文件不存在: ${fixture.source}`);
      console.error(`   跳过此 fixture。`);
      continue;
    }

    const originalBuf = await fs.readFile(sourcePath);
    const originalKB = Math.round(originalBuf.length / 1024);

    // 压缩
    let compressedBuf = await sharp(originalBuf)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    // 如果仍超过 MAX_SIZE_KB，逐步降低质量
    let quality = JPEG_QUALITY;
    while (compressedBuf.length / 1024 > MAX_SIZE_KB && quality > 30) {
      quality -= 10;
      compressedBuf = await sharp(originalBuf)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    }

    const compressedKB = Math.round(compressedBuf.length / 1024);

    await fs.writeFile(outputPath, compressedBuf);

    console.log(`✅ ${fixture.output}`);
    console.log(`   源: ${fixture.source} (${originalKB} KB)`);
    console.log(`   压缩后: ${compressedKB} KB (quality=${quality})`);
    console.log(`   用途: ${fixture.description}`);
    console.log(`   报告依据: ${fixture.reportNote}\n`);

    results.push({ name: fixture.output, originalKB, compressedKB });
  }

  // 4. 汇总
  console.log('=== 汇总 ===');
  const totalKB = results.reduce((sum, r) => sum + r.compressedKB, 0);
  console.log(`共生成 ${results.length} 个 fixture，总计 ${totalKB} KB`);
  if (totalKB > 600) {
    console.warn(`⚠️ 总体积 ${totalKB} KB > 600 KB，考虑进一步压缩。`);
  }

  // 5. 生成 README
  const readmePath = path.join(OUTPUT_DIR, 'README.md');
  const readmeContent = `# E2E 测试 Fixture — Nana 拍题图片

> 由 \`scripts/prepare-e2e-fixtures.ts\` 自动生成，请勿手动修改。

## 文件清单

| 文件 | 用途 | 隐私检查 |
|------|------|:--------:|
| \`clear-printed.jpg\` | 清晰印刷题图（无手写） | ⚠️ 待确认 |
| \`with-handwriting.jpg\` | 含手写解答的题图 | ⚠️ 待确认 |
| \`tilted-partial.jpg\` | 倾斜/不完整但可识别的题图 | ⚠️ 待确认 |

## 来源

- 源目录: \`doc/research/vision-samples/handheld/\`（不入 git）
- 原始图片: 20 张学生手持拍照数学题，由外甥女拍摄
- 挑选依据: \`doc/research/vision-samples/handheld-report.md\` 的 AI 逐条分析报告

## 隐私状态

**⚠️ 待目视确认**

AI 分析报告中未提及姓名、学校、班级、手机号等个人信息，
但文本分析无法替代视觉检查。使用前请逐张目视确认。

如发现隐私信息：
1. 优先更换为同类无隐私图片
2. 如必须使用，先打码处理

## 压缩参数

- 最大宽度: ${MAX_WIDTH}px
- JPEG quality: ${JPEG_QUALITY}（超限时自动降级）
- 单张上限: ${MAX_SIZE_KB} KB
- 总计: ${totalKB} KB

## 重新生成

\`\`\`bash
npx tsx scripts/prepare-e2e-fixtures.ts
\`\`\`
`;
  await fs.writeFile(readmePath, readmeContent);
  console.log(`\n📄 README 已生成: ${readmePath}`);

  // 6. 提醒隐私检查
  console.log('\n⚠️  隐私检查提醒:');
  console.log('   请逐张目视检查输出目录中的 3 张图片，');
  console.log('   确认无姓名、学校、班级、手机号等隐私信息。');
  console.log('   确认后请将 README 中的"⚠️ 待确认"改为"✅ 已确认"。');
}

main().catch((err) => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
