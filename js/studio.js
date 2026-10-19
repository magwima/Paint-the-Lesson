// Studio (paint a lesson), My classes (library with folders) and the slide editor.
import { $, esc, ICONS, SECTIONS, NOTES, LEVELS, LENGTHS, setCustoms, getCustoms, allSections, findSec, parse, inline, renderBody, renderTitle,
  KEYRX, plain, wordsOf, shortDesc, THEMES, FONTS, sid, themeColors, buildDeck, slideEl, ytId, cleanTranscript, LIBS, loadScript, toast, fmtDate } from "./core.js";
import { sample, ERR, hasAI } from "./ai.js";
import { saveDoc, savePptx } from "./exports.js";
import { sb, friendly } from "./supa.js";

let ctx = null;              // { uid, profile(), go(view), addToCourse(cls) }
const state = { level:"B1", length:90, on:new Set(SECTIONS.filter(s=>!s.off).map(s=>s.key)) };
let ctl = null, busy = false, title = "", parts = [], currentClass = null, busyPart = -1;
const MAX_CUSTOM = 2, SLOTS = [[434,216],[380,368]], CUSTOM_PAINTS = ["#F4B6C2","#93B2E6","#D6C25E","#C4A487"];
let editing = null, mix = { w:10, paint:CUSTOM_PAINTS[0] };
const customs = () => getCustoms();

/* ================= Storage (Supabase) ================= */
const store = {
  async list(){ const { data, error } = await sb.from("classes").select("*").order("updated_at", { ascending:false }).limit(1000); if (error) throw error; return data; },
  async get(id){ const { data, error } = await sb.from("classes").select("*").eq("id", id).maybeSingle(); if (error) throw error; return data; },
  async put(c){
    c.updated_at = new Date().toISOString();
    const row = { id:c.id, owner:ctx.uid, folder_id:c.folder_id || null, title:(c.title || "Untitled lesson").slice(0,200), level:c.level || "", length:c.length || 90,
      student:c.student || "", md:c.md || "", deck:c.deck || null, updated_at:c.updated_at };
    const { error } = await sb.from("classes").upsert(row); if (error) throw error;
  },
  async del(id){ const { error } = await sb.from("classes").delete().eq("id", id); if (error) throw error; },
  async folders(){ const { data, error } = await sb.from("folders").select("*").order("created_at"); if (error) throw error; return data; },
  async addFolder(name){ const { data, error } = await sb.from("folders").insert({ name, owner:ctx.uid }).select().single(); if (error) throw error; return data; },
  async renameFolder(id, name){ const { error } = await sb.from("folders").update({ name }).eq("id", id); if (error) throw error; },
  async delFolder(id){ const { error } = await sb.from("folders").delete().eq("id", id); if (error) throw error; }
};
export const classStore = store;

/* ================= Preferences ================= */
function loadPrefs(){
  try {
    const p = JSON.parse(localStorage.getItem("ptl:prefs") || localStorage.getItem("teachthis:prefs") || "{}");
    if (LEVELS.includes(p.level)) state.level = p.level;
    if (LENGTHS.includes(p.length)) state.length = p.length;
    if (Array.isArray(p.customs)) setCustoms(p.customs.slice(0, MAX_CUSTOM).filter(c => c && c.key && c.name && c.spec)
      .map(c => ({ key:String(c.key), name:String(c.name).slice(0,40), spec:String(c.spec).slice(0,400), w:[5,10,15].includes(c.w)?c.w:10,
                   paint:CUSTOM_PAINTS.includes(c.paint)?c.paint:CUSTOM_PAINTS[0], custom:true, desc:shortDesc(String(c.spec)) })));
    if (Array.isArray(p.on) && p.on.length) { const keep = p.on.filter(k => findSec(k)); if (keep.length) state.on = new Set(keep); }
    if (p.student) $("student").value = p.student;
  } catch(e) {}
}
function savePrefs(){
  try { localStorage.setItem("ptl:prefs", JSON.stringify({ level:state.level, length:state.length, on:[...state.on],
    student:$("student").value, customs:customs().map(({key,name,spec,w,paint})=>({key,name,spec,w,paint})) })); } catch(e) {}
}

