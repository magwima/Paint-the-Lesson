// Courses: curriculum, lessons, quizzes, students, progress, marking, discussion, settings and the calendar.
import { $, esc, toast, fmtDate, fmtTime, slugify, armed, dialog, plain, studentMd, LEVELS, saveBlob, icsFor, inline, parse } from "./core.js";
import { sb, friendly, uploadFile, site } from "./supa.js";
import { sample, ERR, hasAI } from "./ai.js";
import { md, renderBlocks } from "./blocks.js";
import { classStore } from "./studio.js";

let ctx = null; // { uid, profile(), go(view, arg) }
export function initCourses(c){ ctx = c; }

const COLORS = ["#A9CFEA","#E89AA6","#F2B33D","#B9D8B0","#C9B6E4","#8CCFC4","#F08A6B","#D9A066"];
const uuid = () => crypto.randomUUID();
const q = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const joinLink = code => site("learn.html") + "?join=" + encodeURIComponent(code);
const courseLink = c => site("course.html") + "?c=" + encodeURIComponent(c.slug || c.id);
async function must(p){ const r = await p; if (r.error) throw r.error; return r.data; }
function copy(text, label){ navigator.clipboard.writeText(text).then(() => toast((label || "Link") + " copied."), () => toast("Couldn't copy. Select it and copy it yourself.", true)); }
function aiFail(e){ toast(ERR[e && e.code] || friendly(e), true); if (e && (e.code === "no_key" || e.code === "bad_key")) ctx.go("profile"); }
function cover(c){
  return c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" loading="lazy">`
    : `<div class="cover-paint" style="--paint:${esc(c.color || "#A9CFEA")}"><span>${esc((c.title || "?").trim().charAt(0).toUpperCase())}</span></div>`;
}

/* ============================== Course list ============================== */
export async function renderCourses(){
  const v = $("vCourses");
  v.innerHTML = `<header class="page-head"><div><h1>Courses.</h1><p>Group lessons into courses, invite students with a class code, and follow their progress.</p></div>
    <div class="head-acts"><button class="mx-ghost" id="cPlan">Plan a course with AI</button><button class="mx-save" id="cNew">New course</button></div></header>
    <div class="kpis" id="cKpis"></div><div class="course-grid" id="cGrid"><p class="lib-empty">Loading…</p></div>`;
  q("#cNew", v).addEventListener("click", newCourseDialog);
  q("#cPlan", v).addEventListener("click", () => planDialog());
  let courses;
  try { courses = await must(sb.from("courses").select("*").eq("owner", ctx.uid).order("created_at", { ascending:false })); }
  catch(e) { q("#cGrid", v).innerHTML = `<p class="lib-empty">${esc(friendly(e))}</p>`; return; }
  const ids = courses.map(c => c.id);
  let lessons = [], enr = [], subs = [], sess = [];
  if (ids.length) {
    [lessons, enr, subs] = await Promise.all([
      must(sb.from("lessons").select("id,course_id").in("course_id", ids)),
      must(sb.from("enrolments").select("course_id,student_id").in("course_id", ids)),
      must(sb.from("submissions").select("id,course_id").in("course_id", ids).eq("kind","homework").is("graded_at", null))
    ]).catch(() => [[],[],[]]);
  }
  try { sess = await must(sb.from("sessions").select("*").eq("owner", ctx.uid).gte("starts_at", new Date().toISOString()).order("starts_at").limit(3)); } catch(e) {}
  const students = new Set(enr.map(e => e.student_id)).size;
  q("#cKpis", v).innerHTML = `
    <div class="kpi paper"><b>${courses.length}</b><span>${courses.length === 1 ? "course" : "courses"}</span></div>
    <div class="kpi paper"><b>${students}</b><span>${students === 1 ? "student" : "students"}</span></div>
    <div class="kpi paper ${subs.length ? "hot" : ""}"><b>${subs.length}</b><span>homework to mark</span></div>
    <div class="kpi paper wide"><span class="kpi-l">Next live lesson</span>${sess.length ? `<b class="small">${esc(sess[0].title)}</b><span>${fmtDate(sess[0].starts_at, { weekday:"short", day:"numeric", month:"short" })}, ${fmtTime(sess[0].starts_at)}</span>` : `<span>Nothing booked. <a href="#calendar">Open the calendar</a></span>`}</div>`;
  const g = q("#cGrid", v);
  if (!courses.length) {
    g.innerHTML = `<div class="lib-empty"><p>No courses yet. A course holds your lessons in order, with quizzes, homework and a certificate at the end. Students join with a class code.</p></div>`;
    return;
  }
  g.innerHTML = courses.map(c => {
    const nl = lessons.filter(l => l.course_id === c.id).length, ns = enr.filter(e => e.course_id === c.id).length, nh = subs.filter(s => s.course_id === c.id).length;
    return `<a class="paper course-card" href="#course/${c.id}">
      <div class="cc-cover">${cover(c)}<span class="badge-s ${c.published ? "on" : ""}">${c.published ? "Published" : "Draft"}</span></div>
      <div class="cc-info"><h2>${esc(c.title)}</h2>${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ""}
      <p class="meta">${c.level ? esc(c.level) + " · " : ""}${nl} ${nl === 1 ? "lesson" : "lessons"} · ${ns} ${ns === 1 ? "student" : "students"}${nh ? ` · <b class="hot-t">${nh} to mark</b>` : ""}</p></div></a>`;
  }).join("");
}

function newCourseDialog(){
  const d = dialog(`<h2>New course</h2>
    <div class="field"><label for="ncTitle">Course title</label><input id="ncTitle" type="text" maxlength="120" placeholder="e.g. Business English for meetings"></div>
    <div class="field"><label for="ncLevel">Level</label><select id="ncLevel"><option value="">Any level</option>${LEVELS.map(l => `<option>${l}</option>`).join("")}<option value="A1">A1</option></select></div>
    <p class="mx-err" id="ncMsg" role="alert"></p>
    <div class="mx-actions"><button class="mx-save" id="ncGo">Create course</button><button class="mx-ghost" data-close>Cancel</button></div>`, { onOpen: d => q("#ncTitle", d).focus() });
  q("#ncGo", d).addEventListener("click", async () => {
    const title = q("#ncTitle", d).value.trim();
    if (!title) { q("#ncMsg", d).textContent = "Give the course a title."; return; }
    try {
      const c = await createCourse({ title, level:q("#ncLevel", d).value });
      d.close(); location.hash = "#course/" + c.id;
    } catch(e) { q("#ncMsg", d).textContent = friendly(e); }
  });
}
async function createCourse(fields){
  const base = slugify(fields.title) || "course";
  const row = { owner:ctx.uid, color:COLORS[Math.floor(Math.random()*COLORS.length)], ...fields, slug: base + "-" + Math.random().toString(36).slice(2,6) };
  const c = await must(sb.from("courses").insert(row).select().single());
  await must(sb.from("modules").insert({ course_id:c.id, title:"Module 1", position:0 }));
  return c;
}

