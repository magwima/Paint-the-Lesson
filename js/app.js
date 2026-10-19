// Teacher app: sign-in, profile and AI settings, and the page router.
import { $, esc, SECTIONS, ICONS, toast, slugify, armed } from "./core.js";
import { sb, signIn, loadProfile, friendly, signOut, uploadFile, site } from "./supa.js";
import { PROVIDERS, getAI, setAI, clearAI, testAI } from "./ai.js";
import { initStudio, renderLibrary, studioKeyChanged } from "./studio.js";
import { initCourses, renderCourses, renderCourse, renderLessonEditor, renderCalendar, addToCourse, lessonDirty } from "./courses.js";

const LANGS = ["English","Polski","Español","Deutsch","Français","Italiano","Português","Čeština","Українська","Türkçe"];
const COUNTRIES = ["Poland","United Kingdom","Ireland","United States","Canada","Germany","Czechia","Slovakia","Ukraine","Lithuania","Spain","France","Italy","Portugal","Netherlands","Belgium","Austria","Switzerland","Sweden","Norway","Denmark","Finland","Romania","Hungary","Greece","Turkey","Brazil","Mexico","Argentina","Japan","South Korea","China","Vietnam","Thailand","India","United Arab Emirates","Saudi Arabia","Egypt","Nigeria","Kenya","South Africa","Australia","New Zealand"];
let user = null, profile = null;

/* ---- Living paint behind the sign-in card ---- */
(function buildPaintBg(){
  const bg = $("paintBg"); if (!bg) return;
  const spots = [[9,17],[31,13],[69,13],[91,19],[6,50],[94,50],[11,83],[50,89],[89,82]];
  const strokes = [[-6,27,-8],[62,21,6],[-4,70,5],[60,76,-5]];
  const paints = SECTIONS.map(x => x.paint);
  strokes.forEach(([x,y,r], i) => {
    const st = document.createElement("div"); st.className = "pb-stroke";
    st.style.cssText = `left:${x}%;top:${y}%;--rot:${r}deg;--paint:${paints[(i*2+1) % paints.length]};--dur:${10 + i*1.3}s;--delay:${0.4 + i*1.6}s`;
    bg.appendChild(st);
  });
  SECTIONS.forEach((sec, i) => {
    const [x,y] = spots[i % spots.length];
    const sc = document.createElement("div"); sc.className = "pb-scoop";
    sc.style.cssText = `left:${x}%;top:${y}%;--paint:${sec.paint};--dur:${8.5 + (i % 4) * 1.1}s;--delay:${(i * 0.55).toFixed(2)}s`;
    sc.innerHTML = `<div class="pb-blob"><svg viewBox="0 0 24 24">${ICONS[sec.key]}</svg></div><span class="pb-label"></span>`;
    sc.querySelector(".pb-label").textContent = sec.name;
    bg.appendChild(sc);
  });
})();

