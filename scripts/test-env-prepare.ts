/**
 * test:env:prepare — 统一测试环境准备入口（PR-1）
 *
 * 职责（r2.1 约束 1）：
 * - CI 在 job 级显式设置绝对 DATABASE_URL=file:<repo>/data/test/<job>.db
 * - 脚本只负责：验证路径在白名单内、删除重建该文件、初始化 schema/seed
 * - 本地未提供 DATABASE_URL 时，才生成固定的 profile 路径（data/test/<profile>.db）
 * - 不引入 nanoid，需要唯一 ID 时用 Node 内置 crypto.randomUUID()
 *
 * 安全约束（外部评审 P1-1）：
 * - 解析后的绝对路径必须位于 <repo>/data/test/ 内，否则 exit 1 + DATABASE_URL_NOT_IN_WHITELIST
 * - 只允许删除/重建白名单内的临时文件
 * - 禁止对普通 DATABASE_URL 使用 --accept-data-loss
 * - 输出 errorCode/errorMessage，catch 中不吞掉真实异常
 *
 * profile 设计（外部评审 P1-5）：
 * - domain: 只需 DATABASE_URL/NEXTAUTH_SECRET/NEXTAUTH_URL（集成/领域测试）
 * - api:    需要 Provider 变量（真实 HTTP API 契约测试）
 * - ui:     只需公共变量（浏览器 UI 契约测试，page.route 拦截，不需 Provider）
 * - canary: 需要 Provider 变量（开发栈全链路测试）
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

interface PreflightReport {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  profile: string;
  dbPath: string;
  schemaOk: boolean;
  seedOk: boolean;
  counts: {
    knowledgeNode: number;
    textbookTopic: number;
    textbookNodeMapping: number;
  };
  envOk: boolean;
  missingEnv: string[];
  durationMs: number;
}

const REPO_ROOT = process.cwd();
const ALLOWED_TEST_DIR = path.resolve(REPO_ROOT, 'data', 'test');

const COMMON_REQUIRED = ['NEXTAUTH_SECRET', 'NEXTAUTH_URL'];
const PROVIDER_REQUIRED = ['VOLCENGINE_API_KEY', 'VOLCENGINE_BASE_URL', 'LITE_ENDPOINT_ID'];

function profileEnvRequirements(profile: string): string[] {
  switch (profile) {
    case 'domain':
      // 集成/领域测试 mock next-auth，不依赖真实会话变量
      return [];
    case 'api':
      return [...PROVIDER_REQUIRED];
    case 'ui':
      // UI 契约拦截 /process，不调 Provider；但仍需真实 NextAuth 会话
      return [...COMMON_REQUIRED];
    case 'canary':
      return [...COMMON_REQUIRED, ...PROVIDER_REQUIRED];
    default:
      throw new Error(`INVALID_PROFILE: ${profile}`);
  }
}

function parseProfile(): string {
  const arg = process.argv.find((a) => a.startsWith('--profile='));
  const profile = arg ? arg.split('=')[1] : 'domain';
  if (!['domain', 'api', 'ui', 'canary'].includes(profile)) {
    throw new Error(`INVALID_PROFILE: ${profile}`);
  }
  return profile;
}

function resolveDbPath(profile: string): string {
  const envUrl = (process.env.DATABASE_URL ?? '').trim();
  if (envUrl) {
    // CI 显式传入路径：只校验 + 使用，不生成
    const filePath = envUrl.replace(/^file:/, '');
    const abs = path.resolve(filePath);
    validateDbPath(abs);
    return abs;
  }
  // 本地未提供路径：生成固定 profile 路径（data/test/<profile>.db）
  return path.join(ALLOWED_TEST_DIR, `${profile}.db`);
}

function validateDbPath(abs: string): void {
  const allowedAbs = path.resolve(ALLOWED_TEST_DIR);
  const relative = path.relative(allowedAbs, abs);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `DATABASE_URL_NOT_IN_WHITELIST: ${abs} 不在 ${allowedAbs} 下（拒绝操作非测试库）`,
    );
  }
}

async function main(): Promise<void> {
  const start = Date.now();
  const report: PreflightReport = {
    ok: false,
    profile: '',
    dbPath: '',
    schemaOk: false,
    seedOk: false,
    counts: { knowledgeNode: 0, textbookTopic: 0, textbookNodeMapping: 0 },
    envOk: false,
    missingEnv: [],
    durationMs: 0,
  };

  try {
    const profile = parseProfile();
    report.profile = profile;

    // 1. 确定 DB 路径（CI 显式传入 → 校验；本地 → 固定 profile 路径）
    const dbPath = resolveDbPath(profile);
    report.dbPath = dbPath;
    // 写回环境变量，让后续 prisma/tsx 命令使用同一路径
    process.env.DATABASE_URL = `file:${dbPath}`;

    // 2. 按 profile 检查 env（DATABASE_URL 已由脚本确定，不算缺失项）
    const required = profileEnvRequirements(profile);
    for (const key of required) {
      if (!process.env[key]) report.missingEnv.push(key);
    }
    report.envOk = report.missingEnv.length === 0;
    if (!report.envOk) {
      throw new Error(`MISSING_ENV: ${report.missingEnv.join(', ')}`);
    }

    // 3. 安全删除并重建临时 DB 文件（只删白名单内）
    fs.mkdirSync(ALLOWED_TEST_DIR, { recursive: true });
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    // 4. schema + seed（不加 --accept-data-loss）
    execSync('npx prisma db push', { stdio: 'inherit' });
    execSync('npx prisma db seed', { stdio: 'inherit' });
    execSync('npx tsx prisma/seed_graph.ts', { stdio: 'inherit' });
    execSync('npx tsx prisma/seed_textbook_topics.ts', { stdio: 'inherit' });
    report.schemaOk = true;
    report.seedOk = true;

    // 5. 验证数量（DATABASE_URL 已写回 process.env，PrismaClient 从 env 读取）
    const prisma = new PrismaClient();
    report.counts.knowledgeNode = await prisma.knowledgeNode.count();
    report.counts.textbookTopic = await prisma.textbookTopic.count();
    report.counts.textbookNodeMapping = await prisma.textbookNodeMapping.count();
    await prisma.$disconnect();

    report.ok =
      report.counts.knowledgeNode >= 48 &&
      report.counts.textbookTopic === 16 &&
      report.counts.textbookNodeMapping === 48;

    if (!report.ok) {
      throw new Error(
        `SEED_COUNT_MISMATCH: KnowledgeNode=${report.counts.knowledgeNode}(需≥48), TextbookTopic=${report.counts.textbookTopic}(需=16), TextbookNodeMapping=${report.counts.textbookNodeMapping}(需=48)`,
      );
    }
  } catch (e) {
    report.ok = false;
    const msg = e instanceof Error ? e.message : String(e);
    // 从消息头提取 errorCode（如 DATABASE_URL_NOT_IN_WHITELIST: ...）
    const codeMatch = msg.match(/^([A-Z_]+):/);
    report.errorCode = codeMatch ? codeMatch[1] : 'UNKNOWN_ERROR';
    report.errorMessage = msg;
    // 显式打印原始错误，不吞掉（r2.1 要求）
    console.error(`[test-env-prepare] failed: ${e instanceof Error ? e.stack : msg}`);
  } finally {
    report.durationMs = Date.now() - start;
    console.log(`[test-env-prepare] ${JSON.stringify(report)}`);
    process.exit(report.ok ? 0 : 1);
  }
}

main();
