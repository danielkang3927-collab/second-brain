"""자동 점검용 가짜 구글(로그인, 드라이브, 문서). 실제 구글에는 아무것도 보내지 않는다.

지키는 규칙을 실제 구글처럼 흉내 낸다.
- 표(access token)가 없거나 낡았으면 401.
- 앱이 만들지 않은 글(자료실)에 쓰려 하면 403. 지우기·옮기기·휴지통 요청이 오면 violations 에 적는다.
- 문서 고치기는 revisionId 가 맞을 때만 받는다. 글자 번호는 실제처럼 UTF-16 단위로 센다.
본문과 자료 제목은 모두 시험용으로 지어낸 것이다(실제 성경 본문, 실제 사람 이름 없음).
"""
import json, re, urllib.parse

DOC = "application/vnd.google-apps.document"
FOLDER = "application/vnd.google-apps.folder"
READONLY = "https://www.googleapis.com/auth/drive.readonly"
FILE = "https://www.googleapis.com/auth/drive.file"


class Fake:
    def __init__(self, folders, email="pastor@example.com"):
        self.F = folders
        self.email = email
        self.files = {}
        self.seq = 0
        self.clock = 0
        self.tokens = set()
        self.session = True          # 구글에 로그인된 상태인가 (화면 없는 새로 받기가 되는가)
        self.grant = "all"           # all | partial(drive.file 빠짐) | deny
        self.has_vault = True        # 이 계정에 자료실이 있는가
        self.no_markdown = False     # 마크다운으로 문서 만들기를 받지 않는 척
        self.auth_log, self.calls, self.violations = [], [], []
        self.fail_next = None        # ("경로 조각", status, body) 한 번만 실패
        for key in [k for k in folders if k in ("root", "bible", "old", "guide", "packs", "yoji", "illust", "read", "manu", "mine", "memo", "method")]:
            self._put(folders[key], key, FOLDER, [folders["root"]] if key != "root" else [], vault=True)

    # ---------- 파일 넣기 ----------
    def _now(self):
        self.clock += 1
        return "2026-11-23T%02d:%02d:%02d.000Z" % (self.clock // 3600 % 24, self.clock // 60 % 60, self.clock % 60)

    def _id(self):
        self.seq += 1
        return "fakeDocument%04d" % self.seq

    def _put(self, fid, name, mime, parents, **kw):
        t = self._now()
        f = dict(id=fid, name=name, mimeType=mime, parents=parents, createdTime=t, modifiedTime=t,
                 webViewLink="https://docs.google.com/document/d/%s/edit" % fid, vault=False, app=False, rev=1)
        f.update(kw)
        self.files[fid] = f
        return f

    def vault_doc(self, folder_key, name, md):
        return self._put(self._id(), name, DOC, [self.F[folder_key]], vault=True, md=md)

    def by_name(self, name):
        return next(f for f in self.files.values() if f["name"] == name)

    # ---------- 로그인 ----------
    def auth(self, route):
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(route.request.url).query))
        self.auth_log.append(q)
        back, st = q.get("redirect_uri", ""), q.get("state", "")
        if q.get("prompt") == "none" and not self.session:
            frag = {"error": "interaction_required", "state": st}
        elif self.grant == "deny":
            frag = {"error": "access_denied", "state": st}
        else:
            tok = "tok-%d" % (len(self.auth_log) * 10 + len(self.tokens))
            self.tokens.add(tok)
            self.session = True
            scope = "email openid https://www.googleapis.com/auth/userinfo.email " + READONLY + ("" if self.grant == "partial" else " " + FILE)
            frag = {"access_token": tok, "token_type": "Bearer", "expires_in": "3599", "scope": scope, "state": st}
        url = back + "#" + urllib.parse.urlencode(frag)
        route.fulfill(status=200, content_type="text/html", body="<!doctype html><script>location.replace(%s)</script>" % json.dumps(url))

    # ---------- 공통 ----------
    def _json(self, route, obj, status=200):
        route.fulfill(status=status, content_type="application/json; charset=UTF-8", body=json.dumps(obj, ensure_ascii=False))

    def _err(self, route, status, msg, reason="", st=""):
        self._json(route, {"error": {"code": status, "message": msg, "status": st, "errors": [{"reason": reason, "message": msg}]}}, status)

    def _gate(self, route):
        req = route.request
        path = urllib.parse.urlsplit(req.url).path
        self.calls.append((req.method, path))
        if req.method == "DELETE":
            self.violations.append("DELETE " + path)
            self._err(route, 500, "delete is not allowed in this app")
            return False
        tok = (req.headers.get("authorization") or "").replace("Bearer ", "")
        if tok not in self.tokens:
            self._err(route, 401, "Invalid Credentials", "authError", "UNAUTHENTICATED")
            return False
        if self.fail_next and self.fail_next[0] in path:
            _, status, body = self.fail_next
            self.fail_next = None
            self._json(route, body, status)
            return False
        return True

    def visible(self, f):
        return self.has_vault or not f["vault"]

    # ---------- 드라이브 ----------
    def api(self, route):
        if urllib.parse.urlsplit(route.request.url).path == "/books/v1/volumes":
            return self._json(route, {"items": [{"volumeInfo": {"title": "시험용 책", "authors": ["홍길동"], "publisher": "시험출판", "publishedDate": "2020-03-01", "pageCount": 240, "imageLinks": {"thumbnail": "http://books.google.com/books/content?id=x1"}}}]})
        if not self._gate(route):
            return
        req = route.request
        parts = urllib.parse.urlsplit(req.url)
        path, q = parts.path, dict(urllib.parse.parse_qsl(parts.query))
        if path == "/oauth2/v3/userinfo":
            return self._json(route, {"email": self.email, "email_verified": True})
        if path == "/drive/v3/files" and req.method == "GET":
            return self._json(route, {"files": self.search(q.get("q", ""), q.get("orderBy", ""), int(q.get("pageSize", "20")))})
        if path == "/drive/v3/files" and req.method == "POST":
            meta = json.loads(req.post_data or "{}")
            if meta.get("mimeType") != FOLDER:
                return self._err(route, 400, "only folders here")
            if meta.get("parents"):
                self.violations.append("folder created inside another folder")
            f = self._put(self._id(), meta["name"], FOLDER, meta.get("parents") or [], app=True)
            return self._json(route, self.pub(f))
        if path == "/upload/drive/v3/files" and req.method == "POST":
            return self.upload(route, req)
        m = re.match(r"^/upload/drive/v3/files/([^/]+)$", path)
        if m and req.method == "PATCH":
            f = self.files.get(m.group(1))
            if not f or not self.visible(f):
                return self._err(route, 404, "File not found: " + m.group(1), "notFound")
            if not f["app"] or f["mimeType"] == DOC:
                self.violations.append("content overwrite on " + f["name"])
                return self._err(route, 403, "The user has not granted the app write access to the file.", "appNotAuthorizedToFile")
            f["content"] = req.post_data or ""
            f["modifiedTime"] = self._now()
            return self._json(route, {"id": f["id"]})
        m = re.match(r"^/drive/v3/files/([^/]+)(/export)?$", path)
        if m:
            f = self.files.get(m.group(1))
            if req.method != "GET":
                self.violations.append("%s %s" % (req.method, path))
                return self._err(route, 403, "metadata changes are not allowed in this app")
            if not f or not self.visible(f):
                return self._err(route, 404, "File not found: " + m.group(1), "notFound")
            if m.group(2):
                if f["mimeType"] != DOC:
                    return self._err(route, 403, "Export only supports Docs Editors files.", "fileNotExportable")
                return route.fulfill(status=200, content_type="text/markdown; charset=UTF-8", body=f["md"] if "md" in f else export_md(f))
            if q.get("alt") == "media":
                return route.fulfill(status=200, content_type="application/json; charset=UTF-8", body=f.get("content", ""))
            return self._json(route, self.pub(f))
        self._err(route, 404, "unknown path " + path)

    def pub(self, f):
        return {k: f[k] for k in ("id", "name", "mimeType", "parents", "createdTime", "modifiedTime", "webViewLink")}

    def upload(self, route, req):
        ctype = req.headers.get("content-type", "")
        b = re.search(r"boundary=(.+)$", ctype).group(1)
        body = req.post_data_buffer.decode("utf-8")
        chunks = [c for c in body.split("--" + b) if c.strip() and c.strip() != "--"]
        meta = json.loads(chunks[0].split("\r\n\r\n", 1)[1])
        head, content = chunks[1].split("\r\n\r\n", 1)
        content = content.rsplit("\r\n", 1)[0]
        parent = self.files.get((meta.get("parents") or [""])[0])
        if not parent or not self.visible(parent):
            return self._err(route, 404, "File not found: parent", "notFound")
        if not parent["app"]:
            self.violations.append("create inside vault folder " + parent["name"])
            return self._err(route, 403, "The user has not granted the app write access to the file.", "appNotAuthorizedToFile")
        if meta.get("mimeType") == DOC and "image/" in head:
            f = self._put(self._id(), meta["name"], DOC, meta["parents"], app=True, md="![][image1]\n\n사진에서 읽은 첫 줄\n\n둘째 줄\n")
            return self._json(route, self.pub(f))
        if meta.get("mimeType") == DOC:
            if "text/markdown" in head and self.no_markdown:
                return self._err(route, 400, "Bad Request: unsupported import format", "badRequest")
            f = self._put(self._id(), meta["name"], DOC, meta["parents"], app=True, units=import_md(content))
        else:
            f = self._put(self._id(), meta["name"], "application/json", meta["parents"], app=True, content=content)
        self._json(route, self.pub(f))

    # 앱이 쓰는 검색식만 푼다
    def search(self, q, order, size):
        atoms = []

        def atom(fn):
            atoms.append(fn)
            return " A[%d](f) " % (len(atoms) - 1)

        un = lambda s: s.replace("\\'", "'").replace("\\\\", "\\")
        S = r"'((?:[^'\\]|\\.)*)'"
        expr = q
        expr = re.sub(r"'me' in owners", lambda m: atom(lambda f: True), expr)
        expr = re.sub(S + r" in parents", lambda m: atom(lambda f, v=un(m.group(1)): v in f["parents"]), expr)
        expr = re.sub(r"name = " + S, lambda m: atom(lambda f, v=un(m.group(1)): f["name"] == v), expr)
        expr = re.sub(r"mimeType = " + S, lambda m: atom(lambda f, v=un(m.group(1)): f["mimeType"] == v), expr)
        expr = re.sub(r"fullText contains " + S, lambda m: atom(lambda f, v=un(m.group(1)): v in f["name"] or v in (f.get("md") or (export_md(f) if "units" in f else ""))), expr)
        expr = re.sub(r"trashed = false", lambda m: atom(lambda f: True), expr)
        if re.search(r"[^A\[\]\d\(\)f\sandor]", expr):
            raise ValueError("가짜 드라이브가 모르는 검색식: " + q)
        out = [f for f in self.files.values() if self.visible(f) and eval(expr, {"A": atoms, "f": f})]
        if "modifiedTime desc" in order:
            out.sort(key=lambda f: f["modifiedTime"], reverse=True)
        return [self.pub(f) for f in out[:size]]

    # ---------- 구글 문서 ----------
    def docs(self, route):
        if not self._gate(route):
            return
        req = route.request
        path = urllib.parse.urlsplit(req.url).path
        m = re.match(r"^/v1/documents/([^/:]+)(:batchUpdate)?$", path)
        f = m and self.files.get(m.group(1))
        if not f or not self.visible(f) or f["mimeType"] != DOC:
            return self._err(route, 404, "Requested entity was not found.", "notFound", "NOT_FOUND")
        if not m.group(2):
            if "units" not in f:
                return self._err(route, 400, "가짜 문서: 자료실 문서는 내보내기로만 읽는다")
            return self._json(route, doc_json(f))
        if not f["app"]:
            self.violations.append("batchUpdate on vault doc " + f["name"])
            return self._err(route, 403, "The caller does not have permission", "forbidden", "PERMISSION_DENIED")
        body = json.loads(req.post_data or "{}")
        need = (body.get("writeControl") or {}).get("requiredRevisionId")
        if need is not None and need != "rev%d" % f["rev"]:
            return self._err(route, 400, "The required revision ID '%s' does not match the latest revision 'rev%d'." % (need, f["rev"]), "failedPrecondition", "FAILED_PRECONDITION")
        work = [dict(u) for u in f["units"]]
        try:
            for r in body.get("requests", []):
                apply_request(work, r)
        except ValueError as e:           # 실제 구글처럼: 하나라도 틀리면 아무것도 바뀌지 않는다
            return self._err(route, 400, "Invalid requests: %s" % e, "badRequest", "INVALID_ARGUMENT")
        f["units"] = work
        f["rev"] += 1
        f["modifiedTime"] = self._now()
        self._json(route, {"documentId": f["id"], "replies": [{} for _ in body.get("requests", [])]})


