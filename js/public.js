// Public pages: course page, teacher page and certificate check. No sign-in needed.
import { $, esc, fmtDate } from "./core.js";
import { sb, friendly, site } from "./supa.js";
import { md, renderBlocks } from "./blocks.js";

const params = new URLSearchParams(location.search);
const page = document.body.dataset.page;
const root = $("pMain");
const cover = c => c.cover_url ? `<img src="${esc(c.cover_url)}" alt="">` : `<div class="cover-paint" style="--paint:${esc(c.color || "#A9CFEA")}"><span>${esc((c.title || "?").charAt(0).toUpperCase())}</span></div>`;
const fail = msg => { root.innerHTML = `<div class="paper empty-card"><h1>Not found.</h1><p>${esc(msg)}</p><a class="mx-save" href="index.html">Go to Paint the Lesson</a></div>`; };
const setMeta = (title, desc) => { document.title = title; const m = document.querySelector('meta[name="description"]'); if (m && desc) m.content = desc.slice(0,160); };

async function coursePage(){
  const slug = params.get("c"); if (!slug) return fail("This link is missing the course name.");
  const { data, error } = await sb.rpc("public_course", { p_slug:slug });
  if (error) return fail(friendly(error));
  if (!data) return fail("This course doesn't exist or isn't published yet.");
  const { course:c, teacher:t, modules, outline, students, enrolled } = data;
  setMeta(`${c.title} · Paint the Lesson`, c.subtitle || c.description || "");
  const pv = params.get("preview");
  if (pv) {
    const { data:l } = await sb.from("lessons").select("id,title,summary,blocks").eq("id", pv).maybeSingle();
    if (l) {
      root.innerHTML = `<div class="crumbs"><a href="?c=${encodeURIComponent(slug)}">${esc(c.title)}</a> / <span>Free preview</span></div>
        <article class="lesson-view solo"><header class="paper lv-head"><p class="group-label">Free preview</p><h1>${esc(l.title)}</h1>${l.summary ? `<p class="lead">${esc(l.summary)}</p>` : ""}</header>
        <div class="paper lv-body">${renderBlocks(l.blocks)}</div>
        <div class="paper lv-done"><p>Like it? Join the course to get every lesson, quizzes and a certificate.</p><div class="mx-actions">${joinBtn(c, enrolled)}</div></div></article>`;
      bindJoin(); return;
    }
  }
  const groups = [{ id:null, title:"" }, ...modules].map(m => ({ m, ls: outline.filter(x => (x.module_id || null) === m.id) })).filter(g => g.ls.length);
  let n = 0;
  root.innerHTML = `
    <header class="course-hero paper public"><div class="ch-cover big">${cover(c)}</div><div class="ch-text">
      ${c.level ? `<span class="badge-s">${esc(c.level)}</span>` : ""}
      <h1>${esc(c.title)}</h1>${c.subtitle ? `<p class="lead">${esc(c.subtitle)}</p>` : ""}
      <p class="meta">${outline.length} ${outline.length === 1 ? "lesson" : "lessons"}${outline.some(x => x.has_quiz) ? " · quizzes" : ""}${c.certificate ? " · certificate of completion" : ""}${students ? ` · ${students} ${students === 1 ? "student" : "students"}` : ""}</p>
      <div class="mx-actions">${joinBtn(c, enrolled)}</div>
    </div></header>
    <div class="pub-grid">
      <section class="paper pub-about"><h2 class="le-h">About this course</h2><div class="prose">${md(c.description || c.subtitle || "")}</div>
        <h2 class="le-h">What's inside</h2>
        ${groups.map(g => `${g.m.title ? `<p class="ol-mod">${esc(g.m.title)}</p>` : ""}<ol class="ol pub">${g.ls.map(x => { n++; return `<li class="ol-i open"><span><i class="ol-dot">${n}</i><span class="ol-t">${esc(x.title)}${x.summary ? `<small>${esc(x.summary)}</small>` : ""}</span></span>
          ${x.is_preview ? `<a class="badge-s on" href="?c=${encodeURIComponent(slug)}&preview=${x.id}">Free preview</a>` : ""}</li>`; }).join("")}</ol>`).join("")}
      </section>
      <aside class="paper pub-teacher">${t.photo ? `<img class="pf-photo" src="${esc(t.photo)}" alt="">` : `<div class="face">${esc((t.name || "?").charAt(0))}</div>`}
        <p class="group-label">Your teacher</p><h2>${esc(t.name || "")}</h2>${t.city || t.country ? `<p class="hint-line">${esc([t.city, t.country].filter(Boolean).join(", "))}</p>` : ""}
        <div class="prose">${md(t.bio || "")}</div>${t.slug ? `<a class="mx-ghost" href="teacher.html?t=${encodeURIComponent(t.slug)}">More from ${esc((t.name || "").split(" ")[0])}</a>` : ""}</aside>
    </div>`;
  bindJoin();
}
function joinBtn(c, enrolled){
  if (enrolled) return `<a class="mx-save" href="learn.html#c/${c.id}">Go to the course</a>`;
  if (c.open_enrolment) return `<a class="paint-btn" href="learn.html?enrol=${c.id}">Join for free</a>`;
  return `<form class="ask join-inline" id="pubJoin"><input type="text" maxlength="12" placeholder="Class code" aria-label="Class code" autocapitalize="characters"><button class="mx-save">Join with a code</button></form><p class="hint-line">Ask the teacher for the class code.</p>`;
}
function bindJoin(){
  const f = $("pubJoin"); if (!f) return;
  f.addEventListener("submit", e => { e.preventDefault(); const v = f.querySelector("input").value.trim(); if (v) location.href = "learn.html?join=" + encodeURIComponent(v); });
}

