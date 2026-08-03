/**
 * DB 护栏断言 —— 测试禁止连接生产库
 *
 * 在任何测试启动前执行。DATABASE_URL 不在白名单中时，
 * 立即抛出错误，拒绝运行。
 *
 * 白名单是唯一真相源：
 * - 绝不准松成子串匹配或关掉检查
 * - 万一路径变了被误拦，只准加白名单条目
 * - 空值也会被白名单挡下
 *
 * 判定规则（PR-1 起）：
 * 1. 精确匹配白名单条目（如 Docker 容器内路径 `file:/app/data/test.db`）
 * 2. 或解析后绝对路径位于仓库 `<cwd>/data/test/` 目录内
 *    ——这是目录包含判定，不是子串匹配。test:env:prepare 生成的
 *    `file:./data/test/<profile>.db` 与 CI 的绝对路径都经此放行，
 *    但任何指向 `data/` 以外（如 `dev.db`、`/app/data/dev.db`）的路径都会被拒绝。
 *
 * 对应事故：M2 生产库污染（doc/reference/M2-prod-contamination-postmortem.md）
 */

import path from 'path';

const ALLOWED_EXACT = [
  'file:/app/data/test.db',    // Docker 测试容器内路径
];

function isAllowed(url: string): boolean {
  if (ALLOWED_EXACT.includes(url)) return true;

  // 目录包含判定：解析 file: 后的路径，必须在 <cwd>/data/test/ 内
  if (!url.startsWith('file:')) return false;
  const filePath = url.slice('file:'.length);
  const abs = path.resolve(filePath);
  const allowedDir = path.resolve(process.cwd(), 'data', 'test');
  const relative = path.relative(allowedDir, abs);
  // relative 为 '..' 开头或绝对路径 = 在目录外
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  return true;
}

const url = (process.env.DATABASE_URL ?? '').trim();

if (!isAllowed(url)) {
  throw new Error(
    `🛑 测试禁止连接非测试库。\n` +
    `当前 DATABASE_URL="${url || '(空)'}"\n` +
    `允许：精确匹配 ${ALLOWED_EXACT.join(', ')}，或位于 <cwd>/data/test/ 目录内\n` +
    `如果你确信需要加新路径，请修改本文件的白名单逻辑，不要关掉检查。`
  );
}
