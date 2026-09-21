import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const markdownPath = path.resolve('LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md');
const mdContent = fs.readFileSync(markdownPath, 'utf8');

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseMarkdown(md) {
  let lines = md.split(/\r?\n/);
  let html = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent = [];
  let inTable = false;
  let tableRows = [];

  function flushTable() {
    if (!inTable) return;
    if (tableRows.length === 0) {
      inTable = false;
      return;
    }
    let tableHtml = ['<table>'];
    let header = tableRows[0];
    let isHeader = true;
    
    // Check if second row is divider
    let startIdx = 0;
    if (tableRows.length > 1 && tableRows[1].every(cell => /^:?-+:?$/.test(cell.trim()))) {
      tableHtml.push('<thead><tr>');
      header.forEach(cell => {
        tableHtml.push(`<th>${formatInline(cell.trim())}</th>`);
      });
      tableHtml.push('</tr></thead>');
      tableHtml.push('<tbody>');
      startIdx = 2;
    } else {
      tableHtml.push('<tbody>');
    }

    for (let i = startIdx; i < tableRows.length; i++) {
      tableHtml.push('<tr>');
      tableRows[i].forEach(cell => {
        tableHtml.push(`<td>${formatInline(cell.trim())}</td>`);
      });
      tableHtml.push('</tr>');
    }
    tableHtml.push('</tbody></table>');
    html.push(tableHtml.join(''));
    inTable = false;
    tableRows = [];
  }

  function formatInline(text) {
    // Images: ![alt](url)
    text = text.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
      // Resolve image path relative to workspace or base64
      let cleanSrc = src.trim();
      let absSrc = path.resolve(cleanSrc);
      if (fs.existsSync(absSrc)) {
        let ext = path.extname(absSrc).slice(1);
        let base64 = fs.readFileSync(absSrc).toString('base64');
        return `<div class="figure-container"><img src="data:image/${ext};base64,${base64}" alt="${escapeHtml(alt)}" /><p class="caption">${escapeHtml(alt)}</p></div>`;
      }
      return `<img src="${src}" alt="${escapeHtml(alt)}" />`;
    });

    // Links: [text](url)
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

    // Bold & Italic
    text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
    text = text.replace(/_(.*?)_/g, '<em>$1</em>');

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // LaTeX inline: \( ... \) or $...$
    text = text.replace(/\\\((.*?)\\\)/g, '<span class="math inline">$1</span>');

    return text;
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code block toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        html.push(`<pre><code class="language-${codeBlockLang}">${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = '';
      } else {
        flushTable();
        inCodeBlock = true;
        codeBlockLang = line.trim().replace(/^```/, '').trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Table row
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      let cells = line.trim().slice(1, -1).split('|');
      tableRows.push(cells);
      continue;
    } else {
      flushTable();
    }

    // Blank line
    if (!line.trim()) {
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      let bqText = line.trim().replace(/^>\s*/, '');
      html.push(`<blockquote>${formatInline(bqText)}</blockquote>`);
      continue;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      html.push('<hr />');
      continue;
    }

    // Headers
    let h6 = line.match(/^######\s+(.*)/);
    if (h6) { html.push(`<h6>${formatInline(h6[1])}</h6>`); continue; }
    let h5 = line.match(/^#####\s+(.*)/);
    if (h5) { html.push(`<h5>${formatInline(h5[1])}</h5>`); continue; }
    let h4 = line.match(/^####\s+(.*)/);
    if (h4) { html.push(`<h4>${formatInline(h4[1])}</h4>`); continue; }
    let h3 = line.match(/^###\s+(.*)/);
    if (h3) { html.push(`<h3>${formatInline(h3[1])}</h3>`); continue; }
    let h2 = line.match(/^##\s+(.*)/);
    if (h2) { html.push(`<h2>${formatInline(h2[1])}</h2>`); continue; }
    let h1 = line.match(/^#\s+(.*)/);
    if (h1) { html.push(`<h1>${formatInline(h1[1])}</h1>`); continue; }

    // Standalone Image: ![alt](url)
    let imgMatch = line.trim().match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      html.push(formatInline(line.trim()));
      continue;
    }

    // Bullet lists
    let ulMatch = line.match(/^(\s*)[*+-]\s+(.*)/);
    if (ulMatch) {
      let indent = ulMatch[1].length;
      html.push(`<li style="margin-left: ${indent * 10}px;">${formatInline(ulMatch[2])}</li>`);
      continue;
    }

    // Numbered lists
    let olMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (olMatch) {
      let indent = olMatch[1].length;
      html.push(`<li class="numbered" style="margin-left: ${indent * 10}px;">${formatInline(olMatch[2])}</li>`);
      continue;
    }

    // Regular paragraph
    html.push(`<p>${formatInline(line)}</p>`);
  }

  flushTable();
  return html.join('\n');
}

const bodyHtml = parseMarkdown(mdContent);

const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Libro Oficial AI Operating Platform</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
      @bottom-center {
        content: counter(page);
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1a202c;
      background: #ffffff;
      line-height: 1.6;
      font-size: 11pt;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 20pt;
      color: #0f172a;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 6px;
      margin-top: 24pt;
      margin-bottom: 12pt;
      page-break-after: avoid;
    }
    h2 {
      font-size: 16pt;
      color: #1e293b;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-top: 18pt;
      margin-bottom: 10pt;
      page-break-after: avoid;
    }
    h3 {
      font-size: 13pt;
      color: #334155;
      margin-top: 14pt;
      margin-bottom: 6pt;
      page-break-after: avoid;
    }
    h4, h5, h6 {
      font-size: 11.5pt;
      color: #475569;
      margin-top: 12pt;
      margin-bottom: 4pt;
      page-break-after: avoid;
    }
    p {
      margin-top: 0;
      margin-bottom: 8pt;
      text-align: justify;
    }
    blockquote {
      background: #f8fafc;
      border-left: 4px solid #3b82f6;
      margin: 10pt 0;
      padding: 8pt 12pt;
      color: #334155;
      font-style: normal;
      border-radius: 0 6px 6px 0;
      page-break-inside: avoid;
    }
    code {
      font-family: "Cascadia Code", "Fira Code", Consolas, Courier, monospace;
      background: #f1f5f9;
      color: #0f172a;
      padding: 2px 4px;
      border-radius: 4px;
      font-size: 9.5pt;
    }
    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 12pt;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 9pt;
      line-height: 1.45;
      page-break-inside: avoid;
      margin: 10pt 0;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6pt 8pt;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
    .figure-container {
      margin: 14pt 0;
      text-align: center;
      page-break-inside: avoid;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .caption {
      font-size: 9pt;
      color: #64748b;
      margin-top: 4pt;
      font-style: italic;
      text-align: center;
    }
    hr {
      border: 0;
      height: 1px;
      background: #e2e8f0;
      margin: 18pt 0;
    }
    li {
      margin-bottom: 4pt;
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

const tempHtmlPath = path.resolve('scratch_book_export.html');
fs.writeFileSync(tempHtmlPath, fullHtml, 'utf8');

const outputPath = path.resolve('LIBRO_OFICIAL_AI_OPERATING_PLATFORM.pdf');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

console.log('Generating PDF via headless Edge...');
execFileSync(edgePath, [
  '--headless',
  '--disable-gpu',
  '--run-all-compositor-stages-before-draw',
  '--print-to-pdf-no-header',
  `--print-to-pdf=${outputPath}`,
  tempHtmlPath
]);

if (fs.existsSync(outputPath)) {
  const stats = fs.statSync(outputPath);
  console.log(`PDF successfully created at: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  fs.unlinkSync(tempHtmlPath);
} else {
  console.error('Failed to create PDF.');
}
