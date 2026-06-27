/**
 * 生成手持拍照测试的 HTML 报告 + 判定指南
 * 用法: npx tsx scripts/gen-report-html.ts
 */
import fs from 'fs';
import path from 'path';

const HANDHELD_DIR = 'doc/research/vision-samples/handheld';
const REPORT_MD = 'doc/research/vision-samples/handheld-report.md';
const REPORT_HTML = 'doc/research/vision-samples/handheld-report.html';
const GUIDE_HTML = 'doc/research/vision-samples/judgment-guide.html';

// 图片文件名列表
const IMAGE_FILES = fs.readdirSync(path.resolve(HANDHELD_DIR))
  .filter(f => f.endsWith('.jpg'))
  .sort();

interface ImageEntry {
  index: number;
  fileName: string;
  questionText: string;
  answerText: string;
  analysis: string;
  subject: string;
  knowledgePoints: string;
  promptTokens: number;
  completionTokens: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 渲染到 HTML，保留 $$ LaTeX 和内联 $ LaTeX 供 KaTeX 渲染 */
function renderLatex(text: string): string {
  return escapeHtml(text);
}

function parseReport(): ImageEntry[] {
  const content = fs.readFileSync(path.resolve(REPORT_MD), 'utf-8');
  const entries: ImageEntry[] = [];

  // Split by "### 图片 XX："
  const blocks = content.split(/### 图片 \d+：/);
  blocks.shift(); // remove header

  for (let i = 0; i < blocks.length && i < 20; i++) {
    const block = blocks[i];
    const fileName = IMAGE_FILES[i];

    // Extract XML
    const xmlMatch = block.match(/```xml\n([\s\S]*?)```/);
    if (!xmlMatch) continue;

    const xml = xmlMatch[1];

    function extract(tag: string): string {
      const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].trim() : '';
    }

    // Extract tokens
    const tokenMatch = block.match(/prompt=(\d+)\s*\/\s*completion=(\d+)/);
    const promptTokens = tokenMatch ? parseInt(tokenMatch[1]) : 0;
    const completionTokens = tokenMatch ? parseInt(tokenMatch[2]) : 0;

    entries.push({
      index: i + 1,
      fileName,
      questionText: extract('question_text'),
      answerText: extract('answer_text'),
      analysis: extract('analysis'),
      subject: extract('subject'),
      knowledgePoints: extract('knowledge_points'),
      promptTokens,
      completionTokens,
    });
  }

  return entries;
}

function generateReportHTML(entries: ImageEntry[]): string {
  const totalPrompt = entries.reduce((s, e) => s + e.promptTokens, 0);
  const totalCompletion = entries.reduce((s, e) => s + e.completionTokens, 0);
  const totalTokens = totalPrompt + totalCompletion;

  const imageCards = entries.map(e => {
    const qHtml = renderLatex(e.questionText);
    const aHtml = renderLatex(e.answerText);
    const anHtml = renderLatex(e.analysis);
    const kpHtml = renderLatex(e.knowledgePoints);
    const totalTk = e.promptTokens + e.completionTokens;

    return `
    <div class="card" data-idx="${e.index}">
      <div class="card-header">
        <span class="img-num">#${String(e.index).padStart(2, '0')}</span>
        <span class="img-name">${escapeHtml(e.fileName)}</span>
        <span class="tokens">${totalTk} tokens</span>
      </div>
      <div class="card-body">
        <div class="field">
          <div class="field-label">题面</div>
          <div class="field-value">${qHtml || '<span class="empty">（空）</span>'}</div>
        </div>
        <div class="field">
          <div class="field-label">答案</div>
          <div class="field-value">${aHtml || '<span class="empty">（空）</span>'}</div>
        </div>
        <div class="field">
          <div class="field-label">分析</div>
          <div class="field-value">${anHtml || '<span class="empty">（空）</span>'}</div>
        </div>
        <div class="field-row">
          <div class="field-tag">学科：${escapeHtml(e.subject)}</div>
          <div class="field-tag">知识点：${kpHtml || '<span class="empty">（空）</span>'}</div>
        </div>
      </div>
      <div class="score-area">
        <div class="score-title">✏️ 打分</div>
        <div class="score-grid">
          <label>题面 <input type="number" min="0" max="5" class="score-input" data-dim="q" placeholder="0-5"></label>
          <label>答案 <input type="number" min="0" max="5" class="score-input" data-dim="a" placeholder="0-5"></label>
          <label>分析 <input type="number" min="0" max="5" class="score-input" data-dim="an" placeholder="0-5"></label>
          <label>学科 <input type="number" min="0" max="3" class="score-input" data-dim="s" placeholder="0-3"></label>
          <label>知识点 <input type="number" min="0" max="3" class="score-input" data-dim="k" placeholder="0-3"></label>
        </div>
        <div class="score-total">小计：<span class="subtotal">0</span> / 21</div>
        <input class="remark-input" placeholder="备注（可选）">
      </div>
    </div>`;
  }).join('\n');

  const scoreTableRows = entries.map(e =>
    `<tr>
      <td>${String(e.index).padStart(2, '0')}</td>
      <td><input type="number" min="0" max="5" class="tb-score" data-idx="${e.index}" data-dim="q"></td>
      <td><input type="number" min="0" max="5" class="tb-score" data-idx="${e.index}" data-dim="a"></td>
      <td><input type="number" min="0" max="5" class="tb-score" data-idx="${e.index}" data-dim="an"></td>
      <td><input type="number" min="0" max="3" class="tb-score" data-idx="${e.index}" data-dim="s"></td>
      <td><input type="number" min="0" max="3" class="tb-score" data-idx="${e.index}" data-dim="k"></td>
      <td class="tb-total" data-idx="${e.index}">0</td>
    </tr>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI 拍照识题测试报告</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]});"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
  background: #f9f7f2; color: #2c3e2d; line-height: 1.7; padding: 0;
}
.container { max-width: 800px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 1.6rem; margin-bottom: 8px; color: #2c6e4f; }
.subtitle { color: #666; font-size: 0.85rem; margin-bottom: 24px; }
.stats-bar {
  display: flex; gap: 16px; flex-wrap: wrap; background: #e8f0e4; border-radius: 12px;
  padding: 16px 20px; margin-bottom: 28px; font-size: 0.9rem;
}
.stat-item { display: flex; flex-direction: column; }
.stat-label { color: #666; font-size: 0.75rem; }
.stat-value { font-weight: 600; font-size: 1.1rem; color: #2c6e4f; }

.card {
  background: white; border-radius: 14px; padding: 20px; margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.card-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
  padding-bottom: 12px; border-bottom: 1px solid #eee;
}
.img-num {
  background: #2c6e4f; color: white; width: 32px; height: 32px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 0.85rem; flex-shrink: 0;
}
.img-name { font-size: 0.8rem; color: #888; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tokens { font-size: 0.75rem; color: #aaa; }

.field { margin-bottom: 10px; }
.field-label { font-size: 0.8rem; font-weight: 600; color: #2c6e4f; margin-bottom: 2px; }
.field-value { font-size: 0.92rem; color: #333; }
.field-value .empty { color: #bbb; font-style: italic; }
.field-row { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
.field-tag {
  background: #eef4ea; padding: 4px 10px; border-radius: 6px;
  font-size: 0.8rem; color: #3a5a3a;
}

.score-area { margin-top: 14px; padding-top: 14px; border-top: 1px dashed #ddd; }
.score-title { font-size: 0.9rem; font-weight: 600; margin-bottom: 8px; }
.score-grid { display: flex; gap: 8px; flex-wrap: wrap; }
.score-grid label {
  display: flex; flex-direction: column; align-items: center;
  font-size: 0.78rem; color: #555; gap: 4px;
}
.score-input, .tb-score {
  width: 52px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 6px;
  text-align: center; font-size: 0.9rem;
}
.score-input:focus, .tb-score:focus { outline: 2px solid #2c6e4f; border-color: #2c6e4f; }
.score-total { margin-top: 8px; font-size: 0.9rem; font-weight: 600; color: #2c6e4f; }
.remark-input {
  width: 100%; margin-top: 6px; padding: 6px 10px; border: 1px solid #ddd;
  border-radius: 6px; font-size: 0.85rem;
}

.section-title { font-size: 1.2rem; font-weight: 700; margin: 32px 0 16px; color: #2c6e4f; }

table.score-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 28px; }
table.score-table th { background: #2c6e4f; color: white; padding: 8px 6px; text-align: center; }
table.score-table td { text-align: center; padding: 6px 4px; border-bottom: 1px solid #eee; }
table.score-table td:first-child { font-weight: 600; }
.tb-total { font-weight: 600; color: #2c6e4f; }

.summary-box {
  background: #e8f0e4; border-radius: 12px; padding: 20px; margin-bottom: 28px;
}
.summary-box ol { padding-left: 20px; }
.summary-box li { margin-bottom: 6px; }

.btn-group { display: flex; gap: 12px; flex-wrap: wrap; margin: 20px 0; }
.btn {
  display: inline-block; padding: 10px 24px; border-radius: 8px;
  font-size: 0.9rem; font-weight: 600; cursor: pointer; border: none;
}
.btn-apply { background: #2c6e4f; color: white; }
.btn-apply:hover { background: #235a3f; }
.btn-reset { background: #ddd; color: #333; }
.btn-reset:hover { background: #ccc; }
.btn-export { background: #4a7c59; color: white; }
.btn-export:hover { background: #3d694b; }

#toast {
  display: none; position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: #2c6e4f; color: white; padding: 12px 24px; border-radius: 8px;
  font-size: 0.9rem; z-index: 999;
}
</style>
</head>
<body>
<div class="container">
  <h1>📸 AI 拍照识题测试报告</h1>
  <div class="subtitle">生成时间：2026-06-20 · 共 20 张照片</div>

  <div class="stats-bar">
    <div class="stat-item"><span class="stat-label">总图片</span><span class="stat-value">20</span></div>
    <div class="stat-item"><span class="stat-label">成功识别</span><span class="stat-value">20 ✅</span></div>
    <div class="stat-item"><span class="stat-label">失败</span><span class="stat-value">0</span></div>
    <div class="stat-item"><span class="stat-label">总 tokens</span><span class="stat-value">${totalTokens}</span></div>
    <div class="stat-item"><span class="stat-label">费用</span><span class="stat-value">¥0.78</span></div>
  </div>

  <h2 class="section-title">📋 逐张识别结果</h2>
  ${imageCards}

  <h2 class="section-title">📊 评分汇总表</h2>
  <p style="font-size:0.85rem;color:#666;margin-bottom:12px;">在下面填分，上面卡片里的分也会自动同步。</p>
  <table class="score-table">
    <thead>
      <tr><th>#</th><th>题面(5)</th><th>答案(5)</th><th>分析(5)</th><th>学科(3)</th><th>知识点(3)</th><th>总分(21)</th></tr>
    </thead>
    <tbody>
      ${scoreTableRows}
    </tbody>
    <tfoot>
      <tr style="font-weight:700;background:#eef4ea;">
        <td>平均</td>
        <td id="avg-q">—</td>
        <td id="avg-a">—</td>
        <td id="avg-an">—</td>
        <td id="avg-s">—</td>
        <td id="avg-k">—</td>
        <td id="avg-total">—</td>
      </tr>
    </tfoot>
  </table>

  <div class="btn-group">
    <button class="btn btn-apply" onclick="calcAll()">📊 计算汇总</button>
    <button class="btn btn-reset" onclick="resetAll()">🔄 清空重填</button>
    <button class="btn btn-export" onclick="exportResult()">📋 复制结果</button>
  </div>

  <h2 class="section-title">📈 判定结果</h2>
  <div class="summary-box" id="result-box">
    <p style="margin-bottom:8px;"><strong>题面+答案平均准确率：</strong><span id="final-accuracy">待打分后计算</span></p>
    <p><strong>综合判定：</strong><span id="final-verdict">🟡 待孩子打分后计算</span></p>
  </div>

  <div style="font-size:0.8rem;color:#999;text-align:center;padding:20px 0;">
    判定阈值：≥80% ✅ 通过 ｜ 60–80% 🟡 暂停 ｜ &lt;60% 🔴 不通过
  </div>
</div>

<div id="toast"></div>

<script>
function syncCardToTable(idx) {
  const card = document.querySelector('.card[data-idx="' + idx + '"]');
  const row = document.querySelector('tr td:first-child');
  if (!card || !row) return;
  const inputs = card.querySelectorAll('.score-input');
  inputs.forEach(inp => {
    const dim = inp.dataset.dim;
    const tb = document.querySelector('.tb-score[data-idx="' + idx + '"][data-dim="' + dim + '"]');
    if (tb && inp.value) tb.value = inp.value;
  });
}
function syncTableToCard(idx) {
  const tbs = document.querySelectorAll('.tb-score[data-idx="' + idx + '"]');
  const card = document.querySelector('.card[data-idx="' + idx + '"]');
  if (!card) return;
  tbs.forEach(tb => {
    const dim = tb.dataset.dim;
    const inp = card.querySelector('.score-input[data-dim="' + dim + '"]');
    if (inp && tb.value) inp.value = tb.value;
  });
}

// 监听所有输入同步
document.addEventListener('input', function(e) {
  if (e.target.classList.contains('score-input')) {
    const card = e.target.closest('.card');
    const idx = card ? card.dataset.idx : null;
    if (idx) syncCardToTable(idx);
    calcSubtotal(idx);
  }
  if (e.target.classList.contains('tb-score')) {
    const idx = e.target.dataset.idx;
    if (idx) { syncTableToCard(idx); calcSubtotal(idx); }
  }
});

function calcSubtotal(idx) {
  const card = document.querySelector('.card[data-idx="' + idx + '"]');
  if (!card) return;
  const inputs = card.querySelectorAll('.score-input');
  let sum = 0;
  inputs.forEach(i => { const v = parseInt(i.value); if (!isNaN(v)) sum += v; });
  card.querySelector('.subtotal').textContent = sum;

  const tbTotal = document.querySelector('.tb-total[data-idx="' + idx + '"]');
  if (tbTotal) tbTotal.textContent = sum;
}

function calcAll() {
  const dims = ['q', 'a', 'an', 's', 'k'];
  const totals = { q: 0, a: 0, an: 0, s: 0, k: 0 };
  let totalSum = 0;
  let count = 0;

  for (let i = 1; i <= 20; i++) {
    const card = document.querySelector('.card[data-idx="' + i + '"]');
    if (!card) continue;
    count++;
    dims.forEach(d => {
      const inp = card.querySelector('.score-input[data-dim="' + d + '"]');
      const v = inp ? parseInt(inp.value) : 0;
      if (!isNaN(v)) totals[d] += v;
    });
    calcSubtotal(i);
  }

  dims.forEach(d => {
    const avg = count > 0 ? (totals[d] / count).toFixed(1) : '—';
    document.getElementById('avg-' + d).textContent = avg;
  });

  const totalAvg = count > 0 ? (dims.reduce((s, d) => s + totals[d], 0) / count).toFixed(1) : '—';
  document.getElementById('avg-total').textContent = totalAvg + '/21';

  // 题面+答案准确率
  const qaScore = totals.q + totals.a;
  const qaMax = count * 10;
  const accuracy = qaMax > 0 ? ((qaScore / qaMax) * 100).toFixed(1) : '—';
  document.getElementById('final-accuracy').textContent = accuracy + '%';

  const pct = parseFloat(accuracy);
  let verdict;
  if (isNaN(pct)) verdict = '🟡 待打分后计算';
  else if (pct >= 80) verdict = '✅ 通过（≥80%）— 可以进 T2 开发！';
  else if (pct >= 60) verdict = '🟡 暂停（60–80% 区间）— 先优化再重测';
  else verdict = '🔴 不通过（<60%）— 需要回炉重评技术路线';
  document.getElementById('final-verdict').textContent = verdict;

  toast('已计算 ✅');
}

function resetAll() {
  if (!confirm('确定清空所有分数？')) return;
  document.querySelectorAll('.score-input, .tb-score').forEach(i => i.value = '');
  for (let i = 1; i <= 20; i++) {
    const card = document.querySelector('.card[data-idx="' + i + '"]');
    if (card) card.querySelector('.subtotal').textContent = '0';
    const tb = document.querySelector('.tb-total[data-idx="' + i + '"]');
    if (tb) tb.textContent = '0';
  }
  ['q','a','an','s','k','total'].forEach(id => {
    const el = document.getElementById('avg-' + id);
    if (el) el.textContent = '—';
  });
  document.getElementById('final-accuracy').textContent = '待打分后计算';
  document.getElementById('final-verdict').textContent = '🟡 待孩子打分后计算';
  toast('已清空 🔄');
}

function exportResult() {
  const accuracy = document.getElementById('final-accuracy').textContent;
  const verdict = document.getElementById('final-verdict').textContent;

  let txt = '📸 AI 拍照识题测试 — 评分结果\\n\\n';
  txt += '图片\\t题面\\t答案\\t分析\\t学科\\t知识点\\t总分\\n';
  for (let i = 1; i <= 20; i++) {
    const card = document.querySelector('.card[data-idx="' + i + '"]');
    if (!card) continue;
    const vals = [];
    card.querySelectorAll('.score-input').forEach(inp => {
      vals.push(inp.value || '0');
    });
    txt += String(i).padStart(2,'0') + '\\t' + vals.join('\\t') + '\\t' + card.querySelector('.subtotal').textContent + '\\n';
  }
  txt += '\\n题面+答案准确率：' + accuracy + '\\n';
  txt += '综合判定：' + verdict;

  // Copy to clipboard
  navigator.clipboard.writeText(txt).then(() => toast('已复制到剪贴板 📋')).catch(() => toast('复制失败'));
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 2000);
}
</script>
</body>
</html>`;
}

function generateGuideHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI 认题测试 · 裁判指南</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
  background: #f9f7f2; color: #2c3e2d; line-height: 1.8; padding: 0;
}
.container { max-width: 640px; margin: 0 auto; padding: 32px 20px; }

h1 { font-size: 1.5rem; margin-bottom: 16px; color: #2c6e4f; }
h2 { font-size: 1.15rem; margin: 24px 0 12px; color: #3a7a5a; }
.step-box {
  background: white; border-radius: 16px; padding: 20px; margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.step-num {
  display: inline-block; background: #2c6e4f; color: white;
  width: 28px; height: 28px; border-radius: 50%; text-align: center;
  line-height: 28px; font-weight: 700; font-size: 0.85rem; margin-right: 8px;
}
p { margin-bottom: 10px; font-size: 0.95rem; }
ul { padding-left: 20px; margin-bottom: 10px; }
li { margin-bottom: 6px; font-size: 0.92rem; }

.score-table {
  width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.88rem;
}
.score-table th { background: #2c6e4f; color: white; padding: 10px 8px; text-align: center; }
.score-table td { padding: 10px 8px; border-bottom: 1px solid #eee; text-align: center; }
.score-table tr:last-child td { border-bottom: none; }
.score-table .label { text-align: left; font-weight: 600; }

.example-box {
  background: #eef4ea; border-radius: 12px; padding: 20px; margin: 16px 0;
  border-left: 4px solid #2c6e4f;
}
.example-box .ex-title { font-weight: 700; margin-bottom: 8px; color: #2c6e4f; }
.example-box .ex-row { margin-bottom: 4px; font-size: 0.92rem; }
.example-box .ex-score { color: #2c6e4f; font-weight: 600; }
.example-box .ex-total { font-size: 1.1rem; font-weight: 700; color: #2c6e4f; margin-top: 8px; }

.tips-box {
  background: #fef8e7; border-radius: 12px; padding: 20px; margin: 16px 0;
  border-left: 4px solid #e8b84b;
}
.tips-box li { margin-bottom: 8px; }
.footer { text-align: center; color: #999; font-size: 0.8rem; margin-top: 40px; }
</style>
</head>
<body>
<div class="container">
  <h1>🧐 AI 认题测试 · 裁判指南</h1>
  <p style="color:#666;">嗨 XX，帮小姨/小舅一个忙好不好？</p>
  <p style="color:#666;">我们做了一个 AI，它想学"看照片认题目"——就是你平时拍的那些错题照片。<br>
  现在拍了 20 张你的题，AI 都看了一遍，它认出来的结果写在那个报告里了。<br>
  <strong>需要你来当裁判，看看 AI 认对了没有。你说了算！</strong></p>

  <div class="step-box">
    <h2><span class="step-num">1</span> 看照片</h2>
    <p>打开手机（或电脑），找到对应的那张照片，自己先看看题目长什么样。不用完全做出来，但你肯定知道这题原本是啥样的。</p>
  </div>

  <div class="step-box">
    <h2><span class="step-num">2</span> 看 AI 认出来的</h2>
    <p>打开报告，看 AI 认出了什么。一共要看 5 个方面：</p>
    <ul>
      <li><strong>题面</strong>：AI 写的题目文字对不对？数字、公式、符号有没有看错？</li>
      <li><strong>答案</strong>：AI 写的答案对不对？</li>
      <li><strong>分析</strong>：AI 写的解题思路方向对吗？（不用抠细节，大致方向对就行）</li>
      <li><strong>学科</strong>：AI 说这是哪科（数学／物理／化学……）对不对？</li>
      <li><strong>知识点</strong>：AI 说这题考什么，比如考的是"解方程"还是"三角公式"？说得沾不沾边？</li>
    </ul>
  </div>

  <div class="step-box">
    <h2><span class="step-num">3</span> 打分</h2>
    <p>每个方面打一个分，写在报告里的输入框里：</p>
    <table class="score-table">
      <tr><th>项目</th><th>满分</th><th>怎么打分</th></tr>
      <tr><td class="label">题面认对了没？</td><td><strong>5 分</strong></td><td>5＝完全对，4＝有一两处小错，3＝对了一半，2＝大部分错，1＝基本全错，0＝AI 说看不清</td></tr>
      <tr><td class="label">答案认对了没？</td><td><strong>5 分</strong></td><td>同上</td></tr>
      <tr><td class="label">分析靠不靠谱？</td><td><strong>5 分</strong></td><td>5＝思路对，4＝方向对但有小问题，3＝沾边但不准，2＝方向偏了，1＝完全不沾边，0＝没写<br><span style="color:#e68a2e;">💡 如果这题你自己还不太会、不确定 AI 分析得对不对，可以空着不评</span></td></tr>
      <tr><td class="label">学科说对了没？</td><td><strong>3 分</strong></td><td>3＝完全对，2＝大类对了但细分不对，1＝错了，0＝没写</td></tr>
      <tr><td class="label">知识点沾边不？</td><td><strong>3 分</strong></td><td>3＝全说中了，2＝说中了大头，1＝只沾一点边，0＝没写或完全不对</td></tr>
    </table>
    <p style="font-weight:700;color:#2c6e4f;">满分 21 分。你觉得 17 分以上就算 AI 表现不错。</p>
  </div>

  <div class="example-box">
    <div class="ex-title">📌 举个例子</div>
    <p style="font-size:0.9rem;color:#555;margin-bottom:10px;">假设照片上是一道解方程题：<em>"2x + 5 = 13，求 x"</em>。</p>
    <div class="ex-row">题面 → "2x + 5 = 13" <span class="ex-score">← ✅ 全对，5 分</span></div>
    <div class="ex-row">答案 → "x = 4" <span class="ex-score">← ✅ 完全正确，5 分</span></div>
    <div class="ex-row">分析 → "移项得 2x = 8，两边除以 2……" <span class="ex-score">← ✅ 思路对，4 分</span></div>
    <div class="ex-row">学科 → "数学" <span class="ex-score">← ✅ 对，3 分</span></div>
    <div class="ex-row">知识点 → "一元一次方程" <span class="ex-score">← ✅ 全中，3 分</span></div>
    <div class="ex-total">总分：5 + 5 + 4 + 3 + 3 = 20 分 / 21 分 ✅ 不错！</div>
  </div>

  <div class="tips-box">
    <h2 style="margin-top:0;">⚠️ 几个小提醒</h2>
    <ul>
      <li><strong>AI 看错了很正常</strong>，你如实打分就好，不用客气！</li>
      <li>如果 AI 说"无法识别"（图片太糊看不清），题面和答案就给 0 分</li>
      <li>打分全靠你的感觉，没有标准答案——<strong>你觉得对就是对，你觉得不对就是不对</strong></li>
      <li>打分的时候不用把题做出来，只用对照你看到的原题来判断就行</li>
      <li>弄完了喊一声，就 OK 啦！谢谢帮忙～😊</li>
    </ul>
  </div>

  <div class="footer">— 感谢帮忙测试 🙏 —</div>
</div>
</body>
</html>`;
}

// Main
const entries = parseReport();
const reportHtml = generateReportHTML(entries);
fs.writeFileSync(path.resolve(REPORT_HTML), reportHtml, 'utf-8');
console.log(`✅ 报告 HTML: ${REPORT_HTML}`);

const guideHtml = generateGuideHTML();
fs.writeFileSync(path.resolve(GUIDE_HTML), guideHtml, 'utf-8');
console.log(`✅ 指南 HTML: ${GUIDE_HTML}`);
