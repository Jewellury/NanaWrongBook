/**
 * sync-agents.js
 *
 * 从 doc/agents/（canonical）同步正文到 .claude/agents/ 和 .opencode/agents/（运行时加载层）。
 *
 * 两端现在都有 YAML frontmatter，同步时：
 *   - 从目标文件提取并保留 YAML frontmatter（Claude 和 OpenCode 格式不同）
 *   - 从 canonical 提取正文（去除 canonical source pointer 注释头）
 *   - 输出 = 各自的 YAML frontmatter + 空行 + canonical 正文
 *
 * 用法: node scripts/sync-agents.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL_DIR = path.join(ROOT, 'doc', 'agents');
const CLAUDE_DIR = path.join(ROOT, '.claude', 'agents');
const OPENCODE_DIR = path.join(ROOT, '.opencode', 'agents');

const AGENTS = ['plan-agent.md', 'execute-agent.md', 'audit-agent.md'];

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Extract the YAML frontmatter block from a file.
 * Returns { frontmatter, body } or null if no frontmatter found.
 */
function extractFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] && lines[0].trim() === '---') {
    const endIndex = lines.slice(1).findIndex(l => l.trim() === '---');
    if (endIndex !== -1) {
      const frontmatterEnd = endIndex + 2;
      return {
        frontmatter: lines.slice(0, frontmatterEnd).join('\n'),
        body: lines.slice(frontmatterEnd).join('\n').trimStart(),
      };
    }
  }
  return null;
}

/**
 * Extract canonical body by stripping the leading canonical source pointer block.
 */
function extractCanonicalBody(content) {
  let text = content.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('> **Canonical source.**')) {
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i].trim() === '>' || lines[i].trim() === '')) {
        i++;
        if (i < lines.length && lines[i].trim() === '' && i + 1 < lines.length && !lines[i + 1].startsWith('> ')) {
          i++;
          break;
        }
      }
      startIdx = i;
      break;
    }
  }
  let body = lines.slice(startIdx).join('\n');
  body = body.replace(/\n{3,}$/, '\n\n');
  return body.trimEnd() + '\n';
}

/**
 * Sync body to a runtime target file, preserving its YAML frontmatter.
 */
function syncRuntime(runtimeDir, runtimeName, dryRun) {
  let synced = 0;
  const errors = [];

  for (const agent of AGENTS) {
    const canonicalPath = path.join(CANONICAL_DIR, agent);
    const targetPath = path.join(runtimeDir, agent);

    const canonicalContent = readFileSafe(canonicalPath);
    if (!canonicalContent) {
      errors.push(`Canonical file not found: ${canonicalPath}`);
      continue;
    }

    const targetContent = readFileSafe(targetPath);
    if (!targetContent) {
      errors.push(`Target file not found: ${targetPath}. Create it with YAML frontmatter skeleton first.`);
      continue;
    }

    const parsed = extractFrontmatter(targetContent);
    if (!parsed) {
      errors.push(`No YAML frontmatter found in ${targetPath}. Cannot sync.`);
      continue;
    }

    const canonicalBody = extractCanonicalBody(canonicalContent);
    const output = parsed.frontmatter + '\n\n' + canonicalBody;

    if (dryRun) {
      if (targetContent === output) {
        console.log(`  OK: ${runtimeName}/${agent} (already in sync)`);
      } else {
        console.log(`  WOULD UPDATE: ${runtimeName}/${agent}`);
        synced++;
      }
    } else {
      fs.writeFileSync(targetPath, output, 'utf-8');
      console.log(`  synced: ${runtimeName}/${agent}`);
      synced++;
    }
  }

  if (errors.length > 0) {
    errors.forEach(e => console.error(`  - ${e}`));
  }
  return { synced, errors };
}

function sync() {
  console.log('Syncing canonical → runtimes...\n');

  const claudeResult = syncRuntime(CLAUDE_DIR, '.claude/agents', false);
  const opencodeResult = syncRuntime(OPENCODE_DIR, '.opencode/agents', false);

  const totalSynced = claudeResult.synced + opencodeResult.synced;
  const totalErrors = claudeResult.errors.length + opencodeResult.errors.length;

  if (totalErrors > 0) {
    console.error(`\n${totalErrors} error(s) encountered.`);
    process.exit(1);
  }

  console.log(`\nDone: ${totalSynced}/6 files synced.`);
  console.log('Run node scripts/check-agent-sync.js to verify.');
}

sync();
