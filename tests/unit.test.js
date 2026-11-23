/* 계산 부분 단위 점검. 실행: node tests/unit.test.js */
"use strict";
const path = require("path");
global.D = require(path.join(__dirname, "../js/data.js"));
const C = require(path.join(__dirname, "../js/core.js"));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log("안 됨: " + name + (extra !== undefined ? " → " + JSON.stringify(extra) : "")); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

/* 책과 제목 */
eq("책 66권", D.BOOKS.length, 66);
eq("장 수 합 1189", D.BOOKS.reduce((n, b) => n + b[2], 0), 1189);
const lk = C.bookByName("누가복음"), ps = C.bookByName("시편");
eq("장 문서 제목", C.chapterTitle(lk, 19), "42_누가복음 19장");
eq("시편 문서 제목", C.chapterTitle(ps, 23), "19_시편 023편");
eq("본문 이름", C.passageLabel(lk, 19, "1-10"), "누가복음 19:1-10");
eq("본문 이름(장 전체)", C.passageLabel(lk, 19, ""), "누가복음 19장");
eq("본문 이름(시편)", C.passageLabel(ps, 23, ""), "시편 23편");
eq("준비 제목", C.prepTitle("2026-11-29", lk, 19, "1-10"), "준비_2026-11-29_누가복음 19:1-10");
eq("준비 제목 되읽기", C.parsePrepTitle("준비_2026-11-29_누가복음 19:1-10"), { date: "2026-11-29", bookIndex: 41, ch: 19, verses: "1-10" });
eq("준비 제목 되읽기(장 전체)", C.parsePrepTitle("준비_2026-11-29_누가복음 19장"), { date: "2026-11-29", bookIndex: 41, ch: 19, verses: "" });
eq("준비 제목 되읽기(시편)", C.parsePrepTitle("준비_2026-12-06_시편 23편"), { date: "2026-12-06", bookIndex: 18, ch: 23, verses: "" });
eq("준비 제목 되읽기(책 이름에 숫자 없음, 요한일서)", C.parsePrepTitle("준비_2026-12-06_요한일서 4:7-12").bookIndex, 61);
eq("준비 문서가 아닌 이름", C.parsePrepTitle("묵상_2026-11"), null);
eq("없는 책", C.parsePrepTitle("준비_2026-11-29_없는책 1장"), null);