# ---------- 문서 모형 ----------
# 문서는 '낱칸'의 줄이다. 글자 한 칸(UTF-16 단위 하나) {"c": 두 바이트, "link": 주소|None},
# 문단 끝 {"nl": 문단 모양}, 표 {"table": 줄들, "len": 차지하는 칸 수}. 맨 앞 칸 번호는 1이다.
def chars(text, link=None):
    b = text.encode("utf-16-le")
    return [{"c": b[i:i + 2], "link": link} for i in range(0, len(b), 2)]


def import_md(md):
    units, lines, i = [], md.split("\n"), 0
    while i < len(lines):
        ln = lines[i].rstrip()
        if not ln:
            i += 1
            continue
        if ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i].rstrip())
                i += 1
            units.append({"table": rows, "len": 3 + sum(len(c) + 2 for r in rows for c in r.strip("|").split("|")) + len(rows)})
            continue
        style, text = ("HEADING_2", ln[3:]) if ln.startswith("## ") else ("HEADING_1", ln[2:]) if ln.startswith("# ") else ("NORMAL_TEXT", ln)
        units += chars(text) + [{"nl": style}]
        i += 1
    if not units or "nl" not in units[-1]:
        units.append({"nl": "NORMAL_TEXT"})
    return units


def ulen(u):
    return u["len"] if "table" in u else 1