async function teacherPage(){
  const slug = params.get("t"); if (!slug) return fail("This link is missing the teacher's name.");
  const { data, error } = await sb.rpc("public_teacher", { p_slug:slug });
  if (error) return fail(friendly(error));
  if (!data) return fail("We couldn't find this teacher.");
  const { teacher:t, courses } = data;
  setMeta(`${t.name} · Paint the Lesson`, t.bio || "");
  root.innerHTML = `<header class="paper teacher-hero">${t.photo ? `<img class="pf-photo big" src="${esc(t.photo)}" alt="">` : `<div class="face">${esc((t.name || "?").charAt(0))}</div>`}
    <div><p class="group-label">English teacher</p><h1>${esc(t.name)}</h1>${t.city || t.country ? `<p class="hint-line">${esc([t.city, t.country].filter(Boolean).join(", "))}</p>` : ""}<div class="prose">${md(t.bio || "")}</div></div></header>
    <h2 class="sub-h">Courses</h2>
    ${courses.length ? `<div class="course-grid">${courses.map(c => `<a class="paper course-card" href="course.html?c=${encodeURIComponent(c.slug || c.id)}"><div class="cc-cover">${cover(c)}</div>
      <div class="cc-info"><h2>${esc(c.title)}</h2>${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ""}<p class="meta">${c.level ? esc(c.level) + " · " : ""}${c.lessons} lessons</p></div></a>`).join("")}</div>`
      : `<p class="lib-empty">No published courses yet.</p>`}`;
}

async function verifyPage(){
  const id = params.get("id");
  root.innerHTML = `<section class="paper verify"><h1>Check a certificate.</h1><p class="hint-line">Type the certificate number printed at the bottom of the certificate.</p>
    <form class="ask" id="vf"><input id="vId" type="text" value="${esc(id || "")}" placeholder="e.g. 3f1c…" aria-label="Certificate number"><button class="mx-save">Check</button></form><div id="vRes" aria-live="polite"></div></section>`;
  const check = async v => {
    const res = $("vRes");
    if (!/^[0-9a-f-]{36}$/i.test(v)) { res.innerHTML = `<p class="mx-err">That isn't a valid certificate number.</p>`; return; }
    const { data, error } = await sb.rpc("verify_certificate", { p_id:v });
    if (error) { res.innerHTML = `<p class="mx-err">${esc(friendly(error))}</p>`; return; }
    res.innerHTML = data ? `<div class="cert-ok"><p class="done-t">✓ This certificate is genuine.</p><p><b>${esc(data.student_name)}</b> completed <b>${esc(data.course_title)}</b>${data.teacher_name ? ` with ${esc(data.teacher_name)}` : ""} on ${fmtDate(data.issued_at, { day:"numeric", month:"long", year:"numeric" })}.</p></div>`
      : `<p class="mx-err">No certificate has this number.</p>`;
  };
  $("vf").addEventListener("submit", e => { e.preventDefault(); check($("vId").value.trim()); });
  if (id) check(id);
}

({ course:coursePage, teacher:teacherPage, verify:verifyPage })[page]().catch(e => fail(friendly(e)));
