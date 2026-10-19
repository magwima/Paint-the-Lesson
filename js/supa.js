// Supabase connection and the shared sign-in card.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { esc } from "./core.js";

const RECOVERY = /type=recovery/.test(location.hash);
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:"ptl-auth" }
});

export const here = () => location.href.split("#")[0].split("?")[0];
export const site = path => new URL(path, here()).href;

// Turn a Supabase error into a sentence a teacher can act on
export function friendly(e){
  const m = String(e && (e.message || e.error_description || e) || "");
  if (/relation .* does not exist|schema cache|Could not find the (table|function)|PGRST20[25]/i.test(m + (e && e.code || "")))
    return "The database isn't set up yet. Run supabase/schema.sql in the Supabase SQL Editor (see the README).";
  if (/Invalid login credentials/i.test(m)) return "That email and password don't match. Try again or use “Email me a link”.";
  if (/Email not confirmed/i.test(m)) return "Confirm your email first: open the link we sent you, then sign in.";
  if (/User already registered/i.test(m)) return "There's already an account with this email. Sign in instead.";
  if (/Password should be/i.test(m)) return "Use a password of at least 6 characters.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
  if (/provider is not enabled|Unsupported provider/i.test(m)) return "Google sign-in isn't switched on yet. Use your email for now.";
  if (/bad_code/.test(m)) return "That class code wasn't found. Check it with your teacher.";
  if (/quiz_not_passed/.test(m)) return "Pass the quiz first, then mark the lesson complete.";
  if (/not_complete/.test(m)) return "Finish every lesson first to get your certificate.";
  if (/not_open/.test(m)) return "This lesson isn't open yet.";
  if (/closed/.test(m)) return "This course isn't open for sign-up. Ask the teacher for a class code.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "No connection. Check your internet and try again.";
  if (/duplicate key.*slug/i.test(m)) return "That web address is already taken. Choose another.";
  return m || "Something went wrong. Try again.";
}

export async function currentUser(){ const { data } = await sb.auth.getSession(); return data.session ? data.session.user : null; }

export async function loadProfile(uid){
  const { data, error } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  if (data) return data;
  // The sign-up trigger normally creates it; make one if it's missing
  const u = await currentUser();
  const row = { id:uid, email:u && u.email || "", name:(u && (u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name))) || (u && u.email || "").split("@")[0] };
  const ins = await sb.from("profiles").insert(row).select().single();
  if (ins.error) throw ins.error;
  return ins.data;
}

/* Sign-in card. Resolves with the user once signed in.
   opts: { title, lead, who:"teacher"|"student" } */
