/* 세컨브레인 — 구글 로그인과 드라이브 연결.
   자료실(세컨브레인 폴더)은 읽기만 한다. 앱이 쓰는 글은 앱이 만든 폴더 안에만 만든다.
   지우는 요청, 휴지통에 넣는 요청은 이 파일에 없다. 내용을 고쳐 쓰는 파일은 '활동 기록.json' 하나뿐이고, 합친 뒤에만 쓴다. */
"use strict";
const G = {
  AUTH: "https://accounts.google.com/o/oauth2/v2/auth",
  DRIVE: "https://www.googleapis.com/drive/v3",
  UPLOAD: "https://www.googleapis.com/upload/drive/v3",
  DOCS: "https://docs.googleapis.com/v1",
  INFO: "https://www.googleapis.com/oauth2/v3/userinfo"
};
const DOC_MIME = "application/vnd.google-apps.document", FOLDER_MIME = "application/vnd.google-apps.folder";
const NEED = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"];
const AUTH = { token: "", exp: 0, email: "", scopes: "" };

class GErr extends Error { constructor(code, msg, status) { super(msg); this.code = code; this.status = status || 0; } }
const enc = encodeURIComponent;
const qs = o => Object.keys(o).map(k => enc(k) + "=" + enc(o[k])).join("&");
const q1 = s => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/* ---------- 로그인: 구글 화면으로 갔다가 이 주소로 돌아오는 전체 화면 이동 ---------- */
const clientId = () => String(D.OAUTH.clientId || LS.get("clientId", "") || "").trim();
const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, "");
const signedIn = () => !!AUTH.token && AUTH.exp > Date.now() + 30000;
const scopesOk = () => NEED.every(s => (" " + AUTH.scopes + " ").indexOf(" " + s + " ") >= 0);
function authLoad() {
  const a = LS.get("auth", null) || {}; AUTH.email = a.email || ""; AUTH.scopes = a.scopes || "";
  if (a.token && a.exp > Date.now() + 30000) { AUTH.token = a.token; AUTH.exp = a.exp; } else { AUTH.token = ""; AUTH.exp = 0; }
}
function authSave() { LS.set("auth", { token: AUTH.token, exp: AUTH.exp, email: AUTH.email, scopes: AUTH.scopes }); }
/* mode: "" 보통, "silent" 화면 없이 새로 받기, "consent" 허락 화면 다시, "pick" 계정 고르기 */
function authUrl(mode) {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  LS.set("oauthState", { s: state, t: Date.now(), silent: mode === "silent" });
  const p = { client_id: clientId(), redirect_uri: redirectUri(), response_type: "token", scope: D.OAUTH.scope, state: state, include_granted_scopes: "true" };
  if (mode === "silent") p.prompt = "none"; else if (mode === "consent") p.prompt = "consent"; else if (mode === "pick" || !AUTH.email) p.prompt = "select_account";
  if (AUTH.email && mode !== "pick") p.login_hint = AUTH.email;
  return G.AUTH + "?" + qs(p);
}
function authGo(mode) { location.replace(authUrl(mode)); }
/* 구글에서 돌아온 주소(#access_token=…)를 읽는다. 보낼 때 만든 확인 값과 맞을 때만 받고, 주소에서 바로 지운다. null: 해당 없음 */
function authReturn() {
  const h = location.hash || ""; if (!/(^#|&)(access_token|error)=/.test(h)) return null;
  const q = {}; h.slice(1).split("&").forEach(kv => { const i = kv.indexOf("="); if (i > 0) { try { q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " ")); } catch (e) {} } });
  const saved = LS.get("oauthState", null); LS.del("oauthState");
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  const silent = !!(saved && saved.silent);
  if (!saved || saved.s !== q.state) return { ok: false, error: "state", silent: silent };
  if (q.error) return { ok: false, error: q.error, silent: silent };
  if (!q.access_token) return { ok: false, error: "no_token", silent: silent };
  AUTH.token = q.access_token; AUTH.exp = Date.now() + (parseInt(q.expires_in, 10) || 3600) * 1000; AUTH.scopes = q.scope || ""; authSave();
  return { ok: true, silent: silent };
}
function signOut() { AUTH.token = ""; AUTH.exp = 0; AUTH.email = ""; AUTH.scopes = ""; authSave(); }

