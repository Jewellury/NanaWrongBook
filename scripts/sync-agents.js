/**
 * sync-agents.js
 *
 * 从 doc/agents/（canonical）同步正文到 .claude/agents/ 和 .opencode/agents/（运行时加载层）。
 *
 * - .claude/agents/ 输出 = canonical 指针注释头 + 空行 + 正文
 * - .opencode/agents/ 输出 = 目标文件已有 YAML frontmatter + 空行 + 正文
 *   （如果目标文件不存在，报错并提示先生成 frontmatter 骨架）
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
      const frontmatterEnd = endIndex + 2; // +1 for slice offset, +1 for the closing ---
      return {
        frontmatter: lines.slice(0, frontmatterEnd).join('\n'),
        body: lines.slice(frontmatterEnd).join('\n').trimStart(),
      };
    }
  }
  return null;
}

/**
 * Extract the body (non-canonical-pointer) content from a canonical file.
 * Strips the leading "> **Canonical source.**" block comment and any trailing canonical notes.
 */
function extractCanonicalBody(content) {
  // Normalize line endings
  let text = content.replace(/\r\n/g, '\n');

  // Remove the canonical source pointer block (lines starting with "> " at the top)
  const lines = text.split('\n');
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('> **Canonical source.**')) {
      // Skip this line and subsequent continuation lines
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
  // Remove trailing whitespace/empty lines at the very end (canonical normalization)
  body = body.replace(/\n{3,}$/, '\n\n');
  return body.trimEnd() + '\n';
}

function sync() {
  const errors = [];
  let synced = 0;

  for (const agent of AGENTS) {
    const canonicalPath = path.join(CANONICAL_DIR, agent);
    const canonicalContent = readFileSafe(canonicalPath);

    if (!canonicalContent) {
      errors.push(`Canonical file not found: ${canonicalPath}`);
      continue;
    }

    const canonicalBody = extractCanonicalBody(canonicalContent);

    // --- Sync to .claude/agents/ ---
    const claudePath = path.join(CLAUDE_DIR, agent);
    const claudeExisting = readFileSafe(claudePath);
    if (!claudeExisting) {
      errors.push(`Target file not found: ${claudePath}. Create the file with a frontmatter skeleton first.`);
    } else {
      const claudeHeader = `> **Canonical source:** \`doc/agents/${agent}\` — 修改规则请改 canonical，再运行 \`node scripts/sync-agents.js\`。\n> 运行时加载文件不得独立修改规则本体。\n`;
      const claudeOutput = claudeHeader + '\n' + canonicalBody;
      fs.writeFileSync(claudePath, claudeOutput, 'utf-8');
      console.log(`  synced: .claude/agents/${agent}`);
      synced++;
    }

    // --- Sync to .opencode/agents/ ---
    const opencodePath = path.join(OPENCODE_DIR, agent);
    const opencodeExisting = readFileSafe(opencodePath);
    if (!opencodeExisting) {
      errors.push(`Target file not found: ${opencodePath}. Create the file with YAML frontmatter skeleton first.`);
    } else {
      const parsed = extractFrontmatter(opencodeExisting);
      if (!parsed) {
        errors.push(`No YAML frontmatter found in ${opencodePath}. Cannot sync.`);
      } else {
        const opencodeOutput = parsed.frontmatter + '\n\n' + canonicalBody;
        fs.writeFileSync(opencodePath, opencodeOutput, 'utf-8');
        console.log(`  synced: .opencode/agents/${agent}`);
        synced++;
      }
    }
  }

  if (errors.length > 0) {
    console.error('\nErrors:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`\nDone: ${synced}/6 files synced.`);
  console.log('Run node scripts/check-agent-sync.js to verify.');
}

sync();