/* ---- Plan a course with AI ---- */
function planDialog(course){
  const d = dialog(`<h2>${course ? "Add lessons with AI" : "Plan a course with AI"}</h2>
    <p class="dlg-lead">Describe the course. The AI drafts modules and lessons; you can edit everything afterwards.</p>
    <div class="field"><label for="plTopic">What should students be able to do at the end?</label><textarea id="plTopic" rows="3" placeholder="e.g. Run meetings and small talk confidently in English at work">${course ? esc(course.description || course.title) : ""}</textarea></div>
    <div class="pf-two">
      <div class="field"><label for="plLevel">Level</label><select id="plLevel">${LEVELS.map(l => `<option ${course && course.level === l ? "selected" : l === "B1" ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="plStudents">Students</label><input id="plStudents" type="text" placeholder="e.g. adult professionals in IT"></div>
    </div>
    <div class="pf-two">
      <div class="field"><label for="plMods">Modules</label><input id="plMods" type="number" min="1" max="8" value="${course ? 1 : 3}"></div>
      <div class="field"><label for="plLess">Lessons per module</label><input id="plLess" type="number" min="1" max="8" value="4"></div>
    </div>
    <label class="check"><input type="checkbox" id="plQuiz" checked> Write lesson content and a short quiz for every lesson (takes longer)</label>
    <p class="mx-err" id="plMsg" role="status" aria-live="polite"></p>
    <div class="mx-actions"><button class="mx-save" id="plGo">${course ? "Add lessons" : "Plan the course"}</button><button class="mx-ghost" data-close>Cancel</button></div>`, { onOpen: d => q("#plTopic", d).focus() });
  q("#plGo", d).addEventListener("click", async () => {
    const topic = q("#plTopic", d).value.trim(), msg = q("#plMsg", d), btn = q("#plGo", d);
    if (topic.length < 8) { msg.textContent = "Describe the course in a sentence or two."; return; }
    if (!hasAI()) { aiFail({ code:"no_key" }); d.close(); return; }
    const level = q("#plLevel", d).value, who = q("#plStudents", d).value.trim() || "adult learners";
    const nm = Math.max(1, Math.min(8, +q("#plMods", d).value || 3)), nl = Math.max(1, Math.min(8, +q("#plLess", d).value || 4));
    const full = q("#plQuiz", d).checked;
    btn.disabled = true; msg.textContent = "Planning the course…";
    try {
      const plan = await sample.json(`You are an expert English teacher and course designer. Design an English course.
Goal: ${topic}
Level: ${level} (CEFR). Students: ${who}.
Make exactly ${nm} module(s), each with exactly ${nl} lesson(s), in a sensible order that builds skills step by step.
Return a JSON object: {"title": string, "subtitle": string (one line), "description": string (2–3 sentences for the course page), "modules": [{"title": string, "lessons": [{"title": string, "summary": string (one sentence: what the student learns)}]}]}`);
      if (!plan || !Array.isArray(plan.modules)) throw { code:"invalid_json" };
      let c = course;
      if (!c) c = await createCourse({ title:String(plan.title || topic).slice(0,120), subtitle:String(plan.subtitle || "").slice(0,200), description:String(plan.description || ""), level });
      let mods = await must(sb.from("modules").select("*").eq("course_id", c.id).order("position"));
      const existingLessons = await must(sb.from("lessons").select("id").eq("course_id", c.id));
      let mpos = mods.length;
      // Reuse the empty first module of a new course
      const reuse = !course && mods.length === 1 && !existingLessons.length ? mods[0] : null;
      let made = 0; const total = plan.modules.reduce((a, m) => a + (m.lessons || []).length, 0);
      for (let i = 0; i < plan.modules.length; i++) {
        const pm = plan.modules[i];
        let mod;
        if (i === 0 && reuse) { mod = reuse; await must(sb.from("modules").update({ title:String(pm.title || "Module 1").slice(0,120) }).eq("id", mod.id)); }
        else mod = await must(sb.from("modules").insert({ course_id:c.id, title:String(pm.title || `Module ${mpos + 1}`).slice(0,120), position:mpos++ }).select().single());
        let lpos = 0;
        for (const pl of (pm.lessons || [])) {
          made++; msg.textContent = full ? `Writing lesson ${made} of ${total}: ${pl.title}…` : `Adding lesson ${made} of ${total}…`;
          const lesson = { id:uuid(), course_id:c.id, module_id:mod.id, title:String(pl.title || "Lesson").slice(0,160), summary:String(pl.summary || ""), position:lpos++,
            blocks: pl.summary ? [{ type:"text", md:String(pl.summary) }] : [] };
          let key = null;
          if (full) {
            try {
              const w = await writeLessonAI(lesson, c, level, who);
              lesson.blocks = [{ type:"text", md:w.content }];
              if (w.quiz.length) { lesson.quiz = { questions:w.quiz.map(({ correct, accepted, ...rest }) => rest) }; key = keyOf(w.quiz); }
              if (w.homework) lesson.homework = w.homework;
            } catch(e) { if (e && (e.code === "bad_key" || e.code === "no_key" || e.code === "rate_limited")) throw e; }
          }
          await must(sb.from("lessons").insert(lesson));
          if (key) await must(sb.from("quiz_keys").upsert({ lesson_id:lesson.id, answers:key }));
        }
      }
      d.close(); toast("Course planned. Check and edit each lesson."); location.hash = "#course/" + c.id; if (course) renderCourse(c.id, "curriculum");
    } catch(e) { btn.disabled = false; msg.textContent = ERR[e && e.code] || friendly(e); }
  });
}
// Write one lesson's content, a 5-question quiz and homework
async function writeLessonAI(lesson, course, level, who){
  const out = await sample.json(`You are an expert English teacher writing one self-study lesson for an online course.
Course: ${course.title}. Level: ${level || course.level || "B1"} (CEFR). Students: ${who || "adult learners"}.
Lesson: ${lesson.title}. ${lesson.summary || ""}
Write:
1. "content": the lesson in Markdown (use ## headings, short paragraphs, bullet lists, **bold** key language, example sentences). About 350–600 words. Include a short explanation, examples, a small practice task, and a speaking or writing prompt. Language must match the level. No tables, no emojis.
2. "quiz": 5 questions that check the lesson. Each: {"q": string, "type": "choice" | "multi" | "truefalse" | "short", "options": [strings] (for choice/multi; 3 or 4 options; for truefalse use ["True","False"]), "correct": [indexes of the right options, from 0] (for choice, multi, truefalse), "accepted": [acceptable short answers] (for short only)}.
3. "homework": one short writing or speaking task the student sends to the teacher.
Return a JSON object: {"content": string, "quiz": [...], "homework": string}`);
  if (!out || typeof out.content !== "string") throw { code:"invalid_json" };
  return { content:out.content, quiz:normQuiz(out.quiz), homework:String(out.homework || "").trim() };
}
function normQuiz(list){
  return (Array.isArray(list) ? list : []).map(x => {
    let type = ["choice","multi","truefalse","short"].includes(x && x.type) ? x.type : "choice";
    let options = Array.isArray(x.options) ? x.options.map(String).slice(0,6) : [];
    if (type === "truefalse") options = ["True","False"];
    let correct = Array.isArray(x.correct) ? x.correct.map(Number).filter(n => n >= 0 && n < options.length) : (Number.isInteger(x.correct) ? [x.correct] : []);
    const accepted = Array.isArray(x.accepted) ? x.accepted.map(String).filter(Boolean) : (x.answer ? [String(x.answer)] : []);
    if (type !== "short" && !correct.length) correct = [0];
    if (type === "choice" || type === "truefalse") correct = correct.slice(0,1);
    return { id:"q" + Math.random().toString(36).slice(2,8), type, q:String(x.q || x.question || "").slice(0,500), options: type === "short" ? [] : options, correct, accepted };
  }).filter(x => x.q && (x.type === "short" ? x.accepted.length : x.options.length >= 2));
}
const keyOf = quiz => Object.fromEntries(quiz.map(x => [x.id, x.type === "short" ? x.accepted : x.correct]));

/* ============================== One course ============================== */
const TABS = [["curriculum","Curriculum"],["students","Students"],["progress","Progress"],["marking","Marking"],["discussion","Discussion"],["settings","Settings"]];
export async function renderCourse(id, tab = "curriculum"){
  const v = $("vCourse");
  v.innerHTML = `<p class="lib-empty">Loading…</p>`;
  let c;
  try { c = await must(sb.from("courses").select("*").eq("id", id).single()); }
  catch(e) { v.innerHTML = `<p class="lib-empty">${esc(friendly(e))} <a href="#courses">Back to courses</a></p>`; return; }
  if (!TABS.some(t => t[0] === tab)) tab = "curriculum";
  v.innerHTML = `
    <div class="crumbs"><a href="#courses">Courses</a> <span aria-hidden="true">/</span> <span>${esc(c.title)}</span></div>
    <header class="page-head course-head">
      <div class="ch-cover">${cover(c)}</div>
      <div class="ch-main"><h1>${esc(c.title)}</h1>
        <p><span class="badge-s ${c.published ? "on" : ""}">${c.published ? "Published" : "Draft"}</span> ${c.level ? `<span class="badge-s">${esc(c.level)}</span>` : ""}
        <span class="code-chip" title="Students type this code to join">Class code <b>${esc(c.join_code)}</b></span></p></div>
      <div class="head-acts">
        <button class="mx-ghost" id="chInvite">Invite students</button>
        <a class="mx-ghost" href="learn.html?course=${c.id}&preview=1" target="_blank" rel="noopener">Preview as student</a>
        ${c.published ? `<a class="mx-ghost" href="${esc(courseLink(c))}" target="_blank" rel="noopener">Course page</a>` : ""}
        <button class="mx-save" id="chPub">${c.published ? "Unpublish" : "Publish"}</button>
      </div>
    </header>
    <nav class="tabs ctabs" role="tablist">${TABS.map(([k,l]) => `<a class="tool" role="tab" href="#course/${c.id}/${k}" aria-pressed="${k===tab}" aria-selected="${k===tab}">${l}</a>`).join("")}</nav>
    <div id="cBody"></div>`;
  q("#chInvite", v).addEventListener("click", () => inviteDialog(c));
  q("#chPub", v).addEventListener("click", async () => {
    try { await must(sb.from("courses").update({ published:!c.published, updated_at:new Date().toISOString() }).eq("id", c.id));
      toast(c.published ? "Course unpublished. Enrolled students keep access." : "Course published."); renderCourse(c.id, tab); }
    catch(e) { toast(friendly(e), true); }
  });
  const body = q("#cBody", v);
  const fn = { curriculum:tabCurriculum, students:tabStudents, progress:tabProgress, marking:tabMarking, discussion:tabDiscussion, settings:tabSettings }[tab];
  try { await fn(c, body); } catch(e) { body.innerHTML = `<p class="lib-empty">${esc(friendly(e))}</p>`; }
}

function inviteDialog(c){
  const link = joinLink(c.join_code);
  const d = dialog(`<h2>Invite students</h2>
    <p class="dlg-lead">Send students this link. They create a free account and join straight away. Or they can type the class code at the student page.</p>
    <div class="invite-code">${esc(c.join_code)}</div>
    <div class="ask"><input type="text" readonly value="${esc(link)}" aria-label="Invite link"><button class="mx-save" id="ivCopy">Copy link</button></div>
    <p class="hint-line">Students sign in at <b>${esc(site("learn.html"))}</b>. ${c.published && c.open_enrolment ? "Anyone can also join from your public course page." : ""}</p>
    <div class="mx-actions"><a class="mx-ghost" href="mailto:?subject=${encodeURIComponent("Join my course: " + c.title)}&body=${encodeURIComponent(`Hi,\n\nJoin my course "${c.title}" on Paint the Lesson:\n${link}\n\nClass code: ${c.join_code}\n`)}">Write an email</a><span class="sep"></span><button class="mx-ghost" data-close>Close</button></div>`);
  q("#ivCopy", d).addEventListener("click", () => copy(link, "Invite link"));
}

/* ---------- Curriculum ---------- */
async function tabCurriculum(c, body){
  const [mods, lessons] = await Promise.all([
    must(sb.from("modules").select("*").eq("course_id", c.id).order("position")),
    must(sb.from("lessons").select("id,module_id,title,summary,position,quiz,homework,release_days,release_at,is_preview,published,blocks").eq("course_id", c.id).order("position"))
  ]);
  const loose = lessons.filter(l => !l.module_id || !mods.some(m => m.id === l.module_id));
  const groups = [...(loose.length ? [{ id:null, title:"Lessons without a module", position:-1 }] : []), ...mods];
  const badge = l => [
    !l.published ? `<span class="badge-s warn">Draft</span>` : "",
    l.is_preview ? `<span class="badge-s">Free preview</span>` : "",
    l.quiz && l.quiz.questions && l.quiz.questions.length ? `<span class="badge-s">Quiz · ${l.quiz.questions.length}</span>` : "",
    l.homework ? `<span class="badge-s">Homework</span>` : "",
    l.release_days ? `<span class="badge-s">Opens day ${l.release_days}</span>` : l.release_at ? `<span class="badge-s">Opens ${fmtDate(l.release_at)}</span>` : ""
  ].join(" ");
  body.innerHTML = `
    <div class="cur-tools"><button class="mx-save" id="cuAddMod">Add module</button><button class="mx-ghost" id="cuAddClass">Add a painted class</button><button class="mx-ghost" id="cuAI">Add lessons with AI</button>
      <span class="sep"></span><span class="hint-line">${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}</span></div>
    ${groups.map((m, mi) => {
      const ls = (m.id ? lessons.filter(l => l.module_id === m.id) : loose).sort((a,b) => a.position - b.position);
      return `<section class="paper module" data-mod="${m.id || ""}">
        <div class="mod-head">
          ${m.id ? `<input class="mod-title" value="${esc(m.title)}" aria-label="Module title" maxlength="120">` : `<h3>${esc(m.title)}</h3>`}
          ${m.id ? `<span class="mod-acts"><button class="mx-ghost sm" data-mup="${m.id}" ${mi === (loose.length ? 1 : 0) ? "disabled" : ""}>Up</button><button class="mx-ghost sm" data-mdown="${m.id}" ${mi === groups.length - 1 ? "disabled" : ""}>Down</button><button class="mx-ghost sm danger" data-mdel="${m.id}">Delete</button></span>` : ""}
        </div>
        <ol class="les-list">${ls.map((l, li) => `<li class="les" data-les="${l.id}">
          <span class="les-n">${li + 1}</span>
          <a class="les-t" href="#lesson/${l.id}">${esc(l.title)}</a>
          <span class="les-b">${badge(l)}</span>
          <span class="les-acts"><button class="mx-ghost sm" data-lup="${l.id}" ${li === 0 ? "disabled" : ""} aria-label="Move ${esc(l.title)} up">Up</button><button class="mx-ghost sm" data-ldown="${l.id}" ${li === ls.length - 1 ? "disabled" : ""} aria-label="Move ${esc(l.title)} down">Down</button>
          ${mods.length > 1 || !m.id ? `<select class="les-move" data-lmove="${l.id}" aria-label="Module for ${esc(l.title)}">${mods.map(x => `<option value="${x.id}" ${x.id === l.module_id ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select>` : ""}</span>
        </li>`).join("") || `<li class="les empty">No lessons yet.</li>`}</ol>
        ${m.id ? `<button class="mx-ghost add-les" data-addles="${m.id}">Add lesson</button>` : ""}
      </section>`;
    }).join("")}
    ${!groups.length ? `<p class="lib-empty">Add a module to start.</p>` : ""}`;

  q("#cuAddMod", body).addEventListener("click", async () => {
    try { await must(sb.from("modules").insert({ course_id:c.id, title:`Module ${mods.length + 1}`, position:(mods.at(-1)?.position ?? -1) + 1 })); renderCourse(c.id, "curriculum"); }
    catch(e) { toast(friendly(e), true); }
  });
  q("#cuAI", body).addEventListener("click", () => planDialog(c));
  q("#cuAddClass", body).addEventListener("click", () => addToCourse(null, c.id));
  qa(".mod-title", body).forEach(inp => inp.addEventListener("change", async () => {
    const id = inp.closest("[data-mod]").dataset.mod;
    try { await must(sb.from("modules").update({ title:inp.value.trim() || "Module" }).eq("id", id)); toast("Module renamed."); } catch(e) { toast(friendly(e), true); }
  }));
  qa("[data-addles]", body).forEach(b => b.addEventListener("click", async () => {
    const mid = b.dataset.addles, pos = lessons.filter(l => l.module_id === mid).length;
    try { const l = await must(sb.from("lessons").insert({ course_id:c.id, module_id:mid, title:"New lesson", position:pos }).select().single()); location.hash = "#lesson/" + l.id; }
    catch(e) { toast(friendly(e), true); }
  }));
  const swap = async (table, a, b) => { await Promise.all([must(sb.from(table).update({ position:b.position }).eq("id", a.id)), must(sb.from(table).update({ position:a.position }).eq("id", b.id))]); };
  const renumber = async (table, list) => { await Promise.all(list.map((x, i) => x.position === i ? null : must(sb.from(table).update({ position:i }).eq("id", x.id)))); list.forEach((x, i) => x.position = i); };
  qa("[data-mup],[data-mdown]", body).forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.mup || b.dataset.mdown, i = mods.findIndex(m => m.id === id), j = b.dataset.mup ? i - 1 : i + 1;
    if (j < 0 || j >= mods.length) return;
    try { await renumber("modules", mods); await swap("modules", mods[i], mods[j]); renderCourse(c.id, "curriculum"); } catch(e) { toast(friendly(e), true); }
  }));
  qa("[data-lup],[data-ldown]", body).forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.lup || b.dataset.ldown, l = lessons.find(x => x.id === id);
    const sib = lessons.filter(x => x.module_id === l.module_id).sort((a,b) => a.position - b.position);
    const i = sib.indexOf(l), j = b.dataset.lup ? i - 1 : i + 1; if (j < 0 || j >= sib.length) return;
    try { await renumber("lessons", sib); await swap("lessons", sib[i], sib[j]); renderCourse(c.id, "curriculum"); } catch(e) { toast(friendly(e), true); }
  }));
  qa("[data-lmove]", body).forEach(s => s.addEventListener("change", async () => {
    const pos = lessons.filter(l => l.module_id === s.value).length;
    try { await must(sb.from("lessons").update({ module_id:s.value, position:pos }).eq("id", s.dataset.lmove)); renderCourse(c.id, "curriculum"); } catch(e) { toast(friendly(e), true); }
  }));
  qa("[data-mdel]", body).forEach(b => armed(b, "Delete module and its lessons?", async () => {
    try { await must(sb.from("modules").delete().eq("id", b.dataset.mdel)); renderCourse(c.id, "curriculum"); } catch(e) { toast(friendly(e), true); }
  }));
}

