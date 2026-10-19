// Shared pieces: lesson sections, Markdown rendering, slide decks, small helpers.

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

export const ICONS = {
  warm:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  vocab:'<path d="M3 18l4-11 4 11M4.5 14h5"/><path d="M14 11.5c1-1 4-1.3 4.5.5v6M18.5 14.5c-2.5-.5-5 0-5 2s3 2 5 0"/>',
  reading:'<path d="M3 6c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0zM12 6c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0z"/>',
  discuss:'<path d="M3 5h11v7H8l-3 3v-3H3z"/><path d="M17 9h4v7h-2v3l-3-3h-6v-2"/>',
  practice:'<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  phrases:'<path d="M5 12c0-3 1.6-5 4-5.5v2C8 9 7.3 10 7.3 11.3H9.5V17H5zM13.5 12c0-3 1.6-5 4-5.5v2c-1 .5-1.7 1.5-1.7 2.8H18V17h-4.5z"/>',
  speaking:'<path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6"/>',
  quiz:'<path d="M4 4h16v16H4z"/><path d="M8 12l3 3 5-6"/>',
  listen:'<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 15h3v5H5.5A1.5 1.5 0 0 1 4 18.5zM20 15h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5z"/>'
};

export const SECTIONS = [
  {key:"warm", desc:"Opinion questions to get talking", name:"Warm-up", w:8, paint:"#F2B33D", at:[88,272],
   spec:"3 personal opinion questions linked to the topic and to the student's job or interests."},
  {key:"vocab", desc:"8 key words, reused in the story", name:"Key vocabulary", w:10, paint:"#E89AA6", at:[86,174],
   spec:"Exactly 8 words or phrases taken from the source text, chosen for {LEVEL} level, numbered 1 to 8. For each one: the word or phrase in bold, its part of speech, a simple definition, a synonym and an antonym where one exists, and a new example sentence. These 8 items will appear again in the reading story."},
  {key:"reading", desc:"A story at this level, key words in colour", name:"Reading", w:15, paint:"#B9D8B0", at:[148,98], spec:""},
  {key:"listen", desc:"Questions from a YouTube video", name:"Listening", w:15, paint:"#D9A066", at:[194,228], off:true, spec:""},
  {key:"discuss", desc:"Open questions about decisions", name:"Discussion", w:15, paint:"#A9CFEA", at:[244,68],
   spec:"5 open questions that ask the student to judge decisions, compare, or connect the topic to their own work."},
  {key:"practice", desc:"Gap-fill, matching or open cloze", name:"Practice", w:15, paint:"#C9B6E4", at:[350,66],
   spec:"One numbered exercise (matching, gap-fill or open cloze) using the key vocabulary{FOCUS}. Then a \"### Answer key\" subsection."},
  {key:"phrases", desc:"Natural expressions to use", name:"Phrases & idioms", w:10, paint:"#F08A6B", at:[452,98],
   spec:"4 natural expressions related to the topic, each with its meaning and an example sentence."},
  {key:"speaking", desc:"Role-play or mini-debate", name:"Speaking task", w:12, paint:"#8CCFC4", at:[524,178],
   spec:"A role-play or mini-debate with clear roles, a situation, and 3 useful phrases to use."},
  {key:"quiz", desc:"Quick review questions", name:"Wrap-up quiz", w:5, paint:"#EFE2BF", at:[182,346],
   spec:"5 quick questions that review the lesson. Then a \"### Answer key\" subsection."}
];
export const NOTES = {key:"notes", name:"Teacher notes", paint:"#D9D5CC",
  spec:"2–3 short tips: likely difficulties for this student and how to extend the lesson if time remains."};
export const LEVELS = ["A2","B1","B2","C1","C2"], LENGTHS = [45,60,90];

// Custom sections live in the studio; parsing needs to know them.
let customs = [];
export function setCustoms(list){ customs = list; }
export function getCustoms(){ return customs; }
export function allSections(){
  const base = SECTIONS.filter(s => s.key !== "quiz");
  return [...base, ...customs, SECTIONS.find(s => s.key === "quiz")];
}
export const findSec = key => allSections().find(s => s.key === key);

