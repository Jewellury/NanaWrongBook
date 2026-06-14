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
 * 对应事故：M2 生产库污染（doc/reference/M2-prod-contamination-postmortem.md）
 */

const ALLOWED_DATABASE_URLS = [
  'file:/app/data/test.db',    // Docker 测试容器内路径
  'file:./data/test/test.db',  // 本地相对路径
];

const url = (process.env.DATABASE_URL ?? '').trim();

if (!ALLOWED_DATABASE_URLS.includes(url)) {
  throw new Error(
    `🛑 测试禁止连接非测试库。\n` +
    `当前 DATABASE_URL="${url || '(空)'}"\n` +
    `白名单: ${ALLOWED_DATABASE_URLS.join(', ')}\n` +
    `如果你确信需要加新路径，请修改本文件的白名单数组，不要关掉检查。`
  );
}
