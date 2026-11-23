/* 세컨브레인 — 계산과 기기 저장. 화면과 떨어져 있어 따로 시험할 수 있다. */
"use strict";
const BUILD = 4;

/* ---------- 작은 도구 ---------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const ym = d => d.getFullYear() + "-" + pad2(d.getMonth() + 1);
const stamp = d => pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
const dayAdd = (s, n) => { const p = s.split("-").map(Number); const d = new Date(p[0], p[1] - 1, p[2] + n); return ymd(d); };
const safeUrl = u => (/^https:\/\//.test(String(u || "")) ? String(u) : "#");
function unesc(s) { return String(s).replace(/\\([\\`*_{}\[\]()#+\-.!~|>])/g, "$1"); }

/* ---------- 기기 저장 ---------- */
const LS = {
  get(k, dflt) { try { const v = localStorage.getItem("sb." + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
  set(k, v) { try { localStorage.setItem("sb." + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem("sb." + k); } catch (e) {} }
};

/* ---------- 성경 본문과 장 문서 ---------- */
const book = i => { const b = D.BOOKS[i]; return b ? { i: i, order: i + 1, name: b[0], abbr: b[1], chapters: b[2] } : null; };
const bookByName = n => { const i = D.BOOKS.findIndex(b => b[0] === n); return i < 0 ? null : book(i); };
const unitOf = b => (b.name === "시편" ? "편" : "장");
function chapterTitle(b, ch) { const ps = b.name === "시편"; return pad2(b.order) + "_" + b.name + " " + String(ch).padStart(ps ? 3 : 2, "0") + (ps ? "편" : "장"); }
function passageLabel(b, ch, verses) { const v = String(verses || "").replace(/절/g, "").replace(/\s+/g, ""); return b.name + " " + ch + (v ? ":" + v : unitOf(b)); }
function shortLabel(b, ch, verses) { const v = String(verses || "").replace(/절/g, "").replace(/\s+/g, ""); return b.abbr + " " + ch + (v ? ":" + v : ""); }
function prepTitle(date, b, ch, verses) { return "준비_" + date + "_" + passageLabel(b, ch, verses); }
function parsePrepTitle(title) {
  const m = String(title || "").match(/^준비_(\d{4}-\d{2}-\d{2})_(.+?)\s+(\d+)(?::([\d,\-~–\s]+)|편|장)?$/);
  if (!m) return null; const b = bookByName(m[2]); if (!b) return null;
  return { date: m[1], bookIndex: b.i, ch: parseInt(m[3], 10), verses: (m[4] || "").trim() };
}
/* "1-10", "1, 5", "3" → 절 번호 모음. 비어 있으면 null(장 전체) */
function parseVerses(s) {
  const str = String(s || "").replace(/절/g, "").trim(); if (!str) return null;
  const set = new Set();
  for (const part of str.split(/[,\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)\s*[-~–]\s*(\d+)$/);
    if (m) { const a = +m[1], z = +m[2]; if (a <= z && z - a < 200) for (let i = a; i <= z; i++) set.add(i); }
    else if (/^\d+$/.test(part)) set.add(+part);
  }
  return set.size ? set : null;
}
/* 장 문서(드라이브가 마크다운으로 내어 준 글)에서 걸린 자료와 역본별 본문을 꺼낸다 */
function parseChapter(md) {
  const out = { links: {}, texts: {}, order: [] };
  let mode = null, sec = null, ver = null;
  for (const raw of String(md || "").split("\n")) {
    const line = raw.replace(/\s+$/, ""); if (!line.trim()) continue;
    if (/^##\s+/.test(line) && !/^###/.test(line)) {
      const t = unesc(line.replace(/^##\s+/, "").trim()); const m = t.match(/^본문\s*\((.+)\)$/);
      if (m) { mode = "text"; ver = m[1]; out.texts[ver] = []; out.order.push(ver); }
      else if (t.indexOf("걸린 자료") >= 0) mode = "links"; else mode = null;
      sec = null; continue;
    }
    if (/^###\s+/.test(line)) {
      const t = unesc(line.replace(/^###\s+/, "").trim());
      if (mode === "links") { sec = t; out.links[sec] = out.links[sec] || []; } else if (mode === "text") out.texts[ver].push({ h: t });
      continue;
    }
    if (mode === "links" && sec) {
      const m = line.match(/^\s*[-*]\s+\[(.+)\]\((https?:\/\/[^\s)]+)\)(?:\s*·\s*(.*))?$/);
      if (m) out.links[sec].push({ text: unesc(m[1]), url: unesc(m[2]), extra: m[3] ? unesc(m[3]) : "" });
      continue;
    }
    if (mode === "text") {
      const m = line.match(/^\s*\*\*(\d+)\*\*\s*(.*)$/); const arr = out.texts[ver];
      if (m) arr.push({ n: parseInt(m[1], 10), t: unesc(m[2]) });
      else if (arr.length && arr[arr.length - 1].t !== undefined) arr[arr.length - 1].t += " " + unesc(line.trim());
    }
  }
  return out;
}

/* ---------- 준비 문서 ---------- */
const cell = s => String(s || "").replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim();
const anchorOf = no => "(메모 자리 " + no + ")";
function prepTemplate(o) {
  const L = ["# 준비: " + cell(o.label), "", "| 항목 | 내용 |", "|---|---|", "| 종류 | 설교 준비 |", "| 본문 | " + cell(o.label) + " |", "| 날짜 | " + cell(o.date) + " |",
    "| 장 문서 | " + (o.chapterUrl ? "[" + cell(o.chapterTitle) + "](" + o.chapterUrl + ")" : "[확인 필요]") + " |", "| 만든 곳 | 세컨브레인 앱, " + cell(o.today) + " |", ""];
  for (const s of D.STEPS) L.push("## " + s.no + ". " + s.title, "", anchorOf(s.no), "");
  return L.join("\n");
}
const docIdOf = url => { const m = String(url || "").match(/^https:\/\/docs\.google\.com\/document\/d\/([\w-]{10,})/); return m ? m[1] : ""; };
/* 줄 속의 [글](주소)를 조각으로 나눈다. raw: 글자를 그대로 둔다(앱이 쓴 글). 아니면 구글이 붙인 역슬래시를 벗긴다(내보낸 글). */
function splitLinks(line, raw) {
  const parts = [], fix = raw ? (x => x) : unesc, re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g; let last = 0, m;
  while ((m = re.exec(line))) { if (m.index > last) parts.push({ t: fix(line.slice(last, m.index)) }); parts.push({ t: fix(m[1]), url: fix(m[2]) }); last = re.lastIndex; }
  if (last < line.length) parts.push({ t: fix(line.slice(last)) });
  return parts;
}
function docRoot(payload) {
  let d = payload; if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return null; } }
  if (d && d.content && d.content.tabs) d = d.content;
  return (d && d.tabs) ? d : null;
}
/* 구글 문서의 문단 하나를 한 줄 글로. 링크는 [글](주소)로 적는다. */
function paraLine(p) {
  let out = "";
  for (const r of p.elements || []) {
    if (r.textRun) { const t = String(r.textRun.content || "").replace(/\n$/, "").replace(/[\n\u000b]/g, " "), u = r.textRun.textStyle && r.textRun.textStyle.link && r.textRun.textStyle.link.url; out += (u && t.trim()) ? "[" + t + "](" + u + ")" : t; }
    else if (r.richLink && r.richLink.richLinkProperties) { const q = r.richLink.richLinkProperties; out += "[" + (q.title || q.uri) + "](" + q.uri + ")"; }
  }
  return out;
}
/* 준비 문서를 단계별로 읽는다. lines: 메모 자리 앞의 줄(앱에서 고칠 수 있음), tail: 메모 자리 뒤의 줄(보기만), complex: 표 같은 것이 섞여 있음 */
function prepRead(doc) {
  const body = doc.tabs[0].documentTab.body.content, steps = {}, order = []; let cur = null;
  for (const el of body) {
    const p = el.paragraph;
    if (!p) { if (cur && (el.table || el.tableOfContents)) cur.complex = true; continue; }
    const st = (p.paragraphStyle && p.paragraphStyle.namedStyleType) || "", line = paraLine(p), plain = line.trim();
    const h = st === "HEADING_2" && plain.match(/^(\d+)\.\s+(.*)$/);
    if (h) { cur = { no: +h[1], title: h[2], lines: [], els: [], tail: [], complex: false, head: el, anchor: null, end: el.endIndex }; if (!steps[cur.no]) { steps[cur.no] = cur; order.push(cur.no); } else cur = null; continue; }
    if (st === "HEADING_1" || st === "HEADING_2" || st === "TITLE") { cur = null; continue; }
    if (!cur) continue;
    cur.end = el.endIndex;
    if (!cur.anchor && plain === anchorOf(cur.no)) { cur.anchor = el; continue; }
    if (cur.anchor) { if (plain) cur.tail.push(line); continue; }
    cur.lines.push(line); cur.els.push(el);
  }
  for (const no of order) { const c = steps[no]; while (c.lines.length && !c.lines[c.lines.length - 1].trim()) { c.lines.pop(); c.els.pop(); } }
  return { steps: steps, order: order, revisionId: doc.revisionId, documentId: doc.documentId };
}
const one = v => String(v == null ? "" : v).replace(/[\r\n\u000b]+/g, " ");
/* 줄 하나를 조각 묶음으로: {pre,text,url,post} 모양이나 "글 [제목](주소)" 모양의 글 */
function toSegs(l) {
  if (typeof l === "string") return splitLinks(one(l), true);
  const out = []; if (l.pre) out.push({ t: one(l.pre) }); if (l.text) out.push(l.url ? { t: one(l.text), url: l.url } : { t: one(l.text) }); if (l.post) out.push({ t: one(l.post) });
  return out;
}
const segText = segs => segs.map(x => x.t).join("");
/* first 자리에서 시작하는 줄들의 링크·문단 모양 요청. gap: 줄 사이 글자 수(줄바꿈 1). clear: 링크가 아닌 조각의 링크를 지운다 */
function styleReqs(tabId, first, lines, clear) {
  const reqs = []; let pos = first;
  for (const segs of lines) {
    for (const g of segs) {
      const n = g.t.length;
      if (n && g.url) reqs.push({ updateTextStyle: { range: { startIndex: pos, endIndex: pos + n, tabId: tabId }, textStyle: { link: { url: g.url } }, fields: "link" } });
      else if (n && clear) reqs.push({ updateTextStyle: { range: { startIndex: pos, endIndex: pos + n, tabId: tabId }, textStyle: {}, fields: "link" } });
      pos += n;
    }
    pos += 1;
  }
  return { reqs: reqs, end: pos - 1 };
}
const normal = (tabId, a, b) => ({ updateParagraphStyle: { range: { startIndex: a, endIndex: Math.max(b, a + 1), tabId: tabId }, paragraphStyle: { namedStyleType: "NORMAL_TEXT" }, fields: "namedStyleType" } });
/* 단계 칸에 줄을 더하는 요청. 메모 자리 줄 바로 위에 넣는다. 자리 줄이 없으면 단계 제목 아래, 그것도 없으면(stepNo 0 포함) 문서 맨 끝. */
function memoRequests(doc, stepNo, lines) {
  const tab = doc.tabs[0], tabId = tab.tabProperties.tabId, body = tab.documentTab.body.content;
  let anchor = null, heading = null, lastEnd = 1;
  for (const el of body) {
    if (el.endIndex) lastEnd = el.endIndex;
    const p = el.paragraph; if (!p) continue;
    const plain = (p.elements || []).map(r => (r.textRun ? r.textRun.content : "")).join("").trim();
    const st = p.paragraphStyle && p.paragraphStyle.namedStyleType;
    if (!anchor && plain === anchorOf(stepNo)) anchor = el;
    if (!heading && st === "HEADING_2" && plain.indexOf(stepNo + ". ") === 0) heading = el;
  }
  const clean = lines.map(toSegs).filter(g => segText(g).trim());
  if (!clean.length) return null;
  let at, block, first;
  if (anchor) { at = anchor.startIndex; block = clean.map(g => segText(g) + "\n").join(""); first = at; }
  else if (heading && heading.endIndex < lastEnd) { at = heading.endIndex; block = clean.map(g => segText(g) + "\n").join(""); first = at; }
  else { at = lastEnd - 1; block = clean.map(g => "\n" + segText(g)).join(""); first = at + 1; }
  const st = styleReqs(tabId, first, clean, false);
  return { documentId: doc.documentId, requests: [{ insertText: { location: { index: at, tabId: tabId }, text: block } }].concat(st.reqs, [normal(tabId, first, st.end)]), writeControl: { requiredRevisionId: doc.revisionId }, where: anchor ? "anchor" : (heading ? "heading" : "end") };
}
/* 메모 한 줄을 고치는 요청. 그 줄이 그사이 바뀌었으면 { conflict: true }. 새 글이 비면 줄을 없앤다. */
function lineRequests(doc, stepNo, k, oldText, newText) {
  const info = prepRead(doc).steps[stepNo]; if (!info) return { conflict: true };
  let i = k; if (info.lines[i] !== oldText) { const hits = info.lines.map((t, j) => (t === oldText ? j : -1)).filter(j => j >= 0); if (hits.length !== 1) return { conflict: true }; i = hits[0]; }
  const el = info.els[i], tabId = doc.tabs[0].tabProperties.tabId, a = el.startIndex, b = el.endIndex, segs = toSegs(String(newText || "").trim()), reqs = [];
  if (!segText(segs).trim()) reqs.push({ deleteContentRange: { range: { startIndex: a, endIndex: b, tabId: tabId } } });
  else {
    if (b - 1 > a) reqs.push({ deleteContentRange: { range: { startIndex: a, endIndex: b - 1, tabId: tabId } } });
    reqs.push({ insertText: { location: { index: a, tabId: tabId }, text: segText(segs) } });
    Array.prototype.push.apply(reqs, styleReqs(tabId, a, [segs], true).reqs);
  }
  return { documentId: doc.documentId, requests: reqs, writeControl: { requiredRevisionId: doc.revisionId } };
}
/* 쓰는 칸(개요, 원고)의 글 전체를 바꾸는 요청. current: 지금 문서에 있는 글(다른 곳에서 바뀌었는지 견주는 데 쓴다). 단계 칸이 문서에 없으면 맨 끝에 만든다. */
function bodyRequests(doc, stepNo, title, text) {
  const tab = doc.tabs[0], tabId = tab.tabProperties.tabId, body = tab.documentTab.body.content, lastEnd = body[body.length - 1].endIndex;
  const info = prepRead(doc).steps[stepNo], reqs = [];
  const raw = String(text || "").replace(/\r/g, "").split("\n").map(x => x.replace(/\s+$/, "")); while (raw.length && !raw[raw.length - 1]) raw.pop(); while (raw.length && !raw[0]) raw.shift();
  const lines = raw.map(toSegs), out = { documentId: doc.documentId, writeControl: { requiredRevisionId: doc.revisionId }, current: info ? info.lines.join("\n") : "", complex: !!(info && info.complex) };
  if (!info) {
    const all = [[{ t: stepNo + ". " + title }]].concat(lines, [[{ t: anchorOf(stepNo) }]]), first = lastEnd, st = styleReqs(tabId, first, all, false);
    reqs.push({ insertText: { location: { index: lastEnd - 1, tabId: tabId }, text: all.map(g => "\n" + segText(g)).join("") } });
    Array.prototype.push.apply(reqs, st.reqs);
    reqs.push({ updateParagraphStyle: { range: { startIndex: first, endIndex: first + all[0][0].t.length, tabId: tabId }, paragraphStyle: { namedStyleType: "HEADING_2" }, fields: "namedStyleType" } });
    reqs.push(normal(tabId, first + all[0][0].t.length + 1, st.end));
  } else {
    const a = info.head.endIndex, atEnd = !info.anchor && info.end >= lastEnd, b = info.anchor ? info.anchor.startIndex : (atEnd ? lastEnd - 1 : info.end);
    if (b > a) reqs.push({ deleteContentRange: { range: { startIndex: a, endIndex: b, tabId: tabId } } });
    if (lines.length) {
      /* 보통은 제목 바로 아래에 "줄\n" 으로 넣는다. 문서가 이 칸에서 끝나면 마지막 줄바꿈은 지울 수 없으므로 모양을 달리한다. */
      const tailOnly = a >= lastEnd, first = tailOnly ? lastEnd : a, st = styleReqs(tabId, first, lines, true);
      const text = tailOnly ? lines.map(g => "\n" + segText(g)).join("") : atEnd ? lines.map(segText).join("\n") : lines.map(g => segText(g) + "\n").join("");
      reqs.push({ insertText: { location: { index: tailOnly ? lastEnd - 1 : a, tabId: tabId }, text: text } });
      Array.prototype.push.apply(reqs, st.reqs); reqs.push(normal(tabId, first, st.end));
    }
  }
  out.requests = reqs;
  return out;
}

/* ---------- 자료 읽기: 구글이 마크다운으로 내어 준 글을 화면 글로 ----------
   모든 글자는 먼저 안전하게 바꾼 뒤에 굵은 글씨·링크만 되살린다. linkFn(글, 주소)이 링크 모양을 정한다. */
function mdInline(s, linkFn) {
  const keep = [], hold = h => { keep.push(h); return "\u0001" + (keep.length - 1) + "\u0002"; };
  let t = String(s).replace(/!\[[^\]]*\]\[[^\]]*\]|!\[[^\]]*\]\([^)]*\)/g, "");
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, a, u) => hold(linkFn(unesc(a), unesc(u))));
  t = esc(unesc(t));
  t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,!?]|$)/g, "$1<i>$2</i>");
  return t.replace(/\u0001(\d+)\u0002/g, (m, i) => keep[+i]);
}
function mdHtml(md, linkFn) {
  const link = linkFn || ((t, u) => '<a href="' + esc(safeUrl(u)) + '" target="_blank" rel="noopener">' + esc(t) + "</a>");
  const src = String(md || "").replace(/\r/g, "").split("\n"), out = []; let list = "", table = null;
  const closeList = () => { if (list) { out.push("</" + list + ">"); list = ""; } };
  const closeTable = () => { if (table) { out.push('<div class="tbl"><table>' + table.map((r, i) => "<tr>" + r.map(c => (i ? "<td>" : "<th>") + mdInline(c, link) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</table></div>"); table = null; } };
  for (const rawLine of src) {
    const line = rawLine.replace(/\s+$/, "");
    if (/^\[[^\]]+\]:\s*<?data:/.test(line)) continue;                       /* 문서에 박힌 그림 자료 */
    if (/^\s*\|.*\|\s*$/.test(line)) { closeList(); const cells = line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()); if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue; (table = table || []).push(cells); continue; }
    closeTable();
    if (!line.trim()) { closeList(); continue; }
    if (/^\(메모 자리 \d+\)$/.test(unesc(line.trim()))) continue;
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { closeList(); const lv = Math.min(4, m[1].length + 1); out.push("<h" + lv + ">" + mdInline(m[2], link) + "</h" + lv + ">"); continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { closeList(); out.push("<hr>"); continue; }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push("<li>" + mdInline(m[1], link) + "</li>"); continue; }
    if ((m = line.match(/^\s*\d+\\?[.)]\s+(.*)$/))) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push("<li>" + mdInline(m[1], link) + "</li>"); continue; }
    closeList();
    if ((m = line.match(/^\s*>\s?(.*)$/))) { out.push("<blockquote>" + mdInline(m[1], link) + "</blockquote>"); continue; }
    out.push("<p>" + mdInline(line, link) + "</p>");
  }
  closeList(); closeTable();
  return out.join("");
}
function logosPrompt(o) {
  const what = o.stepNo === 3 ? "본문의 주요 낱말을 원어로 살펴 뜻, 쓰임, 문법에서 눈여겨볼 것을 정리" : "내 서재의 주석과 영어 자료에서 이 본문 해설을 읽고 한국어로 정리";
  return ["세컨브레인 작업이다. 로고스에서 연구해 줘.", "- 본문: " + o.label, "- 할 일: " + what,
    "- 내가 적어 둔 것: " + (o.notes && o.notes.length ? o.notes.join(" / ") : "(없음)"),
    "- 결과는 준비 문서 " + o.docUrl + " 의 \"" + o.stepNo + ". " + o.stepTitle + "\" 칸에 넣어 줘.",
    "- 책 이름과 쪽을 출처로 붙이고, 자료에 없는 말은 쓰지 마. 확인 못 한 것은 [확인 필요]로 표시해 줘."].join("\n");
}

/* ---------- 활동 기록 (나의 현황) ----------
   days: { "2026-11-23": { prep: 2, read: 1, qt: 1, book: 0 } }  날마다 종류별 횟수
   log:  [{ id, d, k, n }]  최근 기록 200개 (무엇을 했는지 한 줄)
   합칠 때는 덮어쓰지 않는다. 날·종류마다 큰 쪽을 남기고, log는 id로 모은다. */
const ACT_KEYS = ["prep", "read", "qt", "book"];
function actEmpty() { return { app: "second-brain", v: 1, days: {}, log: [] }; }
function actNorm(a) {
  const o = actEmpty(); if (!a || typeof a !== "object") return o;
  if (a.days && typeof a.days === "object") for (const d of Object.keys(a.days).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue; const src = a.days[d] || {}; const row = {};
    for (const k of ACT_KEYS) { const n = Math.floor(+src[k] || 0); if (n > 0) row[k] = n; }
    if (Object.keys(row).length) o.days[d] = row;
  }
  if (Array.isArray(a.log)) for (const e of a.log) if (e && e.id && /^\d{4}-\d{2}-\d{2}$/.test(e.d || "") && ACT_KEYS.indexOf(e.k) >= 0) o.log.push({ id: String(e.id), d: e.d, k: e.k, n: String(e.n || "").slice(0, 80) });
  return o;
}
function actMerge(a, b) {
  const A = actNorm(a), B = actNorm(b), o = actEmpty();
  for (const d of Array.from(new Set(Object.keys(A.days).concat(Object.keys(B.days)))).sort()) {
    const row = {}; for (const k of ACT_KEYS) { const n = Math.max((A.days[d] || {})[k] || 0, (B.days[d] || {})[k] || 0); if (n > 0) row[k] = n; }
    o.days[d] = row;
  }
  const seen = new Set();
  for (const e of A.log.concat(B.log)) { if (seen.has(e.id)) continue; seen.add(e.id); o.log.push(e); }
  o.log.sort((x, y) => (x.id < y.id ? 1 : -1)); o.log = o.log.slice(0, 200);
  return o;
}
function actTotal(a) { let n = 0; const A = actNorm(a); for (const d of Object.keys(A.days)) for (const k of ACT_KEYS) n += A.days[d][k] || 0; return n; }
function actSame(a, b) { const A = actNorm(a), B = actNorm(b), ids = x => x.log.map(e => e.id).sort().join(","); return JSON.stringify(A.days) === JSON.stringify(B.days) && ids(A) === ids(B); }
function actAdd(a, kind, note, when) {
  const o = actNorm(a), d = ymd(when), row = o.days[d] || (o.days[d] = {});
  row[kind] = (row[kind] || 0) + 1;
  o.log.unshift({ id: when.getTime() + "-" + Math.random().toString(36).slice(2, 7), d: d, k: kind, n: String(note || "").slice(0, 80) });
  o.log = o.log.slice(0, 200);
  return o;
}
const dayHas = (a, d) => { const r = a.days[d]; return !!r && ACT_KEYS.some(k => r[k] > 0); };
/* 오늘(또는 어제)까지 이어진 날 수 */
function actStreak(a, today) {
  const A = actNorm(a); let d = today; if (!dayHas(A, d)) d = dayAdd(d, -1);
  let n = 0; while (dayHas(A, d)) { n++; d = dayAdd(d, -1); }
  return n;
}
/* 이번 주(월~일) 일곱 날 */
function actWeek(a, today) {
  const A = actNorm(a), p = today.split("-").map(Number), dow = (new Date(p[0], p[1] - 1, p[2]).getDay() + 6) % 7, mon = dayAdd(today, -dow), out = [];
  for (let i = 0; i < 7; i++) { const d = dayAdd(mon, i); out.push({ d: d, kinds: ACT_KEYS.filter(k => (A.days[d] || {})[k] > 0), today: d === today, future: d > today }); }
  return out;
}
/* 최근 12주: 주마다 일곱 칸(월~일). 값은 그날 한 종류 수 */
function actWeeks12(a, today) {
  const A = actNorm(a), p = today.split("-").map(Number), dow = (new Date(p[0], p[1] - 1, p[2]).getDay() + 6) % 7, mon = dayAdd(today, -dow), weeks = [];
  for (let w = 11; w >= 0; w--) { const start = dayAdd(mon, -7 * w), row = []; for (let i = 0; i < 7; i++) { const d = dayAdd(start, i); row.push({ d: d, n: ACT_KEYS.filter(k => (A.days[d] || {})[k] > 0).length, future: d > today }); } weeks.push(row); }
  return weeks;
}

if (typeof module !== "undefined") module.exports = { BUILD, esc, ymd, ym, stamp, dayAdd, safeUrl, unesc, book, bookByName, chapterTitle, passageLabel, shortLabel, prepTitle, parsePrepTitle, parseVerses, parseChapter, prepTemplate, docIdOf, splitLinks, docRoot, paraLine, prepRead, toSegs, memoRequests, lineRequests, bodyRequests, mdHtml, logosPrompt, actEmpty, actNorm, actMerge, actTotal, actSame, actAdd, actStreak, actWeek, actWeeks12 };
