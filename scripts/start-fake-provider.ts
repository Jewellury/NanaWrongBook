/**
 * 假豆包 Provider CI/本地启动入口（r3.1 任务 2.9 CI 修复）
 *
 * 用途：替代此前 `npx tsx -e "import(...)"` 的不稳定启动方式。
 * PR #3 暴露的根因（详见 doc/plan/nana-test-framework-ci-fix-plan.md）：
 *   - `npx tsx -e` 的 -e 模式在 Node 22 + tsx 组合下，对 .ts 动态 import 行为不稳定，
 *     现象：fake-provider.log 报 `m.startFakeProvider is not a function`（实际 export 存在）。
 *   - 换独立脚本文件后，tsx 走正常文件加载路径，行为可预测。
 *
 * 用法：
 *   CI:    nohup npx tsx scripts/start-fake-provider.ts > /tmp/fake-provider.log 2>&1 &
 *   本地:  npx tsx scripts/start-fake-provider.ts   （Ctrl+C 退出）
 *
 * 端口：默认 3999，与 ci.yml 的 VOLCENGINE_BASE_URL 一致。
 *       可通过 FAKE_PROVIDER_PORT 环境变量覆写（测试用 3998 避免冲突）。
 *
 * 关联：
 *   - e2e/helpers/fake-provider-server.ts：实现源（export startFakeProvider / stopFakeProvider）
 *   - .github/workflows/ci.yml：e2e-test job 的 Start/Stop step
 */
import { startFakeProvider, stopFakeProvider } from '../e2e/helpers/fake-provider-server';

const PORT = Number(process.env.FAKE_PROVIDER_PORT) || 3999;

async function main() {
  const { server, port } = await startFakeProvider(PORT);
  console.log(`fake-provider listening on ${port}`);

  // 幂等保护：狂按 Ctrl+C 或 SIGTERM/SIGINT 同时到达时，避免 shutdown 重入导致
  // stopFakeProvider(server) 被多次调用（第二次 server.close() 会回调 error，走 catch 退出 1）
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`received ${signal}, shutting down...`);
    try {
      await stopFakeProvider(server);
      console.log('fake-provider stopped cleanly');
      process.exit(0);
    } catch (err) {
      console.error('error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('failed to start fake-provider:', err);
  process.exit(1);
});