def para_list(f):
    """[(문단 모양, 글, [(시작, 끝, 주소)])] 표는 ("TABLE", 줄들, [])"""
    out, cur, links, run = [], [], [], None
    for u in f["units"]:
        if "table" in u:
            out.append(("TABLE", u["table"], []))
        elif "nl" in u:
            if run:
                links.append((run[0], len(cur), run[1]))
            out.append((u["nl"], b"".join(cur).decode("utf-16-le"), links))
            cur, links, run = [], [], None
        else:
            if run and run[1] != u["link"]:
                links.append((run[0], len(cur), run[1]))
                run = None
            if u["link"] and not run:
                run = (len(cur), u["link"])
            cur.append(u["c"])
    return out


def doc_json(f):
    content, pos, start, runs = [{"endIndex": 1, "sectionBreak": {}}], 1, 1, []

    def push_run(buf, link, at):
        if buf:
            runs.append({"startIndex": at, "endIndex": at + len(buf), "textRun": {"content": b"".join(buf).decode("utf-16-le"), "textStyle": ({"link": {"url": link}} if link else {})}})

    buf, link, at = [], None, 1
    for u in f["units"]:
        if "table" in u:
            content.append({"startIndex": pos, "endIndex": pos + u["len"], "table": {"rows": len(u["table"])}})
            pos += u["len"]
            start, at = pos, pos
            continue
        if "nl" in u:
            push_run(buf + [b"\n\x00"], link, at)
            pos += 1
            content.append({"startIndex": start, "endIndex": pos, "paragraph": {"elements": runs, "paragraphStyle": {"namedStyleType": u["nl"]}}})
            runs, buf, link, start, at = [], [], None, pos, pos
            continue
        if buf and u["link"] != link:
            push_run(buf, link, at)
            buf, at = [], pos
        link = u["link"]
        buf.append(u["c"])
        pos += 1
    return {"documentId": f["id"], "title": f["name"], "revisionId": "rev%d" % f["rev"],
            "tabs": [{"tabProperties": {"tabId": "t.0", "index": 0}, "documentTab": {"body": {"content": content}}}]}