/* ---------- 요청 (모든 기다림에 끝나는 시간이 있다) ---------- */
function fetchT(url, opts, ms) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 20000); return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(() => clearTimeout(t)); }
async function gfetch(url, opts, ms) {
  if (!signedIn()) throw new GErr("login", "로그인이 필요합니다.");
  let res; const o = opts || {};
  try { res = await fetchT(url, Object.assign({}, o, { headers: Object.assign({ Authorization: "Bearer " + AUTH.token }, o.headers || {}) }), ms); }
  catch (e) { const late = e && e.name === "AbortError"; throw new GErr(late ? "timeout" : "network", late ? "구글이 제때 답하지 않았습니다." : "인터넷 연결을 확인해 주십시오."); }
  if (res.status === 401) { AUTH.token = ""; AUTH.exp = 0; authSave(); throw new GErr("login", "로그인이 만료되었습니다.", 401); }
  if (!res.ok) {
    let j = null; try { j = await res.json(); } catch (e) {}
    const er = (j && j.error) || {}, msg = er.message || er.status || ("HTTP " + res.status), why = ((er.errors && er.errors[0] && er.errors[0].reason) || "") + " " + (er.status || "") + " " + msg;
    const code = /accessNotConfigured|SERVICE_DISABLED|has not been used in project/i.test(why) ? "api_off"
      : /insufficient.*(scope|permission)|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(why) ? "scope"
      : res.status === 403 ? "forbidden" : res.status === 404 ? "notfound" : (res.status === 429 || res.status >= 500) ? "busy"
      : (res.status === 400 && /revision/i.test(why)) ? "revision" : "bad";
    throw new GErr(code, String(msg).slice(0, 200), res.status);
  }
  return res;
}