function sectionFor(heading){
  const h = heading.toLowerCase();
  const all = allSections();
  return all.find(s => h.startsWith(s.name.toLowerCase())) ||
         (h.startsWith("teacher note") ? NOTES : null) ||
         all.find(s => !s.custom && h.includes(s.name.toLowerCase().split(" ")[0])) || null;
}
export function parse(md){
  const lines = String(md || "").split("\n"); const t = []; const ps = []; let cur = null;
  for (const l of lines) {
    if (/^##\s+/.test(l) && !/^###/.test(l)) { cur = { sec: sectionFor(l.replace(/^##\s+/,"")), md: l }; ps.push(cur); }
    else if (cur) cur.md += "\n" + l;
    else t.push(l);
  }
  return { title: t.join("\n"), parts: ps };
}

export function inline(s){
  return esc(s).replace(/==([^=\n]+?)==/g,'<mark class="vk">$1</mark>')
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g,"$1<em>$2</em>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g,'$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}
export const KEYRX = /answer key|answers|teacher note|teacher's note/i;

export function renderBody(md){
  const out=[]; let list=null, inKey=false;
  const cl=()=>{ if(list){ out.push(`</${list}>`); list=null; } };
  const ck=()=>{ if(inKey){ cl(); out.push("</div>"); inKey=false; } };
  for (const raw of String(md || "").split("\n")) {
    const line = raw.replace(/\s+$/,""); let m;
    if ((m=line.match(/^#{3,6}\s+(.*)/))) { cl(); ck(); if (KEYRX.test(m[1])) { out.push('<div class="key">'); inKey=true; } out.push(`<h3>${inline(m[1])}</h3>`); }
    else if ((m=line.match(/^#{1,2}\s+(.*)/))) { cl(); ck(); out.push(`<h3>${inline(m[1])}</h3>`); }
    else if ((m=line.match(/^\s*[-*•]\s+(.*)/))) { if(list!=="ul"){ cl(); out.push("<ul>"); list="ul"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m=line.match(/^\s*(\d+)[.)]\s+(.*)/))) { if(list!=="ol"){ cl(); out.push(`<ol start="${m[1]}">`); list="ol"; } out.push(`<li>${inline(m[2])}</li>`); }
    else if (!line.trim() || /^-{3,}$/.test(line.trim())) cl();
    else { cl(); out.push(`<p>${inline(line)}</p>`); }
  }
  ck(); cl(); return out.join("\n");
}
export function renderTitle(md){
  const lines = String(md || "").split("\n").filter(l=>l.trim());
  let h = "";
  lines.forEach(l => { const m = l.match(/^#\s+(.*)/); h += m ? `<h2 class="title">${inline(m[1])}</h2>` : `<p class="aim">${inline(l)}</p>`; });
  return h;
}
// Render a whole painted lesson (read-only), each section in its colour
export function renderLesson(md, student){
  const p = parse(student ? studentMd(md) : md);
  let h = renderTitle(p.title);
  p.parts.forEach(part => {
    const paint = part.sec ? part.sec.paint : "#D9D5CC";
    const first = part.md.split("\n")[0].replace(/^##\s+/,"");
    h += `<section class="part${part.sec===NOTES?" teacher-only":""}" style="--paint:${paint}"><div class="part-head"><h2>${inline(first)}</h2></div>${renderBody(part.md.split("\n").slice(1).join("\n"))}</section>`;
  });
  return h;
}
// Remove answer keys and teacher notes
export function studentMd(md){
  const p = parse(md);
  const strip = s => { const keep=[]; let skip=false;
    for (const l of s.split("\n")) { const h=l.match(/^(#{1,6})\s+(.*)/); if (h) skip = h[1].length>=3 && KEYRX.test(h[2]); if(!skip) keep.push(l); }
    return keep.join("\n"); };
  return [p.title.trim(), ...p.parts.filter(x => x.sec !== NOTES).map(x => strip(x.md))].join("\n\n").trim();
}

export const plain = s => String(s || "").replace(/==/g,"").replace(/\*\*/g,"").replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$|[.,!?;:])/g,"$1$2").replace(/^#+\s*/,"").trim();
export const wordsOf = t => (String(t || "").match(/\S+/g) || []).length;
export const shortDesc = t => { t = String(t).replace(/\s+/g," ").trim(); return t.length > 38 ? t.slice(0,36).trim()+"…" : t; };

// ---------- Slide decks ----------
export const THEMES = {
  navy:{ name:"Navy and gold", primary:"#1F2A44", accent:"#B08D57", bg:"#FFFFFF", text:"#1F2430" },
  burgundy:{ name:"Burgundy", primary:"#5B1A2A", accent:"#B8945A", bg:"#FFFFFF", text:"#2A1E21" },
  forest:{ name:"Forest", primary:"#1E3D33", accent:"#7E9A6E", bg:"#FFFFFF", text:"#1E2622" },
  slate:{ name:"Slate and blue", primary:"#2B2F36", accent:"#3E7CB1", bg:"#F7F8FA", text:"#23262B" },
  paint:{ name:"Paint box", primary:"#26262A", accent:"#E8768A", bg:"#FCFBF8", text:"#26262A" },
  ocean:{ name:"Ocean", primary:"#12466B", accent:"#2BA59A", bg:"#FFFFFF", text:"#18242E" }
};
export const FONTS = {
  classic:{ name:"Classic", head:"Georgia", body:"Arial" },
  modern:{ name:"Modern", head:"Arial", body:"Arial" },
  academic:{ name:"Academic", head:"Times New Roman", body:"Georgia" },
  clear:{ name:"Clear", head:"Verdana", body:"Verdana" }
};
export const FONT_STACK = { "Georgia":'Georgia, "Times New Roman", serif', "Arial":'Arial, Helvetica, sans-serif',
  "Times New Roman":'"Times New Roman", Times, serif', "Verdana":'Verdana, Geneva, sans-serif' };
export const sid = () => "s" + Math.random().toString(36).slice(2,9);
export function themeColors(k){ const t = THEMES[k] || THEMES.navy; return { primary:t.primary, accent:t.accent, bg:t.bg, text:t.text }; }

function chunk(lines, maxLines = 6, maxChars = 620){
  const out = []; let cur = [], len = 0;
  lines.forEach(l => {
    const isHead = /^\*\*[^*]+\*\*:?$/.test(l.trim());
    if (cur.length && (cur.length >= maxLines || len + l.length > maxChars || (isHead && len > 200))) {
      let carry = [];
      if (/^\*\*[^*]+\*\*:?$/.test(cur[cur.length-1].trim()) && cur.length > 1) carry = [cur.pop()];
      out.push(cur); cur = carry; len = carry.reduce((a,x) => a + x.length, 0);
    }
    cur.push(l); len += l.length;
  });
  if (cur.length) out.push(cur);
  return out.length ? out : [[""]];
}
export function buildDeck(cls, prev){
  const p = parse(cls.md);
  const tl = p.title.split("\n").map(l => l.trim()).filter(Boolean);
  const head = tl.find(l => /^#\s/.test(l));
  const aim = tl.filter(l => !/^#\s/.test(l)).map(plain).join(" ");
  const np = p.parts.find(x => x.sec === NOTES);
  const notes = np ? np.md.split("\n").slice(1).map(l => l.replace(/^\s*[*•]\s+/,"- ").replace(/\*\*/g,"")).join("\n").trim() : "";
  const slides = [{ id:sid(), kind:"title", label:`${cls.level}, ${cls.length} minutes` + (cls.student ? `, for ${cls.student}` : ""),
    title: head ? plain(head) : cls.title, body: aim, notes, layout:"standard", answers:false, accent:null }];
  let n = 0;
  p.parts.filter(x => x.sec !== NOTES).forEach(part => {
    n++;
    const lines = part.md.split("\n");
    const h = lines[0].replace(/^##\s+/,"").trim();
    const hm = h.match(/^(.*?)\s*\(([^)]*\bmin[^)]*)\)\s*$/i);
    const name = plain(hm ? hm[1] : h), time = hm ? hm[2].trim() : "";
    const main = [], keys = []; let inKey = false;
    lines.slice(1).forEach(l => {
      const sh = l.match(/^#{3,6}\s+(.*)/);
      if (sh) { inKey = KEYRX.test(sh[1]); if (!inKey) main.push("**" + plain(sh[1]) + "**"); return; }
      if (!l.trim() || /^-{3,}$/.test(l.trim())) return;
      const line = l.replace(/^\s*[*•]\s+/,"- ").replace(/^\s*(\d+)\)\s+/,"$1. ").trim();
      (inKey ? keys : main).push(line);
    });
    const label = `Part ${n}` + (time ? `, ${time}` : "");
    chunk(main).forEach((c,i) => slides.push({ id:sid(), kind:"content", label, title: i ? `${name} (continued)` : name,
      body:c.join("\n"), notes:"", layout:"standard", answers:false, accent:null }));
    if (keys.length) chunk(keys, 8, 700).forEach((c,i) => slides.push({ id:sid(), kind:"content", label:"Answer key, teacher only",
      title: `${name}: answers` + (i ? " (continued)" : ""), body:c.join("\n"), notes:"", layout:"standard", answers:true, accent:null }));
  });
  const b = prev || {};
  return { theme: b.theme || "navy", colors: b.colors || themeColors("navy"), font: b.font || "classic", scale: b.scale || 1,
           footer: b.footer !== false, edited:false, slides };
}
function hex2rgb(h){ h = String(h).replace("#",""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const n = parseInt(h,16) || 0; return [n>>16&255, n>>8&255, n&255]; }
export function mixHex(a,b,t){ const A = hex2rgb(a), B = hex2rgb(b); return "#" + A.map((v,i) => Math.round(v + (B[i]-v)*t).toString(16).padStart(2,"0")).join("").toUpperCase(); }
export function bodyPt(s, deck){
  const len = (s.body || "").length;
  let pt = s.layout === "statement" ? (len > 260 ? 24 : len > 140 ? 28 : 34) : (len > 760 ? 14 : len > 560 ? 16 : len > 380 ? 18 : 20);
  if (s.layout === "columns") pt = Math.min(pt, 18);
  return Math.round(pt * (deck.scale || 1));
}
function slideBodyHTML(text){
  const out = []; let list = null;
  const cl = () => { if (list) { out.push(`</${list}>`); list = null; } };
  String(text || "").split("\n").forEach(raw => {
    const l = raw.trim(); let m;
    if (!l) { cl(); return; }
    if ((m = l.match(/^[-*•]\s+(.*)/))) { if (list !== "ul") { cl(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = l.match(/^(\d+)[.)]\s+(.*)/))) { if (list !== "ol") { cl(); out.push(`<ol start="${m[1]}">`); list = "ol"; } out.push(`<li>${inline(m[2])}</li>`); }
    else { cl(); out.push(`<p>${inline(l)}</p>`); }
  });
  cl(); return out.join("");
}
export function slideEl(s, cls, i, total){
  const d = cls.deck, c = d.colors, f = FONTS[d.font] || FONTS.classic, accent = s.accent || c.accent;
  const el = document.createElement("div");
  el.className = "slide" + (s.kind === "title" ? " is-title" : "");
  el.style.cssText = `--s-primary:${c.primary};--s-accent:${accent};--s-bg:${c.bg};--s-text:${c.text};--s-muted:${mixHex(c.text,c.bg,.45)};` +
    `--s-head:${FONT_STACK[f.head]};--s-body:${FONT_STACK[f.body]};--s-size:${(bodyPt(s,d)/9.6).toFixed(3)}cqw;--s-scale:${d.scale || 1}`;
  if (s.kind === "title") {
    el.innerHTML = `<div class="ts"><div class="ts-label">${inline(s.label || "")}</div><div class="ts-title">${inline(s.title || "")}</div><div class="ts-rule"></div><div class="ts-aim">${inline(s.body || "")}</div></div>`;
  } else {
    const bc = s.layout === "columns" ? "bdy cols" : s.layout === "statement" ? "bdy stmt" : "bdy";
    const body = slideBodyHTML(s.body);
    el.innerHTML = `<div class="band"></div><div class="lbl">${inline(s.label || "")}</div><div class="ttl">${inline(s.title || "")}</div><div class="rule"></div>` +
      `<div class="${bc}">${s.layout === "statement" ? `<div>${body}</div>` : body}</div>` +
      (d.footer ? `<div class="ftr"><span>${esc(cls.title || "")}</span><span>${i+1} / ${total}</span></div>` : "");
  }
  return el;
}

// ---------- Video links ----------
export function ytId(u){
  try {
    const url = new URL(String(u).trim()); if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const h = url.hostname.replace(/^(www|m|music)\./,""); let id = null;
    if (h === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    else if (h === "youtube.com" || h === "youtube-nocookie.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else { const m = url.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/); id = m && m[2]; }
    }
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch(e) { return null; }
}
export function videoEmbed(u){
  const y = ytId(u); if (y) return `https://www.youtube-nocookie.com/embed/${y}?rel=0`;
  try { const url = new URL(u); if (/(^|\.)vimeo\.com$/.test(url.hostname)) { const m = url.pathname.match(/(\d{6,})/); if (m) return `https://player.vimeo.com/video/${m[1]}`; }
    if (/loom\.com$/.test(url.hostname)) { const m = url.pathname.match(/share\/([\w]+)/); if (m) return `https://www.loom.com/embed/${m[1]}`; } } catch(e) {}
  return null;
}
export function cleanTranscript(t){
  return String(t || "").split("\n")
    .filter(l => !/^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/.test(l))
    .map(l => l.replace(/^\s*\d{1,2}:\d{2}(:\d{2})?\s+/,"").replace(/\[(music|applause|laughter)\]/gi,"").trim())
    .filter(Boolean).join(" ").replace(/\s{2,}/g," ").trim();
}

// ---------- Scripts, files, toasts ----------
export const LIBS = {
  pdfWorker:"https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  pdf:"https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  mammoth:"https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
  pptx:"https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
  docx:"https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
  pdfmake:"https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js",
  pdfFonts:"https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js"
};
const loaded = {};
export function loadScript(url){
  if (!loaded[url]) loaded[url] = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = url; s.async = false;
    s.onload = res; s.onerror = () => { delete loaded[url]; rej(new Error("load")); };
    document.head.appendChild(s);
  });
  return loaded[url];
}
export function saveBlob(blob, filename){
  const a = document.createElement("a"); const u = URL.createObjectURL(blob);
  a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
export const safeName = s => (plain(s).replace(/[^\w\- ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+/g,"").trim().slice(0,60) || "lesson");

let toastEl = null, toastT = null;
export function toast(msg, err){
  if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role","status"); toastEl.setAttribute("aria-live","polite"); document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.toggle("err", !!err); toastEl.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), err ? 6000 : 3200);
}
export const fmtDate = (d, opt) => new Date(d).toLocaleDateString("en-GB", opt || { day:"numeric", month:"short", year:"numeric" });
export const fmtTime = d => new Date(d).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
export const slugify = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ł/g,"l").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);

// Confirm on second click
export function armed(btn, label, fn){
  btn.addEventListener("click", async () => {
    if (!btn.dataset.armed) { btn.dataset.armed = "1"; const old = btn.textContent; btn.dataset.old = old; btn.textContent = label;
      setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.old; } }, 4000); return; }
    delete btn.dataset.armed; btn.textContent = btn.dataset.old; await fn();
  });
}

// Small modal dialog
export function dialog(html, { onOpen, wide } = {}){
  const d = document.createElement("dialog"); d.className = "paper dlg" + (wide ? " wide" : "");
  d.innerHTML = html; document.body.appendChild(d);
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", e => { if (e.target === d) d.close(); });
  d.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => d.close()));
  d.showModal(); if (onOpen) onOpen(d);
  return d;
}

// .ics calendar file
export function icsFor(events, name){
  const z = d => new Date(d).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
  const e = s => String(s || "").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Paint the Lesson//EN","CALSCALE:GREGORIAN","X-WR-CALNAME:" + e(name || "Paint the Lesson")];
  events.forEach(ev => {
    const end = new Date(new Date(ev.starts_at).getTime() + (ev.minutes || 60) * 60000);
    lines.push("BEGIN:VEVENT", "UID:" + ev.id + "@paint-the-lesson", "DTSTAMP:" + z(Date.now()), "DTSTART:" + z(ev.starts_at), "DTEND:" + z(end),
      "SUMMARY:" + e(ev.title), "DESCRIPTION:" + e([ev.notes, ev.link].filter(Boolean).join("\n")), ...(ev.link ? ["URL:" + e(ev.link)] : []), "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return new Blob([lines.join("\r\n")], { type:"text/calendar" });
}
