// Lesson content blocks, shown to students (and to teachers in preview).
import { esc, inline, renderLesson, videoEmbed } from "./core.js";

// Light Markdown: headings, lists, quotes, paragraphs
export function md(text){
  const out = []; let list = null, quote = false;
  const cl = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const cq = () => { if (quote) { cl(); out.push("</blockquote>"); quote = false; } };
  for (const raw of String(text || "").split("\n")) {
    let line = raw.replace(/\s+$/,""), m;
    if (/^>\s?/.test(line)) { if (!quote) { cl(); out.push("<blockquote>"); quote = true; } line = line.replace(/^>\s?/,""); }
    else cq();
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { cl(); const n = Math.min(4, m[1].length + 1); out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
    else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== "ul") { cl(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)/))) { if (list !== "ol") { cl(); out.push(`<ol start="${m[1]}">`); list = "ol"; } out.push(`<li>${inline(m[2])}</li>`); }
    else if (!line.trim() || /^-{3,}$/.test(line.trim())) cl();
    else { cl(); out.push(`<p>${inline(line)}</p>`); }
  }
  cq(); cl(); return out.join("\n");
}

const fileIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
const linkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';

export function renderBlock(b){
  if (!b || !b.type) return "";
  if (b.type === "text") return `<div class="blk blk-text prose">${md(b.md)}</div>`;
  if (b.type === "painted") return `<div class="blk blk-painted"><div class="lesson">${renderLesson(b.md, true)}</div></div>`;
  if (b.type === "video") {
    const src = videoEmbed(b.url);
    return src ? `<figure class="blk blk-video"><div class="vid"><iframe src="${esc(src)}" title="${esc(b.caption || "Video")}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`
      : (b.url ? `<p class="blk"><a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.caption || b.url)}</a></p>` : "");
  }
  if (b.type === "image") return b.url ? `<figure class="blk blk-image"><img src="${esc(b.url)}" alt="${esc(b.caption || "")}" loading="lazy">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>` : "";
  if (b.type === "file") return b.url ? `<a class="blk blk-file paper" href="${esc(b.url)}" target="_blank" rel="noopener" download>${fileIcon}<span><b>${esc(b.name || "Download file")}</b><small>${esc(b.caption || "Open or download")}</small></span></a>` : "";
  if (b.type === "link") return b.url ? `<a class="blk blk-file paper" href="${esc(b.url)}" target="_blank" rel="noopener">${linkIcon}<span><b>${esc(b.name || b.url)}</b><small>${esc(b.caption || new URL(b.url, location.href).hostname)}</small></span></a>` : "";
  return "";
}
export const renderBlocks = blocks => (blocks || []).map(renderBlock).join("\n");