def locate(units, idx):
    """칸 번호 idx 가 시작되는 낱칸의 자리. 표 한가운데면 오류."""
    pos = 1
    for k, u in enumerate(units):
        if pos == idx:
            return k
        if pos < idx < pos + ulen(u):
            raise ValueError("표 안은 건드릴 수 없다 (칸 %d)" % idx)
        pos += ulen(u)
    if pos == idx:
        return len(units)
    raise ValueError("문서 밖의 자리 (칸 %d, 끝 %d)" % (idx, pos))


def apply_request(units, r):
    if "insertText" in r:
        it = r["insertText"]
        k = len(units) - 1 if "endOfSegmentLocation" in it else locate(units, it["location"]["index"])
        if k >= len(units):
            raise ValueError("문서 끝의 줄바꿈 뒤에는 넣을 수 없다")
        style = next(u["nl"] for u in units[k:] if "nl" in u)
        new = []
        for ch in chars(it["text"]):
            new.append({"nl": style} if ch["c"] == b"\n\x00" else ch)
        units[k:k] = new
        return
    if "deleteContentRange" in r:
        rg = r["deleteContentRange"]["range"]
        a, b = locate(units, rg["startIndex"]), locate(units, rg["endIndex"])
        if b <= a:
            raise ValueError("빈 범위는 지울 수 없다")
        if b >= len(units):
            raise ValueError("문서 끝의 줄바꿈은 지울 수 없다")
        del units[a:b]
        return
    if "updateTextStyle" in r:
        ts = r["updateTextStyle"]
        rg = ts["range"]
        a, b = locate(units, rg["startIndex"]), locate(units, rg["endIndex"])
        if b <= a:
            raise ValueError("빈 범위")
        url = (ts.get("textStyle") or {}).get("link", {}).get("url")
        for u in units[a:b]:
            if "c" in u:
                u["link"] = url
        return
    if "updateParagraphStyle" in r:
        ps = r["updateParagraphStyle"]
        rg = ps["range"]
        a, b = locate(units, rg["startIndex"]), locate(units, rg["endIndex"])
        if b <= a:
            raise ValueError("빈 범위")
        for k in range(a, len(units)):       # 범위에 걸친 문단들의 끝 칸까지
            if "nl" in units[k]:
                units[k]["nl"] = ps["paragraphStyle"]["namedStyleType"]
                if k >= b - 1:
                    break
        return
    raise ValueError("가짜 문서가 모르는 요청: %r" % list(r))