/* ================= Palette ================= */
let pal;
function place(b, at){ b.style.left = (at[0]/600*100)+"%"; b.style.top = (at[1]/440*100)+"%"; }
function renderWells(){
  pal.querySelectorAll(".well").forEach(w => w.remove());
  SECTIONS.forEach((s,i) => {
    const b = document.createElement("button");
    b.className = "well"; b.dataset.key = s.key; place(b, s.at);
    b.style.setProperty("--paint", s.paint); b.style.setProperty("--n", i);
    b.innerHTML = `<span class="cup"></span><span class="scoop"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[s.key]}</svg></span>`;
    b.addEventListener("click", () => toggle(s.key));
    pal.appendChild(b);
  });
  customs().forEach((c,i) => {
    const b = document.createElement("button");
    b.className = "well"; b.dataset.key = c.key; place(b, SLOTS[i]);
    b.style.setProperty("--paint", c.paint); b.style.setProperty("--n", 8+i);
    b.innerHTML = `<span class="cup"></span><span class="scoop"><span class="letter" aria-hidden="true">${esc(c.name.trim().charAt(0).toUpperCase())}</span></span>`;
    b.addEventListener("click", () => toggle(c.key));
    pal.appendChild(b);
  });
  if (customs().length < MAX_CUSTOM) {
    const b = document.createElement("button");
    b.className = "well plus"; b.dataset.key = "_add"; place(b, SLOTS[customs().length]);
    b.style.setProperty("--paint", CUSTOM_PAINTS[customs().length % CUSTOM_PAINTS.length]);
    b.setAttribute("aria-label", "Add your own section");
    b.dataset.tip = "Add your own colour\nFor example pronunciation,\na game or a listening task";
    b.innerHTML = `<span class="cup"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg></span>`;
    b.addEventListener("click", () => openMixer("new"));
    pal.appendChild(b);
  }
}
function renderLegend(){
  const legend = $("legend"); legend.innerHTML = "";
  allSections().forEach(s => {
    const li = document.createElement("li");
    li.innerHTML = `<button class="lg" data-key="${s.key}" style="--paint:${s.paint}"><span class="dot"></span><span class="nm">${esc(s.name)}</span><span class="min"><span></span></span></button>` +
      (s.custom ? `<button class="edit" data-edit="${s.key}" aria-label="Edit ${esc(s.name)}">Edit</button>` : "");
    li.querySelector(".lg").addEventListener("click", () => toggle(s.key));
    const e = li.querySelector(".edit"); if (e) e.addEventListener("click", () => openMixer(s.key));
    legend.appendChild(li);
  });
}
export function swatchRow(el, values, cur, fmt, onPick){
  el.innerHTML = "";
  values.forEach(v => {
    const b = document.createElement("button");
    b.className = "swatch"; b.type = "button"; b.textContent = fmt(v); b.setAttribute("aria-pressed", String(v===cur));
    b.addEventListener("click", () => onPick(v));
    el.appendChild(b);
  });
}
function drawControls(){
  swatchRow($("levels"), LEVELS, state.level, v=>v, v => { state.level=v; savePrefs(); refresh(); });
  swatchRow($("lengths"), LENGTHS, state.length, v=>v+" min", v => { state.length=v; savePrefs(); refresh(); });
}
function toggle(key){
  if (state.on.has(key)) { if (state.on.size === 1) { setStatus("Keep at least one well filled."); return; } state.on.delete(key); }
  else state.on.add(key);
  savePrefs(); refresh();
}
function minutes(){
  const sel = allSections().filter(s => state.on.has(s.key));
  const tot = sel.reduce((a,s)=>a+s.w,0);
  const m = {}; let sum = 0;
  sel.forEach(s => { m[s.key] = Math.max(3, Math.round(s.w/tot*state.length)); sum += m[s.key]; });
  if (sel.length) { const big = sel.reduce((a,s)=> s.w>a.w ? s : a); m[big.key] += state.length - sum; }
  return m;
}
function refresh(){
  const m = minutes();
  pal.querySelectorAll(".well:not(.plus)").forEach(b => {
    const s = findSec(b.dataset.key); if (!s) return;
    const on = state.on.has(s.key);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${s.name}${on ? ", "+m[s.key]+" minutes, included" : ", skipped"}. ${s.desc}`);
    b.dataset.tip = on ? `${s.name}, ${m[s.key]} min\n${s.desc}\nClick to skip` : `${s.name} (skipped)\n${s.desc}\nClick to add it back`;
  });
  renderLegend();
  $("legend").querySelectorAll(".lg").forEach(b => {
    const on = state.on.has(b.dataset.key);
    b.setAttribute("aria-pressed", String(on));
    b.querySelector(".min span").textContent = on ? m[b.dataset.key]+" min" : "";
  });
  $("listenField").hidden = !state.on.has("listen");
  $("stickMin").textContent = state.length + " min";
  $("stickInfo").textContent = state.level + ", " + state.on.size + (state.on.size===1?" colour":" colours");
  drawControls();
}

/* ---- Custom colour mixer ---- */
function drawMixerSwatches(){
  swatchRow($("mxMin"), [5,10,15], mix.w, v=>({5:"Short",10:"Medium",15:"Long"})[v], v => { mix.w=v; drawMixerSwatches(); });
  const row = $("mxPaint"); row.innerHTML = "";
  CUSTOM_PAINTS.forEach((c,i) => {
    const b = document.createElement("button");
    b.className = "paint-dot"; b.type = "button"; b.style.setProperty("--paint", c);
    b.setAttribute("aria-label", ["Rose","Cornflower","Ochre","Cinnamon"][i]); b.setAttribute("aria-pressed", String(c===mix.paint));
    b.addEventListener("click", () => { mix.paint = c; drawMixerSwatches(); });
    row.appendChild(b);
  });
}
function openMixer(key){
  const c = key === "new" ? null : customs().find(x => x.key === key);
  if (key === "new" && customs().length >= MAX_CUSTOM) { setStatus("The palette holds two custom colours. Edit or remove one first."); return; }
  editing = key;
  $("mxTitle").textContent = c ? "Edit your colour" : "Mix your own colour";
  $("mxName").value = c ? c.name : ""; $("mxSpec").value = c ? c.spec : "";
  mix = { w: c ? c.w : 10, paint: c ? c.paint : CUSTOM_PAINTS.find(p => !customs().some(x => x.paint === p)) || CUSTOM_PAINTS[0] };
  $("mxDelete").hidden = !c; $("mxSave").textContent = c ? "Save changes" : "Add to palette";
  $("mxErr").textContent = "";
  drawMixerSwatches();
  $("mixer").hidden = false; $("mxName").focus();
}
function closeMixer(){ $("mixer").hidden = true; editing = null; }

/* ================= Prompts ================= */
const ARTICLE_MAX = 40000;
function ctxOf(){
  const focus = $("focus").value.trim(), id = ytId($("ytUrl").value);
  const listening = state.on.has("listen");
  const transcript = listening ? cleanTranscript($("transcript").value).slice(0, 30000) : "";
  const article = $("article").value.trim().slice(0,ARTICLE_MAX);
  const useTranscript = wordsOf(article) < 80 && wordsOf(transcript) >= 80;
  return { level:state.level, student:$("student").value.trim() || "adult professional", focus,
           article, transcript, yt: id ? "https://www.youtube.com/watch?v=" + id : "",
           source: useTranscript ? transcript : article, sourceIsTranscript: useTranscript };
}
function readingSpec(c){
  const words = { A2:200, B1:280, B2:380, C1:450, C2:500 }[c.level] || 300;
  const vocabOn = state.on.has("vocab");
  return `Write an original story of about ${words} words at ${c.level} level, inspired by the topic and ideas of the source text. Do not copy its sentences. Start with the story's title in bold on its own line, then the story in short paragraphs.
${vocabOn ? "Use all 8 Key vocabulary items in the story. For each one, use the exact word or phrase, or a synonym, an antonym or another form of it (for example the noun instead of the verb)." : `Include 8 useful words or phrases for ${c.level} level.`} Mark each of these 8 words in the story by wrapping it in double equals signs, like ==word==. Mark nothing else.
After the story, write **Words in the story** and a bullet list: each marked word, then ${vocabOn ? "how it links to the key vocabulary (same word, synonym of …, antonym of …, or word family of …)" : "its meaning in simple words"}.
Then write **Questions** and 6 numbered True / False / Not Given statements about the story. "Not Given" must mean the story genuinely does not say it.
Then write **Talk about it** and 2 questions that invite discussion of the marked words, for example how the meaning would change with the opposite word.
Then a "### Answer key" subsection with each True / False / Not Given answer and a one-line reason.`;
}
function listenSpec(c){
  return `Use ONLY the video transcript for this section. Start with this line exactly: Video: ${c.yt}
Then write **Before you watch** and 2 short prediction questions.
Then write **While you watch** and 6 numbered questions at ${c.level} level that follow the order of the video. Mix multiple choice (options a), b), c) each on its own line) and short-answer questions about key information.
Then write **After you watch** and 2 discussion questions linking the video to the student's life or work.
Then a "### Answer key" subsection with each answer and the words from the transcript that prove it.`;
}
function specOf(s, c){
  if (s.key === "reading") return readingSpec(c);
  if (s.key === "listen") return listenSpec(c);
  if (s.custom) return (/[.!?]$/.test(s.spec) ? s.spec : s.spec + ".") + " Make it fit the article, the level and this student. Include a \"### Answer key\" subsection if the activity has answers.";
  return s.spec.replace("{FOCUS}", c.focus ? " and the language focus ("+c.focus+")" : "").replace("{LEVEL}", c.level);
}
function notesLang(){ const p = ctx.profile(); return p && p.lang && p.lang !== "English" ? p.lang : ""; }
function buildPrompt(){
  const c = ctxOf(), m = minutes();
  const sel = allSections().filter(s => state.on.has(s.key));
  let body = sel.map(s => `## ${s.name} (${m[s.key]} min)\n${specOf(s,c)}`).join("\n\n");
  const nl = notesLang() ? ` Write the Teacher notes in ${notesLang()}.` : "";
  body += `\n\n## ${NOTES.name}\n${NOTES.spec}${nl}`;
  return `You are an expert English teacher who designs engaging 1:1 lessons for adult professionals.

Create a ${state.length}-minute lesson based on the source text below.
Student level: ${c.level} (CEFR)
Student: ${c.student}
${c.focus ? "Language focus: " + c.focus + "\n" : ""}
Write the lesson in Markdown using EXACTLY these section headings, in this order, and no others:

# [A short, engaging lesson title]
One line: the lesson aim.

${body}

Rules:
- Lots of speaking. Adult, real-world tone. Nothing childish.
- Language difficulty must match ${c.level}.
- Reading questions must be answerable from the story you write. Listening questions must be answerable from the transcript.
- Use ==double equals== only to mark the 8 vocabulary words inside the reading story.
- Use Markdown headings, numbered lists and bullet points only. No tables, no horizontal rules, no emojis.
- No introduction or closing remarks outside the lesson.

${sourceBlocks(c, state.on.has("listen"))}`;
}
function sourceBlocks(c, withTranscript){
  let out = `SOURCE TEXT${c.sourceIsTranscript ? " (this is also the video transcript)" : ""}:\n"""\n${c.source}\n"""`;
  if (withTranscript && !c.sourceIsTranscript && c.transcript) out += `\n\nVIDEO TRANSCRIPT (for the Listening section only):\n"""\n${c.transcript}\n"""`;
  return out;
}

