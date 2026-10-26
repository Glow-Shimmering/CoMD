import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import katex from 'katex';
import katexCSS from 'katex/dist/katex.min.css?inline';

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: true,
  highlight(code, language): string {
    if (language && hljs.getLanguage(language)) return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}).use(taskLists, { enabled: false });
md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
  const start = state.pos;
  if (state.src[start] !== '$' || state.src[start + 1] === '$' || /\s/.test(state.src[start + 1] ?? '')) return false;
  let end = start + 1;
  while ((end = state.src.indexOf('$', end)) !== -1 && state.src[end - 1] === '\\') end++;
  if (end < 0 || /\s/.test(state.src[end - 1]) || state.src.slice(start, end).includes('\n')) return false;
  if (!silent) { const token = state.push('math_inline', 'math', 0); token.content = state.src.slice(start + 1, end); }
  state.pos = end + 1; return true;
});
md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
  const first = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]).trim();
  if (!first.startsWith('$$')) return false;
  let line = startLine, body = first.slice(2), closed = body.endsWith('$$');
  if (closed) body = body.slice(0, -2);
  else {
    const lines: string[] = body ? [body] : [];
    while (++line < endLine) {
      const part = state.src.slice(state.bMarks[line], state.eMarks[line]);
      if (part.trimEnd().endsWith('$$')) { lines.push(part.trimEnd().slice(0, -2)); closed = true; break; }
      lines.push(part);
    }
    body = lines.join('\n');
  }
  if (!closed) return false;
  if (!silent) { const token = state.push('math_block', 'math', 0); token.content = body; token.map = [startLine, line + 1]; token.block = true; }
  state.line = line + 1; return true;
});
const math = (content: string, displayMode: boolean) => katex.renderToString(content, { throwOnError: false, displayMode, trust: false, strict: 'ignore' });
md.renderer.rules.math_inline = (tokens, index) => math(tokens[index].content, false);
md.renderer.rules.math_block = (tokens, index) => `<div class="math-block">${math(tokens[index].content, true)}</div>`;
const headingRule = md.renderer.rules.heading_open;
md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('id', `line-${tokens[index].map?.[0] ?? index}`);
  return headingRule ? headingRule(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
};
export function renderMarkdown(text: string, docId: string): string {
  const clean = DOMPurify.sanitize(md.render(text), { USE_PROFILES: { html: true, mathMl: true }, ADD_ATTR: ['class', 'style'], FORBID_TAGS: ['style'], ALLOW_UNKNOWN_PROTOCOLS: false });
  const template = document.createElement('template'); template.innerHTML = clean;
  template.content.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') ?? '';
    if (/^(https:|data:image\/(png|jpeg|gif|webp);)/i.test(src)) return;
    if (/^[a-z][a-z\d+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('/')) { img.removeAttribute('src'); return; }
    let relative: string;
    try { relative = decodeURIComponent(src.split(/[?#]/)[0]); } catch { img.removeAttribute('src'); return; }
    img.src = `comd-asset://asset/${docId}/${encodeURIComponent(relative)}`;
    img.loading = 'lazy';
  });
  return template.innerHTML;
}
export function headings(text: string) {
  return md.parse(text, {}).flatMap((token, index, tokens) => token.type === 'heading_open'
    ? [{ level: Number(token.tag.slice(1)), text: tokens[index + 1]?.content.replace(/[*_`]/g, '') ?? '', line: (token.map?.[0] ?? 0) + 1 }] : []);
}
const exportStyles = `body{max-width:780px;margin:48px auto;padding:0 24px;color:#263449;font:16px/1.85 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}h1,h2,h3{line-height:1.4;page-break-after:avoid}h1{font-size:32px}h2{margin-top:32px}a{color:#2864e8}blockquote{border-left:3px solid #8aaff8;margin:24px 0;padding:6px 20px;background:#f3f7ff;color:#56677e}pre{background:#f5f7fb;border:1px solid #e3eaf4;border-radius:8px;padding:18px;white-space:pre-wrap;overflow-wrap:anywhere}code{font:0.88em/1.7 ui-monospace,SFMono-Regular,Consolas,monospace}p code,li code{background:#edf3ff;padding:2px 5px;border-radius:4px}table{width:100%;border-collapse:collapse;margin:22px 0}td,th{border:1px solid #e3eaf4;padding:9px 14px;text-align:left}th{background:#f5f8fc}img{max-width:100%;height:auto}hr{border:0;border-top:1px solid #e3eaf4;margin:32px 0}.task-list-item{list-style:none}.task-list-item-checkbox{margin-right:8px}.katex-display{overflow:auto}.hljs-keyword,.hljs-selector-tag{color:#87549a}.hljs-string{color:#467549}.hljs-number{color:#bd753d}.hljs-comment{color:#7b8da6}@media print{body{margin:0;padding:0;font-size:11pt}a{color:inherit;text-decoration:none}pre,blockquote,tr,img{break-inside:avoid}thead{display:table-header-group}}`;
async function dataURL(url: string): Promise<string> {
  const response = await fetch(url); if (!response.ok) throw new Error('无法读取资源');
  const blob = await response.blob();
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
}
export async function exportHTML(text: string, id: string, title: string) {
  const template = document.createElement('template'); template.innerHTML = renderMarkdown(text, id);
  let missing = 0;
  await Promise.all([...template.content.querySelectorAll('img')].map(async image => {
    try { image.src = await dataURL(image.src); image.removeAttribute('loading'); }
    catch { missing++; }
  }));
  let fonts = katexCSS;
  if (text.includes('$')) {
    const urls = [...new Set([...fonts.matchAll(/url\(([^)]+)\)/g)].map(match => match[1].replace(/^['"]|['"]$/g, '')))];
    const replacements = await Promise.all(urls.map(async url => { try { return [url, await dataURL(new URL(url, document.baseURI).href)] as const; } catch { return null; } }));
    for (const replacement of replacements) if (replacement) fonts = fonts.split(replacement[0]).join(replacement[1]);
  } else fonts = '';
  return { missing, html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https: comd-asset:; font-src data:; base-uri 'none'"><title>${md.utils.escapeHtml(title)}</title><style>${exportStyles}\n${fonts}</style></head><body>${template.innerHTML}</body></html>` };
}