/* 절 */
eq("절 1-10", Array.from(C.parseVerses("1-10")), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
eq("절 1, 5", Array.from(C.parseVerses("1, 5절")), [1, 5]);
eq("절 3~4", Array.from(C.parseVerses("3~4")), [3, 4]);
eq("절 비움", C.parseVerses(""), null);
eq("절 엉뚱한 글", C.parseVerses("가나다"), null);

/* 장 문서 읽기: 구글이 실제로 내어 주는 모양(줄 끝 빈칸 둘, \_ , 빈 칸 표시) */
const md = ["# 누가복음 19장", "", "## 이 장에 걸린 자료", "", "### 교회 설교 요지", "", "(아직 없음)", "", "### 예화", "",
  "- [시험용\\_하나](https://docs.google.com/document/d/AAA_bbb-1/edit) · 1, 5절  ", "- [둘째 (괄호)](https://docs.google.com/document/d/CCC/edit)", "",
  "## 본문 (개역개정)", "", "### 소제목", "", "**1** 첫째 절", "", "**2** 둘째 절", "", "## 본문 (우리말성경)", "", "**1** 첫째 절 나", "", "**2** 둘째 절 나", ""].join("\n");
const p = C.parseChapter(md);
eq("자료 칸", Object.keys(p.links), ["교회 설교 요지", "예화"]);
eq("빈 칸", p.links["교회 설교 요지"], []);
eq("예화 첫 줄", p.links["예화"][0], { text: "시험용_하나", url: "https://docs.google.com/document/d/AAA_bbb-1/edit", extra: "1, 5절" });
eq("예화 둘째 줄", p.links["예화"][1].text, "둘째 (괄호)");
eq("역본 순서", p.order, ["개역개정", "우리말성경"]);
eq("본문 줄", p.texts["개역개정"], [{ h: "소제목" }, { n: 1, t: "첫째 절" }, { n: 2, t: "둘째 절" }]);
eq("위험한 주소는 링크가 되지 않음", C.safeUrl("javascript:alert(1)"), "#");

/* 준비 문서 틀과 되읽기 */
const tpl = C.prepTemplate({ label: "누가복음 19:1-10", date: "2026-11-29", chapterTitle: "42_누가복음 19장", chapterUrl: "https://docs.google.com/document/d/X/edit", today: "2026-11-23" });
ok("틀에 여덟 단계", D.STEPS.every(s => tpl.indexOf("## " + s.no + ". " + s.title) >= 0 && tpl.indexOf("(메모 자리 " + s.no + ")") >= 0));
/* 메모 넣을 자리 계산 (구글 문서 번호는 UTF-16 글자 수) */
function docOf(paras) {
  const content = [{ endIndex: 1, sectionBreak: {} }]; let pos = 1;
  for (const [style, text] of paras) { const n = text.length + 1; content.push({ startIndex: pos, endIndex: pos + n, paragraph: { elements: [{ textRun: { content: text + "\n" } }], paragraphStyle: { namedStyleType: style } } }); pos += n; }
  return { documentId: "DOC", revisionId: "r1", tabs: [{ tabProperties: { tabId: "t.0" }, documentTab: { body: { content: content } } }] };
}
const doc = docOf([["HEADING_1", "준비: 누가복음 19:1-10"], ["HEADING_2", "1. 본문 읽기"], ["NORMAL_TEXT", "(메모 자리 1)"], ["HEADING_2", "2. 관찰"], ["HEADING_2", "3. 원어"], ["NORMAL_TEXT", "(메모 자리 3)"]]);
const r1 = C.memoRequests(doc, 1, [{ pre: "11-23 09:00 ", text: "메모 😀", url: "", post: "" }, { pre: "", text: "둘째 줄", url: "", post: "" }]);
const at1 = doc.tabs[0].documentTab.body.content[3].startIndex;
eq("자리 줄 위치(제목 두 줄 뒤)", at1, 1 + "준비: 누가복음 19:1-10\n".length + "1. 본문 읽기\n".length);
eq("자리 줄 앞에 넣음", [r1.where, r1.requests[0].insertText.location.index, r1.requests[0].insertText.text], ["anchor", at1, "11-23 09:00 메모 😀\n둘째 줄\n"]);
eq("넣은 줄은 보통 글(그림 글자는 두 칸)", r1.requests[r1.requests.length - 1].updateParagraphStyle.range, { startIndex: at1, endIndex: at1 + "11-23 09:00 메모 😀\n둘째 줄".length, tabId: "t.0" });
eq("문서가 바뀌었으면 받지 않게", r1.writeControl, { requiredRevisionId: "r1" });
const r2 = C.memoRequests(doc, 2, [{ pre: "", text: "관찰", url: "", post: "" }]);
eq("자리 줄이 없으면 제목 바로 아래", [r2.where, r2.requests[0].insertText.location.index], ["heading", doc.tabs[0].documentTab.body.content[4].endIndex]);
const r3 = C.memoRequests(doc, 3, [{ pre: "담음: ", text: "예화", url: "https://docs.google.com/document/d/Z/edit", post: " (1절)" }]);
const at3 = doc.tabs[0].documentTab.body.content[6].startIndex;
eq("링크 범위", r3.requests[1].updateTextStyle.range, { startIndex: at3 + 4, endIndex: at3 + 6, tabId: "t.0" });
const r0 = C.memoRequests(doc, 0, [{ pre: "", text: "맨 끝", url: "", post: "" }]);
const end = doc.tabs[0].documentTab.body.content[6].endIndex;
eq("단계가 아니면 문서 맨 끝", [r0.where, r0.requests[0].insertText.location.index, r0.requests[0].insertText.text], ["end", end - 1, "\n맨 끝"]);
eq("빈 줄만 있으면 아무것도 안 함", C.memoRequests(doc, 1, [{ pre: "", text: "  ", url: "", post: "" }]), null);
eq("문서 겉싸개 벗기기", C.docRoot({ content: doc }).documentId, "DOC");

/* 준비 문서 읽기: 링크는 [글](주소), 메모 자리 뒤의 줄은 따로, 표가 있으면 표시 */
function docOf2(items) {
  const content = [{ endIndex: 1, sectionBreak: {} }]; let pos = 1;
  for (const it of items) {
    if (it === "TABLE") { content.push({ startIndex: pos, endIndex: pos + 10, table: {} }); pos += 10; continue; }
    const style = it[0], runs = it.slice(1), els = []; let n = 0;
    runs.forEach((r, i) => { const t = (typeof r === "string" ? r : r[0]) + (i === runs.length - 1 ? "\n" : ""); els.push({ textRun: { content: t, textStyle: typeof r === "string" ? {} : { link: { url: r[1] } } } }); n += t.length; });
    content.push({ startIndex: pos, endIndex: pos + n, paragraph: { elements: els, paragraphStyle: { namedStyleType: style } } }); pos += n;
  }
  return { documentId: "DOC", revisionId: "r7", tabs: [{ tabProperties: { tabId: "t.0" }, documentTab: { body: { content: content } } }] };
}
const U1 = "https://docs.google.com/document/d/ZZZZZZZZZZZZ/edit";
const pd = docOf2([["HEADING_1", "준비: 누가복음 19:1-10"], "TABLE", ["HEADING_2", "1. 본문 읽기"], ["NORMAL_TEXT", "11-23 09:00 첫 메모"], ["NORMAL_TEXT", "담음: ", ["예화_하나", U1], " (1절)"], ["NORMAL_TEXT", "(메모 자리 1)"], ["NORMAL_TEXT", "자리 뒤에 붙은 줄"],
  ["HEADING_2", "8. 개요"], ["NORMAL_TEXT", "첫째 대지"], ["NORMAL_TEXT", ""], ["NORMAL_TEXT", "둘째 대지"], ["NORMAL_TEXT", ""], ["NORMAL_TEXT", "(메모 자리 8)"], ["HEADING_2", "9. 원고"]]);
const pr = C.prepRead(pd);
eq("단계 차례", pr.order, [1, 8, 9]);
eq("메모 줄(링크는 [글](주소))", pr.steps[1].lines, ["11-23 09:00 첫 메모", "담음: [예화_하나](" + U1 + ") (1절)"]);
eq("메모 자리 뒤의 줄", pr.steps[1].tail, ["자리 뒤에 붙은 줄"]);
eq("쓰는 칸은 빈 줄을 살리고 끝의 빈 줄만 뗌", pr.steps[8].lines, ["첫째 대지", "", "둘째 대지"]);
eq("빈 칸", [pr.steps[9].lines, pr.steps[9].anchor], [[], null]);
eq("앱이 쓴 글의 링크 조각(역슬래시를 건드리지 않음)", C.splitLinks("a\\_b [예화_하나](" + U1 + ") 끝", true), [{ t: "a\\_b " }, { t: "예화_하나", url: U1 }, { t: " 끝" }]);
eq("내보낸 글의 링크 조각(역슬래시를 벗김)", C.splitLinks("a\\_b [예화\\_하나](" + U1 + ")"), [{ t: "a_b " }, { t: "예화_하나", url: U1 }]);
eq("구글 문서 번호 꺼내기", [C.docIdOf(U1), C.docIdOf("https://example.com/document/d/ZZZZZZZZZZZZ/edit"), C.docIdOf("javascript:alert(1)")], ["ZZZZZZZZZZZZ", "", ""]);

/* 메모 한 줄 고치기 */
const P1 = pd.tabs[0].documentTab.body.content;
const l1 = C.lineRequests(pd, 1, 0, "11-23 09:00 첫 메모", "고친 메모");
eq("줄 고치기: 그 문단의 글만 바꿈", [l1.requests[0].deleteContentRange.range, l1.requests[1].insertText], [{ startIndex: P1[4].startIndex, endIndex: P1[4].endIndex - 1, tabId: "t.0" }, { location: { index: P1[4].startIndex, tabId: "t.0" }, text: "고친 메모" }]);
eq("줄 고치기: 링크 아닌 글은 링크를 지움", l1.requests[2].updateTextStyle, { range: { startIndex: P1[4].startIndex, endIndex: P1[4].startIndex + 5, tabId: "t.0" }, textStyle: {}, fields: "link" });
const l2 = C.lineRequests(pd, 1, 0, "담음: [예화_하나](" + U1 + ") (1절)", "");
eq("줄 고치기: 자리가 밀렸어도 같은 글을 찾아감, 비우면 문단째 없앰", l2.requests, [{ deleteContentRange: { range: { startIndex: P1[5].startIndex, endIndex: P1[5].endIndex, tabId: "t.0" } } }]);
eq("줄 고치기: 그 줄이 바뀌었으면 건드리지 않음", C.lineRequests(pd, 1, 0, "없는 줄", "x"), { conflict: true });

/* 쓰는 칸 전체 바꾸기 */
const b8 = C.bodyRequests(pd, 8, "개요", "\n새 첫째\n\n새 둘째 [예화](" + U1 + ")\n\n");
eq("칸 바꾸기: 지금 글", b8.current, "첫째 대지\n\n둘째 대지");
eq("칸 바꾸기: 제목 아래부터 메모 자리 앞까지 지우고 넣음", [b8.requests[0].deleteContentRange.range, b8.requests[1].insertText], [{ startIndex: P1[8].endIndex, endIndex: P1[13].startIndex, tabId: "t.0" }, { location: { index: P1[8].endIndex, tabId: "t.0" }, text: "새 첫째\n\n새 둘째 예화\n" }]);
const a8 = P1[8].endIndex, lk8 = b8.requests.filter(r => r.updateTextStyle && r.updateTextStyle.textStyle.link)[0].updateTextStyle.range;
eq("칸 바꾸기: 링크 범위", lk8, { startIndex: a8 + "새 첫째\n\n새 둘째 ".length, endIndex: a8 + "새 첫째\n\n새 둘째 예화".length, tabId: "t.0" });
const b9 = C.bodyRequests(pd, 9, "원고", "원고 첫 줄\n둘째 줄");
const end9 = P1[P1.length - 1].endIndex;
eq("칸 바꾸기: 문서가 제목에서 끝나면 맨 끝에 이어 넣음", [b9.requests.length > 1, b9.requests[0].insertText], [true, { location: { index: end9 - 1, tabId: "t.0" }, text: "\n원고 첫 줄\n둘째 줄" }]);
const b5 = C.bodyRequests(pd, 5, "지난 자료", "새 칸의 글");
eq("칸 바꾸기: 없는 단계는 문서 끝에 제목과 메모 자리까지 만듦", b5.requests[0].insertText, { location: { index: end9 - 1, tabId: "t.0" }, text: "\n5. 지난 자료\n새 칸의 글\n(메모 자리 5)" });
eq("칸 바꾸기: 새 제목은 제목 모양", b5.requests.filter(r => r.updateParagraphStyle)[0].updateParagraphStyle, { range: { startIndex: end9, endIndex: end9 + "5. 지난 자료".length, tabId: "t.0" }, paragraphStyle: { namedStyleType: "HEADING_2" }, fields: "namedStyleType" });
eq("칸 바꾸기: 빈 글이면 지우기만", C.bodyRequests(pd, 8, "개요", "  \n").requests.length, 1);
ok("칸 바꾸기: 표가 섞인 칸은 표시", C.prepRead(docOf2([["HEADING_2", "3. 원어"], "TABLE", ["NORMAL_TEXT", "(메모 자리 3)"]])).steps[3].complex === true);

/* 자료 읽기: 글자는 안전하게, 굵은 글씨와 링크만 살림 */
const h = C.mdHtml("# 제목 <b>\n\n본문 **굵게** <script>alert(1)</script> a\\_b\n\n- 하나\n- [둘](" + U1 + ")\n\n1\\. 첫째\n2\\. 둘째\n\n| 가 | 나 |\n|---|---|\n| 1 | 2 |\n\n(메모 자리 3)\n\n> 인용\n\n![][image1]\n\n[image1]: <data:image/png;base64,AAAA>\n", (t, u) => "<x-link data-u=\"" + u + "\">" + t + "</x-link>");
ok("읽기: 제목과 문단", h.indexOf("<h2>제목 &lt;b&gt;</h2>") === 0 && h.indexOf("<p>본문 <b>굵게</b> &lt;script&gt;alert(1)&lt;/script&gt; a_b</p>") > 0, h);
ok("읽기: 목록, 번호 목록, 표, 인용", h.indexOf("<ul><li>하나</li><li><x-link data-u=\"" + U1 + "\">둘</x-link></li></ul>") > 0 && h.indexOf("<ol><li>첫째</li><li>둘째</li></ol>") > 0 && h.indexOf("<table><tr><th>가</th><th>나</th></tr><tr><td>1</td><td>2</td></tr></table>") > 0 && h.indexOf("<blockquote>인용</blockquote>") > 0, h);
ok("읽기: 메모 자리 줄과 박힌 그림은 빼고, 꺾쇠는 살아 있지 않음", h.indexOf("메모 자리") < 0 && h.indexOf("data:image") < 0 && h.indexOf("<script") < 0, h);
ok("읽기: 위험한 주소의 링크는 죽은 링크", C.mdHtml("[x](https://a.b/c)").indexOf('href="https://a.b/c"') > 0 && C.mdHtml("[x](javascript:alert(1))").indexOf("href") < 0);

/* 활동 기록: 합쳐도 줄지 않는다 */
const d1 = new Date(2026, 10, 23, 9, 0), d2 = new Date(2026, 10, 22, 21, 0);
let a = C.actAdd(null, "prep", "누가복음 19:1-10", d1); a = C.actAdd(a, "read", "시편 23편", d1); a = C.actAdd(a, "prep", "한 번 더", d1);
let b = C.actAdd(null, "qt", "시편 23편", d2); b = C.actAdd(b, "prep", "다른 기기", d1);
const m1 = C.actMerge(a, b), m2 = C.actMerge(b, a);
eq("합치기: 날마다 큰 쪽", m1.days, { "2026-11-22": { qt: 1 }, "2026-11-23": { prep: 2, read: 1 } });
ok("합치기: 순서를 바꿔도 같음", C.actSame(m1, m2));
ok("합치기: 여러 번 해도 같음", C.actSame(C.actMerge(m1, a), m1) && C.actSame(C.actMerge(m1, m1), m1));
ok("합치기: 줄지 않음", C.actTotal(m1) >= C.actTotal(a) && C.actTotal(m1) >= C.actTotal(b));
eq("합치기: 기록 줄 모두 남음", m1.log.length, 5);
ok("빈 것과 합쳐도 그대로", C.actSame(C.actMerge(a, null), a) && C.actSame(C.actMerge({}, a), a));
ok("깨진 값은 버림", C.actTotal(C.actNorm({ days: { "엉뚱": { prep: 3 }, "2026-11-23": { prep: "x", read: -2, etc: 9 } }, log: [{ id: 1 }, null] })) === 0);
ok("날짜 순서가 달라도 같다고 봄", C.actSame({ days: { "2026-11-23": { read: 1 }, "2026-11-22": { qt: 1 } } }, { days: { "2026-11-22": { qt: 1 }, "2026-11-23": { read: 1 } } }));
let big = null; for (let i = 0; i < 260; i++) big = C.actAdd(big, "read", "줄 " + i, new Date(2026, 10, 1, 0, i));
eq("기록 줄은 200줄까지", [big.log.length, big.days["2026-11-01"].read], [200, 260]);

/* 연속 일수, 이번 주, 12주 (2026-11-23은 월요일) */
let s = null; for (const day of [23, 22, 21, 19]) s = C.actAdd(s, "read", "", new Date(2026, 10, day, 8, 0));
eq("연속 3일", C.actStreak(s, "2026-11-23"), 3);
eq("오늘 기록이 없어도 어제까지 이어짐", C.actStreak(s, "2026-11-24"), 3);
eq("이틀 비면 끊김", C.actStreak(s, "2026-11-25"), 0);
const wk = C.actWeek(s, "2026-11-23");
eq("이번 주는 월요일부터", [wk[0].d, wk[6].d, wk[0].today, wk[0].kinds, wk[1].future], ["2026-11-23", "2026-11-29", true, ["read"], true]);
const g = C.actWeeks12(s, "2026-11-23");
eq("12주 표 크기", [g.length, g[0].length, g[11][0].d, g[0][0].d], [12, 7, "2026-11-23", "2026-09-07"]);
eq("12주 표: 지난주 주일 칸", g[10][6], { d: "2026-11-22", n: 1, future: false });
eq("달이 바뀌는 날 더하기", [C.dayAdd("2026-03-01", -1), C.dayAdd("2026-12-31", 1)], ["2026-02-28", "2027-01-01"]);

/* 8판: 기록 덩이, 책별 독서 현황 */
const md2 = docOf([["HEADING_1", "독서 2026-11"], ["NORMAL_TEXT", "[독서] 2026-11-24 책, 45쪽"], ["NORMAL_TEXT", "줄1"], ["NORMAL_TEXT", "[독서] 2026-11-24 책"], ["NORMAL_TEXT", "줄2"]]);
const B2 = C.blocksRead(md2);
eq("기록 덩이 읽기", B2.blocks.map(b => [b.head, b.lines, b.k, b.kind]), [["[독서] 2026-11-24 책, 45쪽", ["줄1"], 0, "독서"], ["[독서] 2026-11-24 책", ["줄2"], 0, "독서"]]);
eq("가운데 덩이 지우기: 다음 덩이 앞까지", C.blockRequests(md2, "[독서] 2026-11-24 책, 45쪽", 0).requests[0].deleteContentRange.range.endIndex, B2.blocks[1].a);
const q9 = C.blockRequests(md2, "[독서] 2026-11-24 책", 0).requests[0].deleteContentRange.range;
eq("끝 덩이 지우기: 앞 줄바꿈부터 문서 끝 앞까지", [q9.startIndex, q9.endIndex], [B2.blocks[1].a - 1, B2.end - 1]);
ok("없는 덩이는 conflict", C.blockRequests(md2, "[독서] 2026-11-01 없음", 0).conflict === true);
let a9 = C.actAdd(null, "book", "책, 45쪽", new Date(2026, 10, 23, 9)); a9 = C.actAdd(a9, "book", "책", new Date(2026, 10, 24, 9)); a9 = C.actAdd(a9, "book", "둘째 책, 완독", new Date(2026, 10, 24, 10));
const st9 = C.bookStats(a9);
eq("책별 현황: 쪽은 마지막으로 적은 값, 날은 마지막 읽은 날", st9["책"], { t: "책", page: 45, last: "2026-11-24", done: false, n: 2 });
ok("책별 현황: 완독 표시", st9["둘째 책"].done === true);
eq("독서만의 이어진 날", [C.actStreakOf(a9, "2026-11-24", "book"), C.actStreakOf(a9, "2026-11-25", "book"), C.actStreakOf(a9, "2026-11-24", "qt")], [2, 2, 0]);

/* 9판: 물결표, 낱말 뽑기, 겹치는 차례 */
ok("물결표 두 개는 하나로", C.mdHtml("창세기 1~~11장과 12~~50장, 16~17쪽").indexOf("1~11장과 12~50장, 16~17쪽") >= 0);
eq("낱말 뽑기: 조사를 떼고 흔한 말은 뺌", C.keywordsOf("하나님의 은혜는 잃어버린 아들을 찾으시는 아버지의 사랑, 아버지의 은혜", 4), ["은혜", "아버지", "잃어버린", "아들"]);
eq("겹치는 차례", C.rankFiles([{ kw: "은혜", files: [{ id: "a" }, { id: "b" }] }, { kw: "아버지", files: [{ id: "b" }] }]).map(r => [r.f.id, r.hits.length]), [["b", 2], ["a", 1]]);

console.log("단위 점검: 됨 " + pass + ", 안 됨 " + fail);
process.exit(fail ? 1 : 0);