def esc_md(s):
    return re.sub(r"([_*])", r"\\\1", s)


def export_md(f):
    """구글이 문서를 마크다운으로 내어 줄 때의 모양을 흉내 낸다 (제목의 '1.' 은 '1\\.' 으로, 밑줄은 '\\_' 로)."""
    out = []
    for style, text, links in para_list(f):
        if style == "TABLE":
            out.append("\n".join(text))
            continue
        units, pieces, last = text.encode("utf-16-le"), [], 0
        for a, b, url in sorted(links):
            pieces.append(esc_md(units[last * 2:a * 2].decode("utf-16-le")))
            pieces.append("[%s](%s)" % (esc_md(units[a * 2:b * 2].decode("utf-16-le")), url))
            last = b
        pieces.append(esc_md(units[last * 2:].decode("utf-16-le")))
        line = "".join(pieces)
        if style == "HEADING_1":
            line = "# " + line
        elif style == "HEADING_2":
            line = "## " + re.sub(r"^(\d+)\.", r"\1\\.", line)
        out.append(line)
    return "\n\n".join(out) + "\n"


# ---------- 시험용 자료실 ----------
def chapter_md(title, unit, verses, links=None, heading=None):
    links = links or {}
    L = ["# " + title, "", "## 이 %s에 걸린 자료" % unit, ""]
    for sec in ["교회 설교 요지", "외부 설교", "예화", "원고", "내 설교", "연구", "묵상", "독서"]:
        L += ["### " + sec, ""]
        items = links.get(sec) or []
        if not items:
            L += ["(아직 없음)", ""]
        else:
            for k, (text, url, extra) in enumerate(items):
                L.append("- [%s](%s)%s%s" % (esc_md(text), url, (" · " + extra) if extra else "", "  " if k < len(items) - 1 else ""))
            L.append("")
    for ver, tag in (("개역개정", "가"), ("우리말성경", "나")):
        L += ["## 본문 (%s)" % ver, ""]
        if heading:
            L += ["### " + heading, ""]
        for n in range(1, verses + 1):
            L += ["**%d** 시험용 본문 %s역 %d절입니다." % (n, tag, n), ""]
    return "\n".join(L)