/* ================= Painted output ================= */
function show(){
  const out = $("out"); out.className = "lesson";
  let h = renderTitle(title);
  parts.forEach((p,i) => {
    const sec = p.sec, paint = sec ? sec.paint : "#D9D5CC";
    const first = p.md.split("\n")[0].replace(/^##\s+/,"");
    const rest = p.md.split("\n").slice(1).join("\n");
    h += `<section class="part${sec===NOTES?" teacher-only":""}${i===busyPart?" busy":""}" style="--paint:${paint}">
      <div class="part-head"><h2>${inline(first)}</h2>
      <button class="repaint" data-i="${i}" ${busy?"disabled":""} aria-label="Repaint ${esc(first)}">Repaint</button></div>
      ${renderBody(rest)}</section>`;
  });
  out.innerHTML = h || '<p class="thinking">Mixing paints… a full lesson usually takes 30–90 seconds.</p>';
}
function fullMarkdown(student){
  const strip = md => {
    if (!student) return md;
    const keep=[]; let skip=false;
    for (const l of md.split("\n")) { const h=l.match(/^(#{1,6})\s+(.*)/); if (h) skip = h[1].length>=3 && KEYRX.test(h[2]); if(!skip) keep.push(l); }
    return keep.join("\n");
  };
  const ps = parts.filter(p => !(student && p.sec===NOTES)).map(p => strip(p.md));
  return [title.trim(), ...ps].join("\n\n").trim();
}
function lessonTitle(){ const m = title.match(/^#\s+(.*)$/m); return m ? plain(m[1]) : "Untitled lesson"; }

function setBusy(on){
  busy = on;
  $("go").disabled = on; $("hole").disabled = on;
  $("go").textContent = on ? "Painting…" : "Paint the lesson";
  $("hole").textContent = on ? "…" : "Paint";
  $("stop").hidden = !on;
  updateTools();
}
function updateTools(){
  const has = parts.length > 0;
  $("toolbar").hidden = !has && !busy;
  $("copy").hidden = !has || busy;
  $("openSlides").hidden = !currentClass || busy;
  $("toCourse").hidden = !currentClass || busy;
  $("saveWrap").hidden = !has || busy;
  document.querySelectorAll(".repaint").forEach(b => b.disabled = busy);
}
export function setStatus(msg, err){ const s = $("status"); if (!s) return; s.textContent = msg; s.classList.toggle("err", !!err); }
function aiError(e){
  if (e && e.code === "no_key") { setStatus(ERR.no_key, true); showKeyNudge(); return; }
  setStatus(ERR[e && e.code] || ERR.upstream_error, true);
  if (e && (e.code === "bad_key" || e.code === "bad_model")) showKeyNudge();
}
function showKeyNudge(){ $("unavail").hidden = hasAI(); }

async function paint(){
  if (busy) return;
  if (!hasAI()) { aiError({ code:"no_key" }); return; }
  const vc = ctxOf();
  if (state.on.has("listen")) {
    if (!vc.yt) { setStatus("Add a YouTube link for Listening, or empty its well.", true); $("ytUrl").focus(); return; }
    if (wordsOf(vc.transcript) < 40) { setStatus("Paste the video's transcript for Listening. On YouTube: description, Show transcript, then copy.", true); $("transcript").focus(); return; }
  }
  if (wordsOf(vc.source) < 80) { setStatus(state.on.has("listen") ? "Add an article or file of at least 80 words, or a longer transcript." : "Paste an article or upload a file of at least 80 words first.", true); $("article").focus(); return; }
  savePrefs(); setStatus("");
  title = ""; parts = []; busyPart = -1; currentClass = null;
  setBusy(true); show();
  if (window.matchMedia("(max-width:1079px)").matches) $("out").scrollIntoView({ behavior:"smooth", block:"start" });
  ctl = new AbortController();
  try {
    const { text, truncated } = await sample(buildPrompt(), { signal:ctl.signal, onText: ({text}) => { ({title, parts} = parse(text)); show(); } });
    ({title, parts} = parse(text)); show();
    setStatus(truncated ? "The lesson was cut short. Try fewer wells or a shorter article." : "Lesson painted.");
    if (await saveClassFromStudio(true)) setStatus((truncated ? "The lesson was cut short, but it's saved. " : "Lesson painted and saved to My classes. ") + "Open slides to edit it, or add it to a course.");
  } catch(e) {
    if (e && e.text) ({title, parts} = parse(e.text));
    if (!parts.length && !title) { $("out").className="empty"; $("out").textContent="No lesson yet."; } else show();
    if (e && e.code === "cancelled") setStatus("Stopped."); else aiError(e);
    if (parts.length && e && e.code !== "refused") await saveClassFromStudio(true);
  } finally { setBusy(false); show(); updateTools(); }
}

async function repaint(i){
  if (busy || !parts[i]) return;
  if (!hasAI()) { aiError({ code:"no_key" }); return; }
  const p = parts[i], c = ctxOf();
  const headLine = p.md.split("\n")[0].trim();
  const name = headLine.replace(/^##\s+/,"");
  const spec = p.sec ? specOf(p.sec, c) : "Same type of activity as before.";
  const nl = p.sec === NOTES && notesLang() ? ` Write it in ${notesLang()}.` : "";
  const prompt = `You are an expert English teacher editing one section of a 1:1 lesson.
Student level: ${c.level} (CEFR). Student: ${c.student}.${c.focus ? " Language focus: "+c.focus+"." : ""}

The current lesson, for context (avoid repeating its items):
"""
${fullMarkdown(false)}
"""

Rewrite ONLY the section "${name}" with fresh, different content of the same kind and the same timing.
What this section must contain: ${spec}${nl}
Start your reply with exactly this line: ${headLine}
Output only that section in Markdown. No tables, no other sections, no remarks.

${c.source && wordsOf(c.source) >= 40 ? sourceBlocks(c, p.sec && p.sec.key === "listen") : ""}`;
  const old = p.md; busyPart = i; setBusy(true); show(); setStatus("Repainting " + name + "…");
  ctl = new AbortController();
  try {
    const { text } = await sample(prompt, { signal:ctl.signal,
      onText: ({text}) => { parts[i].md = text.trim().startsWith("##") ? text : headLine + "\n" + text; show(); } });
    parts[i].md = text.trim().startsWith("##") ? text.trim() : headLine + "\n" + text.trim();
    setStatus(name + " repainted." + (p.sec && p.sec.key === "vocab" && parts.some(x => x.sec && x.sec.key === "reading") ? " Repaint Reading too, so the story uses the new words." : ""));
    if (currentClass) { const wasEdited = currentClass.deck && currentClass.deck.edited; await saveClassFromStudio(false);
      if (wasEdited) setStatus(name + " repainted. Your edited slides weren't changed."); }
  } catch(e) {
    parts[i].md = old;
    if (e && e.code === "cancelled") setStatus("Stopped. The previous version is kept."); else aiError(e);
  } finally { busyPart = -1; setBusy(false); show(); }
}

function setView(student){
  document.body.classList.toggle("student", student);
  $("viewTeacher").setAttribute("aria-pressed", String(!student));
  $("viewStudent").setAttribute("aria-pressed", String(student));
}
const isStudent = () => document.body.classList.contains("student");

async function saveClassFromStudio(isNew){
  const md = fullMarkdown(false);
  if (isNew || !currentClass) {
    currentClass = { id:crypto.randomUUID(), created_at:new Date().toISOString(), level:state.level, length:state.length,
      student:$("student").value.trim(), title:lessonTitle(), md, deck:null, folder_id:null };
    currentClass.deck = buildDeck(currentClass);
  } else {
    currentClass.md = md;
    if (!currentClass.deck || !currentClass.deck.edited) { currentClass.title = lessonTitle(); currentClass.deck = buildDeck(currentClass, currentClass.deck); }
  }
  try { await store.put(currentClass); updateTools(); return true; }
  catch(e) { setStatus("The lesson is ready, but it couldn't be saved to My classes. " + friendly(e), true); return false; }
}
// Open a saved class back in the studio, to repaint parts
export function loadIntoStudio(c){
  currentClass = c; ({ title, parts } = parse(c.md));
  if (LEVELS.includes(c.level)) state.level = c.level;
  if (LENGTHS.includes(c.length)) state.length = c.length;
  if (c.student) $("student").value = c.student;
  refresh(); show(); updateTools(); setStatus("Opened “" + c.title + "”. Repaint any part; changes are saved.");
}

/* ================= Files: PDF and Word ================= */
const MAX_FILE = 50 * 1024 * 1024;
async function pdfText(buf){
  await loadScript(LIBS.pdfWorker); await loadScript(LIBS.pdf);
  const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  const doc = await lib.getDocument({ data:new Uint8Array(buf), isEvalSupported:false, useSystemFonts:true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    let t = ""; for (const it of tc.items) { t += it.str || ""; t += it.hasEOL ? "\n" : " "; }
    pages.push(t.replace(/[ \t]+\n/g,"\n").replace(/ {2,}/g," ").trim());
    if (i % 5 === 0) setStatus(`Reading page ${i} of ${doc.numPages}…`);
  }
  return pages.join("\n\n").replace(/\n{3,}/g,"\n\n").trim();
}
async function docxText(buf){
  await loadScript(LIBS.mammoth);
  const r = await window.mammoth.extractRawText({ arrayBuffer:buf });
  return (r.value || "").replace(/\n{3,}/g,"\n\n").trim();
}
export async function fileToText(f, onMsg){
  const name = f.name || "file", ext = name.toLowerCase().split(".").pop();
  if (f.size > MAX_FILE) throw new Error(`${name} is ${Math.ceil(f.size/1048576)} MB. The limit is 50 MB.`);
  if (ext === "doc") throw new Error("Older .doc files can't be read. Save it as .docx or PDF first.");
  if (ext === "txt" || ext === "md") return await f.text();
  if (!["pdf","docx"].includes(ext)) throw new Error("Upload a PDF, a Word (.docx) or a text file.");
  if (onMsg) onMsg(`Reading ${name}…`);
  const buf = await f.arrayBuffer();
  try { return ext === "pdf" ? await pdfText(buf) : await docxText(buf); }
  catch(e) { throw new Error(e && e.message === "load" ? "The file reader couldn't load. Check your connection and try again." : `Couldn't read ${name}. It may be password-protected or damaged.`); }
}
function updateCount(){
  const n = wordsOf($("article").value), long = $("article").value.length > ARTICLE_MAX;
  $("counter").textContent = n.toLocaleString("en") + (n===1?" word":" words") + (long ? ". Long text: only the first part will be used." : "");
  $("counter").classList.toggle("warn", long);
}
async function handleFile(f){
  if (!f) return;
  $("fileBtn").disabled = true;
  try {
    const text = await fileToText(f, m => setStatus(m));
    const words = wordsOf(text);
    if (words < 30) { setStatus(/pdf$/i.test(f.name) ? "No text found. This PDF may be scanned pages. Try a PDF with selectable text or a Word file." : "No text found in this file.", true); return; }
    $("article").value = text; updateCount();
    $("fileName").textContent = `${f.name}, ${words.toLocaleString("en")} words`; $("fileChip").hidden = false;
    setStatus(text.length > ARTICLE_MAX ? `Loaded ${f.name}. It's long, so only the first part will be used. Trim it to the part you want.` : `Loaded ${f.name}. Check or trim the text, then paint.`);
  } catch(e) { setStatus(e.message, true); }
  finally { $("fileBtn").disabled = false; $("file").value = ""; }
}

/* ================= Library with folders ================= */
let libFilter = "all", folders = [], dragId = null, libSearch = "";
async function moveClass(c, folderId){
  if ((c.folder_id || "") === (folderId || "")) return;
  c.folder_id = folderId || null;
  try { await store.put(c); } catch(e) { toast(friendly(e), true); }
  if (currentClass && currentClass.id === c.id) currentClass.folder_id = c.folder_id;
  renderLibrary();
}
function dropTarget(el, folderId, list){
  el.addEventListener("dragover", e => { if (dragId) { e.preventDefault(); el.classList.add("over"); } });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", e => { e.preventDefault(); el.classList.remove("over"); const c = list.find(x => x.id === dragId); dragId = null; if (c) moveClass(c, folderId); });
}
function folderButton(label, key, count, list){
  const b = document.createElement("button"); b.className = "fold" + (libFilter === key ? " on" : "");
  b.setAttribute("aria-pressed", String(libFilter === key));
  b.innerHTML = `<span class="fname"></span><span class="fcount">${count}</span>`; b.querySelector(".fname").textContent = label;
  b.addEventListener("click", () => { libFilter = key; renderLibrary(); });
  if (key !== "all") dropTarget(b, key === "none" ? "" : key, list);
  return b;
}
function startRename(f, row){
  const inp = document.createElement("input"); inp.type = "text"; inp.className = "fold-input"; inp.value = f.name; inp.maxLength = 40;
  inp.setAttribute("aria-label", "Folder name");
  row.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = async keep => {
    if (done) return; done = true;
    if (keep) { const v = inp.value.trim(); if (v && v !== f.name) { try { await store.renameFolder(f.id, v); } catch(e) { toast(friendly(e), true); } } }
    renderLibrary();
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") finish(true); else if (e.key === "Escape") finish(false); });
  inp.addEventListener("blur", () => finish(true));
}
export async function renderLibrary(){
  const g = $("libGrid"), side = $("folderList");
  g.innerHTML = '<p class="lib-empty">Loading your classes…</p>';
  let list = [];
  try { [list, folders] = await Promise.all([store.list(), store.folders()]); }
  catch(e) { g.innerHTML = `<p class="lib-empty">${esc(friendly(e))}</p>`; return; }
  if ($("vLib").hidden) return;
  if (libFilter !== "all" && libFilter !== "none" && !folders.some(f => f.id === libFilter)) libFilter = "all";
  side.innerHTML = "";
  side.appendChild(folderButton("All classes", "all", list.length, list));
  side.appendChild(folderButton("Not in a folder", "none", list.filter(c => !c.folder_id).length, list));
  folders.forEach(f => {
    const row = document.createElement("div"); row.className = "fold-row";
    const b = folderButton(f.name, f.id, list.filter(c => c.folder_id === f.id).length, list);
    b.addEventListener("dblclick", () => startRename(f, row));
    const ren = document.createElement("button"); ren.className = "fold-act"; ren.textContent = "Rename"; ren.setAttribute("aria-label", `Rename ${f.name}`);
    ren.addEventListener("click", () => startRename(f, row));
    const del = document.createElement("button"); del.className = "fold-act danger"; del.textContent = "Delete"; del.setAttribute("aria-label", `Delete folder ${f.name}`);
    del.addEventListener("click", async () => {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Confirm"; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "Delete"; } }, 4000); return; }
      try { await store.delFolder(f.id); } catch(e) { toast(friendly(e), true); }
      if (libFilter === f.id) libFilter = "all"; renderLibrary();
    });
    const acts = document.createElement("span"); acts.className = "fold-acts"; acts.append(ren, del);
    row.append(b, acts); side.appendChild(row);
  });
  let shown = libFilter === "all" ? list : libFilter === "none" ? list.filter(c => !c.folder_id) : list.filter(c => c.folder_id === libFilter);
  const q = libSearch.trim().toLowerCase();
  if (q) shown = shown.filter(c => (c.title + " " + (c.student || "") + " " + (c.level || "")).toLowerCase().includes(q));
  const fname = libFilter === "all" ? "All classes" : libFilter === "none" ? "Not in a folder" : (folders.find(f => f.id === libFilter) || {}).name;
  $("libHeading").textContent = fname || "All classes";
  if (!list.length) {
    g.innerHTML = `<div class="lib-empty"><p>No classes yet. Paint a lesson in the Studio and it will appear here.</p><button class="mx-save" id="libGo">Go to the Studio</button></div>`;
    $("libGo").addEventListener("click", () => ctx.go("studio")); return;
  }
  if (!shown.length) { g.innerHTML = `<p class="lib-empty">${q ? "No classes match your search." : "Nothing here yet. Drag a class onto this folder, or use the folder menu on a class."}</p>`; return; }
  g.innerHTML = "";
  shown.forEach(c => {
    if (!c.deck) c.deck = buildDeck(c);
    const card = document.createElement("article"); card.className = "paper lib-card"; card.draggable = true;
    card.addEventListener("dragstart", e => { dragId = c.id; card.classList.add("dragging"); try { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; } catch(err) {} });
    card.addEventListener("dragend", () => { dragId = null; card.classList.remove("dragging"); document.querySelectorAll(".fold.over").forEach(x => x.classList.remove("over")); });
    const thumb = document.createElement("button"); thumb.className = "lib-thumb"; thumb.setAttribute("aria-label", "Open " + c.title);
    thumb.appendChild(slideEl(c.deck.slides[0], c, 0, c.deck.slides.length));
    thumb.addEventListener("click", () => openEditor(c));
    const info = document.createElement("div"); info.className = "lib-info";
    info.innerHTML = `<h2></h2><p>${esc(c.level)}, ${c.length} min, ${c.deck.slides.length} slides</p><p>Edited ${fmtDate(c.updated_at || c.created_at)}</p>`;
    info.querySelector("h2").textContent = c.title;
    const mv = document.createElement("select"); mv.className = "lib-move"; mv.setAttribute("aria-label", `Folder for ${c.title}`);
    [["","Not in a folder"], ...folders.map(f => [f.id, f.name])].forEach(([v,t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; mv.appendChild(o); });
    mv.value = c.folder_id || "";
    mv.addEventListener("change", () => moveClass(c, mv.value));
    const acts = document.createElement("div"); acts.className = "lib-acts";
    const open = document.createElement("button"); open.className = "mx-save"; open.textContent = "Slides";
    open.addEventListener("click", () => openEditor(c));
    const st = document.createElement("button"); st.className = "mx-ghost"; st.textContent = "Repaint";
    st.title = "Open in the Studio to repaint parts";
    st.addEventListener("click", () => { ctx.go("studio"); loadIntoStudio(c); });
    const tc = document.createElement("button"); tc.className = "mx-ghost"; tc.textContent = "Add to course";
    tc.addEventListener("click", () => ctx.addToCourse(c));
    const del = document.createElement("button"); del.className = "mx-ghost danger"; del.textContent = "Delete";
    del.addEventListener("click", async () => {
      if (del.dataset.armed) {
        try { await store.del(c.id); } catch(e) { toast(friendly(e), true); return; }
        if (currentClass && currentClass.id === c.id) { currentClass = null; updateTools(); }
        renderLibrary();
      } else { del.dataset.armed = "1"; del.textContent = "Confirm delete"; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "Delete"; } }, 4000); }
    });
    acts.append(open, st, tc, del); info.append(mv, acts);
    card.append(thumb, info); g.appendChild(card);
  });
}

/* ================= Slide editor ================= */
const ed = { cls:null, idx:0 };
const curSlide = () => ed.cls.deck.slides[ed.idx];
let saveTimer = null;
function scheduleSave(){
  clearTimeout(saveTimer); $("edSaved").textContent = "Saving…";
  saveTimer = setTimeout(async () => {
    try { await store.put(ed.cls); $("edSaved").textContent = "Saved"; if (currentClass && currentClass.id === ed.cls.id) currentClass = ed.cls; }
    catch(e) { $("edSaved").textContent = "Couldn't save"; }
  }, 600);
}
export function openEditor(c){
  if (!c.deck) c.deck = buildDeck(c);
  ed.cls = c; ed.idx = 0;
  $("edTitle").value = c.title; $("edSaved").textContent = "";
  $("exportPanel").hidden = true; $("edExport").setAttribute("aria-expanded","false"); exMsg("");
  ctx.go("editor"); setTab("slide");
  renderThumbs(); renderStage(0); renderInspector(); renderDesign();
}
function renderThumbs(){
  const t = $("thumbs"), sl = ed.cls.deck.slides; t.innerHTML = "";
  sl.forEach((s,i) => {
    const b = document.createElement("button"); b.className = "thumb" + (i === ed.idx ? " on" : "");
    b.setAttribute("aria-label", `Slide ${i+1}: ${plain(s.title)}`); b.setAttribute("aria-current", String(i === ed.idx));
    b.innerHTML = `<span class="tn" aria-hidden="true">${i+1}</span>`; b.appendChild(slideEl(s, ed.cls, i, sl.length));
    b.addEventListener("click", () => go(i));
    t.appendChild(b);
  });
  const add = document.createElement("button"); add.className = "thumb add"; add.textContent = "Add slide";
  add.addEventListener("click", addSlide); t.appendChild(add);
}
function refreshThumb(i){
  const b = $("thumbs").children[i]; if (!b) return;
  const old = b.querySelector(".slide"); if (old) old.replaceWith(slideEl(ed.cls.deck.slides[i], ed.cls, i, ed.cls.deck.slides.length));
}
function renderStage(dir){
  const sl = ed.cls.deck.slides; const el = slideEl(sl[ed.idx], ed.cls, ed.idx, sl.length);
  if (dir) el.classList.add(dir > 0 ? "in-next" : "in-prev");
  $("stage").innerHTML = ""; $("stage").appendChild(el);
  $("slideCount").textContent = `${ed.idx+1} / ${sl.length}`;
  $("prevSlide").disabled = ed.idx === 0; $("nextSlide").disabled = ed.idx === sl.length - 1;
}
function markThumbs(){
  [...$("thumbs").querySelectorAll(".thumb:not(.add)")].forEach((b,i) => { b.classList.toggle("on", i === ed.idx); b.setAttribute("aria-current", String(i === ed.idx)); });
  const cur = $("thumbs").children[ed.idx]; if (cur) cur.scrollIntoView({ block:"nearest", inline:"nearest" });
}
function go(i){
  const n = ed.cls.deck.slides.length; i = Math.max(0, Math.min(n-1, i));
  if (i === ed.idx) return;
  const dir = i > ed.idx ? 1 : -1; ed.idx = i; renderStage(dir); markThumbs(); renderInspector();
}
function changed(){ ed.cls.deck.edited = true; renderStage(0); refreshThumb(ed.idx); scheduleSave(); }
function structureChanged(){ ed.cls.deck.edited = true; renderThumbs(); renderStage(0); renderInspector(); markThumbs(); scheduleSave(); }
function setTab(t){
  $("pSlide").hidden = t !== "slide"; $("pDesign").hidden = t !== "design";
  $("tabSlide").setAttribute("aria-pressed", String(t === "slide")); $("tabSlide").setAttribute("aria-selected", String(t === "slide"));
  $("tabDesign").setAttribute("aria-pressed", String(t === "design")); $("tabDesign").setAttribute("aria-selected", String(t === "design"));
}
const LAYOUTS = { standard:"Standard", statement:"Big statement", columns:"Two columns" };
let undoAsk = null;
function renderInspector(){
  const s = curSlide(), isTitle = s.kind === "title";
  $("insLabel").value = s.label || ""; $("insTitle").value = s.title || ""; $("insBody").value = s.body || ""; $("insNotes").value = s.notes || "";
  $("insBodyLabel").textContent = isTitle ? "Subtitle" : "Slide text";
  $("layoutField").hidden = isTitle; $("answersField").hidden = isTitle;
  $("insAnswers").checked = !!s.answers;
  $("insOwnAccent").checked = !!s.accent; $("insAccent").value = s.accent || ed.cls.deck.colors.accent; $("insAccent").disabled = !s.accent;
  swatchRow($("insLayout"), Object.keys(LAYOUTS), s.layout || "standard", v => LAYOUTS[v], v => { curSlide().layout = v; renderInspector(); changed(); });
  $("insUp").disabled = ed.idx === 0; $("insDown").disabled = ed.idx === ed.cls.deck.slides.length - 1;
  $("insDel").textContent = "Delete"; delete $("insDel").dataset.armed;
  $("insAsk").value = ""; $("askMsg").textContent = ""; $("askMsg").classList.remove("err");
  $("askUndo").hidden = !(undoAsk && undoAsk.id === s.id);
}
function addSlide(){
  const sl = ed.cls.deck.slides, s = curSlide();
  sl.splice(ed.idx + 1, 0, { id:sid(), kind:"content", label: s.kind === "title" ? "" : (s.label || ""), title:"New slide", body:"- First point\n- Second point",
    notes:"", layout:"standard", answers:false, accent:null });
  ed.idx++; structureChanged(); $("insTitle").focus(); $("insTitle").select();
}
function move(d){
  const sl = ed.cls.deck.slides, j = ed.idx + d; if (j < 0 || j >= sl.length) return;
  [sl[ed.idx], sl[j]] = [sl[j], sl[ed.idx]]; ed.idx = j; structureChanged();
}
function renderDesign(){
  const d = ed.cls.deck, th = $("themes"); th.innerHTML = "";
  Object.entries(THEMES).forEach(([k,t]) => {
    const b = document.createElement("button"); b.className = "theme-btn"; b.setAttribute("aria-pressed", String(d.theme === k));
    b.innerHTML = `<i style="background:${t.primary}"></i><i style="background:${t.accent}"></i>${t.name}`;
    b.addEventListener("click", () => { d.theme = k; d.colors = themeColors(k); designChanged(); });
    th.appendChild(b);
  });
  $("dPrimary").value = d.colors.primary; $("dAccent").value = d.colors.accent; $("dBg").value = d.colors.bg; $("dText").value = d.colors.text;
  swatchRow($("dFonts"), Object.keys(FONTS), d.font, v => FONTS[v].name, v => { d.font = v; designChanged(); });
  swatchRow($("dSizes"), [0.9, 1, 1.12], d.scale || 1, v => ({0.9:"Smaller",1:"Normal",1.12:"Larger"})[v], v => { d.scale = v; designChanged(); });
  $("dFooter").checked = d.footer !== false;
}
let rafPending = false;
function redrawSoon(){ if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; renderThumbs(); renderStage(0); markThumbs(); }); } }
function designChanged(){ ed.cls.deck.edited = true; renderDesign(); redrawSoon(); scheduleSave(); }

/* ---- Present ---- */
const pr = { idx:0, x:null };
function drawPresent(dir){
  const sl = ed.cls.deck.slides; const el = slideEl(sl[pr.idx], ed.cls, pr.idx, sl.length);
  if (dir) el.classList.add(dir > 0 ? "in-next" : "in-prev");
  $("prStage").innerHTML = ""; $("prStage").appendChild(el);
  $("prCount").textContent = `${pr.idx+1} / ${sl.length}`;
  $("prPrev").disabled = pr.idx === 0; $("prNext").disabled = pr.idx === sl.length - 1;
  $("prNotes").textContent = sl[pr.idx].notes || "";
}
function prGo(d){ const n = ed.cls.deck.slides.length, i = pr.idx + d; if (i < 0 || i >= n) return; pr.idx = i; drawPresent(d); }
function prJump(i){ if (i === pr.idx) return; const d = i > pr.idx ? 1 : -1; pr.idx = i; drawPresent(d); }
function openPresent(){
  pr.idx = ed.idx; $("present").hidden = false; drawPresent(0);
  try { const p = $("present").requestFullscreen && $("present").requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch(e) {}
  $("prNext").focus();
}
function closePresent(){
  $("present").hidden = true;
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch(e) {}
  if (pr.idx !== ed.idx) { const d = pr.idx > ed.idx ? 1 : -1; ed.idx = pr.idx; renderStage(d); markThumbs(); renderInspector(); }
  $("edPresent").focus();
}
function exMsg(t, err){ $("exMsg").textContent = t; $("exMsg").classList.toggle("err", !!err); }

/* ================= Wiring ================= */
export function initStudio(context){
  ctx = context;
  pal = $("palette");
  loadPrefs();
  renderWells(); setTimeout(() => pal.classList.remove("intro"), 1400);
  refresh();
  $("hole").dataset.tip = "Paint the lesson\nfrom your article";
  showKeyNudge();

  $("mxCancel").addEventListener("click", closeMixer);
  $("mxSave").addEventListener("click", () => {
    const name = $("mxName").value.trim(), spec = $("mxSpec").value.trim();
    if (!name) { $("mxErr").textContent = "Give the section a name."; $("mxName").focus(); return; }
    if (spec.length < 10) { $("mxErr").textContent = "Describe what the section should include."; $("mxSpec").focus(); return; }
    if (allSections().some(s => s.name.toLowerCase() === name.toLowerCase() && s.key !== editing)) { $("mxErr").textContent = "That name is already on the palette."; return; }
    if (editing === "new") {
      const key = "c" + Date.now().toString(36);
      setCustoms([...customs(), { key, name, spec, w:mix.w, paint:mix.paint, custom:true, desc:shortDesc(spec) }]);
      state.on.add(key);
    } else { const c = customs().find(x => x.key === editing); if (c) Object.assign(c, { name, spec, w:mix.w, paint:mix.paint, desc:shortDesc(spec) }); }
    closeMixer(); renderWells(); savePrefs(); refresh(); setStatus(`${name} added to your mix.`);
  });
  $("mxDelete").addEventListener("click", () => {
    const c = customs().find(x => x.key === editing); if (!c) return;
    setCustoms(customs().filter(x => x.key !== editing)); state.on.delete(c.key);
    if (!state.on.size) state.on.add("warm");
    closeMixer(); renderWells(); savePrefs(); refresh(); setStatus(`${c.name} removed from the palette.`);
  });
  ["mxName","mxSpec"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Escape") closeMixer(); }));

  $("article").addEventListener("input", () => { updateCount(); if (!$("article").value.trim()) $("fileChip").hidden = true; });
  $("go").addEventListener("click", paint);
  $("hole").addEventListener("click", paint);
  $("out").addEventListener("click", e => { const b = e.target.closest(".repaint"); if (b) repaint(Number(b.dataset.i)); });
  $("stop").addEventListener("click", () => ctl && ctl.abort());
  $("viewTeacher").addEventListener("click", () => setView(false));
  $("viewStudent").addEventListener("click", () => setView(true));
  $("copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(fullMarkdown(isStudent())); setStatus("Copied."); }
    catch(e) { const r=document.createRange(); r.selectNodeContents($("out")); const s=getSelection(); s.removeAllRanges(); s.addRange(r); setStatus("Selected. Copy it with your device's copy command."); }
  });
  $("openSlides").addEventListener("click", () => { if (currentClass) openEditor(currentClass); });
  $("toCourse").addEventListener("click", () => { if (currentClass) ctx.addToCourse(currentClass); });
  $("unavailGo").addEventListener("click", () => ctx.go("profile"));

  $("fileBtn").addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", e => handleFile(e.target.files[0]));
  $("fileClear").addEventListener("click", () => { $("article").value = ""; $("fileChip").hidden = true; updateCount(); setStatus(""); $("article").focus(); });
  ["dragenter","dragover"].forEach(t => $("formCard").addEventListener(t, e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); $("drop").classList.add("over"); } }));
  ["dragleave","dragend"].forEach(t => $("formCard").addEventListener(t, e => { if (!e.relatedTarget || !$("formCard").contains(e.relatedTarget)) $("drop").classList.remove("over"); }));
  $("formCard").addEventListener("drop", e => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); $("drop").classList.remove("over"); handleFile(e.dataTransfer.files[0]); });

  $("ytUrl").addEventListener("input", () => {
    const v = $("ytUrl").value.trim(), msg = $("ytMsg"); msg.classList.remove("ok","bad");
    if (!v) msg.textContent = "Only YouTube links work here.";
    else if (ytId(v)) { msg.textContent = "YouTube video found."; msg.classList.add("ok"); }
    else { msg.textContent = "That isn't a YouTube video link. Use a youtube.com or youtu.be link."; msg.classList.add("bad"); }
  });
  $("transcript").addEventListener("input", () => { const n = wordsOf(cleanTranscript($("transcript").value)); $("trCount").textContent = n ? `${n.toLocaleString("en")} words.` : ""; });

  // Studio download menu
  const closeSaveMenu = () => { $("saveMenu").hidden = true; $("save").setAttribute("aria-expanded","false"); };
  $("save").addEventListener("click", e => { e.stopPropagation(); const open = $("saveMenu").hidden; $("saveMenu").hidden = !open; $("save").setAttribute("aria-expanded", String(open)); if (open) $("dlWord").focus(); });
  document.addEventListener("click", e => { if (!$("saveMenu").hidden && !$("saveWrap").contains(e.target)) closeSaveMenu(); });
  $("saveMenu").addEventListener("keydown", e => { if (e.key === "Escape") { closeSaveMenu(); $("save").focus(); } });
  ["dlWord","dlPdf"].forEach(id => $(id).addEventListener("click", async () => {
    closeSaveMenu(); await saveDoc(id === "dlPdf" ? "pdf" : "docx", fullMarkdown(false), isStudent(), lessonTitle(), (t, err) => setStatus(t, err));
  }));

  // Library
  $("newFolder").addEventListener("click", async () => {
    let n = 1, name = "New folder"; while (folders.some(f => f.name === name)) name = `New folder ${++n}`;
    try { const f = await store.addFolder(name); libFilter = f.id; await renderLibrary();
      const row = [...$("folderList").querySelectorAll(".fold-row")].find(r => r.querySelector(".fname").textContent === name);
      if (row) startRename(f, row);
    } catch(e) { toast(friendly(e), true); }
  });
  $("libSearch").addEventListener("input", () => { libSearch = $("libSearch").value; renderLibrary(); });

  // Editor
  $("edBack").addEventListener("click", () => ctx.go("lib"));
  $("edTitle").addEventListener("input", () => { ed.cls.title = $("edTitle").value; ed.cls.deck.edited = true; renderThumbs(); renderStage(0); scheduleSave(); });
  $("prevSlide").addEventListener("click", () => go(ed.idx - 1));
  $("nextSlide").addEventListener("click", () => go(ed.idx + 1));
  $("tabSlide").addEventListener("click", () => setTab("slide"));
  $("tabDesign").addEventListener("click", () => setTab("design"));
  [["insLabel","label"],["insTitle","title"],["insBody","body"],["insNotes","notes"]].forEach(([id,key]) =>
    $(id).addEventListener("input", () => { curSlide()[key] = $(id).value; if (key === "notes") { ed.cls.deck.edited = true; scheduleSave(); } else changed(); }));
  $("insAnswers").addEventListener("change", () => {
    const s = curSlide(); s.answers = $("insAnswers").checked;
    if (s.answers && !/answer/i.test(s.label || "")) s.label = "Answer key, teacher only";
    $("insLabel").value = s.label; changed();
  });
  $("insOwnAccent").addEventListener("change", () => { const s = curSlide(); s.accent = $("insOwnAccent").checked ? $("insAccent").value : null; $("insAccent").disabled = !s.accent; changed(); });
  $("insAccent").addEventListener("input", () => { const s = curSlide(); if (s.accent !== null) { s.accent = $("insAccent").value; changed(); } });
  $("insAdd").addEventListener("click", addSlide);
  $("insDup").addEventListener("click", () => {
    const copy = JSON.parse(JSON.stringify(curSlide())); copy.id = sid(); if (copy.kind === "title") copy.kind = "content";
    ed.cls.deck.slides.splice(ed.idx + 1, 0, copy); ed.idx++; structureChanged();
  });
  $("insUp").addEventListener("click", () => move(-1));
  $("insDown").addEventListener("click", () => move(1));
  $("insDel").addEventListener("click", () => {
    const b = $("insDel"), sl = ed.cls.deck.slides;
    if (sl.length === 1) { $("askMsg").textContent = "A class needs at least one slide."; return; }
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Confirm delete"; return; }
    sl.splice(ed.idx, 1); ed.idx = Math.min(ed.idx, sl.length - 1); structureChanged();
  });
  $("askGo").addEventListener("click", async () => {
    const s = curSlide(), req = $("insAsk").value.trim(), msg = $("askMsg");
    msg.classList.remove("err");
    if (!req) { $("insAsk").focus(); msg.textContent = "Say what to change, for example: simpler words for B1."; return; }
    const btn = $("askGo"); btn.disabled = true; btn.textContent = "Rewriting…"; msg.textContent = "";
    const before = { id:s.id, title:s.title, body:s.body };
    try {
      const out = await sample.json(`You are helping an English teacher edit one presentation slide for a 1:1 lesson.
Lesson: ${ed.cls.title}. Level: ${ed.cls.level} (CEFR). Student: ${ed.cls.student || "adult professional"}.

Current slide title: ${s.title}
Current slide text:
"""
${s.body}
"""

Teacher's request: ${req}

Reply with only a JSON object: {"title": string, "body": string}.
In "body", put each point on its own line. Start bullet lines with "- " and numbered lines with "1. ", "2. " and so on. Use **bold** sparingly. Keep it short enough for one slide: at most 7 lines.`);
      if (!out || typeof out.body !== "string") throw { code:"invalid_json" };
      s.title = String(out.title || s.title).slice(0,160); s.body = String(out.body).slice(0,2000);
      undoAsk = before; changed(); renderInspector(); $("askMsg").textContent = "Slide rewritten.";
    } catch(e) { msg.classList.add("err"); msg.textContent = ERR[e && e.code] || ERR.upstream_error; }
    finally { btn.disabled = false; btn.textContent = "Rewrite"; }
  });
  $("insAsk").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("askGo").click(); } });
  $("askUndo").addEventListener("click", () => {
    const s = ed.cls.deck.slides.find(x => undoAsk && x.id === undoAsk.id); if (!s) return;
    s.title = undoAsk.title; s.body = undoAsk.body; undoAsk = null; changed(); renderInspector(); $("askMsg").textContent = "Previous version restored.";
  });
  [["dPrimary","primary"],["dAccent","accent"],["dBg","bg"],["dText","text"]].forEach(([id,key]) =>
    $(id).addEventListener("input", () => { const d = ed.cls.deck; d.colors = { ...d.colors, [key]:$(id).value }; d.theme = "custom";
      d.edited = true; [...$("themes").children].forEach(b => b.setAttribute("aria-pressed","false")); redrawSoon(); scheduleSave(); }));
  $("dFooter").addEventListener("change", () => { ed.cls.deck.footer = $("dFooter").checked; designChanged(); });
  $("edRebuild").addEventListener("click", () => {
    const b = $("edRebuild");
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Rebuild and lose slide edits?"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Rebuild from lesson"; }, 4000); return; }
    delete b.dataset.armed; b.textContent = "Rebuild from lesson";
    ed.cls.deck = buildDeck(ed.cls, ed.cls.deck); ed.idx = 0; renderThumbs(); renderStage(0); renderInspector(); renderDesign(); scheduleSave();
  });
  $("edToCourse").addEventListener("click", () => ctx.addToCourse(ed.cls));

  document.addEventListener("keydown", e => {
    if (!$("present").hidden) {
      if (["ArrowRight","PageDown"," ","Enter"].includes(e.key)) { e.preventDefault(); prGo(1); }
      else if (["ArrowLeft","PageUp"].includes(e.key)) { e.preventDefault(); prGo(-1); }
      else if (e.key === "Home") { e.preventDefault(); prJump(0); }
      else if (e.key === "End") { e.preventDefault(); prJump(ed.cls.deck.slides.length - 1); }
      else if (e.key === "Escape") { e.preventDefault(); closePresent(); }
      else if (e.key === "n" || e.key === "N") $("prNotes").hidden = !$("prNotes").hidden;
      return;
    }
    if ($("vEditor").hidden) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input","textarea","select"].includes(tag) || e.target.isContentEditable) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(ed.idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(ed.idx - 1); }
  });
  $("edPresent").addEventListener("click", openPresent);
  $("prPrev").addEventListener("click", () => prGo(-1));
  $("prNext").addEventListener("click", () => prGo(1));
  $("prExit").addEventListener("click", closePresent);
  $("prNotesBtn").addEventListener("click", () => { $("prNotes").hidden = !$("prNotes").hidden; });
  $("prStage").addEventListener("pointerdown", e => { pr.x = e.clientX; });
  $("prStage").addEventListener("pointerup", e => {
    if (pr.x === null) return; const dx = e.clientX - pr.x; pr.x = null;
    if (Math.abs(dx) > 40) prGo(dx < 0 ? 1 : -1); else prGo(e.clientX > window.innerWidth / 2 ? 1 : -1);
  });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && !$("present").hidden) $("prNext").focus(); });

  $("edExport").addEventListener("click", () => { const p = $("exportPanel"); p.hidden = !p.hidden; $("edExport").setAttribute("aria-expanded", String(!p.hidden)); exMsg(""); });
  $("exClose").addEventListener("click", () => { $("exportPanel").hidden = true; $("edExport").setAttribute("aria-expanded","false"); $("edExport").focus(); });
  $("exGo").addEventListener("click", async () => {
    const btn = $("exGo"); btn.disabled = true; btn.textContent = "Building slides…"; exMsg("");
    try { await savePptx(ed.cls, { answers:$("exAnswers").checked, notes:$("exNotes").checked }); exMsg("Downloaded. In Canva, choose Create a design, then Import file, and pick this .pptx."); }
    catch(e) { exMsg(e && e.message === "load" ? "The slide builder couldn't load. Check your connection and try again." : "Something went wrong building the file. Try again.", true); }
    finally { btn.disabled = false; btn.textContent = "Download .pptx"; }
  });
  ["exWord","exPdf"].forEach(id => $(id).addEventListener("click", async () => {
    const b = $(id); b.disabled = true;
    try { await saveDoc(id === "exPdf" ? "pdf" : "docx", ed.cls.md || "", $("exStudent").checked, ed.cls.title, exMsg); }
    finally { b.disabled = false; }
  }));
}
export const studioKeyChanged = () => showKeyNudge();