/* ---- Views and routes ---- */
const VIEWS = ["studio","lib","courses","course","lesson","calendar","profile","editor"];
const VID = { studio:"vStudio", lib:"vLib", courses:"vCourses", course:"vCourse", lesson:"vLessonEd", calendar:"vCalendar", profile:"vProfile", editor:"vEditor" };
let view = "gate";
function showView(v){
  view = v;
  $("vGate").hidden = v !== "gate";
  $("appWrap").hidden = v === "gate" || v === "editor";
  VIEWS.forEach(k => { const el = $(VID[k]); if (el) el.hidden = k !== v; });
  const navOf = { studio:"navStudio", lib:"navLib", editor:"navLib", courses:"navCourses", course:"navCourses", lesson:"navCourses", calendar:"navCal" };
  ["navStudio","navLib","navCourses","navCal"].forEach(id => $(id).setAttribute("aria-pressed", String(navOf[v] === id)));
  $("navAcct").setAttribute("aria-pressed", String(v === "profile"));
  document.body.classList.toggle("wide-view", ["course","lesson","calendar","courses"].includes(v));
}
function go(v){
  if (v === "editor") { showView("editor"); window.scrollTo(0,0); return; }
  const hash = { studio:"#studio", lib:"#classes", courses:"#courses", calendar:"#calendar", profile:"#profile" }[v] || "#studio";
  if (location.hash !== hash) location.hash = hash; else route();
}
let lastHash = "";
async function route(){
  if (!profile) return;
  const h = location.hash.replace(/^#/,"") || "studio";
  if (lessonDirty() && !h.startsWith("lesson/") && !confirm("You have unsaved changes in this lesson. Leave without saving?")) { history.replaceState(null, "", "#" + lastHash); return; }
  lastHash = h;
  const [a, b, c] = h.split("/");
  window.scrollTo(0,0);
  if (a === "classes") { showView("lib"); renderLibrary(); }
  else if (a === "courses") { showView("courses"); renderCourses(); }
  else if (a === "course" && b) { showView("course"); renderCourse(b, c); }
  else if (a === "lesson" && b) { showView("lesson"); renderLessonEditor(b); }
  else if (a === "calendar") { showView("calendar"); renderCalendar(); }
  else if (a === "profile") { showView("profile"); renderProfile(false); }
  else showView("studio");
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", e => { if (lessonDirty()) { e.preventDefault(); e.returnValue = ""; } });

/* ---- Avatars ---- */
function initialsSrc(name){
  const ini = String(name || "?").trim().split(/\s+/).map(w => w[0] || "").join("").slice(0,2).toUpperCase() || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#1F2A44"/><text x="48" y="60" font-family="Georgia, serif" font-size="38" font-weight="700" fill="#fff" text-anchor="middle">${ini.replace(/[<&>]/g,"")}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
const avatarSrc = p => (p && p.photo) || initialsSrc(p && p.name);
function paintNav(){ $("navAvatar").src = avatarSrc(profile); $("navName").textContent = (profile && profile.name) || "Teacher"; }

/* ---- Profile and AI settings ---- */
function renderProfile(onboarding){
  const p = profile || {}, ai = getAI();
  const v = $("vProfile");
  v.innerHTML = `<header class="page-head"><div><h1>${onboarding ? "Welcome. Set up your profile." : "Your profile."}</h1>
    <p>${onboarding ? "Check your details and add an AI key, then paint your first lesson." : "How you appear to students, and the AI that paints your lessons."}</p></div></header>
  <div class="profile-grid">
  <section class="paper profile-card" aria-label="Profile">
    <h2 class="le-h">About you</h2>
    <div class="pf-photo-row">
      <img id="pfPhoto" class="pf-photo" alt="Your profile picture" src="${esc(avatarSrc(p))}">
      <div><p class="group-label">Profile picture</p><div class="pf-photo-btns">
        <button class="swatch" id="pfUp" type="button">Upload a photo</button><button class="swatch" id="pfIni" type="button">Use initials</button></div>
        <input type="file" id="pfFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden></div>
    </div>
    <div class="field"><label for="pfName">Name</label><input id="pfName" type="text" maxlength="60" autocomplete="name" value="${esc(p.name || "")}"></div>
    <div class="pf-two">
      <div class="field"><label for="pfCountry">Country</label><input id="pfCountry" type="text" list="pfCountries" maxlength="60" value="${esc(p.country || "")}"><datalist id="pfCountries">${COUNTRIES.map(c => `<option value="${c}">`).join("")}</datalist></div>
      <div class="field"><label for="pfCity">City <span class="hint">(optional)</span></label><input id="pfCity" type="text" maxlength="60" value="${esc(p.city || "")}"></div>
    </div>
    <div class="field"><label for="pfLang">Language for teacher notes</label><select id="pfLang">${LANGS.map(l => `<option ${l === (p.lang || "English") ? "selected" : ""}>${l}</option>`).join("")}</select>
      <p class="hint-line">Teacher notes in your lessons are written in this language. Student material stays in English.</p></div>
    <div class="field"><label for="pfBio">About you <span class="hint">(shown on your teacher page and course pages)</span></label><textarea id="pfBio" rows="4" maxlength="1200">${esc(p.bio || "")}</textarea></div>
    <div class="field"><label for="pfSlug">Your teacher page</label><div class="slug"><span>${esc(site("teacher.html"))}?t=</span><input id="pfSlug" type="text" maxlength="40" value="${esc(p.slug || "")}" placeholder="${esc(slugify(p.name || "my-name"))}"></div>
      <p class="hint-line">${p.slug ? `<a href="teacher.html?t=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Open your teacher page</a> · it lists your published courses.` : "Choose a short name to get a public page listing your published courses."}</p></div>
    <p class="mx-err" id="pfMsg" role="alert"></p>
    <div class="mx-actions"><button class="mx-save" id="pfSave">${onboarding ? "Save and continue" : "Save profile"}</button></div>
  </section>
  <section class="paper profile-card" aria-label="AI">
    <h2 class="le-h">AI</h2>
    <p class="hint-line big">Paint the Lesson writes with your own AI key. It stays in this browser and goes only to the AI company you choose, never to our database. Google Gemini gives free keys.</p>
    <div class="field"><p class="group-label">Provider</p><div class="swatches" id="aiProv">${Object.entries(PROVIDERS).map(([k,x]) => `<button class="swatch" type="button" data-prov="${k}" aria-pressed="${k === ai.provider}">${esc(x.name)}</button>`).join("")}</div></div>
    <ol class="key-steps" id="aiSteps"></ol>
    <div class="field"><label for="aiKey">API key</label><div class="ask"><input id="aiKey" type="password" autocomplete="off" spellcheck="false" value="${esc(ai.key)}" placeholder="Paste your key"><button class="mx-ghost" id="aiShow" type="button">Show</button></div></div>
    <div class="field"><label for="aiModel">Model</label><input id="aiModel" type="text" list="aiModels" value="${esc(ai.model)}"><datalist id="aiModels"></datalist>
      <p class="hint-line" id="aiModelHint"></p></div>
    <p class="mx-err" id="aiMsg" role="status" aria-live="polite"></p>
    <div class="mx-actions"><button class="mx-save" id="aiSave">Save and test</button><span class="sep"></span><button class="mx-ghost danger" id="aiForget" type="button">Remove key from this browser</button></div>
  </section>
  ${onboarding ? "" : `<section class="paper profile-card" aria-label="Account">
    <h2 class="le-h">Account</h2>
    <p class="hint-line big">Signed in as <b>${esc(user.email || "")}</b>. Students sign in at <a href="learn.html" target="_blank" rel="noopener">${esc(site("learn.html"))}</a>.</p>
    <div class="mx-actions"><button class="mx-ghost" id="pfOut">Sign out</button><span class="sep"></span><button class="mx-ghost danger" id="pfDel">Delete my classes and courses</button></div>
  </section>`}
  </div>`;
  let photo = p.photo || "";
  $("pfUp").addEventListener("click", () => $("pfFile").click());
  $("pfIni").addEventListener("click", () => { photo = ""; $("pfPhoto").src = initialsSrc($("pfName").value); });
  $("pfName").addEventListener("input", () => { if (!photo) $("pfPhoto").src = initialsSrc($("pfName").value); });
  $("pfFile").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 15 * 1048576) { $("pfMsg").textContent = "That image is over 15 MB. Choose a smaller one."; return; }
    try {
      const bmp = await createImageBitmap(f); const S = 256, c = document.createElement("canvas"); c.width = c.height = S;
      const side = Math.min(bmp.width, bmp.height); c.getContext("2d").drawImage(bmp, (bmp.width-side)/2, (bmp.height-side)/2, side, side, 0, 0, S, S);
      const blob = await new Promise(r => c.toBlob(r, "image/jpeg", .86));
      photo = await uploadFile(new File([blob], "avatar.jpg", { type:"image/jpeg" }), user.id, "avatars");
      $("pfPhoto").src = photo; $("pfMsg").textContent = "";
    } catch(err) { $("pfMsg").textContent = friendly(err); }
  });
  $("pfSave").addEventListener("click", async () => {
    const name = $("pfName").value.trim();
    if (!name) { $("pfMsg").textContent = "Add the name you'd like to use."; $("pfName").focus(); return; }
    const slug = slugify($("pfSlug").value) || null;
    const row = { name:name.slice(0,60), country:$("pfCountry").value.trim().slice(0,60), city:$("pfCity").value.trim().slice(0,60),
      lang:LANGS.includes($("pfLang").value) ? $("pfLang").value : "English", bio:$("pfBio").value.trim(), slug, photo, is_teacher:true, updated_at:new Date().toISOString() };
    $("pfSave").disabled = true;
    const { data, error } = await sb.from("profiles").update(row).eq("id", user.id).select().single();
    $("pfSave").disabled = false;
    if (error) { $("pfMsg").textContent = friendly(error); return; }
    profile = data; paintNav(); toast("Profile saved.");
    if (onboarding) go("studio"); else renderProfile(false);
  });
  // AI
  let prov = ai.provider;
  const drawSteps = () => {
    const P = PROVIDERS[prov];
    $("aiSteps").innerHTML = prov === "gemini"
      ? `<li>Open <a href="${P.keyUrl}" target="_blank" rel="noopener">Google AI Studio</a> and sign in with a Google account.</li><li>Press <b>Create API key</b>, then copy it.</li><li>Paste it below and press <b>Save and test</b>.</li>`
      : `<li>Open <a href="${P.keyUrl}" target="_blank" rel="noopener">${esc(P.name)} keys</a> and create a key. ${esc(P.name)} charges for use.</li><li>Paste it below and press <b>Save and test</b>.</li>`;
    $("aiModels").innerHTML = P.models.map(m => `<option value="${m}">`).join("");
    $("aiModelHint").textContent = `Suggested: ${P.def}. After testing, the list shows every model your key can use.`;
  };
  drawSteps();
  document.querySelectorAll("[data-prov]").forEach(b => b.addEventListener("click", () => {
    prov = b.dataset.prov; document.querySelectorAll("[data-prov]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("aiModel").value = PROVIDERS[prov].def; if (prov !== getAI().provider) $("aiKey").value = ""; drawSteps();
  }));
  $("aiShow").addEventListener("click", () => { const k = $("aiKey"); k.type = k.type === "password" ? "text" : "password"; $("aiShow").textContent = k.type === "password" ? "Show" : "Hide"; });
  $("aiSave").addEventListener("click", async () => {
    const key = $("aiKey").value.trim(), model = $("aiModel").value.trim() || PROVIDERS[prov].def, msg = $("aiMsg");
    msg.classList.remove("err","ok");
    if (!key) { msg.textContent = "Paste your key first."; msg.classList.add("err"); return; }
    $("aiSave").disabled = true; msg.textContent = "Testing your key…";
    try {
      const models = await testAI({ provider:prov, key, model });
      setAI({ provider:prov, key, model });
      if (models.length) $("aiModels").innerHTML = models.map(m => `<option value="${esc(m)}">`).join("");
      const known = !models.length || models.includes(model);
      msg.textContent = known ? "Key works. You're ready to paint." : `Key works, but “${model}” isn't in your list. Pick a model from the list.`;
      msg.classList.add(known ? "ok" : "err"); studioKeyChanged();
    } catch(e) {
      msg.classList.add("err");
      msg.textContent = e.code === "bad_key" ? "That key wasn't accepted. Copy it again and paste it here." : e.code === "rate_limited" ? "The key works but is at its limit right now. It's saved; try painting in a minute." : "Couldn't reach the AI to test the key. It's saved; try painting.";
      if (e.code !== "bad_key") { setAI({ provider:prov, key, model }); studioKeyChanged(); }
    } finally { $("aiSave").disabled = false; }
  });
  $("aiForget").addEventListener("click", () => { clearAI(); $("aiKey").value = ""; $("aiMsg").textContent = "Key removed from this browser."; studioKeyChanged(); });
  if (!onboarding) {
    $("pfOut").addEventListener("click", signOut);
    armed($("pfDel"), "Delete every class, folder and course for good?", async () => {
      try {
        for (const t of ["courses","classes","folders","sessions"]) { const { error } = await sb.from(t).delete().eq("owner", user.id); if (error) throw error; }
        toast("Your classes and courses were deleted.");
      } catch(e) { toast(friendly(e), true); }
    });
  }
}

