/* 세컨브레인 — 화면.
   단추는 모두 data-act="이름" 으로 달고, 문서 전체에서 한 번에 받아 ACT.이름() 을 부른다.
   화면 전체를 다시 그리는 것은 사용자가 누른 때뿐이다. 뒤에서 끝난 일은 그 부분만 다시 그린다(적던 글을 건드리지 않으려고).
   자료는 모두 앱 안에서 읽는다. 구글 문서로 나가는 링크는 두지 않는다. */
"use strict";
const $ = id => document.getElementById(id);
const TABS = [["prep", "준비"], ["bible", "성경"], ["book", "독서"], ["find", "찾기"], ["me", "현황"]];
const TITLE = { prep: "설교 준비", bible: "성경", book: "독서", find: "찾기", me: "나의 현황", set: "설정" };
const WD = ["주일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const U = Object.assign({ tab: "prep", prepId: "", step: 1, b: 0, ch: 1, ver: "a", whole: false }, LS.get("ui", null) || {});
const S = {
  act: actNorm(LS.get("act", null)), preps: null, prepsSt: "", prepsErr: "", prep: null, prepSt: "", prepErr: "",
  chap: {}, orig: {}, lex: {}, idx: {}, morph: null, word: null, more: {}, goto: null, hit: null, find: null, flash: null, reader: null, edit: null, clash: null,
  sync: { st: "", at: LS.get("syncAt", 0), err: "" }, upd: { want: 0 }, check: null, checking: false, gate: "", gateMode: "", copy: ""
};
const R = [];
const reg = o => (R.push(o), R.length - 1);
const saveUi = () => LS.set("ui", U);
const draft = k => LS.get("d." + k, "");
const draftSet = (k, v) => { if (v) LS.set("d." + k, v); else LS.del("d." + k); };
const val = id => { const e = $(id); return e ? String(e.value).trim() : ""; };
const today = () => ymd(new Date());
const kdate = s => { const p = String(s || "").split("-").map(Number); if (p.length !== 3 || !p[0]) return ""; return p[1] + "월 " + p[2] + "일 " + WD[new Date(p[0], p[1] - 1, p[2]).getDay()]; };
const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return ymd(d); };
const chapKey = (b, ch) => b + ":" + ch;
const stepOf = no => D.STEPS.find(s => s.no === no);
/* 읽다가 담을 자리: 예화는 예화 단계, 나머지 자료는 자료 단계. 단계 번호는 D.STEPS 에서 찾는다 */
const stepFor = kind => (D.STEPS.find(s => s.kinds.indexOf(kind) >= 0) || D.STEPS[0]).no;
const keepNo = sec => sec === "예화" ? stepFor("예화") : stepFor("교회 설교 요지");
const stepInfo = no => (S.prep && S.prep.steps[no]) || { lines: [], tail: [], complex: false };
const btn = (label, act, arg, cls) => '<button type="button" class="b ' + (cls || "") + '" data-act="' + act + '"' + (arg != null ? ' data-arg="' + esc(arg) + '"' : "") + ">" + label + "</button>";
const outLink = (text, url) => '<a href="' + esc(safeUrl(url)) + '" target="_blank" rel="noopener">' + esc(text) + "</a>";
/* 자료 제목: 구글 문서면 앱 안에서 펼치는 단추가 된다. keep: 읽다가 담을 때 들어갈 자리 */
const docBtn = (text, url, keep) => { const id = docIdOf(url); return id ? '<button type="button" class="lk" data-act="read" data-arg="' + reg({ id: id, title: text, keep: keep || null }) + '">' + esc(text) + "</button>" : outLink(text, url); };
const lineHtml = m => splitLinks(m, true).map(p => (p.url ? docBtn(p.t, p.url) : esc(p.t))).join("");

/* ---------- 알림 ---------- */
function explain(e) {
  const c = e && e.code;
  if (c === "login") return "로그인이 만료되었습니다. 다시 로그인하면 하던 곳으로 돌아옵니다.";
  if (c === "api_off") return "구글 클라우드에서 Drive API나 Docs API가 꺼져 있습니다. 두 API를 켠 뒤 다시 눌러 주십시오.";
  if (c === "scope") return "드라이브 권한이 빠져 있습니다. 다시 로그인하고 허락 화면의 칸을 모두 체크해 주십시오.";
  if (c === "forbidden") return "이 계정에는 권한이 없습니다. 자료실이 있는 구글 계정으로 로그인했는지 확인해 주십시오.";
  if (c === "notfound") return "문서를 찾지 못했습니다. 옮겨졌거나 다른 계정일 수 있습니다.";
  if (c === "busy") return "구글이 잠시 바쁩니다. 조금 뒤에 다시 눌러 주십시오.";
  if (c === "timeout") return "제때 답이 오지 않았습니다. 다시 눌러 주십시오.";
  if (c === "network") return "인터넷 연결을 확인해 주십시오.";
  if (c === "conflict" || c === "complex") return e.message;
  return "하지 못했습니다: " + ((e && e.message) || "알 수 없는 문제");
}
let flashT = 0;
function flash(text, kind, act, stay) {
  clearTimeout(flashT); S.flash = text ? { text: text, kind: kind || "ok", act: act || null } : null; paintFlash();
  if (S.flash && S.flash.kind === "ok" && !act && !stay) flashT = setTimeout(() => flash(""), 5000);
}
function paintFlash() {
  const f = S.flash; let h = "";
  if (S.upd.want > BUILD) h += '<div class="bar"><span>새 버전 v' + S.upd.want + "이 나왔습니다.</span>" + btn("지금 바꾸기", "updNow", null, "inl") + "</div>";
  if (f) h += '<div class="bar ' + (f.kind === "bad" ? "bad" : "") + '"><span>' + esc(f.text) + "</span>" + (f.act ? btn(f.act[0], f.act[1], f.act[2], "inl") : "") + btn("닫기", "flashX", null, "inl") + "</div>";
  $("sbFlash").innerHTML = h;
}
function fail(e) {
  const c = e && e.code;
  if (c === "login") flash(explain(e), "bad", ["다시 로그인", "login", canSilent() ? "silent" : ""]);
  else if (c === "scope") flash(explain(e), "bad", ["다시 로그인", "login", "consent"]);
  else flash(explain(e), "bad");
}

/* ---------- 로그인 흐름 ---------- */
const canSilent = () => !!(clientId() && AUTH.email && Date.now() - LS.get("silentAt", 0) > 120000);
function silentGo() { LS.set("silentAt", Date.now()); LS.set("scroll", { y: window.scrollY || 0, t: Date.now() }); authGo("silent"); }
/* 화면 없이 로그인을 새로 받고 돌아왔을 때 보던 자리로 */
function scrollBack() { const s = LS.get("scroll", null); if (!s) return false; LS.del("scroll"); if (Date.now() - s.t > 30000 || !s.y) return false; window.scrollTo(0, s.y); return true; }
const typing = () => { const a = document.activeElement; return !!(a && /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName)); };
function loginWhy(code) {
  if (code === "access_denied") return "구글 허락 화면에서 취소되었습니다. 다시 로그인해 주십시오.";
  if (code === "state") return "로그인 확인 값이 맞지 않아 받지 않았습니다. 다시 로그인해 주십시오.";
  if (code === "interaction_required" || code === "login_required" || code === "consent_required") return "구글 로그인이 풀려 있습니다. 다시 로그인해 주십시오.";
  return "로그인하지 못했습니다 (" + code + "). 다시 눌러 주십시오.";
}
/* 로그인 직후: 이 계정에 자료실이 있는지 먼저 본다. 없으면 아무것도 만들지 않고 로그아웃한다. */
async function afterSignIn(fresh) {
  try {
    if (fresh || !AUTH.email) { const em = await whoAmI(); if (em) { AUTH.email = em; authSave(); } }
    if (fresh || LS.get("vaultOk", "") !== AUTH.email) { await gMeta(D.FOLDERS.root); LS.set("vaultOk", AUTH.email); }
  } catch (e) {
    if (e.code === "notfound" || e.code === "forbidden") {
      const em = AUTH.email; signOut(); forgetAccount();
      S.gate = (em ? em + " 계정에는 " : "이 계정에는 ") + "세컨브레인 자료실이 없습니다. 자료실이 있는 구글 계정으로 로그인해 주십시오."; S.gateMode = "pick"; render(); return;
    }
    if (e.code === "login") { render(); return; }
    fail(e);
  }
  paintTop(); syncSoon(300); enter();
}
function forgetAccount() { MY.id = ""; LS.del("myFolder"); LS.del("chIds"); LS.del("vaultOk"); S.preps = null; S.prepsSt = ""; S.prep = null; S.prepSt = ""; S.chap = {}; S.find = null; S.reader = null; U.prepId = ""; saveUi(); }

/* ---------- 활동 기록 ---------- */
let syncT = 0;
function recordAct(kind, note) { S.act = actAdd(LS.get("act", null), kind, note, new Date()); LS.set("act", S.act); syncSoon(); }
function syncSoon(ms) { clearTimeout(syncT); syncT = setTimeout(syncNow, ms == null ? 4000 : ms); }
async function syncNow() {
  if (!signedIn() || S.sync.st === "ing") return;
  S.sync.st = "ing"; paintSync();
  try {
    const r = await actSync(); S.act = r.act; S.sync = { st: "ok", at: Date.now(), err: "" }; LS.set("syncAt", S.sync.at);
    if (r.pending) syncSoon();
  } catch (e) { S.sync = { st: "err", at: S.sync.at, err: explain(e) }; }
  if (U.tab === "me" && !S.reader) paintMain();
}
function paintSync() { const el = $("syncLine"); if (el) el.textContent = syncText(); }
function syncText() {
  if (!signedIn()) return "이 기기에 저장되어 있습니다. 로그인하면 드라이브의 기록과 합칩니다.";
  if (S.sync.st === "ing") return "드라이브와 맞추는 중입니다.";
  if (S.sync.st === "err") return "드라이브와 맞추지 못했습니다. 기록은 이 기기에 남아 있습니다. " + S.sync.err;
  return S.sync.at ? "드라이브와 맞춘 때: " + stamp(new Date(S.sync.at)) : "아직 드라이브와 맞추지 않았습니다.";
}

