/**
 * check-agent-sync.js
 *
 * 验证 .claude/agents/ 和 .opencode/agents/ 的正文部分与 doc/agents/（canonical）是否一致。
 *
 * 两端运行时文件都有各自的 YAML frontmatter + canonical pointer 注释 + 正文。
 * canonical 文件只有 canonical pointer 注释 + 正文（无 frontmatter）。
 * 比较时统一提取正文部分后对比。
 *
 * 对比前做行尾归一化（\r\n → \n）、去除 BOM、移除末尾空行，避免 Windows 下的假阳性。
 *
 * - 一致 → exit 0，打印 OK
 * - 不一致 → exit 1，打印具体差异文件
 *
 * 用法: node scripts/check-agent-sync.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL_DIR = path.join(ROOT, 'doc', 'agents');
const CLAUDE_DIR = path.join(ROOT, '.claude', 'agents');
const OPENCODE_DIR = path.join(ROOT, '.opencode', 'agents');

const AGENTS = ['plan-agent.md', 'execute-agent.md', 'audit-agent.md'];

/**
 * Normalize text for comparison: strip BOM, normalize CRLF→LF, trim trailing empty lines.
 */
function normalize(text) {
  let t = text;
  if (t.charCodeAt(0) === 0xFEFF) {
    t = t.slice(1);
  }
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  t = t.replace(/[\t ]+$/gm, '');
  t = t.replace(/\n{3,}$/, '\n');
  return t;
}

/**
 * Strip YAML frontmatter block (--- ... ---) if present.
 * Returns the body after frontmatter.
 */
function stripFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0] && lines[0].trim() === '---') {
    const endIndex = lines.slice(1).findIndex(l => l.trim() === '---');
    if (endIndex !== -1) {
      return lines.slice(endIndex + 2).join('\n').trimStart();
    }
  }
  return text;
}

/**
 * Extract the body content from a canonical file: strip the canonical source pointer block.
 */
function extractCanonicalBody(content) {
  let text = stripFrontmatter(normalize(content));
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
  let body = lines.slice(startIdx).join('\n').trimEnd() + '\n';
  return normalize(body);
}

/**
 * Extract the body from a runtime file (either .claude/agents/ or .opencode/agents/).
 * Both now have YAML frontmatter → canonical pointer comment → body.
 * Strip both and return only the body.
 */
function extractRuntimeBody(content) {
  let text = normalize(content);

  // Strip YAML frontmatter (--- ... ---) — both Claude and OpenCode have this
  text = stripFrontmatter(text);

  // Strip canonical pointer comment block (lines starting with "> ")
  const lines = text.split('\n');
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('> **Canonical source:**')) {
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
  let body = lines.slice(startIdx).join('\n').trimEnd() + '\n';
  return normalize(body);
}

function check() {
  const mismatches = [];
  let checked = 0;
  let ok = 0;

  for (const agent of AGENTS) {
    const canonicalPath = path.join(CANONICAL_DIR, agent);
    const claudePath = path.join(CLAUDE_DIR, agent);
    const opencodePath = path.join(OPENCODE_DIR, agent);

    const canonicalContent = readFileSafe(canonicalPath);
    const claudeContent = readFileSafe(claudePath);
    const opencodeContent = readFileSafe(opencodePath);

    if (!canonicalContent) {
      mismatches.push(`MISSING: ${canonicalPath}`);
      continue;
    }
    if (!claudeContent) {
      mismatches.push(`MISSING: ${claudePath}`);
      continue;
    }
    if (!opencodeContent) {
      mismatches.push(`MISSING: ${opencodePath}`);
      continue;
    }

    const canonicalBody = extractCanonicalBody(canonicalContent);
    const claudeBody = extractRuntimeBody(claudeContent);
    const opencodeBody = extractRuntimeBody(opencodeContent);

    let mismatch = false;

    if (canonicalBody !== claudeBody) {
      mismatches.push(`MISMATCH: .claude/agents/${agent} differs from canonical`);
      mismatch = true;
    }

    if (canonicalBody !== opencodeBody) {
      mismatches.push(`MISMATCH: .opencode/agents/${agent} differs from canonical`);
      mismatch = true;
    }

    checked++;
    if (!mismatch) {
      ok++;
      console.log(`  OK: ${agent}`);
    }
  }

  if (mismatches.length > 0) {
    console.error(`\n${mismatches.length} mismatch(es) found:`);
    mismatches.forEach(m => console.error(`  - ${m}`));
    process.exit(1);
  }

  console.log(`\nOK: ${ok}/${checked} agents in sync.`);
  process.exit(0);
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

check();