/* ---- Start ---- */
(async () => {
  showView("gate");
  user = await signIn($("authMount"), { title:"Sign in to your studio.", upTitle:"Create your teacher account.",
    lead:"Paint lessons from any text, build courses and follow your students. Free while in testing." });
  $("authMount").innerHTML = `<p class="brand">Paint the Lesson</p><p class="gate-lead">Opening your studio…</p>`;
  try { profile = await loadProfile(user.id); }
  catch(e) { $("authMount").innerHTML = `<p class="brand">Paint the Lesson</p><h1>Almost there.</h1><p class="gate-lead">${esc(friendly(e))}</p><div class="mx-actions"><button class="mx-save" onclick="location.reload()">Try again</button></div>`; return; }
  if (!profile.is_teacher) { await sb.from("profiles").update({ is_teacher:true }).eq("id", user.id); profile.is_teacher = true; }
  paintNav();
  const ctx = { get uid(){ return user.id; }, profile:() => profile, go, addToCourse:cls => addToCourse(cls) };
  initStudio(ctx); initCourses(ctx);
  const firstTime = !localStorage.getItem("ptl:seen:" + user.id);
  if (firstTime) { try { localStorage.setItem("ptl:seen:" + user.id, "1"); } catch(e) {} }
  if (firstTime && !getAI().key) { showView("profile"); renderProfile(true); return; }
  route();
})();
sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.reload(); });