/* ---------- 장 문서(드라이브)와 원어 자료(앱에 든 공개 자료) ---------- */
/* 장 문서는 성경 폴더 아래 책별 폴더(예: 42_누가복음)에 들어 있다. 책 폴더 번호를 하루 동안 기억한다. */
let BKF = null;
async function bookFolders(force) {
  if (BKF && !force) return BKF;
  const saved = LS.get("bkF", null);
  if (saved && saved.m && !force && Date.now() - (saved.t || 0) < 86400000) return (BKF = saved.m);
  const fs = await gList("'" + D.FOLDERS.bible + "' in parents and mimeType = '" + FOLDER_MIME + "'", { size: 100 });
  const m = {}; fs.forEach(f => { if (/^\d\d_/.test(f.name)) m[f.name] = f.id; });
  LS.set("bkF", { t: Date.now(), m: m }); return (BKF = m);
}
async function chapFind(b, title) {
  const bn = pad2(b.order) + "_" + b.name, opt = { size: 3, order: "modifiedTime desc" };
  const inBook = async m => m[bn] ? await gList("'" + m[bn] + "' in parents and name = '" + q1(title) + "'", opt) : [];
  let fs = await inBook(await bookFolders());
  if (!fs.length) fs = await gList("'" + D.FOLDERS.bible + "' in parents and name = '" + q1(title) + "'", opt);
  if (!fs.length) fs = await inBook(await bookFolders(true));
  return fs;
}
function chapLoad(bi, ch, force) {
  const key = chapKey(bi, ch), cur = S.chap[key];
  if (cur && !force && (cur.st === "ing" || (cur.st === "ok" && Date.now() - cur.t < 600000))) return cur.p;
  const rec = S.chap[key] = { st: "ing", t: Date.now() };
  rec.p = (async () => {
    const title = chapterTitle(book(bi), ch), ids = LS.get("chIds", {}) || {};
    try {
      let id = ids[title];
      if (!id) {
        const fs = await chapFind(book(bi), title);
        if (!fs.length) { rec.st = "none"; return rec; }
        id = fs[0].id; ids[title] = id; LS.set("chIds", ids);
      }
      rec.data = parseChapter(await gExport(id)); rec.id = id; rec.url = docUrl(id); rec.title = title; rec.st = "ok";
    } catch (e) {
      if (e.code === "notfound" && ids[title]) { delete ids[title]; LS.set("chIds", ids); }
      rec.st = "err"; rec.err = explain(e); rec.code = e.code;
    }
    return rec;
  })();
  return rec.p;
}
const JSONS = {};
function getJson(path) {
  if (!JSONS[path]) JSONS[path] = fetchT("data/orig/" + path + "?d=" + encodeURIComponent(D.ORIG.ver), null, 20000).then(r => { if (!r.ok) throw new GErr(r.status === 404 ? "notfound" : "busy", "원어 자료를 받지 못했습니다."); return r.json(); })
    .catch(e => { delete JSONS[path]; throw (e instanceof GErr ? e : new GErr(e && e.name === "AbortError" ? "timeout" : "network", "원어 자료를 받지 못했습니다.")); });
  return JSONS[path];
}
function origLoad(bi, ch) {
  const key = chapKey(bi, ch), cur = S.orig[key];
  if (cur && (cur.st === "ok" || cur.st === "ing")) return cur.p;
  const rec = S.orig[key] = { st: "ing" };
  rec.p = getJson("c/" + pad2(bi + 1) + "_" + String(ch).padStart(3, "0") + ".json").then(d => { rec.data = d; rec.st = "ok"; return rec; }, e => { rec.st = "err"; rec.err = explain(e); return rec; });
  return rec.p;
}
const chunkOf = strong => strong.charAt(0) + Math.floor(parseInt(strong.slice(1, 5), 10) / 250);
/* 낱말 하나를 형태소로 나눈다: [{form, strong, root, gloss, code}] */
function wordParts(w, heb) {
  if (!heb) { const st = String(w[3]).split("+"), mo = String(w[4]).split("+"); return st.map((s, i) => ({ form: i ? "" : w[0], strong: s, root: true, gloss: i ? "" : w[2], code: mo[i] || "" })); }
  const cut = x => String(x).replace(/\\[^/]*/g, ""), forms = cut(w[0]).split("/"), st = cut(w[3]).split("/"), gl = String(w[2]).split("/"), mo = String(w[4]).split("/"), lang = mo[0] ? mo[0].charAt(0) : "H", out = [];
  for (let i = 0; i < st.length; i++) {
    const m = st[i].match(/(\{)?(H\d{4}[A-Za-z]?)/); if (!m) continue;
    out.push({ form: forms[i] || "", strong: m[2], root: !!m[1], gloss: (gl[i] || "").trim(), code: mo[i] ? (i ? lang + mo[i] : mo[i]) : "" });
  }
  return out;
}
const lexOf = strong => { const L = S.lex[chunkOf(strong)]; if (!L) return null; const base = strong.slice(0, 5), e = L.w[strong] || L.w[base]; return e ? { e: e, mean: e[5] >= 0 ? L.m[e[5]] : "", strong: (L.s && L.s[base]) || "", bdb: (L.b && L.b[base]) || [] } : { e: null, mean: "", strong: "", bdb: [] }; };
function wordNeed(parts) {
  const jobs = [];
  if (!S.morph) jobs.push(getJson("morph.json").then(d => { S.morph = d; }));
  for (const p of parts) {
    const ck = chunkOf(p.strong);
    if (!S.lex[ck]) jobs.push(getJson("lex/" + ck + ".json").then(d => { S.lex[ck] = d; }));
    if (p.root && !S.idx[ck]) jobs.push(getJson("idx/" + ck + ".json").then(d => { S.idx[ck] = d; }, () => { S.idx[ck] = {}; }));
  }
  return Promise.all(jobs);
}
const refLabel = r => { const p = r.split(".").map(Number), b = book(p[0] - 1); return b ? b.abbr + " " + p[1] + ":" + p[2] : r; };
const lexHtml = t => esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
function wordNow() { const W = S.word; if (!W) return null; const O = S.orig[chapKey(W.b, W.ch)]; if (!O || O.st !== "ok") return null; const w = (O.data.v[W.v] || [])[W.i]; return w ? { W: W, w: w, heb: W.b < 39, parts: wordParts(w, W.b < 39) } : null; }
function wordPanel() {
  const x = wordNow(); if (!x) return "";
  const heb = x.heb, w = x.w, lang = heb ? "he" : "el", shown = heb ? String(w[0]).replace(/[\/\\]/g, "") : w[0];
  let h = '<div class="wh"><span class="wbig" lang="' + lang + '">' + esc(shown) + '</span><span class="wtr">' + esc(String(w[1]).replace(/\//g, "")) + "</span>" + btn("닫기", "word", "", "inl") + "</div>";
  h += '<p class="wctx">이 자리의 풀이: ' + esc(String(w[2]).replace(/\//g, " ").replace(/\s+/g, " ")) + "</p>";
  if (w[5]) h += '<p class="muted">' + (heb ? "이 낱말은 레닌그라드 사본에는 없고 다른 전승에 바탕을 둔 것으로 자료에 표시되어 있습니다." : "이 낱말은 NA 본문에는 없고 다른 사본 전통(TR, 비잔틴 등)에만 있는 것으로 자료에 표시되어 있습니다.") + "</p>";
  let ready = !!S.morph, deep = "";
  const bare = t => String(t).normalize("NFD").replace(/[\u0591-\u05C7\u0300-\u036f]/g, "");
  for (const p of x.parts) {
    const L = lexOf(p.strong); if (!L) { ready = false; continue; }
    const e = L.e, mo = S.morph && p.code ? S.morph[heb ? "H" : "G"][p.code] : null;
    h += '<div class="wpart"><p><b lang="' + lang + '">' + esc(e ? e[0] : p.form) + "</b> " + (e ? esc(e[1]) : "") + '<span class="wno">' + esc(p.strong) + "</span></p>" +
      (e && e[3] ? "<p>" + esc(e[3]) + (e[4] ? ' <span class="muted">(' + esc(e[4]) + ")</span>" : "") + "</p>" : "") +
      (p.code ? '<p class="wm">' + (mo ? esc(mo[0]) + ' <span class="muted">' + esc(mo[1]) + " · " + esc(p.code) + "</span>" : '<span class="muted">' + esc(p.code) + "</span>") + "</p>" : "") + "</div>";
    if (!p.root) continue;
    /* 사전 풀이: 헬라어는 Abbott-Smith 바탕 풀이, 히브리어는 BDB 요약(표제어가 같은 것을 앞에)과 Strong 풀이 */
    const lemma = e ? bare(e[0]) : "", bdb = L.bdb.slice().sort((p1, p2) => (bare(p2).indexOf(lemma) === 0) - (bare(p1).indexOf(lemma) === 0));
    const texts = []; if (L.mean) texts.push(L.mean); for (const t of bdb) texts.push("BDB: " + t); if (L.strong) texts.push("Strong: " + L.strong);
    if (texts.length) {
      const all = texts.join("\n\n"), long = all.length > 420 && !S.more.lex;
      deep += '<div class="lex">' + lexHtml(long ? all.slice(0, 380).replace(/\s+\S*$/, "") + " …" : all) + "</div>" + (all.length > 420 ? btn(S.more.lex ? "사전 풀이 접기" : "사전 풀이 더 보기", "more", "lex", "inl") : "");
    }
    const ix = (S.idx[chunkOf(p.strong)] || {})[p.strong];
    if (ix) {
      const refs = ix[2] || [], cut = S.more.refs ? refs : refs.slice(0, 24);
      deep += '<p class="wuse">' + (heb ? "구약" : "신약") + "에 " + ix[0] + "번 쓰였습니다.</p>" + '<p class="muted">' + ix[1].map(p2 => book(p2[0] - 1).abbr + " " + p2[1]).join(", ") + "</p>" +
        (refs.length ? '<div class="chips">' + cut.map(r => '<button type="button" class="chip" data-act="refOpen" data-arg="' + r + '">' + esc(refLabel(r)) + "</button>").join("") + "</div>" + (refs.length > 24 ? btn(S.more.refs ? "구절 목록 접기" : "구절 " + refs.length + "곳 모두 보기", "more", "refs", "inl") : "")
          : '<p class="muted">쓰인 곳이 많아 구절 목록은 싣지 않았습니다.</p>');
    }
  }
  h += deep;
  if (!ready) h += '<p class="muted">사전을 불러오는 중입니다.</p>';
  if (S.prep && U.tab === "prep" && !S.reader) h += btn("이 낱말을 메모에 담기", "wordKeep", null, "wide");
  return h + '<p class="muted src">자료: STEP Bible (Tyndale House Cambridge) CC BY 4.0' + (heb ? ", OpenScriptures Hebrew Lexicon CC BY 4.0" : "") + "</p>";
}
function paintWord() { const el = $("wp"); if (el) el.innerHTML = wordPanel(); }
/* 원어 본문: 절마다 우리말 한 줄과 원어 낱말들. 낱말을 누르면 그 절 아래에 풀이가 열린다 */
function origHtml(bi, ch, pick) {
  const O = S.orig[chapKey(bi, ch)]; if (!O || O.st === "ing") return '<p class="muted">원어 본문을 불러오는 중입니다.</p>';
  if (O.st !== "ok") return '<p class="muted">' + esc(O.err) + "</p>" + btn("다시 불러오기", "origReload");
  const heb = bi < 39, C = S.chap[chapKey(bi, ch)], kr = C && C.st === "ok" ? new Map((C.data.texts[C.data.order[0]] || []).filter(x => x.n).map(x => [x.n, x.t])) : null, W = S.word;
  let h = "";
  for (const v of Object.keys(O.data.v)) {
    const n = +v; if (pick && !pick.has(n)) continue;
    const open = W && W.b === bi && W.ch === ch && W.v === v;
    h += '<div class="ov' + (S.hit && S.hit.key === chapKey(bi, ch) && S.hit.v === v ? " hit" : "") + '" id="ov' + v + '"><p class="okr"><b>' + (n || "표제") + "</b>" + (kr && kr.has(n) ? esc(kr.get(n)) : "") + '</p><div class="ow ' + (heb ? "h" : "g") + '"' + (heb ? ' dir="rtl"' : "") + ">" +
      O.data.v[v].map((w, i) => '<button type="button" class="w' + (w[5] ? " alt" : "") + (open && W.i === i ? " on" : "") + '" data-act="word" data-arg="' + bi + ":" + ch + ":" + v + ":" + i + '"><span class="ws" lang="' + (heb ? "he" : "el") + '">' + esc(heb ? String(w[0]).replace(/[\/\\]/g, "") : w[0]) + '</span><span class="wg" dir="ltr">' + esc(String(w[2]).replace(/\//g, "").replace(/\s+/g, " ").trim()) + "</span></button>").join("") + "</div>" +
      (open ? '<div class="wp" id="wp">' + wordPanel() + "</div>" : "") + "</div>";
  }
  return h || '<p class="muted">보여 줄 절이 없습니다. 절 번호를 확인해 주십시오.</p>';
}
function verToggle(data, orig) {
  const segs = []; if (data) { segs.push(["a", data.order[0]]); if (data.order[1]) { segs.push(["b", data.order[1]]); segs.push(["ab", "둘 다"]); } } if (orig) segs.push(["o", "원어"]);
  if (segs.length < 2) return "";
  const cur = segs.some(x => x[0] === U.ver) ? U.ver : segs[0][0];
  return '<div class="segs" role="group" aria-label="역본">' + segs.map(x => '<button type="button" class="seg' + (cur === x[0] ? " on" : "") + '" data-act="ver" data-arg="' + x[0] + '" aria-pressed="' + (cur === x[0]) + '">' + esc(x[1]) + "</button>").join("") + "</div>";
}
/* pick: 보여 줄 절 번호 모음(없으면 장 전체). 소제목은 바로 다음 절이 보일 때만 보인다. */
function versesHtml(data, pick) {
  const a = data.order[0], b = data.order[1], mode = (U.ver === "b" && b) ? "b" : (U.ver === "ab" && b) ? "ab" : "a";
  const main = data.texts[mode === "b" ? b : a] || [], other = mode === "ab" ? new Map((data.texts[b] || []).filter(x => x.n).map(x => [x.n, x.t])) : null;
  let h = "";
  main.forEach((x, i) => {
    if (x.h !== undefined) { const nx = main.slice(i + 1).find(y => y.n); if (!pick || (nx && pick.has(nx.n))) h += '<h4 class="vh">' + esc(x.h) + "</h4>"; return; }
    if (pick && !pick.has(x.n)) return;
    h += '<p class="v"><b>' + x.n + "</b>" + esc(x.t) + "</p>";
    if (other && other.has(x.n)) h += '<p class="v v2">' + esc(other.get(x.n)) + "</p>";
  });
  return h || '<p class="muted">보여 줄 절이 없습니다. 절 번호를 확인해 주십시오.</p>';
}
/* keepStep: 준비의 그 단계에 담기 단추를 둔다. 0이면 단추 없이, 읽다가 담을 자리만 정해 둔다(예화는 예화 단계, 나머지는 자료 단계) */
function linksHtml(data, secs, keepStep) {
  let h = "";
  for (const sec of secs) {
    const arr = data.links[sec] || []; if (!arr.length) continue;
    h += '<h4 class="lh">' + esc(sec) + '</h4><ul class="links">' + arr.map(l => {
      const step = keepStep || keepNo(sec), keep = { step: step, text: l.text, url: l.url, extra: l.extra }, kept = !!keepStep && stepInfo(keepStep).lines.some(m => m.indexOf(l.url) >= 0);
      return "<li>" + docBtn(l.text, l.url, keep) + (l.extra ? '<span class="ex">' + esc(l.extra) + "</span>" : "") + (keepStep ? (kept ? '<span class="kept">담음</span>' : btn("담기", "keep", reg(keep), "inl")) : "") + "</li>";
    }).join("") + "</ul>";
  }
  return h;
}
function chapStateHtml(C, label) {
  if (!C || C.st === "ing") return '<p class="muted">본문을 불러오는 중입니다.</p>';
  if (C.st === "none") return '<p class="muted">' + esc(label) + " 문서가 아직 없습니다. 성경 뼈대를 만드는 작업이 끝나면 보입니다.</p>";
  if (C.st === "err") return '<p class="muted">' + esc(C.err) + "</p>" + btn("다시 불러오기", "chapReload");
  return "";
}
function chapTarget() { return U.tab === "bible" ? [U.b, U.ch] : (S.prep ? [S.prep.info.bookIndex, S.prep.info.ch] : null); }
function wantsOrig() { return U.tab === "bible" ? U.ver === "o" : !!(S.prep && U.step && (stepOf(U.step) || { kinds: [] }).kinds.indexOf("orig") >= 0); }
function chapPartKey() {
  const t = chapTarget(); if (!t) return "";
  const C = S.chap[chapKey(t[0], t[1])], O = S.orig[chapKey(t[0], t[1])];
  return [U.tab, t[0], t[1], (C && C.st) || "ing", wantsOrig() ? (O && O.st) || "ing" : "", U.tab === "prep" ? U.step : "", U.ver].join(":");
}
function paintChap() {
  const el = $("chapPart"); if (!el || S.reader) return;
  const html = U.tab === "bible" ? bibleChapHtml() : (U.tab === "prep" && S.prep && U.step ? chapPartHtml(stepOf(U.step)) : null);
  if (html == null) return;
  const key = chapPartKey(); if (el.dataset.key === key) return;
  el.dataset.key = key; el.innerHTML = html;
  const mat = $("matPart"); if (mat && U.tab === "bible") mat.innerHTML = bibleMatsHtml();
}
/* 쓰인 곳 목록에서 넘어왔을 때 그 절로 간다 */
function gotoVerse() { const el = S.goto ? $("ov" + S.goto) : null; if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" }); }

/* ---------- 화면: 틀 ---------- */
function render() { R.length = 0; paintTop(); paintMain(); paintNav(); paintFlash(); }
function gated() { return U.tab !== "me" && U.tab !== "set" && !signedIn(); }
function paintTop() {
  const rd = !gated() && S.reader ? S.reader.stack[S.reader.stack.length - 1] : null, inPrep = !rd && !gated() && U.tab === "prep" && U.prepId && S.prep;
  $("sbTop").innerHTML = (rd ? '<button type="button" class="b back" data-act="readBack" aria-label="읽던 자료 닫기">닫기</button>' : inPrep ? '<button type="button" class="b back" data-act="prepList" aria-label="목록으로">목록</button>' : "") +
    "<h1>" + esc(gated() ? D.APP : rd ? rd.title : inPrep ? S.prep.label : TITLE[U.tab] || D.APP) + "</h1>" + (rd ? "" : '<button type="button" class="ver" data-act="tab" data-arg="set">v' + BUILD + " 설정</button>");
}
function paintMain() { $("sbMain").innerHTML = gated() ? gateHtml() : S.reader ? readerView() : VIEW[U.tab](); }
function paintNav() { $("sbNav").innerHTML = TABS.map(t => '<button type="button" class="tab" data-act="tab" data-arg="' + t[0] + '"' + (U.tab === t[0] && !S.reader ? ' aria-current="page"' : "") + ">" + t[1] + "</button>").join(""); }
/* 지금 화면에 필요한 것을 불러온다 */
function enter() {
  if (!signedIn()) return;
  if (U.tab === "prep") { if (U.prepId) { if (!S.prep && S.prepSt !== "ing") { openPrep(U.prepId); return; } } else { loadPreps(); scrollBack(); return; } }
  const t = chapTarget();
  if (t && (U.tab === "bible" || (U.tab === "prep" && S.prep))) {
    /* 장 문서와 원어 자료는 따로 도착한다. 어느 쪽이 늦게 와도 가려던 절이 화면에 남도록 둘 다 끝날 때까지 자리를 잡는다 */
    const jobs = [chapLoad(t[0], t[1]).then(() => { paintChap(); scrollBack(); gotoVerse(); })];
    if (wantsOrig()) jobs.push(origLoad(t[0], t[1]).then(() => { paintChap(); gotoVerse(); }));
    Promise.all(jobs).then(() => { S.goto = null; });
  } else scrollBack();
}
function cidHtml() {
  return '<label class="fld">클라이언트 ID<input id="cid" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="…apps.googleusercontent.com" value="' + esc(LS.get("clientId", "")) + '"></label>' + btn("저장", "cidSave", null, "pri wide");
}
function gateHtml() {
  if (!clientId()) return '<section class="sec"><h2>처음 연결</h2><p>구글 로그인에 쓸 연결 값(클라이언트 ID)이 아직 없습니다. 구글 클라우드에서 만든 값을 아래에 붙여 넣어 주십시오. 비밀번호가 아니라 공개 값입니다.</p>' + cidHtml() + "</section>";
  return '<section class="sec"><h2>구글 계정으로 들어가기</h2><p>드라이브의 세컨브레인 자료실을 읽고, 준비한 글과 기록을 내 드라이브에 남깁니다.</p>' +
    (S.gate ? '<p class="warn">' + esc(S.gate) + "</p>" : "") + btn("구글로 로그인", "login", S.gateMode || "", "pri wide") +
    '<p class="muted">자료실은 읽기만 합니다. 앱이 쓰는 글은 「' + esc(D.MY_FOLDER) + "」 폴더에만 만들고, 파일을 지우는 기능은 없습니다.</p></section>";
}
function pickers() {
  const b = book(U.b) || book(0); let o1 = "", o2 = "";
  D.BOOKS.forEach((x, i) => { o1 += '<option value="' + i + '"' + (i === b.i ? " selected" : "") + ">" + esc(x[0]) + "</option>"; });
  for (let c = 1; c <= b.chapters; c++) o2 += '<option value="' + c + '"' + (c === U.ch ? " selected" : "") + ">" + c + unitOf(b) + "</option>";
  return '<div class="row"><label class="fld">책<select id="pkB" data-chg="pickBook">' + o1 + '</select></label><label class="fld">' + unitOf(b) + '<select id="pkC" data-chg="pickCh">' + o2 + "</select></label></div>";
}

/* ---------- 화면: 자료 읽기 (앱 안에서 펼친다) ---------- */
function readerOpen(item) {
  if (!S.reader) S.reader = { stack: [], y: window.scrollY || 0 };
  const cur = { id: item.id, title: item.title, keep: item.keep || null, st: "ing", html: "", links: [], err: "" };
  S.reader.stack.push(cur); S.edit = null; render(); window.scrollTo(0, 0);
  return gExport(cur.id).then(md => {
    cur.html = mdHtml(md, (t, u) => { const id = docIdOf(u); if (!id) return outLink(t, u); cur.links.push({ id: id, title: t, url: u }); return '<button type="button" class="lk" data-act="readLink" data-arg="' + (cur.links.length - 1) + '">' + esc(t) + "</button>"; });
    cur.st = "ok";
  }, e => { cur.st = "err"; cur.err = e.code === "forbidden" || e.code === "bad" ? "이 자료는 구글 문서가 아니어서 앱 안에서 펼칠 수 없습니다." : explain(e); if (e.code === "login" || e.code === "scope") fail(e); })
    .then(() => { if (S.reader && S.reader.stack[S.reader.stack.length - 1] === cur) paintMain(); });
}
function readerView() {
  const c = S.reader.stack[S.reader.stack.length - 1];
  if (c.st === "ing") return '<section class="sec"><p class="muted">자료를 펼치는 중입니다.</p></section>';
  if (c.st === "err") return '<section class="sec"><p class="muted">' + esc(c.err) + "</p>" + btn("닫기", "readBack") + "</section>";
  let h = '<article class="reader">' + (c.html || '<p class="muted">내용이 비어 있습니다.</p>') + "</article>";
  if (S.prep && c.keep) {
    const kept = stepInfo(c.keep.step).lines.some(m => m.indexOf(c.keep.url) >= 0), s = stepOf(c.keep.step);
    h += '<div class="keepbar">' + (kept ? '<span class="kept">지금 준비(' + esc(S.prep.label) + ")에 담았습니다.</span>" : btn("지금 준비에 담기 (" + s.no + ". " + esc(s.title) + ")", "readKeep", null, "pri wide")) + "</div>";
  }
  return h;
}

/* ---------- 화면: 준비 ---------- */
function prepView() {
  if (U.prepId) return prepOpenView();
  return '<section class="sec"><h2>새 준비</h2>' + pickers() +
    '<div class="row"><label class="fld">절<input id="fV" type="text" autocomplete="off" placeholder="예: 1-10" data-draft="f.v" value="' + esc(draft("f.v")) + '"></label>' +
    '<label class="fld">설교 날짜<input id="fD" type="date" data-draft="f.d" value="' + esc(draft("f.d") || nextSunday()) + '"></label></div>' +
    '<p class="muted">절을 비우면 장 전체로 준비합니다.</p>' + btn("준비 시작", "prepStart", null, "pri wide") + "</section>" +
    '<section class="sec"><h2>이어서 하기</h2><div id="prepsPart">' + prepsHtml() + "</div></section>";
}
function prepsHtml() {
  if (S.prepsSt === "err") return '<p class="muted">' + esc(S.prepsErr) + "</p>" + btn("다시 불러오기", "prepsReload");
  if (!S.preps) return '<p class="muted">불러오는 중입니다.</p>';
  if (!S.preps.length) return '<p class="muted">아직 시작한 준비가 없습니다. 위에서 본문을 고르고 시작하면 여기에 쌓입니다.</p>';
  return '<ul class="items">' + S.preps.slice(0, 12).map(p => '<li><button type="button" class="item" data-act="prepOpen" data-arg="' + esc(p.id) + '"><b>' + esc(p.label) + "</b><span>" + esc(kdate(p.info.date)) + " 설교</span></button></li>").join("") + "</ul>";
}
async function loadPreps(force) {
  if (S.prepsSt === "ing" || (S.preps && !force)) return;
  S.prepsSt = "ing";
  try {
    const fs = (await listMy(100)) || [];
    S.preps = fs.map(f => { const info = parsePrepTitle(f.name); return info ? { id: f.id, name: f.name, info: info, label: passageLabel(book(info.bookIndex), info.ch, info.verses) } : null; }).filter(Boolean);
    S.prepsSt = "ok";
  } catch (e) { S.prepsSt = "err"; S.prepsErr = explain(e); }
  const el = $("prepsPart"); if (el && !S.reader) el.innerHTML = prepsHtml();
}
async function prepRefresh() { const P = S.prep, doc = docRoot(await docGet(P.id)); if (!doc) throw new GErr("bad", "준비 문서를 읽지 못했습니다."); if (S.prep === P) P.steps = prepRead(doc).steps; }
async function openPrep(id) {
  U.tab = "prep"; U.prepId = id; saveUi(); S.prep = null; S.prepSt = "ing"; S.edit = null; S.clash = null; S.word = null; render();
  try {
    let p = (S.preps || []).find(x => x.id === id);
    if (!p) { const m = await gMeta(id), info = parsePrepTitle(m.name); if (!info) throw new GErr("bad", "준비 문서가 아닙니다."); p = { id: id, name: m.name, info: info, label: passageLabel(book(info.bookIndex), info.ch, info.verses) }; }
    const chapP = chapLoad(p.info.bookIndex, p.info.ch);
    const doc = docRoot(await docGet(id)); if (!doc) throw new GErr("bad", "준비 문서를 읽지 못했습니다.");
    if (U.prepId !== id) return;
    S.prep = { id: id, name: p.name, info: p.info, label: p.label, url: docUrl(id), steps: prepRead(doc).steps }; S.prepSt = "ok"; render();
    const keep = !!LS.get("scroll", null); if (!keep) scrollStep();
    if (wantsOrig()) origLoad(p.info.bookIndex, p.info.ch).then(paintChap);
    await chapP; if (U.prepId === id) { paintChap(); if (keep) scrollBack(); }
  } catch (e) { if (U.prepId !== id) return; S.prepSt = "err"; S.prepErr = explain(e); render(); }
}
function scrollStep() { const el = U.step ? $("step" + U.step) : null; if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" }); }
function prepOpenView() {
  if (S.prepSt === "err") return '<section class="sec"><p class="muted">' + esc(S.prepErr) + '</p><div class="row two">' + btn("다시 열기", "prepOpen", U.prepId) + btn("목록으로", "prepList") + "</div></section>";
  const P = S.prep; if (!P) return '<section class="sec"><p class="muted">준비한 것을 여는 중입니다.</p></section>';
  let h = '<p class="when">' + esc(kdate(P.info.date)) + ' 설교</p><ol class="spine">';
  for (const s of D.STEPS) {
    const info = stepInfo(s.no), n = info.lines.filter(x => x.trim()).length + info.tail.length, open = U.step === s.no;
    h += '<li class="step' + (open ? " open" : "") + (n ? " has" : "") + '" id="step' + s.no + '"><button type="button" class="sh" data-act="step" data-arg="' + s.no + '" aria-expanded="' + open + '"><span class="node">' + s.no + '</span><span class="st">' + esc(s.title) + "</span>" +
      (n ? '<span class="cnt">' + (s.write ? "쓴 글 있음" : "메모 " + n) + "</span>" : "") + "</button>" + (open ? '<div class="sb">' + stepBody(s) + "</div>" : "") + "</li>";
  }
  return h + '</ol><p class="foot">' + btn("준비한 것 한눈에 읽기", "read", reg({ id: P.id, title: P.label + " 준비" })) + "</p>";
}
function chapPartHtml(s) {
  const P = S.prep, bi = P.info.bookIndex, ch = P.info.ch, C = S.chap[chapKey(bi, ch)], secs = s.kinds.filter(k => k !== "text" && k !== "logos" && k !== "orig");
  const wantText = s.kinds.indexOf("text") >= 0, wantOrig = s.kinds.indexOf("orig") >= 0, pick = U.whole ? null : parseVerses(P.info.verses);
  if (!wantText && !wantOrig && !secs.length) return "";
  let h = "";
  if (wantOrig) h += origHtml(bi, ch, pick);
  const st = chapStateHtml(C, passageLabel(book(bi), ch, ""));
  if (st) return h + (wantText || secs.length ? st : "");
  if (wantText) h += verToggle(C.data, false) + '<div class="scripture">' + versesHtml(C.data, pick) + "</div>";
  if ((wantText || wantOrig) && parseVerses(P.info.verses)) h += btn(U.whole ? "본문만 보기" : "장 전체 보기", "whole", null, "inl");
  if (secs.length) h += linksHtml(C.data, secs, s.no) || (wantOrig ? "" : '<p class="muted">이 장에 걸린 자료가 아직 없습니다.</p>');
  return h;
}
function memosHtml(s, info) {
  const rows = [];
  info.lines.forEach((m, k) => {
    if (!m.trim()) return;
    if (S.edit && S.edit.no === s.no && S.edit.k === k) rows.push('<li class="editing"><textarea id="lineBox" rows="3" aria-label="메모 고치기">' + esc(m) + '</textarea><div class="row two">' + btn("고친 것 저장", "lineSave", null, "pri") + btn("그만두기", "lineCancel") + "</div></li>");
    else rows.push('<li><span class="mt">' + lineHtml(m) + '</span><button type="button" class="ed" data-act="lineEdit" data-arg="' + s.no + ":" + k + '">고치기</button></li>');
  });
  info.tail.forEach(m => rows.push('<li><span class="mt">' + lineHtml(m) + "</span></li>"));
  return rows.length ? '<ul class="memos">' + rows.join("") + "</ul>" : "";
}
function writeHtml(s, info) {
  const P = S.prep, key = "w." + P.id + "." + s.no, base = info.lines.join("\n"), d = draft(key), dirty = !!d && d !== base;
  if (info.complex) return '<p class="warn">이 칸에는 표가 들어 있어 여기서 통째로 고칠 수 없습니다.</p>' + memosHtml(s, info);
  let h = '<label class="fld">' + esc(s.title) + '<textarea id="body' + s.no + '" class="write" data-draft="' + esc(key) + '" data-dirty="' + s.no + '">' + esc(d || base) + "</textarea></label>" +
    '<p class="muted" id="dirty' + s.no + '">' + (dirty ? "저장하지 않은 글이 있습니다." : base ? "드라이브에 저장되어 있습니다." : "") + "</p>";
  if (S.clash && S.clash.no === s.no) h += '<p class="warn">다른 곳에서 이 칸이 바뀌어 덮어쓰지 않았습니다. 바뀐 글은 아래에 있습니다. 필요한 부분을 위의 내 글에 옮긴 뒤 저장해 주십시오.</p><textarea class="copy" rows="8" readonly aria-label="다른 곳에서 바뀐 글">' + esc(S.clash.current) + "</textarea>" + btn("내 글로 저장", "bodyForce", s.no, "wide");
  else h += btn(esc(s.title) + " 저장", "bodySave", s.no, "pri wide");
  if (info.tail.length) h += '<ul class="memos">' + info.tail.map(m => '<li><span class="mt">' + lineHtml(m) + "</span></li>").join("") + "</ul>";
  return h;
}
function stepBody(s) {
  const P = S.prep, info = stepInfo(s.no), key = "p." + P.id + "." + s.no, next = D.STEPS[D.STEPS.indexOf(s) + 1];
  let h = '<p class="guide">' + esc(s.guide) + "</p>" + (s.points && s.points.length ? '<details class="pts"><summary>길잡이</summary><ul>' + s.points.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" + (s.src ? '<p class="src">근거: ' + esc(s.src) + "</p>" : "") + "</details>" : "") + '<div id="chapPart" data-key="' + esc(chapPartKey()) + '">' + chapPartHtml(s) + "</div>";
  if (s.kinds.indexOf("logos") >= 0) {
    h += '<div class="logos">' + btn("로고스 연구 맡길 말 복사", "logos", s.no) + '<p class="muted">복사한 말을 Claude 대화에 붙여 넣으면, 로고스 서재에서 찾은 내용을 이 칸에 넣어 달라는 부탁이 됩니다.</p>' +
      (S.copy ? '<textarea class="copy" rows="6" readonly>' + esc(S.copy) + "</textarea>" : "") + "</div>";
  }
  if (s.write) h += writeHtml(s, info);
  else h += memosHtml(s, info) + '<label class="fld">메모<textarea id="memo' + s.no + '" rows="4" data-draft="' + esc(key) + '">' + esc(draft(key)) + "</textarea></label>" + btn("메모 저장", "memoSave", s.no, "pri wide");
  return h + (next ? '<p class="next">' + btn("다음: " + next.no + ". " + esc(next.title), "step", next.no, "inl") + "</p>" : "");
}

/* ---------- 화면: 성경 ---------- */
function bibleView() {
  const key = "qt." + U.b + "." + U.ch;
  return '<section class="sec">' + pickers() + '<div class="row two">' + btn("앞 장", "chStep", -1) + btn("다음 장", "chStep", 1) + '</div></section><div id="chapPart" data-key="' + esc(chapPartKey()) + '">' + bibleChapHtml() + "</div>" +
    '<section class="sec"><h2>묵상</h2><label class="fld">오늘 말씀이 건네신 것<textarea id="qtText" rows="4" data-draft="' + key + '">' + esc(draft(key)) + "</textarea></label>" + btn("묵상 저장", "qtSave", null, "pri wide") +
    '<p class="foot">' + btn("이번 달 묵상 읽기", "readMonth", "묵상", "inl") + '</p></section><div id="matPart">' + bibleMatsHtml() + "</div>";
}
function bibleChapHtml() {
  const b = book(U.b) || book(0), C = S.chap[chapKey(U.b, U.ch)], label = passageLabel(b, U.ch, ""), okC = !!(C && C.st === "ok"), orig = U.ver === "o";
  const read = S.act.log.some(e => e.d === today() && e.k === "read" && e.n === label);
  let h = '<section class="sec"><h2>' + esc(label) + "</h2>" + verToggle(okC ? C.data : null, true);
  if (orig) h += origHtml(U.b, U.ch, null) + (okC ? "" : chapStateHtml(C, label));
  else if (okC) h += '<div class="scripture">' + versesHtml(C.data, null) + "</div>";
  else h += chapStateHtml(C, label) + '<p class="next">' + btn("원어로 보기", "ver", "o", "inl") + "</p>";
  return h + (read ? '<p class="done">오늘 읽었습니다.</p>' : (okC || orig ? btn("읽었습니다", "readDone", null, "pri wide") : "")) + "</section>";
}
function bibleMatsHtml() {
  const b = book(U.b) || book(0), C = S.chap[chapKey(U.b, U.ch)]; if (!C || C.st !== "ok") return "";
  const mats = linksHtml(C.data, Object.keys(C.data.links), 0);
  return '<section class="sec"><h2>이 ' + unitOf(b) + "에 걸린 자료</h2>" + (mats || '<p class="muted">아직 걸린 자료가 없습니다.</p>') + "</section>";
}

/* ---------- 화면: 독서 ---------- */
function bookView() {
  const recent = LS.get("books", []) || [];
  return '<section class="sec"><h2>읽은 것 적기</h2><label class="fld">책 제목<input id="bkT" type="text" autocomplete="off" data-draft="bk.t" value="' + esc(draft("bk.t")) + '"></label>' +
    (recent.length ? '<div class="chips">' + recent.map(t => '<button type="button" class="chip" data-act="bookPick" data-arg="' + esc(t) + '">' + esc(t) + "</button>").join("") + "</div>" : "") +
    '<div class="row"><label class="fld">쪽<input id="bkP" type="text" inputmode="numeric" autocomplete="off" data-draft="bk.p" value="' + esc(draft("bk.p")) + '"></label>' +
    '<label class="fld">관련 본문<input id="bkR" type="text" autocomplete="off" placeholder="예: 눅 19:1-10" data-draft="bk.r" value="' + esc(draft("bk.r")) + '"></label></div>' +
    '<label class="fld">옮겨 적기와 생각<textarea id="bkX" rows="6" data-draft="bk.x">' + esc(draft("bk.x")) + "</textarea></label>" + btn("독서 기록 저장", "bookSave", null, "pri wide") +
    '<p class="foot">' + btn("이번 달 독서 기록 읽기", "readMonth", "독서", "inl") + "</p></section>";
}

/* ---------- 화면: 찾기 ---------- */
const GROUPS = ["성경", "설교 요지", "예화", "내 설교", "원고", "독서", "내 기록"];
function groupOf(f) { const p = (f.parents || [])[0], F = D.FOLDERS; return p === F.bible || (BKF && Object.keys(BKF).some(k => BKF[k] === p)) ? "성경" : p === F.yoji ? "설교 요지" : p === F.illust ? "예화" : p === F.mine ? "내 설교" : p === F.manu ? "원고" : p === F.read ? "독서" : "내 기록"; }
function findView() {
  const F = S.find;
  let h = '<section class="sec"><div class="findrow"><input id="q" type="search" enterkeyhint="search" autocomplete="off" aria-label="찾을 말" placeholder="낱말이나 문장" data-draft="q" data-enter="find" value="' + esc(draft("q")) + '">' + btn("찾기", "find", null, "pri") + "</div>" +
    '<p class="muted">설교 요지, 예화, 원고, 내 설교, 독서, 성경 본문, 내 기록에서 찾습니다.</p></section>';
  if (!F) return h;
  if (F.st === "ing") return h + '<section class="sec"><p class="muted">찾는 중입니다.</p></section>';
  if (F.st === "err") return h + '<section class="sec"><p class="muted">' + esc(F.err) + "</p></section>";
  if (!F.files.length) return h + '<section class="sec"><p class="muted">「' + esc(F.q) + "」가 들어 있는 자료를 찾지 못했습니다. 다른 낱말로 찾아 보십시오.</p></section>";
  if (S.prep) h += '<p class="when">담기를 누르면 지금 준비(' + esc(S.prep.label) + ")에 들어갑니다.</p>";
  for (const g of GROUPS) {
    const arr = F.files.filter(f => groupOf(f) === g); if (!arr.length) continue;
    h += '<section class="sec"><h2>' + g + " " + arr.length + '</h2><ul class="links">' + arr.map(f => {
      if (g === "성경") { const m = String(f.name).match(/^(\d\d)_(.+?) 0*(\d+)(장|편)$/), b = m && bookByName(m[2]); if (b) return "<li>" + '<button type="button" class="lk" data-act="chOpen" data-arg="' + b.i + ":" + (+m[3]) + '">' + esc(b.name + " " + (+m[3]) + m[4]) + "</button></li>"; }
      const url = docUrl(f.id), can = S.prep && g !== "성경" && g !== "내 기록", keep = can ? { step: keepNo(g), text: f.name, url: url, extra: g } : null;
      return "<li>" + docBtn(f.name, url, keep) + (can ? (stepInfo(keep.step).lines.some(m => m.indexOf(url) >= 0) ? '<span class="kept">담음</span>' : btn("담기", "keep", reg(keep), "inl")) : "") + "</li>";
    }).join("") + "</ul></section>";
  }
  return h;
}

/* ---------- 화면: 나의 현황 ---------- */
function meView() {
  const A = S.act, t = today(), wk = actWeek(A, t), streak = actStreak(A, t), grid = actWeeks12(A, t), names = ["월", "화", "수", "목", "금", "토", "주일"];
  let h = '<section class="sec"><h2>이번 주</h2><div class="week">' + wk.map((d, i) => '<div class="day' + (d.today ? " today" : "") + '"><span class="wd">' + names[i] + '</span><span class="marks">' +
    D.KINDS.map(k => '<i class="mk' + (d.kinds.indexOf(k[0]) >= 0 ? " on" : "") + '">' + k[2] + "</i>").join("") + "</span></div>").join("") + "</div>" +
    '<p class="legend">' + D.KINDS.map(k => "<span><i class=\"mk on\">" + k[2] + "</i>" + k[1] + " " + wk.filter(d => d.kinds.indexOf(k[0]) >= 0).length + "일</span>").join("") + "</p>" +
    (streak ? '<p class="streak"><b>' + streak + "</b>일째 이어지고 있습니다.</p>" : "") + "</section>";
  let days = 0, cells = "";
  for (let r = 0; r < 7; r++) { cells += '<span class="rl">' + (r % 2 === 0 ? names[r] : "") + "</span>"; for (let w = 0; w < 12; w++) { const c = grid[w][r]; if (c.n && !c.future) days++; cells += '<i class="c' + (c.future ? " f" : " l" + c.n) + (c.d === t ? " now" : "") + '"></i>'; } }
  h += '<section class="sec"><h2>최근 12주</h2><div class="g12" role="img" aria-label="최근 12주 가운데 기록이 있는 날 ' + days + '일">' + cells + '</div><p class="muted">기록이 있는 날 ' + days + "일. 색이 짙을수록 그날 한 일의 종류가 많습니다.</p></section>";
  const log = A.log.slice(0, 8), label = {}; D.KINDS.forEach(k => { label[k[0]] = k[1]; });
  h += '<section class="sec"><h2>최근 기록</h2>' + (log.length ? '<ul class="log">' + log.map(e => "<li><span>" + esc(e.d.slice(5)) + "</span><b>" + label[e.k] + "</b>" + esc(e.n) + "</li>").join("") + "</ul>" : '<p class="muted">설교 준비, 성경 읽기, 묵상, 독서를 하면 여기에 쌓입니다.</p>') +
    '<p class="muted" id="syncLine">' + esc(syncText()) + "</p>" + (signedIn() ? btn("지금 맞추기", "syncNow") : "") + "</section>";
  return h;
}

/* ---------- 화면: 설정 ---------- */
function setView() {
  let h = '<section class="sec"><h2>계정</h2>';
  if (signedIn()) h += "<p>" + esc(AUTH.email || "로그인되어 있습니다.") + '</p><div class="row two">' + btn("로그아웃", "logout") + btn("다른 계정으로", "login", "pick") + "</div>";
  else h += '<p class="muted">로그인하지 않았습니다.</p>' + (clientId() ? btn("구글로 로그인", "login", "", "pri wide") : "");
  h += '<p class="muted">자료실은 읽기만 합니다. 앱이 쓰는 글은 「' + esc(D.MY_FOLDER) + "」 폴더에만 만들고, 파일을 지우는 기능은 없습니다. 로그아웃해도 이 기기의 기록은 그대로 둡니다.</p></section>";
  if (!D.OAUTH.clientId) h += '<section class="sec"><h2>연결 값</h2>' + cidHtml() + "</section>";
  h += '<section class="sec"><h2>연결 점검</h2><p class="muted">어디에서 막히는지 한 줄씩 보여 줍니다.</p>' + btn("점검하기", "check") +
    (S.check ? '<ul class="check">' + S.check.map(c => '<li class="' + (c.ok === true ? "ok" : c.ok === false ? "no" : "") + '"><b>' + (c.ok === true ? "됨" : c.ok === false ? "안 됨" : "건너뜀") + "</b>" + esc(c.t) + "</li>").join("") + "</ul>" : "") + "</section>";
  h += '<section class="sec"><h2>버전 v' + BUILD + "</h2>" + D.CHANGELOG.map(c => '<p class="chg"><b>v' + c.v + "</b> " + esc(c.d) + "</p><ul>" + c.t.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>").join("") + btn("새 버전 확인", "updCheck") + "</section>";
  h += '<section class="sec"><h2>원어 자료의 출처</h2>' + D.ORIG.credits.map(c => "<p>" + outLink(c[0], c[2]) + ", " + esc(c[1]) + '</p><p class="muted">' + esc(c[3]) + "</p>").join("") + '<p class="muted">' + esc(D.ORIG.changes) + " 받은 날: " + esc(D.ORIG.ver) + "</p></section>";
  return h;
}
const VIEW = { prep: prepView, bible: bibleView, book: bookView, find: findView, me: meView, set: setView };

/* ---------- 새 판 자동 적용 ---------- */
let busyN = 0;
async function updCheck(manual) {
  try {
    const r = await fetchT("version.json?t=" + Date.now(), { cache: "no-store" }, 8000); if (!r.ok) throw new Error("http");
    const n = +(await r.json()).build || 0;
    if (n > BUILD) { S.upd.want = n; const tried = LS.get("updTry", null) || {}; if (!typing() && !busyN && (tried.n !== n || Date.now() - tried.t > 600000)) updApply(); else paintFlash(); }
    else if (manual) flash("지금이 가장 새 버전입니다 (v" + BUILD + ").");
  } catch (e) { if (manual) flash("새 버전을 확인하지 못했습니다. 인터넷 연결을 확인해 주십시오.", "bad"); }
}
function updApply() { LS.set("updTry", { n: S.upd.want, t: Date.now() }); location.replace(location.pathname + "?v=" + S.upd.want); }

/* ---------- 단추가 하는 일 ---------- */
function closeReader() { const r = S.reader; S.reader = null; render(); if (r) window.scrollTo(0, r.y || 0); }
function keepY(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }
const ACT = {
  tab(t) { U.tab = TITLE[t] ? t : "prep"; saveUi(); S.copy = ""; S.reader = null; S.edit = null; S.word = null; render(); window.scrollTo(0, 0); enter(); },
  flashX() { flash(""); },
  login(mode) {
    if (!clientId()) { flash("연결 값(클라이언트 ID)을 먼저 넣어 주십시오.", "bad"); return; }
    if (mode === "silent") silentGo(); else authGo(mode || "");
  },
  logout() { signOut(); forgetAccount(); S.gate = ""; S.gateMode = ""; flash("로그아웃했습니다. 이 기기의 기록은 그대로 있습니다."); render(); },
  cidSave() {
    const v = val("cid"); if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(v)) { flash("클라이언트 ID 모양이 아닙니다. …apps.googleusercontent.com 으로 끝나는 값입니다.", "bad"); return; }
    LS.set("clientId", v); flash("연결 값을 저장했습니다."); render();
  },
  pickBook(v) { U.b = Math.max(0, Math.min(D.BOOKS.length - 1, +v || 0)); U.ch = 1; saveUi(); S.word = null; S.hit = null; render(); enter(); },
  pickCh(v) { U.ch = Math.max(1, Math.min(book(U.b).chapters, +v || 1)); saveUi(); S.word = null; S.hit = null; if (U.tab === "bible") { render(); enter(); } },
  chStep(d) {
    let b = U.b, ch = U.ch + (+d);
    if (ch < 1) { if (b === 0) return; b--; ch = book(b).chapters; } else if (ch > book(b).chapters) { if (b === D.BOOKS.length - 1) return; b++; ch = 1; }
    U.b = b; U.ch = ch; saveUi(); S.word = null; S.hit = null; render(); window.scrollTo(0, 0); enter();
  },
  chOpen(arg, el, verse) { const p = String(arg).split(":"); U.b = +p[0]; U.ch = +p[1]; U.tab = "bible"; saveUi(); S.reader = null; S.word = null; S.goto = verse || null; S.hit = verse ? { key: chapKey(U.b, U.ch), v: verse } : null; render(); window.scrollTo(0, 0); enter(); },
  refOpen(arg) { const p = String(arg).split(".").map(Number); U.ver = "o"; ACT.chOpen((p[0] - 1) + ":" + p[1], null, String(p[2])); },
  chapReload() { const t = chapTarget(), p = chapLoad(t[0], t[1], true); render(); return p.then(paintChap); },
  origReload() { const t = chapTarget(); delete S.orig[chapKey(t[0], t[1])]; const p = origLoad(t[0], t[1]); render(); return p.then(paintChap); },
  ver(k) { U.ver = k; saveUi(); S.word = null; keepY(render); enter(); },
  whole() { U.whole = !U.whole; saveUi(); render(); },
  word(arg) {
    const p = String(arg || "").split(":"), next = p.length === 4 ? { b: +p[0], ch: +p[1], v: p[2], i: +p[3] } : null, same = next && S.word && ["b", "ch", "v", "i"].every(k => S.word[k] === next[k]);
    S.word = same ? null : next; S.more = {};
    keepY(render);
    const x = wordNow(); if (x) return wordNeed(x.parts).then(paintWord, e => { paintWord(); throw e; });
  },
  more(k) { S.more[k] = !S.more[k]; paintWord(); },
  async wordKeep() {
    const x = wordNow(), P = S.prep; if (!x || !P) return;
    await wordNeed(x.parts);
    const root = x.parts.find(p => p.root) || x.parts[0], L = lexOf(root.strong), e = L && L.e, mo = S.morph && root.code ? S.morph[x.heb ? "H" : "G"][root.code] : null;
    const shown = x.heb ? String(x.w[0]).replace(/[\/\\]/g, "") : String(x.w[0]).replace(/[.,;·]+$/, "");
    const line = stamp(new Date()) + " " + shown + " (" + shortLabel(book(x.W.b), x.W.ch, x.W.v) + ") ← " + (e ? e[0] + " " + e[1] + ", " : "") + root.strong + (mo ? ", " + mo[0] : root.code ? ", " + root.code : "") + ". " + (e && e[3] ? e[3] : String(x.w[2]).replace(/\//g, "")) + " [STEP Bible]";
    await docInsert(P.id, 3, [line]); await prepRefresh(); recordAct("prep", P.label + ", 원어"); flash("낱말을 3. 원어 칸의 메모에 담았습니다."); keepY(render);
  },
  read(arg) { const it = R[+arg]; if (it) return readerOpen(it); },
  readLink(arg) { const c = S.reader && S.reader.stack[S.reader.stack.length - 1], l = c && c.links[+arg]; if (l) return readerOpen({ id: l.id, title: l.title, keep: S.prep ? { step: (c.keep && c.keep.step) || 5, text: l.title, url: l.url, extra: "" } : null }); },
  readBack() { if (!S.reader) return; S.reader.stack.pop(); if (!S.reader.stack.length) closeReader(); else { render(); window.scrollTo(0, 0); } },
  async readKeep() {
    const c = S.reader && S.reader.stack[S.reader.stack.length - 1], P = S.prep; if (!c || !c.keep || !P) return;
    await docInsert(P.id, c.keep.step, [{ pre: stamp(new Date()) + " 담음: ", text: c.keep.text, url: c.keep.url, post: c.keep.extra ? " (" + c.keep.extra + ")" : "" }]);
    await prepRefresh(); recordAct("prep", P.label + ", 담기"); flash("담았습니다. " + c.keep.step + ". " + stepOf(c.keep.step).title + " 칸에 들어갔습니다."); if (S.reader) paintMain();
  },
  async readMonth(kind) { const f = await findInMy(kind + "_" + ym(new Date())); if (!f) { flash("이번 달 " + kind + " 기록이 아직 없습니다."); return; } return readerOpen({ id: f.id, title: f.name.replace("_", " ") }); },
  prepsReload() { S.preps = null; S.prepsSt = ""; render(); return loadPreps(true); },
  prepList() { U.prepId = ""; saveUi(); S.prep = null; S.prepSt = ""; S.copy = ""; S.reader = null; S.edit = null; S.word = null; render(); window.scrollTo(0, 0); S.preps = null; loadPreps(true); },
  prepOpen(id) { U.step = 1; return openPrep(id); },
  async prepStart() {
    const b = book(U.b) || book(0), ch = U.ch, vRaw = val("fV"), date = val("fD") || nextSunday();
    if (vRaw && !parseVerses(vRaw)) { flash("절은 1-10 이나 1, 5 처럼 적어 주십시오.", "bad"); return; }
    const verses = vRaw.replace(/절/g, "").replace(/\s+/g, "").replace(/[~–]/g, "-"), title = prepTitle(date, b, ch, verses), label = passageLabel(b, ch, verses);
    const had = await findInMy(title);
    if (had) { draftSet("f.v", ""); flash("같은 날짜와 본문의 준비가 이미 있어 그것을 엽니다."); U.step = 1; return openPrep(had.id); }
    const C = await chapLoad(b.i, ch);
    const made = await createInMy(title, prepTemplate({ label: label, date: date, chapterTitle: chapterTitle(b, ch), chapterUrl: C.st === "ok" ? C.url : "", today: today() }));
    draftSet("f.v", ""); draftSet("f.d", ""); recordAct("prep", label + ", 준비 시작");
    S.preps = (S.preps || []); S.preps.unshift({ id: made.id, name: title, info: parsePrepTitle(title), label: label });
    U.step = 1; return openPrep(made.id);
  },
  step(no) { U.step = U.step === +no ? 0 : +no; saveUi(); S.copy = ""; S.edit = null; S.word = null; S.clash = null; render(); scrollStep(); enter(); },
  async memoSave(arg) {
    const no = +arg, P = S.prep, key = "p." + P.id + "." + no, el = $("memo" + no), text = String(el ? el.value : draft(key)).trim();
    if (!text) { flash("적은 것이 없습니다.", "bad"); return; }
    const st = stamp(new Date()), lines = text.split("\n").map(x => x.trim()).filter(Boolean).map((t, i) => (i ? "" : st + " ") + t);
    await docInsert(P.id, no, lines);
    draftSet(key, ""); await prepRefresh(); recordAct("prep", P.label + ", " + stepOf(no).title); flash("메모를 저장했습니다."); keepY(render);
  },
  lineEdit(arg) { const p = String(arg).split(":"); S.edit = { no: +p[0], k: +p[1], empty: false }; keepY(render); const el = $("lineBox"); if (el) el.focus(); },
  lineCancel() { S.edit = null; keepY(render); },
  async lineSave() {
    const E = S.edit, P = S.prep; if (!E || !P) return;
    const old = stepInfo(E.no).lines[E.k], text = val("lineBox");
    if (text === old) { S.edit = null; keepY(render); return; }
    if (!text && !E.empty) { E.empty = true; flash("비운 채로 저장하면 이 메모 줄이 없어집니다. 그래도 하려면 한 번 더 눌러 주십시오.", "bad"); return; }
    try { await docLine(P.id, E.no, E.k, old, text); }
    catch (e) { if (e.code !== "conflict") throw e; S.edit = null; await prepRefresh(); keepY(render); flash("그사이 이 줄이 바뀌어 고치지 않았습니다. 새로 불러왔습니다.", "bad"); return; }
    S.edit = null; await prepRefresh(); flash(text ? "메모를 고쳤습니다." : "메모 줄을 없앴습니다."); keepY(render);
  },
  async bodySave(arg, el, force) {
    const no = +arg, P = S.prep, s = stepOf(no), key = "w." + P.id + "." + no, box = $("body" + no), text = String(box ? box.value : draft(key));
    if (!text.trim()) { flash("적은 것이 없습니다.", "bad"); return; }
    try { await docBody(P.id, no, s.title, text, stepInfo(no).lines.join("\n"), !!force); }
    catch (e) { if (e.code !== "conflict") throw e; S.clash = { no: no, current: e.current || "" }; flash("다른 곳에서 이 칸이 바뀌어 덮어쓰지 않았습니다.", "bad"); keepY(render); return; }
    S.clash = null; draftSet(key, ""); await prepRefresh(); recordAct("prep", P.label + ", " + s.title); flash(s.title + "를 저장했습니다."); keepY(render);
  },
  bodyForce(arg) { return ACT.bodySave(arg, null, true); },
  async keep(arg) {
    const it = R[+arg], P = S.prep; if (!it || !P) return;
    await docInsert(P.id, it.step, [{ pre: stamp(new Date()) + " 담음: ", text: it.text, url: it.url, post: it.extra ? " (" + it.extra + ")" : "" }]);
    await prepRefresh(); recordAct("prep", P.label + ", 담기"); flash("담았습니다. " + it.step + ". " + stepOf(it.step).title + " 칸에 들어갔습니다."); keepY(render);
  },
  async logos(arg) {
    const no = +arg, P = S.prep, s = stepOf(no);
    const text = logosPrompt({ label: P.label, stepNo: no, stepTitle: s.title, docUrl: P.url, notes: stepInfo(no).lines.filter(m => m.trim()).map(m => splitLinks(m, true).map(p => p.t).join("")) });
    try { await navigator.clipboard.writeText(text); S.copy = ""; flash("복사했습니다. Claude 대화에 붙여 넣어 주십시오."); }
    catch (e) { S.copy = text; flash("저절로 복사하지 못했습니다. 아래 글을 길게 눌러 복사해 주십시오.", "bad"); }
    keepY(render);
  },
  async readDone() { const label = passageLabel(book(U.b), U.ch, ""); recordAct("read", label); flash(label + "을 읽은 것으로 적었습니다."); keepY(render); },
  async qtSave() {
    const b = book(U.b), label = passageLabel(b, U.ch, ""), key = "qt." + U.b + "." + U.ch, text = val("qtText");
    if (!text) { flash("적은 것이 없습니다.", "bad"); return; }
    const when = new Date(), doc = await monthDoc("묵상", when);
    await docInsert(doc.id, 0, ["[묵상] " + ymd(when) + " " + label].concat(text.split("\n").map(x => x.trim()).filter(Boolean)));
    draftSet(key, ""); recordAct("qt", label); flash("묵상을 저장했습니다."); keepY(render);
  },
  bookPick(t) { draftSet("bk.t", t); render(); },
  async bookSave() {
    const t = val("bkT"), p = val("bkP"), r = val("bkR"), x = val("bkX");
    if (!t) { flash("책 제목을 적어 주십시오.", "bad"); return; }
    if (!x) { flash("적은 것이 없습니다.", "bad"); return; }
    const when = new Date(), doc = await monthDoc("독서", when);
    await docInsert(doc.id, 0, ["[독서] " + ymd(when) + " " + t + (p ? ", " + p + "쪽" : "") + (r ? ", 관련 본문 " + r : "")].concat(x.split("\n").map(y => y.trim()).filter(Boolean)));
    LS.set("books", [t].concat((LS.get("books", []) || []).filter(y => y !== t)).slice(0, 6));
    draftSet("bk.p", ""); draftSet("bk.x", ""); draftSet("bk.r", ""); recordAct("book", t + (p ? ", " + p + "쪽" : "")); flash("독서 기록을 저장했습니다."); render();
  },
  async find() {
    const q = val("q") || draft("q"); if (!q) { flash("찾을 말을 적어 주십시오.", "bad"); return; }
    if (S.find && S.find.st === "ing") return;
    S.find = { st: "ing", q: q }; render();
    try {
      const F = D.FOLDERS, ps = ["bible", "yoji", "illust", "mine", "manu", "read"].map(k => "'" + F[k] + "' in parents"), my = LS.get("myFolder", ""); if (my) ps.push("'" + q1(my) + "' in parents");
      const bf = await bookFolders(); Object.keys(bf).forEach(k => ps.push("'" + q1(bf[k]) + "' in parents"));
      S.find = { st: "ok", q: q, files: await gList("fullText contains '" + q1(q) + "' and (" + ps.join(" or ") + ")", { size: 40 }) };
    } catch (e) { S.find = { st: "err", q: q, err: explain(e) }; if (e.code === "login" || e.code === "scope") fail(e); }
    if (!S.reader) render();
  },
  syncNow() { return syncNow(); },
  async check() { if (S.checking) return; S.checking = true; try { await runCheck(); } finally { S.checking = false; } },
  updCheck() { return updCheck(true); },
  updNow() { if (S.upd.want > BUILD) updApply(); }
};
/* 연결 점검: 어디에서 막히는지 한 줄씩 */
async function runCheck() {
  const out = [], add = (ok, t) => { out.push({ ok: ok, t: t }); S.check = out.slice(); if (U.tab === "set" && !S.reader) paintMain(); };
  S.check = [];
  add(!!clientId(), clientId() ? "연결 값(클라이언트 ID)이 들어 있습니다." : "연결 값(클라이언트 ID)이 없습니다.");
  try { const d = await getJson("info.json"); add(true, "원어 자료가 들어 있습니다: " + d.counts.chapters + "장, 받은 날 " + d.made); } catch (e) { add(false, "원어 자료를 읽지 못했습니다."); }
  if (!signedIn()) { add(false, "로그인되어 있지 않습니다. 로그인한 뒤 다시 점검해 주십시오."); return; }
  add(scopesOk() || !AUTH.scopes, (scopesOk() || !AUTH.scopes) ? "로그인: " + (AUTH.email || "계정 확인됨") + ", 드라이브 권한 두 가지를 받았습니다." : "드라이브 권한이 빠져 있습니다. 다시 로그인하고 허락 화면의 칸을 모두 체크해 주십시오.");
  try { const m = await gMeta(D.FOLDERS.root); add(true, "자료실 폴더를 읽었습니다: " + m.name); } catch (e) { add(false, "자료실 폴더: " + explain(e)); return; }
  try {
    const C = await chapLoad(0, 1, true);
    if (C.st === "ok") add(true, "성경 장 문서를 읽었습니다: " + C.title + ", " + C.data.order.map(v => v + " " + (C.data.texts[v] || []).filter(x => x.n).length + "절").join(", "));
    else add(C.st === "none" ? null : false, C.st === "none" ? "창세기 1장 문서가 아직 없습니다(성경 뼈대 작업 중)." : "성경 장 문서: " + C.err);
  } catch (e) { add(false, "성경 장 문서: " + explain(e)); }
  try {
    const fid = await myFolder(false, true);
    if (!fid) { add(null, "「" + D.MY_FOLDER + "」 폴더는 아직 없습니다. 준비나 기록을 처음 저장할 때 만듭니다."); return; }
    const docs = (await listMy(1)) || [];
    if (!docs.length) { add(true, "「" + D.MY_FOLDER + "」 폴더가 있습니다. 문서 쓰기는 처음 저장할 때 확인됩니다."); return; }
    const d = docRoot(await docGet(docs[0].id)); add(!!d, d ? "구글 문서 읽기(Docs API)가 됩니다: " + docs[0].name : "구글 문서를 읽지 못했습니다.");
  } catch (e) { add(false, "내 기록 폴더와 문서: " + explain(e)); }
}
function runAct(name, arg, el) {
  const fn = ACT[name]; if (!fn) return;
  let r; try { r = fn(arg, el); } catch (e) { fail(e); return; }
  if (r && typeof r.then === "function") {
    busyN++; if (el && el.tagName === "BUTTON") { el.disabled = true; el.classList.add("busy"); }
    r.catch(fail).then(() => { busyN--; if (el && el.isConnected) { el.disabled = false; el.classList.remove("busy"); } });
  }
}
document.addEventListener("click", ev => { const el = ev.target.closest ? ev.target.closest("[data-act]") : null; if (!el || el.disabled) return; ev.preventDefault(); runAct(el.dataset.act, el.dataset.arg, el); });
document.addEventListener("change", ev => { const el = ev.target; if (el.dataset && el.dataset.draft) draftSet(el.dataset.draft, el.value); if (el.dataset && el.dataset.chg) runAct(el.dataset.chg, el.value, el); });
document.addEventListener("input", ev => {
  const el = ev.target; if (!el.dataset || !el.dataset.draft) return;
  draftSet(el.dataset.draft, el.value);
  if (el.dataset.dirty) { const d = $("dirty" + el.dataset.dirty); if (d) d.textContent = "저장하지 않은 글이 있습니다."; }
});
document.addEventListener("keydown", ev => { const el = ev.target; if (ev.key === "Enter" && !ev.isComposing && el.dataset && el.dataset.enter) { ev.preventDefault(); draftSet(el.dataset.draft, el.value); runAct(el.dataset.enter, null, null); } });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  updCheck(false);
  if (signedIn() && AUTH.exp - Date.now() > 600000) syncSoon(500); else if (canSilent() && !typing() && !busyN) silentGo(); else if (signedIn()) syncSoon(500);
});
/* 뒤로 가기: 읽던 자료를 닫고, 준비 안이면 목록으로, 다른 탭이면 준비로, 처음 화면이면 앱에서 나간다 */
window.addEventListener("popstate", () => {
  const deeper = !!S.reader || (U.tab === "prep" && U.prepId) || U.tab !== "prep";
  if (!deeper) { history.back(); return; }
  if (S.reader) ACT.readBack(); else if (U.tab === "prep") ACT.prepList(); else ACT.tab("prep");
  try { history.pushState({ sb: "top" }, ""); } catch (e) {}
});

/* ---------- 시작 ---------- */
function boot() {
  authLoad();
  const back = authReturn();
  if (back && !back.ok) { S.gate = back.silent ? "" : loginWhy(back.error); }
  else if (back && back.ok && AUTH.scopes && !scopesOk()) { signOut(); S.gate = "드라이브 권한이 빠져 있습니다. 다시 로그인하고 구글 허락 화면의 칸을 모두 체크해 주십시오."; S.gateMode = "consent"; }
  else if (!back && (!signedIn() || AUTH.exp - Date.now() < 600000) && canSilent()) { silentGo(); return; }
  try { history.replaceState({ sb: "base" }, ""); history.pushState({ sb: "top" }, ""); } catch (e) {}
  const seen = LS.get("seenBuild", 0);
  if (seen && seen < BUILD) flash("새 버전 v" + BUILD + "로 바꿨습니다. " + ((D.CHANGELOG[0] && D.CHANGELOG[0].t[0]) || ""), "ok", null, true);
  LS.set("seenBuild", BUILD);
  render();
  if (signedIn()) afterSignIn(!!(back && back.ok && !back.silent));
  updCheck(false);
  setInterval(() => updCheck(false), 120000);
}
boot();
