// Student portal: join with a code, follow lessons, take quizzes, send homework, discuss, get a certificate.
import { $, esc, toast, fmtDate, fmtTime, dialog, saveBlob, icsFor, armed } from "./core.js";
import { sb, signIn, loadProfile, friendly, signOut, uploadFile, site } from "./supa.js";
import { md, renderBlocks } from "./blocks.js";
import { certificatePdf } from "./exports.js";

const params = new URLSearchParams(location.search);
const PREVIEW = params.get("preview") === "1";
let user = null, profile = null;
const main = () => $("lMain");
async function must(p){ const r = await p; if (r.error) throw r.error; return r.data; }
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const cover = c => c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" loading="lazy">` : `<div class="cover-paint" style="--paint:${esc(c.color || "#A9CFEA")}"><span>${esc((c.title || "?").charAt(0).toUpperCase())}</span></div>`;

/* ---------- Home: my courses ---------- */
async function home(){
  const m = main();
  m.innerHTML = `<header class="page-head"><div><h1>Hello, ${esc((profile.name || "").split(" ")[0] || "there")}.</h1><p>Your courses, live lessons and certificates.</p></div></header>
    <div class="learn-home">
      <div><div class="course-grid" id="myCourses"><p class="lib-empty">Loading…</p></div></div>
      <aside class="learn-side">
        <form class="paper join-card" id="joinForm"><h2 class="le-h">Join a course</h2><p class="hint-line">Type the class code from your teacher.</p>
          <div class="ask"><input id="joinCode" type="text" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="e.g. 7F3K2A" aria-label="Class code"><button class="mx-save">Join</button></div>
          <p class="mx-err" id="joinMsg" role="alert"></p></form>
        <section class="paper join-card"><div class="le-row"><h2 class="le-h">Live lessons</h2><span class="sep"></span><button class="mx-ghost sm" id="icsBtn" hidden>Add to calendar</button></div><div id="mySessions"><p class="hint-line">Loading…</p></div></section>
        <section class="paper join-card"><h2 class="le-h">Certificates</h2><div id="myCerts"><p class="hint-line">Loading…</p></div></section>
      </aside>
    </div>`;
  $("joinForm").addEventListener("submit", async e => {
    e.preventDefault(); const code = $("joinCode").value.trim(); if (!code) return;
    try { const r = await must(sb.rpc("join_course", { p_code:code })); toast(`You joined ${r.title}.`); location.hash = "#c/" + r.id; }
    catch(err) { $("joinMsg").textContent = friendly(err); }
  });
  let enr = [];
  try { enr = await must(sb.from("enrolments").select("course_id,enrolled_at").eq("student_id", user.id)); }
  catch(e) { $("myCourses").innerHTML = `<p class="lib-empty">${esc(friendly(e))}</p>`; return; }
  const ids = enr.map(e => e.course_id);
  if (!ids.length) { $("myCourses").innerHTML = `<div class="lib-empty"><p>You haven't joined a course yet. Ask your teacher for a class code or an invite link.</p></div>`; }
  else {
    const [courses, lessons, prog] = await Promise.all([
      must(sb.from("courses").select("*").in("id", ids)),
      must(sb.from("lessons").select("id,course_id").in("course_id", ids)),
      must(sb.from("progress").select("lesson_id,course_id").eq("student_id", user.id))
    ]).catch(() => [[],[],[]]);
    const outlines = await Promise.all(ids.map(id => must(sb.rpc("course_outline", { p_course:id })).catch(() => [])));
    $("myCourses").innerHTML = courses.map(c => {
      const o = outlines[ids.indexOf(c.id)] || [], done = o.filter(x => x.done).length, total = o.length;
      const next = o.find(x => !x.done && new Date(x.unlock_at) <= new Date());
      return `<a class="paper course-card" href="#c/${c.id}"><div class="cc-cover">${cover(c)}</div>
        <div class="cc-info"><h2>${esc(c.title)}</h2>${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ""}
        <p class="meta">${done}/${total} lessons · ${pct(done,total)}%</p><span class="bar"><i style="width:${pct(done,total)}%"></i></span>
        ${next ? `<p class="meta next">Next: ${esc(next.title)}</p>` : total && done >= total ? `<p class="meta next">Finished</p>` : ""}</div></a>`;
    }).join("");
  }
  // Live lessons
  try {
    const ss = ids.length ? await must(sb.from("sessions").select("*").in("course_id", ids).gte("starts_at", new Date(Date.now() - 2*3600e3).toISOString()).order("starts_at").limit(10)) : [];
    $("mySessions").innerHTML = ss.length ? `<ul class="up-list">${ss.map(s => `<li><b>${esc(s.title)}</b><small>${fmtDate(s.starts_at, { weekday:"short", day:"numeric", month:"short" })}, ${fmtTime(s.starts_at)} · ${s.minutes} min</small>${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">Join the lesson</a>` : ""}${s.notes ? `<small>${esc(s.notes)}</small>` : ""}</li>`).join("")}</ul>` : `<p class="hint-line">No live lessons booked.</p>`;
    if (ss.length) { $("icsBtn").hidden = false; $("icsBtn").addEventListener("click", () => saveBlob(icsFor(ss, "My lessons"), "my-lessons.ics")); }
  } catch(e) { $("mySessions").innerHTML = `<p class="hint-line">${esc(friendly(e))}</p>`; }
  try {
    const cs = await must(sb.from("certificates").select("*").eq("student_id", user.id).order("issued_at", { ascending:false }));
    $("myCerts").innerHTML = cs.length ? `<ul class="up-list">${cs.map(c => `<li><b>${esc(c.course_title)}</b><small>${fmtDate(c.issued_at)}</small><button class="linkish" data-cert="${c.id}">Download PDF</button></li>`).join("")}</ul>` : `<p class="hint-line">Finish a course to get a certificate.</p>`;
    $("myCerts").querySelectorAll("[data-cert]").forEach(b => b.addEventListener("click", () => {
      const c = cs.find(x => x.id === b.dataset.cert); certificatePdf(c, site("verify.html") + "?id=" + c.id).catch(() => toast("The certificate couldn't be built. Try again.", true));
    }));
  } catch(e) { $("myCerts").innerHTML = ""; }
}

/* ---------- One course ---------- */
let cur = null; // { course, outline, modules }
async function loadCourse(id){
  const [course, outline, modules] = await Promise.all([
    must(sb.from("courses").select("*").eq("id", id).single()),
    must(sb.rpc("course_outline", { p_course:id })),
    must(sb.from("modules").select("*").eq("course_id", id).order("position"))
  ]);
  if (PREVIEW) outline.forEach(x => { x.unlock_at = new Date(0).toISOString(); });
  cur = { course, outline, modules };
  return cur;
}
function isOpen(x){ return x.unlock_at && new Date(x.unlock_at) <= new Date(); }
function outlineHTML(activeId){
  const { outline, modules } = cur;
  const groups = [{ id:null, title:"" }, ...modules].map(m => ({ m, ls: outline.filter(x => (x.module_id || null) === m.id || (!m.id && x.module_id && !modules.some(mm => mm.id === x.module_id))) })).filter(g => g.ls.length);
  let n = 0;
  return groups.map(g => `${g.m.title ? `<p class="ol-mod">${esc(g.m.title)}</p>` : ""}<ol class="ol">${g.ls.map(x => { n++;
    const open = isOpen(x), state = x.done ? "done" : open ? "open" : "locked";
    return `<li class="ol-i ${state} ${x.id === activeId ? "on" : ""}">${open ? `<a href="#c/${cur.course.id}/${x.id}">` : `<span>`}
      <i class="ol-dot" aria-hidden="true">${x.done ? "✓" : open ? n : "🔒"}</i><span class="ol-t">${esc(x.title)}${!open && x.unlock_at ? `<small>Opens ${fmtDate(x.unlock_at)}</small>` : ""}${x.has_quiz ? `<small>Quiz</small>` : ""}</span>${open ? "</a>" : "</span>"}</li>`; }).join("")}</ol>`).join("");
}
async function coursePage(id){
  const m = main(); m.innerHTML = `<p class="lib-empty">Loading…</p>`;
  try { await loadCourse(id); } catch(e) { m.innerHTML = `<p class="lib-empty">${esc(friendly(e))} <a href="#">Back to my courses</a></p>`; return; }
  const { course:c, outline } = cur;
  const done = outline.filter(x => x.done).length, total = outline.length;
  const next = outline.find(x => !x.done && isOpen(x));
  let teacher = null; try { teacher = await must(sb.from("profiles").select("name,photo,bio").eq("id", c.owner).maybeSingle()); } catch(e) {}
  m.innerHTML = `${PREVIEW ? previewBanner() : `<div class="crumbs"><a href="#">My courses</a> / <span>${esc(c.title)}</span></div>`}
    <header class="course-hero paper"><div class="ch-cover big">${cover(c)}</div><div class="ch-text">
      <h1>${esc(c.title)}</h1>${c.subtitle ? `<p class="lead">${esc(c.subtitle)}</p>` : ""}
      ${teacher ? `<p class="by">${teacher.photo ? `<img class="av" src="${esc(teacher.photo)}" alt="">` : ""} with <b>${esc(teacher.name)}</b></p>` : ""}
      <p class="meta">${done}/${total} lessons complete</p><span class="bar big"><i style="width:${pct(done,total)}%"></i></span>
      <div class="mx-actions">${next ? `<a class="mx-save" href="#c/${c.id}/${next.id}">${done ? "Continue" : "Start"}: ${esc(next.title)}</a>` : ""}
      ${c.certificate && total && done >= total ? `<button class="mx-save" id="certBtn">Get your certificate</button>` : ""}
      ${!PREVIEW ? `<span class="sep"></span><button class="mx-ghost sm danger" id="leaveBtn">Leave course</button>` : ""}</div>
    </div></header>
    <div class="learn-course"><nav class="paper outline" aria-label="Lessons">${outlineHTML(null)}</nav>
      <section class="paper about-course prose">${md(c.description || "")}${!c.description ? `<p class="hint-line">Choose a lesson to begin.</p>` : ""}
      ${c.certificate ? `<p class="hint-line">Finish every lesson to receive a certificate of completion.</p>` : ""}</section></div>`;
  const cb = $("certBtn"); if (cb) cb.addEventListener("click", () => claimCert(c));
  const lb = $("leaveBtn"); if (lb) armed(lb, "Leave and lose your place?", async () => {
    try { await must(sb.from("enrolments").delete().eq("course_id", c.id).eq("student_id", user.id)); toast("You left the course."); location.hash = ""; } catch(e) { toast(friendly(e), true); }
  });
}
async function claimCert(c){
  try { const cert = await must(sb.rpc("claim_certificate", { p_course:c.id }));
    await certificatePdf(cert, site("verify.html") + "?id=" + cert.id); toast("Certificate downloaded. Well done!"); }
  catch(e) { toast(friendly(e), true); }
}
const previewBanner = () => `<div class="preview-banner"><b>Student preview.</b> This is what students see. Quiz answers are checked here but nothing is saved. <button class="linkish" onclick="window.close()">Close</button></div>`;

/* ---------- One lesson ---------- */
async function lessonPage(cid, lid){
  const m = main(); m.innerHTML = `<p class="lib-empty">Loading…</p>`;
  try { if (!cur || cur.course.id !== cid) await loadCourse(cid); else cur.outline = PREVIEW ? cur.outline : await must(sb.rpc("course_outline", { p_course:cid })); }
  catch(e) { m.innerHTML = `<p class="lib-empty">${esc(friendly(e))}</p>`; return; }
  let l;
  try { l = await must(sb.from("lessons").select("*").eq("id", lid).maybeSingle()); } catch(e) { l = null; }
  const oi = cur.outline.findIndex(x => x.id === lid), o = cur.outline[oi];
  if (!l) { m.innerHTML = `<p class="lib-empty">${o && !isOpen(o) ? `This lesson opens on ${fmtDate(o.unlock_at)}.` : "This lesson isn't available."} <a href="#c/${cid}">Back to the course</a></p>`; return; }
  const prev = cur.outline.slice(0, oi).reverse().find(isOpen), next = cur.outline.slice(oi + 1).find(isOpen);
  const questions = (l.quiz && l.quiz.questions) || [];
  let subs = [];
  if (!PREVIEW) try { subs = await must(sb.from("submissions").select("*").eq("lesson_id", lid).eq("student_id", user.id).order("created_at", { ascending:false })); } catch(e) {}
  const passed = subs.some(s => s.kind === "quiz" && s.passed), done = o && o.done;
  m.innerHTML = `${PREVIEW ? previewBanner() : `<div class="crumbs"><a href="#">My courses</a> / <a href="#c/${cid}">${esc(cur.course.title)}</a></div>`}
  <div class="learn-course">
    <nav class="paper outline" aria-label="Lessons"><a class="ol-back" href="#c/${cid}">${esc(cur.course.title)}</a>${outlineHTML(lid)}</nav>
    <article class="lesson-view">
      <header class="paper lv-head"><p class="group-label">Lesson ${oi + 1} of ${cur.outline.length}</p><h1>${esc(l.title)}</h1>${l.summary ? `<p class="lead">${esc(l.summary)}</p>` : ""}</header>
      <div class="paper lv-body">${renderBlocks(l.blocks) || `<p class="hint-line">This lesson has no content yet.</p>`}</div>
      ${questions.length ? `<section class="paper lv-quiz" id="quizBox"></section>` : ""}
      ${l.homework ? `<section class="paper lv-hw" id="hwBox"></section>` : ""}
      <div class="paper lv-done">
        ${done ? `<p class="done-t">✓ You completed this lesson.</p>` : questions.length && !passed ? `<p class="hint-line">Pass the quiz (${cur.course.pass_mark}% or more) to complete this lesson.</p>` : ""}
        <div class="mx-actions">${prev ? `<a class="mx-ghost" href="#c/${cid}/${prev.id}">‹ Previous</a>` : ""}<span class="sep"></span>
          ${!done && !PREVIEW ? `<button class="mx-save" id="doneBtn" ${questions.length && !passed ? "disabled" : ""}>Mark as complete</button>` : ""}
          ${next ? `<a class="${done ? "mx-save" : "mx-ghost"}" href="#c/${cid}/${next.id}">Next lesson ›</a>` : ""}</div>
      </div>
      <section class="paper lv-cmts" id="cmtBox"></section>
    </article>
  </div>`;
  if (questions.length) drawQuiz(l, questions, subs);
  if (l.homework) drawHomework(l, subs);
  drawComments(l);
  const db = $("doneBtn");
  if (db) db.addEventListener("click", async () => {
    db.disabled = true;
    try { await must(sb.rpc("complete_lesson", { p_lesson:l.id })); toast("Lesson complete.");
      cur.outline = await must(sb.rpc("course_outline", { p_course:cid }));
      const all = cur.outline.every(x => x.done);
      if (all && cur.course.certificate) { toast("You finished the course! Get your certificate on the course page."); location.hash = "#c/" + cid; }
      else if (next) location.hash = `#c/${cid}/${next.id}`; else lessonPage(cid, lid);
    } catch(e) { toast(friendly(e), true); db.disabled = false; }
  });
}

function drawQuiz(l, questions, subs){
  const box = $("quizBox"); const last = subs.find(s => s.kind === "quiz");
  const best = subs.filter(s => s.kind === "quiz").reduce((a, s) => Math.max(a, s.max_score ? s.score / s.max_score : 0), -1);
  box.innerHTML = `<div class="le-row"><h2 class="le-h">Quiz</h2><span class="sep"></span>${best >= 0 ? `<span class="badge-s ${subs.some(s => s.kind === "quiz" && s.passed) ? "on" : "warn"}">Best ${Math.round(best * 100)}%</span>` : ""}</div>
    <form id="quizForm" class="quiz">${questions.map((x, i) => `<fieldset class="qz" data-q="${esc(x.id)}"><legend><b>${i + 1}.</b> ${esc(x.q)}</legend>
      ${x.type === "short" ? `<input type="text" name="${esc(x.id)}" autocomplete="off" aria-label="Your answer">`
        : `<ul>${x.options.map((o, k) => `<li><label><input type="${x.type === "multi" ? "checkbox" : "radio"}" name="${esc(x.id)}" value="${k}"> ${esc(o)}</label></li>`).join("")}</ul>${x.type === "multi" ? `<p class="hint-line">Choose all that are right.</p>` : ""}`}
      <p class="qz-fb" aria-live="polite"></p></fieldset>`).join("")}
      <div class="mx-actions"><button class="mx-save" id="quizGo">Check my answers</button><p class="mx-err" id="quizMsg" role="status"></p></div></form>`;
  $("quizForm").addEventListener("submit", async e => {
    e.preventDefault();
    const answers = {};
    for (const x of questions) {
      if (x.type === "short") answers[x.id] = (box.querySelector(`input[name="${CSS.escape(x.id)}"]`).value || "").trim();
      else if (x.type === "multi") answers[x.id] = [...box.querySelectorAll(`input[name="${CSS.escape(x.id)}"]:checked`)].map(i => +i.value);
      else { const c = box.querySelector(`input[name="${CSS.escape(x.id)}"]:checked`); answers[x.id] = c ? +c.value : null; }
    }
    const missing = questions.filter(x => answers[x.id] === null || answers[x.id] === "" || (Array.isArray(answers[x.id]) && !answers[x.id].length)).length;
    if (missing) { $("quizMsg").textContent = `Answer every question first (${missing} left).`; return; }
    $("quizGo").disabled = true; $("quizMsg").textContent = "";
    try {
      let r;
      if (PREVIEW) r = await previewMark(l, questions, answers);
      else r = await must(sb.rpc("submit_quiz", { p_lesson:l.id, p_answers:answers }));
      questions.forEach(x => {
        const fs = box.querySelector(`[data-q="${CSS.escape(x.id)}"]`), res = r.results[x.id] || {}, fb = fs.querySelector(".qz-fb");
        fs.classList.toggle("right", !!res.correct); fs.classList.toggle("wrong", !res.correct);
        const ans = res.answer || [];
        fb.textContent = res.correct ? "Correct." : x.type === "short" ? `Answer: ${ans.join(" / ")}` : `Answer: ${ans.map(k => x.options[k]).join(", ")}`;
      });
      $("quizMsg").textContent = `${r.score} of ${r.max} right (${r.percent}%). ${r.passed ? "You passed!" : `You need ${r.pass_mark}% to pass. Try again.`}`;
      $("quizMsg").classList.toggle("ok", r.passed);
      $("quizGo").textContent = "Try again"; $("quizGo").disabled = false;
      const db = $("doneBtn"); if (db && r.passed) db.disabled = false;
      $("quizGo").onclick = ev => { if ($("quizGo").textContent === "Try again") { ev.preventDefault(); box.querySelectorAll(".qz").forEach(f => { f.classList.remove("right","wrong"); f.querySelector(".qz-fb").textContent = ""; }); $("quizGo").textContent = "Check my answers"; $("quizMsg").textContent = ""; } };
    } catch(err) { $("quizMsg").textContent = friendly(err); $("quizGo").disabled = false; }
  });
}
// Teacher preview: mark in the browser with the answer key (the teacher can read it)
async function previewMark(l, questions, answers){
  const k = (await must(sb.from("quiz_keys").select("answers").eq("lesson_id", l.id).maybeSingle()) || {}).answers || {};
  const norm = s => String(s).trim().replace(/\s+/g," ").toLowerCase();
  let got = 0; const results = {};
  questions.forEach(x => {
    const want = k[x.id] || [], given = answers[x.id];
    const ok = x.type === "short" ? want.some(a => norm(a) === norm(given)) : JSON.stringify([...(Array.isArray(given) ? given : [given])].map(Number).sort()) === JSON.stringify(want.map(Number).sort());
    if (ok) got++; results[x.id] = { correct:ok, answer:want };
  });
  const percent = Math.round(got * 100 / questions.length), pm = cur.course.pass_mark;
  return { score:got, max:questions.length, percent, passed:percent >= pm, pass_mark:pm, results };
}

function drawHomework(l, subs){
  const box = $("hwBox"), hw = subs.filter(s => s.kind === "homework");
  box.innerHTML = `<h2 class="le-h">Homework</h2><div class="prose">${md(l.homework)}</div>
    ${hw.map(s => `<div class="hw-mine"><p class="group-label">Sent ${fmtDate(s.created_at)} ${fmtTime(s.created_at)}</p><div class="prose">${md(s.body || "")}</div>${s.file_url ? `<p><a href="${esc(s.file_url)}" target="_blank" rel="noopener">Your file</a></p>` : ""}
      ${s.graded_at ? `<div class="fb-box"><b>Teacher's feedback${s.score !== null ? ` · ${s.score}/${s.max_score || 10}` : ""}</b><div class="prose">${md(s.feedback || "")}</div></div>` : `<p class="hint-line">Waiting for your teacher to mark it.</p>`}</div>`).join("")}
    ${PREVIEW ? `<p class="hint-line">Students write their answer here and can attach a file.</p>` : `<form id="hwForm"><div class="field"><label for="hwText">${hw.length ? "Send another version" : "Your answer"}</label><textarea id="hwText" rows="6"></textarea></div>
      <div class="upl"><button class="upload-btn" type="button" id="hwFileBtn">Attach a file</button><input type="file" id="hwFile" hidden><span class="hint-line" id="hwFileName">Optional: a document, photo or voice recording, up to 50 MB</span></div>
      <p class="mx-err" id="hwMsg" role="alert"></p><div class="mx-actions"><button class="mx-save" id="hwGo">Send to my teacher</button></div></form>`}`;
  if (PREVIEW) return;
  let file = null;
  $("hwFileBtn").addEventListener("click", () => $("hwFile").click());
  $("hwFile").addEventListener("change", e => { file = e.target.files[0] || null; $("hwFileName").textContent = file ? file.name : "Optional"; });
  $("hwForm").addEventListener("submit", async e => {
    e.preventDefault(); const text = $("hwText").value.trim();
    if (!text && !file) { $("hwMsg").textContent = "Write your answer or attach a file."; return; }
    if (file && file.size > 50 * 1048576) { $("hwMsg").textContent = "That file is over 50 MB."; return; }
    $("hwGo").disabled = true; $("hwGo").textContent = "Sending…";
    try {
      const file_url = file ? await uploadFile(file, user.id, "homework") : null;
      await must(sb.from("submissions").insert({ lesson_id:l.id, course_id:l.course_id, student_id:user.id, kind:"homework", body:text, file_url }));
      toast("Sent to your teacher."); lessonPage(l.course_id, l.id);
    } catch(err) { $("hwMsg").textContent = friendly(err); $("hwGo").disabled = false; $("hwGo").textContent = "Send to my teacher"; }
  });
}

async function drawComments(l){
  const box = $("cmtBox");
  let list = [];
  try { list = await must(sb.from("comments").select("*").eq("lesson_id", l.id).order("created_at")); } catch(e) {}
  box.innerHTML = `<h2 class="le-h">Questions and comments</h2>
    ${list.length ? `<ul class="cmts">${list.map(x => `<li class="${x.author_id === cur.course.owner ? "teacher" : ""} ${x.author_id === user.id ? "mine" : ""}"><div><b>${esc(x.author_name)}</b>${x.author_id === cur.course.owner ? ` <span class="badge-s">Teacher</span>` : ""} <small>${fmtDate(x.created_at)} ${fmtTime(x.created_at)}</small></div><div class="prose">${md(x.body)}</div>
      ${x.author_id === user.id ? `<button class="mx-ghost sm danger" data-cdel="${x.id}">Delete</button>` : ""}</li>`).join("")}</ul>` : `<p class="hint-line">No comments yet. Ask a question about this lesson; your teacher and classmates can answer.</p>`}
    <form class="ask cmt-form" id="cmtForm"><input type="text" id="cmtText" maxlength="4000" placeholder="Write a question or comment…" aria-label="Comment"><button class="mx-save">Post</button></form>`;
  $("cmtForm").addEventListener("submit", async e => {
    e.preventDefault(); const text = $("cmtText").value.trim(); if (!text) return;
    try { await must(sb.from("comments").insert({ lesson_id:l.id, course_id:l.course_id, body:text })); drawComments(l); } catch(err) { toast(friendly(err), true); }
  });
  box.querySelectorAll("[data-cdel]").forEach(b => armed(b, "Delete?", async () => { try { await must(sb.from("comments").delete().eq("id", b.dataset.cdel)); drawComments(l); } catch(e) { toast(friendly(e), true); } }));
}

/* ---------- Account ---------- */
function accountDialog(){
  const d = dialog(`<h2>Your account</h2>
    <div class="field"><label for="acName">Name <span class="hint">(shown to your teacher and on certificates)</span></label><input id="acName" type="text" maxlength="60" value="${esc(profile.name || "")}"></div>
    <p class="hint-line">Signed in as ${esc(user.email || "")}.</p><p class="mx-err" id="acMsg" role="alert"></p>
    <div class="mx-actions"><button class="mx-save" id="acSave">Save</button><button class="mx-ghost" data-close>Close</button><span class="sep"></span><button class="mx-ghost" id="acOut">Sign out</button></div>`);
  d.querySelector("#acSave").addEventListener("click", async () => {
    const name = d.querySelector("#acName").value.trim(); if (!name) { d.querySelector("#acMsg").textContent = "Add your name."; return; }
    try { profile = await must(sb.from("profiles").update({ name, updated_at:new Date().toISOString() }).eq("id", user.id).select().single()); $("lName").textContent = profile.name; d.close(); toast("Saved."); }
    catch(e) { d.querySelector("#acMsg").textContent = friendly(e); }
  });
  d.querySelector("#acOut").addEventListener("click", signOut);
}

/* ---------- Router ---------- */
function route(){
  const [a, b, c] = location.hash.replace(/^#/,"").split("/");
  window.scrollTo(0, 0);
  if (a === "c" && b && c) lessonPage(b, c);
  else if (a === "c" && b) coursePage(b);
  else home();
}

(async () => {
  const join = params.get("join"), enrol = params.get("enrol");
  user = await signIn($("authMount"), {
    title: join ? "Sign in to join your course." : "Sign in to your courses.",
    upTitle: join ? "Create your account to join." : "Create your student account.",
    lead: join ? `Your class code is ${join.toUpperCase()}. Sign in or create a free account, and you'll join straight away.` : "Your lessons, quizzes and homework, all in one place.",
    mode: join || enrol ? "up" : "in"
  });
  try { profile = await loadProfile(user.id); }
  catch(e) { $("authMount").innerHTML = `<h1>Almost there.</h1><p class="gate-lead">${esc(friendly(e))}</p>`; return; }
  $("lGate").hidden = true; $("lApp").hidden = false;
  $("lName").textContent = profile.name || "Account";
  $("lAcct").addEventListener("click", accountDialog);
  if (profile.is_teacher) $("lTeach").hidden = false;
  if (join || enrol) {
    try {
      const r = join ? await must(sb.rpc("join_course", { p_code:join })) : await must(sb.rpc("enrol_open", { p_course:enrol }));
      toast(`You joined ${r.title}.`); history.replaceState(null, "", location.pathname + "#c/" + r.id);
    } catch(e) { toast(friendly(e), true); history.replaceState(null, "", location.pathname); }
  } else if (params.get("course")) {
    const lesson = params.get("lesson");
    history.replaceState(null, "", location.pathname + (PREVIEW ? "?preview=1" : "") + "#c/" + params.get("course") + (lesson ? "/" + lesson : ""));
  }
  window.addEventListener("hashchange", route);
  route();
})();