export function signIn(mount, opts = {}){
  return new Promise(resolve => {
    let mode = RECOVERY ? "reset" : (opts.mode || "in");
    const draw = () => {
      mount.innerHTML = `
      <div class="auth">
        <p class="brand"><i class="logo-dot" aria-hidden="true"></i>Paint the Lesson</p>
        <h1>${esc(mode === "reset" ? "Set a new password." : mode === "up" ? (opts.upTitle || "Create your account.") : (opts.title || "Sign in."))}</h1>
        <p class="gate-lead">${esc(mode === "reset" ? "Choose a new password for your account." : (opts.lead || ""))}</p>
        ${mode === "reset" ? "" : `<div class="tabs auth-tabs" role="tablist">
          <button class="tool" role="tab" data-m="in" aria-pressed="${mode==="in"}" aria-selected="${mode==="in"}">Sign in</button>
          <button class="tool" role="tab" data-m="up" aria-pressed="${mode==="up"}" aria-selected="${mode==="up"}">Create account</button>
        </div>`}
        <form class="auth-form" novalidate>
          ${mode === "up" ? `<div class="field"><label for="auName">Your name</label><input id="auName" type="text" autocomplete="name" maxlength="60" required></div>` : ""}
          ${mode === "reset" ? "" : `<div class="field"><label for="auEmail">Email</label><input id="auEmail" type="email" autocomplete="email" required></div>`}
          <div class="field"><label for="auPass">${mode === "reset" ? "New password" : "Password"}</label><input id="auPass" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" minlength="6" required></div>
          <p class="mx-err" id="auMsg" role="alert"></p>
          <button class="mx-save wide" type="submit">${mode === "reset" ? "Save password" : mode === "up" ? "Create account" : "Sign in"}</button>
        </form>
        ${mode === "reset" ? "" : `<div class="auth-alt">
          <button class="mx-ghost" id="auLink" type="button">Email me a sign-in link</button>
          ${mode === "in" ? `<button class="mx-ghost" id="auForgot" type="button">Forgot password?</button>` : ""}
        </div>
        <div class="or"><span>or</span></div>
        <button class="google" id="auGoogle" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"/></svg>Continue with Google</button>`}
      </div>`;
      const msg = (t, ok) => { const m = mount.querySelector("#auMsg"); m.textContent = t; m.classList.toggle("ok", !!ok); };
      mount.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => { mode = b.dataset.m; draw(); }));
      const form = mount.querySelector("form");
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const btn = form.querySelector("button[type=submit]");
        const email = mount.querySelector("#auEmail") && mount.querySelector("#auEmail").value.trim();
        const pass = mount.querySelector("#auPass").value;
        if (mode !== "reset" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) { msg("Enter a valid email address."); return; }
        if (pass.length < 6) { msg("Use a password of at least 6 characters."); return; }
        btn.disabled = true; msg("");
        try {
          if (mode === "reset") {
            const { error } = await sb.auth.updateUser({ password:pass }); if (error) throw error;
            history.replaceState(null, "", here()); location.reload(); return;
          }
          if (mode === "up") {
            const name = mount.querySelector("#auName").value.trim();
            if (!name) { msg("Add your name."); btn.disabled = false; return; }
            const { data, error } = await sb.auth.signUp({ email, password:pass, options:{ data:{ name }, emailRedirectTo:location.href } });
            if (error) throw error;
            if (!data.session) { msg("Check your inbox and open the link we sent to confirm your email.", true); btn.disabled = false; return; }
          } else {
            const { error } = await sb.auth.signInWithPassword({ email, password:pass }); if (error) throw error;
          }
        } catch(err) { msg(friendly(err)); btn.disabled = false; }
      });
      const link = mount.querySelector("#auLink");
      if (link) link.addEventListener("click", async () => {
        const email = mount.querySelector("#auEmail").value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg("Enter your email first, then press this again."); mount.querySelector("#auEmail").focus(); return; }
        link.disabled = true;
        const name = mount.querySelector("#auName") && mount.querySelector("#auName").value.trim();
        const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo:location.href, ...(name ? { data:{ name } } : {}) } });
        link.disabled = false;
        if (error) msg(friendly(error)); else msg("Sign-in link sent. Open it on this device.", true);
      });
      const forgot = mount.querySelector("#auForgot");
      if (forgot) forgot.addEventListener("click", async () => {
        const email = mount.querySelector("#auEmail").value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg("Enter your email first, then press this again."); mount.querySelector("#auEmail").focus(); return; }
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo:here() });
        if (error) msg(friendly(error)); else msg("We've emailed you a link to set a new password.", true);
      });
      const g = mount.querySelector("#auGoogle");
      if (g) g.addEventListener("click", async () => {
        const { error } = await sb.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:location.href } });
        if (error) msg(friendly(error));
      });
      const first = mount.querySelector("input"); if (first && !opts.noFocus) first.focus();
    };
    draw();
    const { data:sub } = sb.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY") { mode = "reset"; draw(); return; }
      if (session && mode !== "reset") { sub.subscription.unsubscribe(); resolve(session.user); }
    });
    sb.auth.getSession().then(({ data }) => {
      if (data.session && mode !== "reset") { sub.subscription.unsubscribe(); resolve(data.session.user); }
    });
  });
}

export async function signOut(){ await sb.auth.signOut(); location.reload(); }

// Upload a file to the public "files" bucket under the user's folder
export async function uploadFile(file, uid, folder){
  const clean = file.name.replace(/[^\w.\-]+/g,"_").slice(-80);
  const path = `${uid}/${folder || "files"}/${Date.now().toString(36)}-${clean}`;
  const { error } = await sb.storage.from("files").upload(path, file, { cacheControl:"31536000", upsert:false, contentType:file.type || undefined });
  if (error) throw error;
  return sb.storage.from("files").getPublicUrl(path).data.publicUrl;
}