def seed(fake):
    d = lambda i: "https://docs.google.com/document/d/%s/edit" % i
    m = fake.vault_doc("manu", "원고_2026-11-01_시험용 원고", "# 시험용 원고\n\n시험용 원고 본문 첫 문단.\n\n시험용 원고 본문 둘째 문단.\n")
    y = fake.vault_doc("yoji", "요지_2026-11-01_눅 19:1-10_시험용 요지", "# 시험용 요지\n\n| 항목 | 내용 |\n|---|---|\n| 본문 | 눅 19:1-10 |\n\n## 중심 생각\n\n잃은 것을 찾는다는 **시험용 문장**.\n\n- 첫째 대지\n- 둘째 대지\n\n원고: [시험용 원고 전문](%s)\n" % d(m["id"]))
    i1 = fake.vault_doc("illust", "예화_시험용 예화 하나_찾아오심", "# 시험용 예화 하나\n\n시험용 예화 본문.\n")
    i2 = fake.vault_doc("illust", "예화_<img src=x onerror=window.__xss=1>_시험용", "# 꺾쇠가 든 제목\n\n시험용 예화 본문 둘. <script>window.__xss=2</script> <img src=x onerror=window.__xss=3>\n\n[위험한 링크](javascript:window.__xss=4)\n")
    # 실제 자료실처럼 책별 폴더에 넣는다(누가복음). 창세기와 시편은 옛 배치(성경 폴더 바로 아래)로 둔다.
    luke = fake._put("fakeFolderLuke", "42_누가복음", FOLDER, [fake.F["bible"]], vault=True)
    fake._put("fakeFolderOld", "_옛판 (개역개정만 있던 장 문서)", FOLDER, [fake.F["bible"]], vault=True)
    fake.F["luke"] = luke["id"]
    fake.vault_doc("luke", "42_누가복음 19장", chapter_md("누가복음 19장", "장", 12, {
        "교회 설교 요지": [("2026-11-01 시험용 설교자, 시험용 요지 (눅 19:1-10)", d(y["id"]), "")],
        "예화": [("시험용 예화 하나_찾아오심", d(i1["id"]), "1-10절"), ("<b>굵게</b> 보이면 안 되는 제목", d(i2["id"]), "5절")],
        "원고": [("2026-11-01 시험용 원고", d(m["id"]), "")]}, heading="시험용 소제목"))
    fake.vault_doc("bible", "01_창세기 01장", chapter_md("창세기 1장", "장", 3))
    fake.vault_doc("bible", "19_시편 023편", chapter_md("시편 23편", "편", 6, heading="시험용 표제"))
    return dict(yoji=y, illust1=i1, illust2=i2, manu=m)