/* ---------- Add a painted class to a course ---------- */
export async function addToCourse(cls, courseId){
  let courses = [], classes = [];
  try {
    courses = await must(sb.from("courses").select("id,title").eq("owner", ctx.uid).order("created_at", { ascending:false }));
    if (!cls) classes = await classStore.list();
  } catch(e) { toast(friendly(e), true); return; }
  if (!cls && !classes.length) { toast("Paint a lesson in the Studio first."); return; }
  const d = dialog(`<h2>Add a painted class to a course</h2>
    <p class="dlg-lead">Students see the worksheet version: no answer keys and no teacher notes. You can also make an auto-marked quiz from it.</p>
    ${cls ? `<p><b>${esc(cls.title)}</b></p>` : `<div class="field"><label for="atClass">Class</label><select id="atClass">${classes.map(x => `<option value="${x.id}">${esc(x.title)} (${esc(x.level)})</option>`).join("")}</select></div>`}
    <div class="field"><label for="atCourse">Course</label><select id="atCourse">${courses.map(x => `<option value="${x.id}" ${x.id === courseId ? "selected" : ""}>${esc(x.title)}</option>`).join("")}<option value="_new">New course…</option></select></div>
    <div class="field" id="atNewF" ${courses.length ? "hidden" : ""}><label for="atNew">New course title</label><input id="atNew" type="text" maxlength="120"></div>
    <div class="field" id="atModF"><label for="atMod">Module</label><select id="atMod"></select></div>
    <label class="check"><input type="checkbox" id="atQuiz" ${hasAI() ? "checked" : ""}> Make a 6-question auto-marked quiz from it with AI</label>
    <p class="mx-err" id="atMsg" role="status" aria-live="polite"></p>
    <div class="mx-actions"><button class="mx-save" id="atGo">Add to course</button><button class="mx-ghost" data-close>Cancel</button></div>`);
  const sel = q("#atCourse", d), modSel = q("#atMod", d);
  if (!courses.length) sel.value = "_new";
  const loadMods = async () => {
    q("#atNewF", d).hidden = sel.value !== "_new"; q("#atModF", d).hidden = sel.value === "_new";
    if (sel.value === "_new") return;
    const mods = await must(sb.from("modules").select("id,title").eq("course_id", sel.value).order("position")).catch(() => []);
    modSel.innerHTML = mods.map(m => `<option value="${m.id}">${esc(m.title)}</option>`).join("") || `<option value="">No module</option>`;
    if (mods.length) modSel.value = mods.at(-1).id;
  };
  sel.addEventListener("change", loadMods); loadMods();
  q("#atGo", d).addEventListener("click", async () => {
    const msg = q("#atMsg", d), btn = q("#atGo", d);
    const theClass = cls || classes.find(x => x.id === q("#atClass", d).value);
    btn.disabled = true;
    try {
      let cid = sel.value, mid = modSel.value || null;
      if (cid === "_new") {
        const t = q("#atNew", d).value.trim(); if (!t) { msg.textContent = "Give the new course a title."; btn.disabled = false; return; }
        const nc = await createCourse({ title:t, level:theClass.level || "" }); cid = nc.id;
        mid = (await must(sb.from("modules").select("id").eq("course_id", cid).limit(1)))[0]?.id || null;
      }
      const pos = (await must(sb.from("lessons").select("id").eq("course_id", cid).eq("module_id", mid))).length;
      const smd = studentMd(theClass.md);
      const aim = parse(theClass.md).title.split("\n").filter(l => l.trim() && !/^#\s/.test(l)).map(plain).join(" ");
      const lesson = { id:uuid(), course_id:cid, module_id:mid, title:theClass.title.slice(0,160), summary:aim.slice(0,300), position:pos,
        blocks:[{ type:"painted", md:smd, class_id:theClass.id, title:theClass.title }] };
      let key = null;
      if (q("#atQuiz", d).checked && hasAI()) {
        msg.textContent = "Writing the quiz…";
        try {
          const out = await sample.json(quizPrompt(theClass.md, theClass.level, 6));
          const qz = normQuiz(out && (out.quiz || out.questions || out));
          if (qz.length) { lesson.quiz = { questions:qz.map(({ correct, accepted, ...rest }) => rest) }; key = keyOf(qz); }
        } catch(e) { toast("The class was added without a quiz: " + (ERR[e && e.code] || friendly(e)), true); }
      }
      await must(sb.from("lessons").insert(lesson));
      if (key) await must(sb.from("quiz_keys").upsert({ lesson_id:lesson.id, answers:key }));
      d.close(); toast("Added to the course."); location.hash = "#lesson/" + lesson.id;
    } catch(e) { msg.textContent = friendly(e); btn.disabled = false; }
  });
}
function quizPrompt(content, level, n){
  return `You are an English teacher. Write ${n} quiz questions that check a student's understanding of this lesson. Level: ${level || "B1"} (CEFR).
Mix types: "choice" (one right option), "multi" (two or more right options), "truefalse" and "short" (a one- or two-word answer).
Each question: {"q": string, "type": "choice" | "multi" | "truefalse" | "short", "options": [3 or 4 strings] (for choice/multi; for truefalse ["True","False"]), "correct": [indexes from 0] (not for short), "accepted": [acceptable answers, including common spellings] (short only)}.
Return a JSON object: {"quiz": [...]}

LESSON:
"""
${String(content).slice(0, 24000)}
"""`;
}

/* ============================== Lesson editor ============================== */
let led = null; // { lesson, course, quiz: [{id,type,q,options,correct,accepted}], dirty }
const BLOCK_TYPES = [["text","Text"],["video","Video"],["image","Image"],["file","File"],["link","Link"],["painted","Painted class"]];
export async function renderLessonEditor(id){
  const v = $("vLessonEd");
  v.innerHTML = `<p class="lib-empty">Loading…</p>`;
  let lesson, course, key, mods;
  try {
    lesson = await must(sb.from("lessons").select("*").eq("id", id).single());
    [course, key, mods] = await Promise.all([
      must(sb.from("courses").select("*").eq("id", lesson.course_id).single()),
      must(sb.from("quiz_keys").select("answers").eq("lesson_id", id).maybeSingle()),
      must(sb.from("modules").select("id,title").eq("course_id", lesson.course_id).order("position"))
    ]);
  } catch(e) { v.innerHTML = `<p class="lib-empty">${esc(friendly(e))} <a href="#courses">Back to courses</a></p>`; return; }
  const answers = key && key.answers || {};
  led = { lesson, course, mods, dirty:false,
    quiz:((lesson.quiz && lesson.quiz.questions) || []).map(x => ({ ...x, correct: x.type === "short" ? [] : (answers[x.id] || []).map(Number), accepted: x.type === "short" ? (answers[x.id] || []) : [] })) };
  drawLessonEditor();
}
function markDirty(){ if (!led) return; led.dirty = true; const s = $("leSaved"); if (s) s.textContent = "Unsaved changes"; }
export const lessonDirty = () => !!(led && led.dirty && !$("vLessonEd").hidden);
function drawLessonEditor(){
  const v = $("vLessonEd"), { lesson:l, course:c } = led;
  const relMode = l.release_at ? "date" : l.release_days ? "days" : "now";
  v.innerHTML = `
    <div class="crumbs"><a href="#courses">Courses</a> / <a href="#course/${c.id}">${esc(c.title)}</a> / <span>Lesson</span></div>
    <div class="ed-bar le-bar">
      <input id="leTitle" class="ed-title" value="${esc(l.title)}" aria-label="Lesson title" maxlength="160">
      <span class="ed-saved" id="leSaved" role="status" aria-live="polite"></span><span class="sep"></span>
      <a class="tool" href="learn.html?course=${c.id}&lesson=${l.id}&preview=1" target="_blank" rel="noopener">Preview</a>
      <button class="tool danger-t" id="leDel">Delete lesson</button>
      <button class="ed-primary" id="leSave">Save</button>
    </div>
    <div class="le-grid">
      <div class="le-main">
        <section class="paper le-card">
          <div class="field"><label for="leSummary">Summary <span class="hint">(shown in the course outline)</span></label><input id="leSummary" type="text" maxlength="300" value="${esc(l.summary || "")}"></div>
          <h2 class="le-h">Content</h2>
          <div id="leBlocks"></div>
          <div class="add-blocks"><span class="group-label">Add</span>${BLOCK_TYPES.map(([k,n]) => `<button class="swatch" data-addb="${k}">${n}</button>`).join("")}
            <button class="swatch ai" id="leWrite">Write with AI</button></div>
        </section>
        <section class="paper le-card">
          <div class="le-row"><h2 class="le-h">Quiz <span class="hint">(marked automatically; students need ${c.pass_mark}% to pass)</span></h2><span class="sep"></span>
            <button class="mx-ghost" id="leQuizAI">Make questions with AI</button><button class="mx-save" id="leQAdd">Add question</button></div>
          <div id="leQuiz"></div>
        </section>
        <section class="paper le-card">
          <h2 class="le-h">Homework <span class="hint">(optional; students send it to you to mark)</span></h2>
          <textarea id="leHw" rows="3" placeholder="e.g. Write 120 words about a meeting that went badly and what you would do differently.">${esc(l.homework || "")}</textarea>
        </section>
      </div>
      <aside class="paper le-side">
        <h2 class="le-h">Settings</h2>
        <div class="field"><label for="leMod">Module</label><select id="leMod">${led.mods.map(m => `<option value="${m.id}" ${m.id === l.module_id ? "selected" : ""}>${esc(m.title)}</option>`).join("")}</select></div>
        <p class="group-label">Opens</p>
        <label class="check"><input type="radio" name="leRel" value="now" ${relMode==="now"?"checked":""}> As soon as a student joins</label>
        <label class="check"><input type="radio" name="leRel" value="days" ${relMode==="days"?"checked":""}> <input id="leDays" type="number" min="1" max="365" value="${l.release_days || 7}" class="num"> days after they join</label>
        <label class="check"><input type="radio" name="leRel" value="date" ${relMode==="date"?"checked":""}> On a date <input id="leDate" type="datetime-local" value="${l.release_at ? new Date(new Date(l.release_at).getTime() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16) : ""}"></label>
        <hr>
        <label class="check"><input type="checkbox" id="lePub" ${l.published ? "checked" : ""}> Visible to students</label>
        <label class="check"><input type="checkbox" id="lePrev" ${l.is_preview ? "checked" : ""}> Free preview on the course page</label>
        <p class="hint-line">Students can mark a lesson complete only after passing its quiz.</p>
      </aside>
    </div>`;
  drawBlocks(); drawQuiz();
  q("#leTitle", v).addEventListener("input", markDirty);
  ["#leSummary","#leHw","#leMod","#leDays","#leDate","#lePub","#lePrev"].forEach(s => q(s, v).addEventListener("input", markDirty));
  qa("[name=leRel]", v).forEach(r => r.addEventListener("change", markDirty));
  q("#leDays", v).addEventListener("focus", () => { q("[name=leRel][value=days]", v).checked = true; });
  q("#leDate", v).addEventListener("focus", () => { q("[name=leRel][value=date]", v).checked = true; });
  qa("[data-addb]", v).forEach(b => b.addEventListener("click", () => addBlock(b.dataset.addb)));
  q("#leSave", v).addEventListener("click", saveLesson);
  armed(q("#leDel", v), "Delete this lesson?", async () => {
    try { await must(sb.from("lessons").delete().eq("id", led.lesson.id)); led.dirty = false; toast("Lesson deleted."); location.hash = "#course/" + c.id; } catch(e) { toast(friendly(e), true); }
  });
  q("#leQAdd", v).addEventListener("click", () => { led.quiz.push({ id:"q" + Math.random().toString(36).slice(2,8), type:"choice", q:"", options:["",""], correct:[0], accepted:[] }); drawQuiz(); markDirty(); });
  q("#leQuizAI", v).addEventListener("click", async () => {
    const content = lessonText(); if (content.length < 60) { toast("Add some lesson content first, then make questions from it.", true); return; }
    const b = q("#leQuizAI", v); b.disabled = true; b.textContent = "Writing questions…";
    try { const out = await sample.json(quizPrompt(content, c.level, 5)); const qz = normQuiz(out && (out.quiz || out.questions || out));
      if (!qz.length) throw { code:"invalid_json" }; led.quiz.push(...qz); drawQuiz(); markDirty(); toast(`${qz.length} questions added. Check them, then save.`); }
    catch(e) { aiFail(e); } finally { b.disabled = false; b.textContent = "Make questions with AI"; }
  });
  q("#leWrite", v).addEventListener("click", async () => {
    const b = q("#leWrite", v); b.disabled = true; b.textContent = "Writing…";
    try {
      const out = await sample(`You are an expert English teacher writing one self-study lesson for an online course.
Course: ${c.title}. Level: ${c.level || "B1"} (CEFR).
Lesson: ${q("#leTitle", v).value}. ${q("#leSummary", v).value}
${lessonText() ? `Existing content (continue it, don't repeat it):\n"""\n${lessonText().slice(0,8000)}\n"""\n` : ""}
Write the lesson in Markdown: ## headings, short paragraphs, bullet lists, **bold** key language, example sentences, a small practice task and a speaking or writing prompt. 350–600 words. No tables, no emojis. Output only the lesson.`);
      led.lesson.blocks.push({ type:"text", md:out.text.trim() }); drawBlocks(); markDirty(); toast("Content written. Edit it as you like, then save.");
    } catch(e) { aiFail(e); } finally { b.disabled = false; b.textContent = "Write with AI"; }
  });
  window.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === "s" && !$("vLessonEd").hidden) { e.preventDefault(); saveLesson(); } };
}
function lessonText(){
  return (led.lesson.blocks || []).map(b => b.type === "text" || b.type === "painted" ? b.md : b.caption || "").join("\n\n").trim();
}
function addBlock(type){
  if (type === "painted") { pickClass(); return; }
  const b = { type };
  if (type === "text") b.md = "";
  led.lesson.blocks.push(b); drawBlocks(); markDirty();
  const last = qa("#leBlocks .blk-ed").at(-1); if (last) { const i = last.querySelector("textarea,input"); if (i) i.focus(); }
}
async function pickClass(){
  let classes = [];
  try { classes = await classStore.list(); } catch(e) { toast(friendly(e), true); return; }
  if (!classes.length) { toast("Paint a lesson in the Studio first."); return; }
  const d = dialog(`<h2>Add a painted class</h2><p class="dlg-lead">Students see the worksheet: no answer keys or teacher notes.</p>
    <div class="field"><label for="pcSel">Class</label><select id="pcSel">${classes.map(x => `<option value="${x.id}">${esc(x.title)} (${esc(x.level)})</option>`).join("")}</select></div>
    <div class="mx-actions"><button class="mx-save" id="pcGo">Add</button><button class="mx-ghost" data-close>Cancel</button></div>`);
  q("#pcGo", d).addEventListener("click", () => {
    const x = classes.find(k => k.id === q("#pcSel", d).value);
    led.lesson.blocks.push({ type:"painted", md:studentMd(x.md), class_id:x.id, title:x.title }); d.close(); drawBlocks(); markDirty();
  });
}
function drawBlocks(){
  const box = $("leBlocks"), bl = led.lesson.blocks || (led.lesson.blocks = []);
  if (!bl.length) { box.innerHTML = `<p class="hint-line">No content yet. Add text, a video, an image, a file or a painted class.</p>`; return; }
  box.innerHTML = bl.map((b, i) => {
    const head = `<div class="blk-head"><span class="blk-type">${esc((BLOCK_TYPES.find(t => t[0] === b.type) || [,b.type])[1])}</span><span class="sep"></span>
      <button class="mx-ghost sm" data-bup="${i}" ${i===0?"disabled":""}>Up</button><button class="mx-ghost sm" data-bdown="${i}" ${i===bl.length-1?"disabled":""}>Down</button><button class="mx-ghost sm danger" data-bdel="${i}">Remove</button></div>`;
    let inner = "";
    if (b.type === "text") inner = `<div class="md-ed"><textarea data-bk="md" data-i="${i}" rows="8" placeholder="Write in Markdown: ## heading, - bullet, **bold**, [link](https://…)">${esc(b.md || "")}</textarea>
      <div class="md-prev prose" data-prev="${i}">${md(b.md) || '<p class="hint-line">Preview</p>'}</div></div>`;
    else if (b.type === "video") inner = `<div class="field"><label>YouTube, Vimeo or Loom link</label><input data-bk="url" data-i="${i}" type="url" value="${esc(b.url || "")}" placeholder="https://www.youtube.com/watch?v=…"></div>
      <div class="field"><label>Caption <span class="hint">(optional)</span></label><input data-bk="caption" data-i="${i}" type="text" value="${esc(b.caption || "")}"></div><div class="blk-prev" data-prev="${i}">${renderBlocks([b])}</div>`;
    else if (b.type === "image" || b.type === "file") inner = `<div class="upl"><button class="upload-btn" data-upl="${i}">${b.url ? "Replace" : "Upload"} ${b.type === "image" ? "image" : "file"}</button><input type="file" hidden data-uplf="${i}" ${b.type === "image" ? 'accept="image/*"' : ""}>
      <span class="hint-line">${b.type === "image" ? "JPG, PNG, WebP or GIF" : "PDF, Word, audio, slides… up to 50 MB"}</span></div>
      <div class="field"><label>…or a link</label><input data-bk="url" data-i="${i}" type="url" value="${esc(b.url || "")}"></div>
      ${b.type === "file" ? `<div class="field"><label>File name shown</label><input data-bk="name" data-i="${i}" type="text" value="${esc(b.name || "")}"></div>` : ""}
      <div class="field"><label>Caption <span class="hint">(optional)</span></label><input data-bk="caption" data-i="${i}" type="text" value="${esc(b.caption || "")}"></div><div class="blk-prev" data-prev="${i}">${renderBlocks([b])}</div>`;
    else if (b.type === "link") inner = `<div class="field"><label>Link</label><input data-bk="url" data-i="${i}" type="url" value="${esc(b.url || "")}" placeholder="https://… (Google Doc, Canva, Quizlet, Wordwall…)"></div>
      <div class="field"><label>Title</label><input data-bk="name" data-i="${i}" type="text" value="${esc(b.name || "")}"></div>
      <div class="field"><label>Note <span class="hint">(optional)</span></label><input data-bk="caption" data-i="${i}" type="text" value="${esc(b.caption || "")}"></div>`;
    else if (b.type === "painted") inner = `<p><b>${esc(b.title || "Painted class")}</b> <span class="hint">· worksheet version</span></p>
      <details class="pc-prev"><summary>Show what students see</summary><div class="lesson">${renderBlocks([b])}</div></details>
      ${b.class_id ? `<button class="mx-ghost sm" data-refresh="${i}">Update from the class</button>` : ""}`;
    return `<div class="blk-ed" data-b="${i}">${head}${inner}</div>`;
  }).join("");
  qa("[data-bk]", box).forEach(inp => inp.addEventListener("input", () => {
    const i = +inp.dataset.i, b = bl[i]; b[inp.dataset.bk] = inp.value; markDirty();
    const prev = box.querySelector(`[data-prev="${i}"]`);
    if (prev) { clearTimeout(inp._t); inp._t = setTimeout(() => { prev.innerHTML = b.type === "text" ? (md(b.md) || '<p class="hint-line">Preview</p>') : renderBlocks([b]); }, 250); }
  }));
  qa("[data-bup],[data-bdown]", box).forEach(btn => btn.addEventListener("click", () => {
    const i = +(btn.dataset.bup ?? btn.dataset.bdown), j = btn.dataset.bup !== undefined ? i - 1 : i + 1;
    [bl[i], bl[j]] = [bl[j], bl[i]]; drawBlocks(); markDirty();
  }));
  qa("[data-bdel]", box).forEach(btn => armed(btn, "Remove?", () => { bl.splice(+btn.dataset.bdel, 1); drawBlocks(); markDirty(); }));
  qa("[data-upl]", box).forEach(btn => btn.addEventListener("click", () => box.querySelector(`[data-uplf="${btn.dataset.upl}"]`).click()));
  qa("[data-uplf]", box).forEach(inp => inp.addEventListener("change", async () => {
    const f = inp.files[0]; if (!f) return; const i = +inp.dataset.uplf, b = bl[i];
    if (f.size > 50 * 1048576) { toast("That file is over 50 MB.", true); return; }
    const btn = box.querySelector(`[data-upl="${i}"]`); btn.disabled = true; btn.textContent = "Uploading…";
    try { b.url = await uploadFile(f, ctx.uid, "lessons"); if (b.type === "file" && !b.name) b.name = f.name; markDirty(); drawBlocks(); toast("Uploaded. Save the lesson to keep it."); }
    catch(e) { toast(friendly(e), true); btn.disabled = false; btn.textContent = "Upload"; }
  }));
  qa("[data-refresh]", box).forEach(btn => btn.addEventListener("click", async () => {
    const b = bl[+btn.dataset.refresh];
    try { const x = await classStore.get(b.class_id); if (!x) { toast("That class was deleted from My classes.", true); return; }
      b.md = studentMd(x.md); b.title = x.title; drawBlocks(); markDirty(); toast("Updated from the class. Save to publish it."); }
    catch(e) { toast(friendly(e), true); }
  }));
}
function drawQuiz(){
  const box = $("leQuiz"), qz = led.quiz;
  if (!qz.length) { box.innerHTML = `<p class="hint-line">No quiz. Add questions yourself or let the AI write them from the lesson.</p>`; return; }
  const TYPES = [["choice","One answer"],["multi","Several answers"],["truefalse","True / False"],["short","Short answer"]];
  box.innerHTML = qz.map((x, i) => `<div class="qz-ed" data-q="${i}">
    <div class="qz-head"><b>${i + 1}.</b><select data-qt="${i}" aria-label="Question type">${TYPES.map(([k,n]) => `<option value="${k}" ${x.type===k?"selected":""}>${n}</option>`).join("")}</select>
      <span class="sep"></span><button class="mx-ghost sm" data-qup="${i}" ${i===0?"disabled":""}>Up</button><button class="mx-ghost sm danger" data-qdel="${i}">Remove</button></div>
    <input class="qz-q" data-qq="${i}" type="text" value="${esc(x.q)}" placeholder="Question" aria-label="Question ${i+1}">
    ${x.type === "short" ? `<div class="field"><label>Accepted answers <span class="hint">(one per line; capitals and spaces are ignored)</span></label><textarea data-qacc="${i}" rows="2">${esc((x.accepted || []).join("\n"))}</textarea></div>`
      : `<ul class="qz-opts">${x.options.map((o, k) => `<li><label class="qz-c" title="Correct answer"><input type="${x.type === "multi" ? "checkbox" : "radio"}" name="qc${i}" data-qc="${i}" value="${k}" ${x.correct.includes(k) ? "checked" : ""}><span class="sr">Correct</span></label>
        <input type="text" data-qo="${i}" data-k="${k}" value="${esc(o)}" placeholder="Option ${k + 1}" ${x.type === "truefalse" ? "readonly" : ""}>
        ${x.type !== "truefalse" && x.options.length > 2 ? `<button class="mx-ghost sm" data-qor="${i}" data-k="${k}" aria-label="Remove option">×</button>` : ""}</li>`).join("")}</ul>
        ${x.type !== "truefalse" && x.options.length < 6 ? `<button class="mx-ghost sm" data-qoa="${i}">Add option</button>` : ""}<p class="hint-line">Tick the correct ${x.type === "multi" ? "answers" : "answer"}.</p>`}
  </div>`).join("");
  qa("[data-qt]", box).forEach(s => s.addEventListener("change", () => {
    const x = qz[+s.dataset.qt]; x.type = s.value;
    if (x.type === "truefalse") { x.options = ["True","False"]; x.correct = [x.correct[0] === 1 ? 1 : 0]; }
    else if (x.type === "short") { x.accepted = x.accepted && x.accepted.length ? x.accepted : []; }
    else { if (x.options.length < 2) x.options = ["",""]; if (x.type === "choice") x.correct = x.correct.slice(0,1); if (!x.correct.length) x.correct = [0]; }
    drawQuiz(); markDirty();
  }));
  qa("[data-qq]", box).forEach(i => i.addEventListener("input", () => { qz[+i.dataset.qq].q = i.value; markDirty(); }));
  qa("[data-qacc]", box).forEach(t => t.addEventListener("input", () => { qz[+t.dataset.qacc].accepted = t.value.split("\n").map(s => s.trim()).filter(Boolean); markDirty(); }));
  qa("[data-qo]", box).forEach(i => i.addEventListener("input", () => { qz[+i.dataset.qo].options[+i.dataset.k] = i.value; markDirty(); }));
  qa("[data-qc]", box).forEach(i => i.addEventListener("change", () => {
    const x = qz[+i.dataset.qc]; const k = +i.value;
    if (x.type === "multi") { x.correct = qa(`[data-qc="${i.dataset.qc}"]`, box).filter(c => c.checked).map(c => +c.value); }
    else x.correct = [k];
    markDirty();
  }));
  qa("[data-qoa]", box).forEach(b => b.addEventListener("click", () => { qz[+b.dataset.qoa].options.push(""); drawQuiz(); markDirty(); }));
  qa("[data-qor]", box).forEach(b => b.addEventListener("click", () => {
    const x = qz[+b.dataset.qor], k = +b.dataset.k; x.options.splice(k, 1);
    x.correct = x.correct.filter(n => n !== k).map(n => n > k ? n - 1 : n); if (!x.correct.length) x.correct = [0];
    drawQuiz(); markDirty();
  }));
  qa("[data-qup]", box).forEach(b => b.addEventListener("click", () => { const i = +b.dataset.qup; [qz[i-1], qz[i]] = [qz[i], qz[i-1]]; drawQuiz(); markDirty(); }));
  qa("[data-qdel]", box).forEach(b => armed(b, "Remove?", () => { qz.splice(+b.dataset.qdel, 1); drawQuiz(); markDirty(); }));
}
async function saveLesson(){
  const v = $("vLessonEd"), l = led.lesson, btn = q("#leSave", v);
  const rel = (qa("[name=leRel]", v).find(r => r.checked) || {}).value;
  // Check the quiz
  for (const [i, x] of led.quiz.entries()) {
    if (!x.q.trim()) { toast(`Question ${i + 1} has no text.`, true); return; }
    if (x.type === "short" && !x.accepted.length) { toast(`Question ${i + 1} needs at least one accepted answer.`, true); return; }
    if (x.type !== "short" && x.options.filter(o => String(o).trim()).length < 2) { toast(`Question ${i + 1} needs at least two options.`, true); return; }
    if (x.type !== "short" && !x.correct.length) { toast(`Tick the correct answer for question ${i + 1}.`, true); return; }
  }
  const dateVal = q("#leDate", v).value;
  if (rel === "date" && !dateVal) { toast("Choose the date the lesson opens.", true); return; }
  const row = {
    title:q("#leTitle", v).value.trim() || "Untitled lesson", summary:q("#leSummary", v).value.trim(), module_id:q("#leMod", v).value || l.module_id,
    blocks:l.blocks, homework:q("#leHw", v).value.trim() || null,
    quiz: led.quiz.length ? { questions:led.quiz.map(x => ({ id:x.id, type:x.type, q:x.q.trim(), options: x.type === "short" ? [] : x.options.map(o => String(o).trim()) })) } : null,
    release_days: rel === "days" ? Math.max(1, +q("#leDays", v).value || 1) : null,
    release_at: rel === "date" ? new Date(dateVal).toISOString() : null,
    published:q("#lePub", v).checked, is_preview:q("#lePrev", v).checked, updated_at:new Date().toISOString()
  };
  btn.disabled = true; $("leSaved").textContent = "Saving…";
  try {
    await must(sb.from("lessons").update(row).eq("id", l.id));
    if (led.quiz.length) await must(sb.from("quiz_keys").upsert({ lesson_id:l.id, answers:keyOf(led.quiz) }));
    else await must(sb.from("quiz_keys").delete().eq("lesson_id", l.id));
    Object.assign(l, row); led.dirty = false; $("leSaved").textContent = "Saved"; toast("Lesson saved.");
  } catch(e) { $("leSaved").textContent = "Couldn't save"; toast(friendly(e), true); }
  finally { btn.disabled = false; }
}

/* ---------- Data for students, progress and marking ---------- */
async function courseData(c){
  const [lessons, enr, prog, subs] = await Promise.all([
    must(sb.from("lessons").select("id,title,position,module_id,published,quiz,homework").eq("course_id", c.id).order("position")),
    must(sb.from("enrolments").select("*").eq("course_id", c.id).order("enrolled_at")),
    must(sb.from("progress").select("*").eq("course_id", c.id)),
    must(sb.from("submissions").select("*").eq("course_id", c.id).order("created_at", { ascending:false }))
  ]);
  const ids = enr.map(e => e.student_id);
  const profs = ids.length ? await must(sb.from("profiles").select("id,name,email,photo,country,city").in("id", ids)) : [];
  const mods = await must(sb.from("modules").select("id,position").eq("course_id", c.id));
  const mp = Object.fromEntries(mods.map(m => [m.id, m.position]));
  lessons.sort((a,b) => (mp[a.module_id] ?? -1) - (mp[b.module_id] ?? -1) || a.position - b.position);
  const pub = lessons.filter(l => l.published);
  const people = enr.map(e => {
    const p = profs.find(x => x.id === e.student_id) || { name:"Student", email:"" };
    const done = prog.filter(x => x.student_id === e.student_id && pub.some(l => l.id === x.lesson_id));
    const quizzes = subs.filter(s => s.student_id === e.student_id && s.kind === "quiz");
    const best = {}; quizzes.forEach(s => { const v = s.max_score ? s.score / s.max_score : 0; if (!(s.lesson_id in best) || v > best[s.lesson_id]) best[s.lesson_id] = v; });
    const bv = Object.values(best);
    const last = [...done.map(x => x.completed_at), ...subs.filter(s => s.student_id === e.student_id).map(s => s.created_at), e.enrolled_at].sort().at(-1);
    return { ...e, p, done:done.length, total:pub.length, pct:pct(done.length, pub.length), quiz: bv.length ? Math.round(bv.reduce((a,x) => a + x, 0) / bv.length * 100) : null, last };
  });
  return { lessons, pub, enr, prog, subs, profs, people };
}
const nameOf = (profs, id) => (profs.find(p => p.id === id) || {}).name || "Student";
const avatar = p => p.photo ? `<img class="av" src="${esc(p.photo)}" alt="">` : `<span class="av">${esc((p.name || "?").trim().charAt(0).toUpperCase())}</span>`;
const bar = (v, label) => `<span class="bar" role="img" aria-label="${esc(label || v + "%")}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;

/* ---------- Students ---------- */
async function tabStudents(c, body){
  const d = await courseData(c);
  body.innerHTML = `
    <div class="paper invite-strip"><div><p class="group-label">Class code</p><div class="invite-code sm">${esc(c.join_code)}</div></div>
      <div class="inv-text"><p>Students join at <b>${esc(site("learn.html"))}</b> with this code, or straight from the invite link.</p>
      <div class="mx-actions"><button class="mx-save" id="stCopy">Copy invite link</button><button class="mx-ghost" id="stCsv" ${d.people.length ? "" : "disabled"}>Download CSV</button></div></div></div>
    ${d.people.length ? `<div class="paper tbl-wrap"><table class="tbl"><thead><tr><th>Student</th><th>Joined</th><th>Progress</th><th>Quiz average</th><th>Last active</th><th>Note</th><th></th></tr></thead><tbody>
      ${d.people.map(s => `<tr>
        <td><div class="who">${avatar(s.p)}<div><b>${esc(s.p.name)}</b><small>${esc(s.p.email || "")}</small></div></div></td>
        <td>${fmtDate(s.enrolled_at)}</td>
        <td>${bar(s.pct)} <small>${s.done}/${s.total}</small></td>
        <td>${s.quiz === null ? "<small>—</small>" : s.quiz + "%"}</td>
        <td><small>${fmtDate(s.last)}</small></td>
        <td><input class="note-in" data-note="${s.student_id}" value="${esc(s.note || "")}" placeholder="Private note" aria-label="Note about ${esc(s.p.name)}"></td>
        <td><button class="mx-ghost sm danger" data-rm="${s.student_id}">Remove</button></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="lib-empty">No students yet. Copy the invite link and send it to them.</p>`}`;
  q("#stCopy", body).addEventListener("click", () => copy(joinLink(c.join_code), "Invite link"));
  const csvBtn = q("#stCsv", body);
  csvBtn.addEventListener("click", () => {
    const rows = [["Name","Email","Joined","Lessons done","Lessons total","Progress %","Quiz average %","Last active","Note"],
      ...d.people.map(s => [s.p.name, s.p.email, new Date(s.enrolled_at).toISOString().slice(0,10), s.done, s.total, s.pct, s.quiz ?? "", new Date(s.last).toISOString().slice(0,10), s.note || ""])];
    const csv = rows.map(r => r.map(x => `"${String(x ?? "").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    saveBlob(new Blob(["﻿" + csv], { type:"text/csv" }), slugify(c.title) + "-students.csv");
  });
  qa("[data-note]", body).forEach(i => i.addEventListener("change", async () => {
    try { await must(sb.from("enrolments").update({ note:i.value }).eq("course_id", c.id).eq("student_id", i.dataset.note)); toast("Note saved."); } catch(e) { toast(friendly(e), true); }
  }));
  qa("[data-rm]", body).forEach(b => armed(b, "Remove student?", async () => {
    try { await must(sb.from("enrolments").delete().eq("course_id", c.id).eq("student_id", b.dataset.rm)); toast("Student removed."); renderCourse(c.id, "students"); } catch(e) { toast(friendly(e), true); }
  }));
}

/* ---------- Progress ---------- */
async function tabProgress(c, body){
  const d = await courseData(c);
  const n = d.people.length;
  const finished = d.people.filter(s => s.total && s.done >= s.total).length;
  const avg = n ? Math.round(d.people.reduce((a,s) => a + s.pct, 0) / n) : 0;
  const qs = d.people.map(s => s.quiz).filter(x => x !== null);
  const qavg = qs.length ? Math.round(qs.reduce((a,x) => a + x, 0) / qs.length) : null;
  const toMark = d.subs.filter(s => s.kind === "homework" && !s.graded_at).length;
  body.innerHTML = `
    <div class="kpis">
      <div class="kpi paper"><b>${n}</b><span>${n === 1 ? "student" : "students"}</span></div>
      <div class="kpi paper"><b>${avg}%</b><span>average progress</span></div>
      <div class="kpi paper"><b>${finished}</b><span>finished the course</span></div>
      <div class="kpi paper"><b>${qavg === null ? "—" : qavg + "%"}</b><span>quiz average</span></div>
      <div class="kpi paper ${toMark ? "hot" : ""}"><b>${toMark}</b><span>homework to mark</span></div>
    </div>
    ${d.pub.length ? `<div class="paper tbl-wrap"><table class="tbl"><thead><tr><th>Lesson</th><th>Completed</th><th>Quiz attempts</th><th>Best quiz scores</th><th>Homework</th></tr></thead><tbody>
      ${d.pub.map((l, i) => {
        const done = d.prog.filter(p => p.lesson_id === l.id).length;
        const qz = d.subs.filter(s => s.lesson_id === l.id && s.kind === "quiz");
        const best = {}; qz.forEach(s => { const v = s.max_score ? s.score / s.max_score : 0; best[s.student_id] = Math.max(best[s.student_id] ?? 0, v); });
        const bv = Object.values(best); const qa_ = bv.length ? Math.round(bv.reduce((a,x)=>a+x,0)/bv.length*100) : null;
        const hw = d.subs.filter(s => s.lesson_id === l.id && s.kind === "homework");
        return `<tr><td><b>${i + 1}.</b> <a href="#lesson/${l.id}">${esc(l.title)}</a></td><td>${bar(pct(done, n))} <small>${done}/${n}</small></td>
          <td>${l.quiz && l.quiz.questions && l.quiz.questions.length ? qz.length : "<small>no quiz</small>"}</td><td>${qa_ === null ? "<small>—</small>" : qa_ + "%"}</td>
          <td>${l.homework ? `${hw.length} sent${hw.filter(s => !s.graded_at).length ? `, <b class="hot-t">${hw.filter(s => !s.graded_at).length} to mark</b>` : ""}` : "<small>none</small>"}</td></tr>`;
      }).join("")}</tbody></table></div>` : `<p class="lib-empty">No published lessons yet.</p>`}
    ${n && d.pub.length ? `<h2 class="sub-h">Each student</h2><div class="paper tbl-wrap"><table class="tbl grid-tbl"><thead><tr><th>Student</th>${d.pub.map((l,i) => `<th title="${esc(l.title)}">${i+1}</th>`).join("")}</tr></thead><tbody>
      ${d.people.map(s => `<tr><td><div class="who">${avatar(s.p)}<b>${esc(s.p.name)}</b></div></td>${d.pub.map(l => {
        const ok = d.prog.some(p => p.lesson_id === l.id && p.student_id === s.student_id);
        return `<td class="cell ${ok ? "ok" : ""}" title="${esc(l.title)}: ${ok ? "done" : "not yet"}">${ok ? "✓" : ""}</td>`; }).join("")}</tr>`).join("")}
    </tbody></table></div>` : ""}`;
}

/* ---------- Marking ---------- */
async function tabMarking(c, body){
  const d = await courseData(c);
  const hw = d.subs.filter(s => s.kind === "homework").sort((a,b) => (!!a.graded_at - !!b.graded_at) || (new Date(b.created_at) - new Date(a.created_at)));
  const quiz = d.subs.filter(s => s.kind === "quiz").slice(0, 60);
  const lt = id => (d.lessons.find(l => l.id === id) || {}).title || "Lesson";
  body.innerHTML = `
    <h2 class="sub-h">Homework</h2>
    ${hw.length ? hw.map(s => `<article class="paper hw ${s.graded_at ? "done" : ""}" data-sub="${s.id}">
      <div class="hw-head"><div class="who">${avatar(d.profs.find(p => p.id === s.student_id) || {})}<div><b>${esc(nameOf(d.profs, s.student_id))}</b><small>${esc(lt(s.lesson_id))} · sent ${fmtDate(s.created_at)} ${fmtTime(s.created_at)}</small></div></div>
        <span class="badge-s ${s.graded_at ? "on" : "warn"}">${s.graded_at ? "Marked" : "To mark"}</span></div>
      <div class="hw-body prose">${md(s.body || "")}</div>
      ${s.file_url ? `<p><a href="${esc(s.file_url)}" target="_blank" rel="noopener">Open the attached file</a></p>` : ""}
      <div class="hw-grade"><div class="field sc"><label>Score <span class="hint">(out of 10)</span></label><input type="number" min="0" max="10" step="0.5" data-score value="${s.score ?? ""}"></div>
        <div class="field fb"><label>Feedback</label><textarea data-fb rows="3">${esc(s.feedback || "")}</textarea></div></div>
      <div class="mx-actions"><button class="mx-save" data-grade>Save mark</button><button class="mx-ghost" data-suggest>Suggest feedback with AI</button></div>
    </article>`).join("") : `<p class="lib-empty">No homework sent yet.</p>`}
    <h2 class="sub-h">Quiz attempts</h2>
    ${quiz.length ? `<div class="paper tbl-wrap"><table class="tbl"><thead><tr><th>Student</th><th>Lesson</th><th>Score</th><th>Result</th><th>When</th></tr></thead><tbody>
      ${quiz.map(s => `<tr><td>${esc(nameOf(d.profs, s.student_id))}</td><td>${esc(lt(s.lesson_id))}</td><td>${s.score}/${s.max_score}</td><td>${s.passed ? `<span class="badge-s on">Passed</span>` : `<span class="badge-s warn">Not yet</span>`}</td><td><small>${fmtDate(s.created_at)} ${fmtTime(s.created_at)}</small></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="lib-empty">No quiz attempts yet.</p>`}`;
  qa("[data-sub]", body).forEach(card => {
    const s = hw.find(x => x.id === card.dataset.sub);
    q("[data-grade]", card).addEventListener("click", async () => {
      const sc = q("[data-score]", card).value, fb = q("[data-fb]", card).value.trim();
      try { await must(sb.from("submissions").update({ score: sc === "" ? null : +sc, max_score:10, feedback:fb, graded_at:new Date().toISOString() }).eq("id", s.id));
        toast("Mark saved. The student can see it now."); renderCourse(c.id, "marking"); } catch(e) { toast(friendly(e), true); }
    });
    q("[data-suggest]", card).addEventListener("click", async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "Thinking…";
      const lesson = d.lessons.find(l => l.id === s.lesson_id) || {};
      try {
        const out = await sample.json(`You are a supportive English teacher marking homework. Level: ${c.level || "B1"} (CEFR).
Task: ${lesson.homework || lesson.title}
Student's answer:
"""
${s.body || ""}
"""
Return a JSON object: {"score": number from 0 to 10, "feedback": string}. Feedback: 3–6 short lines in English, addressed to the student: what went well, the 2–3 most useful corrections (quote the mistake and give the correct form), and one next step. Kind and specific.`);
        if (typeof out.score === "number") q("[data-score]", card).value = Math.max(0, Math.min(10, Math.round(out.score * 2) / 2));
        if (out.feedback) q("[data-fb]", card).value = String(out.feedback);
        toast("Suggestion added. Edit it, then save the mark.");
      } catch(err) { aiFail(err); } finally { b.disabled = false; b.textContent = "Suggest feedback with AI"; }
    });
  });
}

/* ---------- Discussion ---------- */
async function tabDiscussion(c, body){
  const [comments, lessons] = await Promise.all([
    must(sb.from("comments").select("*").eq("course_id", c.id).order("created_at", { ascending:false }).limit(300)),
    must(sb.from("lessons").select("id,title").eq("course_id", c.id))
  ]);
  const lt = id => (lessons.find(l => l.id === id) || {}).title || "Lesson";
  const byLesson = {}; comments.forEach(x => (byLesson[x.lesson_id] = byLesson[x.lesson_id] || []).push(x));
  const ids = Object.keys(byLesson);
  body.innerHTML = ids.length ? ids.map(id => `<section class="paper thread" data-lesson="${id}"><h3><a href="#lesson/${id}">${esc(lt(id))}</a></h3>
    <ul class="cmts">${byLesson[id].slice().reverse().map(x => `<li class="${x.author_id === ctx.uid ? "mine" : ""}"><div><b>${esc(x.author_name)}</b> <small>${fmtDate(x.created_at)} ${fmtTime(x.created_at)}</small></div><div class="prose">${md(x.body)}</div>
      <button class="mx-ghost sm danger" data-cdel="${x.id}">Delete</button></li>`).join("")}</ul>
    <form class="ask cmt-form"><input type="text" placeholder="Reply…" maxlength="4000" aria-label="Reply"><button class="mx-save">Reply</button></form></section>`).join("")
    : `<p class="lib-empty">No questions or comments yet. Students can write under every lesson.</p>`;
  qa(".cmt-form", body).forEach(f => f.addEventListener("submit", async e => {
    e.preventDefault(); const inp = q("input", f), text = inp.value.trim(); if (!text) return;
    const lesson_id = f.closest("[data-lesson]").dataset.lesson;
    try { await must(sb.from("comments").insert({ lesson_id, course_id:c.id, body:text })); renderCourse(c.id, "discussion"); } catch(err) { toast(friendly(err), true); }
  }));
  qa("[data-cdel]", body).forEach(b => armed(b, "Delete?", async () => {
    try { await must(sb.from("comments").delete().eq("id", b.dataset.cdel)); renderCourse(c.id, "discussion"); } catch(e) { toast(friendly(e), true); }
  }));
}

/* ---------- Settings ---------- */
async function tabSettings(c, body){
  body.innerHTML = `<section class="paper set-card">
    <div class="field"><label for="csTitle">Title</label><input id="csTitle" type="text" maxlength="120" value="${esc(c.title)}"></div>
    <div class="field"><label for="csSub">Subtitle</label><input id="csSub" type="text" maxlength="200" value="${esc(c.subtitle || "")}"></div>
    <div class="field"><label for="csDesc">Description <span class="hint">(for the course page; Markdown works)</span></label><textarea id="csDesc" rows="6">${esc(c.description || "")}</textarea></div>
    <div class="pf-two">
      <div class="field"><label for="csLevel">Level</label><select id="csLevel"><option value="">Any level</option>${["A1",...LEVELS].map(l => `<option ${c.level === l ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="csSlug">Web address</label><div class="slug"><span>${esc(site("course.html"))}?c=</span><input id="csSlug" type="text" maxlength="60" value="${esc(c.slug || "")}"></div></div>
    </div>
    <div class="field"><p class="group-label">Colour</p><div class="paints" id="csColors">${COLORS.map(x => `<button class="paint-dot" type="button" style="--paint:${x}" data-col="${x}" aria-pressed="${x === c.color}" aria-label="Colour ${x}"></button>`).join("")}</div></div>
    <div class="field"><p class="group-label">Cover image</p><div class="cover-row"><div class="cover-prev" id="csCoverPrev">${cover(c)}</div>
      <div><button class="upload-btn" id="csCoverBtn" type="button">Upload image</button><input type="file" id="csCoverFile" accept="image/*" hidden>
      ${c.cover_url ? `<button class="mx-ghost sm" id="csCoverRm" type="button">Remove</button>` : ""}<p class="hint-line">16:9 works best, for example 1600 × 900.</p></div></div></div>
    <hr>
    <label class="check"><input type="checkbox" id="csPub" ${c.published ? "checked" : ""}> Published: the course page is public</label>
    <label class="check"><input type="checkbox" id="csOpen" ${c.open_enrolment ? "checked" : ""}> Anyone can join from the course page (otherwise only with the class code)</label>
    <label class="check"><input type="checkbox" id="csCert" ${c.certificate ? "checked" : ""}> Certificate of completion when a student finishes every lesson</label>
    <div class="field" style="max-width:220px"><label for="csPass">Quiz pass mark (%)</label><input id="csPass" type="number" min="0" max="100" value="${c.pass_mark}"></div>
    <p class="mx-err" id="csMsg" role="alert"></p>
    <div class="mx-actions"><button class="mx-save" id="csSave">Save settings</button></div>
  </section>
  <section class="paper set-card">
    <h2 class="le-h">Class code</h2><p>Current code: <b class="mono">${esc(c.join_code)}</b>. Make a new one if the old code was shared too widely. Students who already joined keep their place.</p>
    <button class="mx-ghost" id="csCode">Make a new code</button>
  </section>
  <section class="paper set-card danger-zone">
    <h2 class="le-h">Delete course</h2><p>Deletes the course, its lessons, quizzes, student progress and certificates. This can't be undone. Your painted classes stay in My classes.</p>
    <button class="mx-ghost danger" id="csDel">Delete this course</button>
  </section>`;
  let color = c.color, coverUrl = c.cover_url || "";
  qa("[data-col]", body).forEach(b => b.addEventListener("click", () => { color = b.dataset.col; qa("[data-col]", body).forEach(x => x.setAttribute("aria-pressed", String(x === b))); }));
  q("#csCoverBtn", body).addEventListener("click", () => q("#csCoverFile", body).click());
  q("#csCoverFile", body).addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return; const btn = q("#csCoverBtn", body); btn.disabled = true; btn.textContent = "Uploading…";
    try { coverUrl = await uploadFile(f, ctx.uid, "covers"); q("#csCoverPrev", body).innerHTML = `<img src="${esc(coverUrl)}" alt="">`; toast("Cover uploaded. Save to keep it."); }
    catch(err) { toast(friendly(err), true); } finally { btn.disabled = false; btn.textContent = "Upload image"; }
  });
  const rm = q("#csCoverRm", body); if (rm) rm.addEventListener("click", () => { coverUrl = ""; q("#csCoverPrev", body).innerHTML = cover({ ...c, cover_url:"", color }); });
  q("#csSave", body).addEventListener("click", async () => {
    const slug = slugify(q("#csSlug", body).value) || slugify(q("#csTitle", body).value) + "-" + Math.random().toString(36).slice(2,6);
    const row = { title:q("#csTitle", body).value.trim() || c.title, subtitle:q("#csSub", body).value.trim(), description:q("#csDesc", body).value,
      level:q("#csLevel", body).value, slug, color, cover_url:coverUrl, published:q("#csPub", body).checked, open_enrolment:q("#csOpen", body).checked,
      certificate:q("#csCert", body).checked, pass_mark:Math.max(0, Math.min(100, +q("#csPass", body).value || 70)), updated_at:new Date().toISOString() };
    try { await must(sb.from("courses").update(row).eq("id", c.id)); toast("Settings saved."); renderCourse(c.id, "settings"); }
    catch(e) { q("#csMsg", body).textContent = friendly(e); }
  });
  armed(q("#csCode", body), "Make a new code? The old one stops working", async () => {
    const code = Math.random().toString(36).slice(2,8).toUpperCase();
    try { await must(sb.from("courses").update({ join_code:code }).eq("id", c.id)); toast("New class code: " + code); renderCourse(c.id, "settings"); } catch(e) { toast(friendly(e), true); }
  });
  armed(q("#csDel", body), "Delete for good?", async () => {
    try { await must(sb.from("courses").delete().eq("id", c.id)); toast("Course deleted."); location.hash = "#courses"; } catch(e) { toast(friendly(e), true); }
  });
}

/* ============================== Calendar ============================== */
let calMonth = null;
export async function renderCalendar(){
  const v = $("vCalendar");
  if (!calMonth) { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
  const start = new Date(calMonth), end = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  const gridStart = new Date(start.getFullYear(), start.getMonth(), 1 - ((start.getDay() + 6) % 7));
  let sessions = [], courses = [];
  try {
    [sessions, courses] = await Promise.all([
      must(sb.from("sessions").select("*").eq("owner", ctx.uid).gte("starts_at", gridStart.toISOString()).lt("starts_at", new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42).toISOString()).order("starts_at")),
      must(sb.from("courses").select("id,title,color").eq("owner", ctx.uid))
    ]);
  } catch(e) { v.innerHTML = `<p class="lib-empty">${esc(friendly(e))}</p>`; return; }
  let upcoming = [];
  try { upcoming = await must(sb.from("sessions").select("*").eq("owner", ctx.uid).gte("starts_at", new Date().toISOString()).order("starts_at").limit(8)); } catch(e) {}
  const col = id => (courses.find(c => c.id === id) || {}).color || "#D9D5CC";
  const cname = id => (courses.find(c => c.id === id) || {}).title || "";
  const today = new Date().toDateString();
  const days = Array.from({ length:42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  v.innerHTML = `<header class="page-head"><div><h1>Calendar.</h1><p>Book live lessons. Students in the course see them, with the join link, on their page.</p></div>
    <div class="head-acts"><button class="mx-ghost" id="calIcs">Download for Google or Outlook</button><button class="mx-save" id="calNew">New live lesson</button></div></header>
    <div class="cal-layout">
      <section class="paper cal">
        <div class="cal-bar"><button class="tool" id="calPrev" aria-label="Previous month">‹</button><h2>${start.toLocaleDateString("en-GB", { month:"long", year:"numeric" })}</h2><button class="tool" id="calNext" aria-label="Next month">›</button><span class="sep"></span><button class="tool" id="calToday">Today</button></div>
        <div class="cal-grid" role="grid">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => `<div class="cal-dow" role="columnheader">${d}</div>`).join("")}
          ${days.map(d => { const ev = sessions.filter(s => new Date(s.starts_at).toDateString() === d.toDateString());
            return `<div class="cal-day ${d.getMonth() !== start.getMonth() ? "out" : ""} ${d.toDateString() === today ? "today" : ""}" role="gridcell" data-day="${d.toISOString()}">
              <span class="cal-n">${d.getDate()}</span>${ev.map(s => `<button class="cal-ev" data-ev="${s.id}" style="--paint:${col(s.course_id)}">${fmtTime(s.starts_at)} ${esc(s.title)}</button>`).join("")}</div>`; }).join("")}
        </div>
      </section>
      <aside class="paper cal-side"><h2 class="le-h">Coming up</h2>
        ${upcoming.length ? `<ul class="up-list">${upcoming.map(s => `<li style="--paint:${col(s.course_id)}"><button class="linkish" data-ev="${s.id}"><b>${esc(s.title)}</b></button><small>${fmtDate(s.starts_at, { weekday:"short", day:"numeric", month:"short" })}, ${fmtTime(s.starts_at)} · ${s.minutes} min${s.course_id ? " · " + esc(cname(s.course_id)) : ""}</small>${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">Join link</a>` : ""}</li>`).join("")}</ul>` : `<p class="hint-line">Nothing booked yet.</p>`}
      </aside>
    </div>`;
  q("#calPrev", v).addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); });
  q("#calNext", v).addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); });
  q("#calToday", v).addEventListener("click", () => { calMonth = null; renderCalendar(); });
  q("#calNew", v).addEventListener("click", () => sessionDialog(null, courses));
  q("#calIcs", v).addEventListener("click", async () => {
    try { const all = await must(sb.from("sessions").select("*").eq("owner", ctx.uid).gte("starts_at", new Date(Date.now() - 30*864e5).toISOString()).order("starts_at"));
      if (!all.length) { toast("No live lessons to download yet."); return; }
      saveBlob(icsFor(all.map(s => ({ ...s, title: s.title + (s.course_id ? " · " + cname(s.course_id) : "") })), "Paint the Lesson"), "live-lessons.ics");
      toast("Calendar file downloaded. Open it to add the lessons to your calendar."); } catch(e) { toast(friendly(e), true); }
  });
  qa("[data-ev]", v).forEach(b => b.addEventListener("click", e => { e.stopPropagation(); sessionDialog(sessions.find(s => s.id === b.dataset.ev) || upcoming.find(s => s.id === b.dataset.ev), courses); }));
  qa(".cal-day", v).forEach(d => d.addEventListener("dblclick", () => { const day = new Date(d.dataset.day); day.setHours(17, 0, 0, 0); sessionDialog({ starts_at:day.toISOString(), minutes:60 }, courses, true); }));
}
function sessionDialog(s, courses, isNewWithDate){
  const isNew = !s || !s.id;
  const t = s && s.starts_at ? new Date(s.starts_at) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(17,0,0,0); return d; })();
  const local = new Date(t.getTime() - t.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const d = dialog(`<h2>${isNew ? "New live lesson" : "Live lesson"}</h2>
    <div class="field"><label for="seTitle">Title</label><input id="seTitle" type="text" maxlength="140" value="${esc(s && s.title || "")}" placeholder="e.g. Speaking practice"></div>
    <div class="pf-two"><div class="field"><label for="seWhen">Starts</label><input id="seWhen" type="datetime-local" value="${local}"></div>
      <div class="field"><label for="seMin">Minutes</label><input id="seMin" type="number" min="10" max="480" step="5" value="${s && s.minutes || 60}"></div></div>
    <div class="field"><label for="seCourse">For a course <span class="hint">(its students see it)</span></label><select id="seCourse"><option value="">Just for me</option>${courses.map(c => `<option value="${c.id}" ${s && s.course_id === c.id ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select></div>
    <div class="field"><label for="seLink">Meeting link <span class="hint">(Google Meet, Zoom, Teams…)</span></label><input id="seLink" type="url" value="${esc(s && s.link || "")}" placeholder="https://meet.google.com/…"></div>
    <div class="field"><label for="seNotes">Notes</label><textarea id="seNotes" rows="2">${esc(s && s.notes || "")}</textarea></div>
    ${isNew ? `<div class="field" style="max-width:240px"><label for="seRep">Repeat weekly</label><select id="seRep">${[1,2,4,6,8,10,12].map(n => `<option value="${n}">${n === 1 ? "Just once" : n + " weeks"}</option>`).join("")}</select></div>` : ""}
    <p class="mx-err" id="seMsg" role="alert"></p>
    <div class="mx-actions"><button class="mx-save" id="seSave">${isNew ? "Book it" : "Save"}</button><button class="mx-ghost" data-close>Cancel</button><span class="sep"></span>${isNew ? "" : `<button class="mx-ghost danger" id="seDel">Delete</button>`}</div>`,
    { onOpen: d => q("#seTitle", d).focus() });
  q("#seSave", d).addEventListener("click", async () => {
    const title = q("#seTitle", d).value.trim(), when = q("#seWhen", d).value, link = q("#seLink", d).value.trim();
    if (!title) { q("#seMsg", d).textContent = "Give it a title."; return; }
    if (!when) { q("#seMsg", d).textContent = "Choose a start time."; return; }
    if (link && !/^https?:\/\//i.test(link)) { q("#seMsg", d).textContent = "The meeting link should start with https://"; return; }
    const base = { owner:ctx.uid, title, starts_at:new Date(when).toISOString(), minutes:+q("#seMin", d).value || 60, course_id:q("#seCourse", d).value || null, link, notes:q("#seNotes", d).value.trim() };
    try {
      if (isNew) {
        const n = +(q("#seRep", d) || { value:1 }).value;
        await must(sb.from("sessions").insert(Array.from({ length:n }, (_, i) => ({ ...base, starts_at:(() => { const d = new Date(when); d.setDate(d.getDate() + i * 7); return d.toISOString(); })() }))));
      } else await must(sb.from("sessions").update(base).eq("id", s.id));
      d.close(); toast(isNew ? "Booked." : "Saved."); renderCalendar();
    } catch(e) { q("#seMsg", d).textContent = friendly(e); }
  });
  const del = q("#seDel", d); if (del) armed(del, "Delete it?", async () => { try { await must(sb.from("sessions").delete().eq("id", s.id)); d.close(); renderCalendar(); } catch(e) { toast(friendly(e), true); } });
}