/* ---------- 드라이브 ---------- */
const FIELDS = "files(id,name,parents,mimeType,modifiedTime,createdTime,webViewLink)";
async function gList(q, opt) { const o = opt || {}, p = { q: q + " and trashed = false", fields: FIELDS, pageSize: o.size || 20, spaces: "drive" }; if (o.order) p.orderBy = o.order; const r = await gfetch(G.DRIVE + "/files?" + qs(p)); return (await r.json()).files || []; }
async function gMeta(id) { const r = await gfetch(G.DRIVE + "/files/" + enc(id) + "?fields=" + enc("id,name,mimeType,modifiedTime,webViewLink")); return await r.json(); }
async function gExport(id) { const r = await gfetch(G.DRIVE + "/files/" + enc(id) + "/export?mimeType=" + enc("text/markdown"), null, 30000); return await r.text(); }
async function gMedia(id) { const r = await gfetch(G.DRIVE + "/files/" + enc(id) + "?alt=media"); return await r.text(); }
async function gCreate(meta, type, body) {
  const b = "sb" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const payload = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n--" + b + "\r\nContent-Type: " + type + "; charset=UTF-8\r\n\r\n" + body + "\r\n--" + b + "--";
  const r = await gfetch(G.UPLOAD + "/files?uploadType=multipart&fields=" + enc("id,name,webViewLink,parents"), { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body: payload }, 30000);
  return await r.json();
}
async function gFolder(name) { const r = await gfetch(G.DRIVE + "/files?fields=" + enc("id,name"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, mimeType: FOLDER_MIME }) }); return await r.json(); }
/* 활동 기록 파일만 고쳐 쓴다 */
async function gPutJson(id, text) { const r = await gfetch(G.UPLOAD + "/files/" + enc(id) + "?uploadType=media&fields=id", { method: "PATCH", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: text }, 30000); return await r.json(); }
async function docGet(id) { const r = await gfetch(G.DOCS + "/documents/" + enc(id) + "?includeTabsContent=true", null, 30000); return await r.json(); }
async function docBatch(id, requests, writeControl) { const body = { requests: requests }; if (writeControl) body.writeControl = writeControl; const r = await gfetch(G.DOCS + "/documents/" + enc(id) + ":batchUpdate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 30000); return await r.json(); }
async function whoAmI() { const r = await gfetch(G.INFO); const j = await r.json(); return j.email || ""; }
const docUrl = id => "https://docs.google.com/document/d/" + enc(id) + "/edit";

/* ---------- 앱이 쓰는 폴더와 글 ---------- */
const MY = { id: "" };
/* make: 없으면 만든다. fresh: 기억해 둔 번호를 버리고 다시 찾는다. 없고 만들지도 않으면 "" */
async function myFolder(make, fresh) {
  if (!fresh && !MY.id) MY.id = LS.get("myFolder", "") || "";
  if (MY.id && !fresh) return MY.id;
  const fs = await gList("name = '" + q1(D.MY_FOLDER) + "' and mimeType = '" + FOLDER_MIME + "' and 'me' in owners", { size: 5 });
  let id = (fs[0] && fs[0].id) || "";
  if (!id && make) id = (await gFolder(D.MY_FOLDER)).id;
  MY.id = id; if (id) LS.set("myFolder", id); else LS.del("myFolder");
  return id;
}
/* 폴더 안에서 할 일. 폴더 번호가 낡았으면(다른 계정, 없어짐) 한 번만 다시 찾는다. 폴더가 없고 만들 일도 아니면 null */
async function inMy(fn, make) {
  let fid = await myFolder(make, false); if (!fid) return null;
  try { return await fn(fid); }
  catch (e) { if (!e || (e.code !== "notfound" && e.code !== "forbidden")) throw e; fid = await myFolder(make, true); if (!fid) return null; return await fn(fid); }
}
const listMy = size => inMy(fid => gList("'" + fid + "' in parents and mimeType = '" + DOC_MIME + "'", { size: size || 100, order: "modifiedTime desc" }), false);
const findInMy = name => inMy(fid => gList("'" + fid + "' in parents and name = '" + q1(name) + "'", { size: 3, order: "modifiedTime desc" }), false).then(fs => (fs && fs[0]) || null);
/* 마크다운 글로 구글 문서를 만든다. 구글이 마크다운을 받지 않으면 보통 글로 한 번 더 */
function createInMy(name, markdown) {
  return inMy(async fid => {
    const meta = { name: name, parents: [fid], mimeType: DOC_MIME };
    try { return await gCreate(meta, "text/markdown", markdown); } catch (e) { if (e.code !== "bad") throw e; return await gCreate(meta, "text/plain", markdown); }
  }, true);
}
/* 달마다 한 문서: '묵상_2026-11', '독서_2026-11' */
async function monthDoc(kind, when) { const name = kind + "_" + ym(when); return (await findInMy(name)) || (await createInMy(name, "# " + kind + " " + ym(when) + "\n")); }
/* 문서의 정해진 자리(stepNo 단계 칸, 0이면 맨 끝)에 줄을 넣는다. 그사이 문서가 바뀌었으면 한 번 다시 읽고 넣는다 */
async function docInsert(id, stepNo, lines) {
  for (let i = 0; i < 2; i++) {
    const doc = docRoot(await docGet(id)); if (!doc) throw new GErr("bad", "문서를 읽지 못했습니다.");
    const req = memoRequests(doc, stepNo, lines); if (!req) return false;
    try { await docBatch(id, req.requests, req.writeControl); return true; } catch (e) { if (e.code === "revision" && i === 0) continue; throw e; }
  }
  return false;
}

/* 메모 한 줄을 고친다(새 글이 비면 그 줄을 없앤다). 그 줄이 그사이 바뀌었으면 conflict */
async function docLine(id, stepNo, k, oldText, newText) {
  for (let i = 0; i < 2; i++) {
    const doc = docRoot(await docGet(id)); if (!doc) throw new GErr("bad", "문서를 읽지 못했습니다.");
    const req = lineRequests(doc, stepNo, k, oldText, newText); if (req.conflict) throw new GErr("conflict", "그사이 이 줄이 바뀌었습니다.");
    try { await docBatch(id, req.requests, req.writeControl); return true; } catch (e) { if (e.code === "revision" && i === 0) continue; throw e; }
  }
  return false;
}
/* 쓰는 칸의 글 전체를 바꾼다. base: 화면이 알고 있던 글. 문서의 글이 그것과 다르면(다른 곳에서 고침) 덮어쓰지 않고 conflict 로 알린다. force: 알고도 내 글로 바꾼다 */
async function docBody(id, stepNo, title, text, base, force) {
  for (let i = 0; i < 2; i++) {
    const doc = docRoot(await docGet(id)); if (!doc) throw new GErr("bad", "문서를 읽지 못했습니다.");
    const req = bodyRequests(doc, stepNo, title, text);
    if (req.complex) throw new GErr("complex", "이 칸에는 표가 들어 있어 통째로 고칠 수 없습니다.");
    if (!force && req.current !== base) { const e = new GErr("conflict", "다른 곳에서 이 칸이 바뀌었습니다."); e.current = req.current; throw e; }
    if (!req.requests.length) return true;
    try { await docBatch(id, req.requests, req.writeControl); return true; } catch (e) { if (e.code === "revision" && i === 0) continue; throw e; }
  }
  return false;
}

/* ---------- 활동 기록: 드라이브 것과 합친다 (덮어쓰지 않는다) ---------- */
async function actSync() {
  const local = actNorm(LS.get("act", null));
  const hit = await findInMy(D.ACT_FILE);
  let merged = local, remote = null;
  if (hit) {
    const raw = await gMedia(hit.id);
    try { remote = JSON.parse(raw); } catch (e) { throw new GErr("bad", "드라이브의 활동 기록 파일을 읽지 못했습니다. 기록을 지키려고 덮어쓰지 않았습니다."); }
    merged = actMerge(local, remote);
    if (!actSame(merged, remote) && actTotal(merged) >= actTotal(remote)) await gPutJson(hit.id, JSON.stringify(merged));
  } else if (actTotal(merged) > 0) {
    await inMy(fid => gCreate({ name: D.ACT_FILE, parents: [fid] }, "application/json", JSON.stringify(merged)), true);
  }
  const now = actMerge(LS.get("act", null), merged);   /* 올리는 사이 이 기기에 생긴 기록을 잃지 않는다 */
  LS.set("act", now);
  return { act: now, pending: !actSame(now, merged) };
}
