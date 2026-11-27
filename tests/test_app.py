"""화면 자동 점검. 실제 크롬에서 단추를 눌러 보고, 구글 자리에 가짜 서버(fake_google.py)를 둔다.

실행: python3 tests/test_app.py <저장소 폴더> <캡처 저장 폴더>
이 점검이 통과해도 실제 구글 로그인·드라이브 연결이 된다는 뜻은 아니다. 그것은 실제 계정으로만 확인한다.
원어 자료(data/orig)는 공개 자료라 진짜 것을 그대로 쓴다.
"""
import sys, os, json, re, subprocess, threading, http.server, socketserver, functools, datetime, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_google import Fake, seed, para_list, chars, DOC, FOLDER, READONLY, FILE

ROOT, OUT = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
os.makedirs(OUT, exist_ok=True)
PORT = 8791
BASE = "http://127.0.0.1:%d/" % PORT
PHONE, IPAD = {"width": 390, "height": 844}, {"width": 820, "height": 1180}
node = lambda expr: json.loads(subprocess.check_output(["node", "-e", "console.log(JSON.stringify(require('./js/data.js')." + expr + "))"], cwd=ROOT))
FOLDERS, MYF, NSTEPS = node("FOLDERS"), node("MY_FOLDER"), len(node("STEPS"))
CID = "1234567890-abcdefg.apps.googleusercontent.com"
TODAY = datetime.date.today()
YM = TODAY.strftime("%Y-%m")
LUKE19 = json.load(open(os.path.join(ROOT, "data/orig/c/42_019.json"), encoding="utf-8"))
results, errors = [], []


def ok(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    if not cond:
        print("  안 됨: %s %s" % (name, str(detail)[:400]))


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Q, directory=ROOT))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def new_ctx(browser, fake, viewport=PHONE, scheme="light", seed_ls=None):
    ctx = browser.new_context(viewport=viewport, color_scheme=scheme, permissions=["clipboard-read", "clipboard-write"], locale="ko-KR", timezone_id="Asia/Seoul")
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(BASE) else (errors.append("밖으로 나가는 요청: " + r.request.url), r.abort()))
    ctx.route("https://accounts.google.com/**", fake.auth)
    ctx.route("https://www.googleapis.com/**", fake.api)
    ctx.route("https://docs.googleapis.com/**", fake.docs)
    def _gem(r):
        import json as _j
        if r.request.headers.get("x-goog-api-key") != "AQ.Ab8TESTKEY-0123456789":
            return r.fulfill(status=400, content_type="application/json", body='{"error":{"message":"API key not valid"}}')
        if r.request.method == "GET":
            return r.fulfill(status=200, content_type="application/json", body=_j.dumps({"models": [{"name": "models/gemini-9-flash", "supportedGenerationMethods": ["generateContent"]}, {"name": "models/gemini-9-flash-lite", "supportedGenerationMethods": ["generateContent"]}, {"name": "models/gemini-9-flash-image", "supportedGenerationMethods": ["generateContent"]}]}))
        GEM_CALLS.append((r.request.url, _j.loads(r.request.post_data or "{}")))
        if "gemini-9-flash:" in r.request.url:
            return r.fulfill(status=503, content_type="application/json", body='{"error":{"message":"high demand"}}')
        r.fulfill(status=200, content_type="application/json", body=_j.dumps({"candidates": [{"content": {"parts": [{"text": "제미나이 가짜 답"}]}}]}))
    ctx.route("https://generativelanguage.googleapis.com/**", _gem)
    ctx.route("https://books.google.com/**", lambda r: r.fulfill(status=200, content_type="image/gif", body=b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"))
    # 실제 연결 값이 들어 있어도, 점검은 연결 값 없이 시작해 직접 넣는 길까지 확인한다.
    _data = open(os.path.join(ROOT, "js/data.js"), encoding="utf-8").read()
    _data = re.sub(r'clientId: "[^"]*"', 'clientId: ""', _data, count=1)
    ctx.route("**/js/data.js*", lambda r: r.fulfill(status=200, content_type="text/javascript; charset=utf-8", body=_data))
    if seed_ls:
        ctx.add_init_script("(() => { if (location.origin !== %s || localStorage.getItem('sb.seeded')) return; const s = %s; for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem('sb.seeded', '1'); })()" % (json.dumps(BASE.rstrip("/")), json.dumps(seed_ls)))
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append("화면 오류: " + str(e)))
    page.on("console", lambda m: errors.append("콘솔: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    return ctx, page


GEM_CALLS = []

def btn(page, name, scope="body"):
    return page.locator(scope).get_by_role("button", name=name, exact=True).first


def nav(page, name):
    page.locator("#sbNav").get_by_role("button", name=name, exact=True).click()


def flash(page, text, timeout=8000, keep=False):
    page.wait_for_function("t => (document.getElementById('sbFlash').innerText || '').includes(t)", arg=text, timeout=timeout)
    if not keep:   # 같은 알림이 또 나올 때 헷갈리지 않게 닫아 둔다
        page.evaluate("() => { const x = document.querySelector('#sbFlash [data-act=flashX]'); if (x) x.click(); }")


def has(page, text, timeout=8000):
    page.wait_for_function("t => document.getElementById('sbMain').innerText.includes(t)", arg=text, timeout=timeout)


def main_text(page):
    return page.inner_text("#sbMain")


def shot(page, name, full=False, top=False):
    if top:
        page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(120)
    page.screenshot(path=os.path.join(OUT, name + ".png"), full_page=full)


def no_overflow(page, name):
    w = page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
    ok("옆으로 넘치지 않음: " + name, w[0] <= w[1], str(w))


def no_drive_links(page, name):
    n = page.evaluate("document.querySelectorAll('a[href*=\"docs.google.com\"], a[href*=\"drive.google.com\"]').length")
    ok("구글 문서로 나가는 링크가 없음: " + name, n == 0, str(n))


def login(page, fake):
    btn(page, "구글로 로그인").click()
    page.wait_for_url(re.compile("^" + re.escape(BASE) + r"(\?v=\d+)?$"))
    page.wait_for_function("() => { try { return !!JSON.parse(localStorage.getItem('sb.auth')).email && !!localStorage.getItem('sb.vaultOk') } catch (e) { return false } }")


def paras(fake, name):
    f = fake.by_name(name)
    return [p for p in para_list(f) if p[0] != "TABLE"], f


def section(ps, no):
    """단계 칸의 글: 제목 다음부터 메모 자리 앞까지"""
    a = next(i for i, x in enumerate(ps) if x[0] == "HEADING_2" and x[1].startswith("%d. " % no))
    b = next(i for i, x in enumerate(ps) if i > a and x[1] == "(메모 자리 %d)" % no)
    return ps[a + 1:b]


def retext(f, old, new):
    """다른 곳에서 문서를 고친 것처럼: 글이 old 인 문단을 new 로 바꾼다"""
    units, out, cur, hit = f["units"], [], [], False
    for u in units:
        if "c" in u:
            cur.append(u)
            continue
        if "nl" in u and b"".join(x["c"] for x in cur).decode("utf-16-le") == old:
            cur, hit = chars(new), True
        out += cur + [u]
        cur = []
    assert hit, "바꿀 문단이 없다: " + old
    f["units"] = out
    f["rev"] += 1


def drop_section(f, title):
    """옛 문서처럼: 단계 칸 하나(제목부터 메모 자리까지)를 통째로 없앤다"""
    ps, units, out, k, skipping = para_list(f), f["units"], [], 0, False
    cur = []
    for u in units:
        cur.append(u)
        if "c" in u:
            continue
        p = ps[k]
        k += 1
        if p[0] == "HEADING_2" and p[1] == title:
            skipping = True
        if not skipping:
            out += cur
        if skipping and p[0] != "TABLE" and p[1].startswith("(메모 자리 "):
            skipping = False
        cur = []
    f["units"] = out
    f["rev"] += 1


def app_folder(fake):
    return [f for f in fake.files.values() if f["name"] == MYF and f["mimeType"] == FOLDER]


def run_main(browser):
    fake = Fake(FOLDERS)
    made = seed(fake)
    ctx, page = new_ctx(browser, fake)
    prep_name = "준비_2026-11-29_누가복음 19:1-10"
    d = lambda f: "https://docs.google.com/document/d/%s/edit" % f["id"]

    # s1 처음 연결
    page.goto(BASE)
    page.wait_for_selector("#sbMain section")
    ok("s1 연결 값이 없으면 처음 연결 화면", "처음 연결" in main_text(page))
    import re as _re0
    build_now = int(_re0.search(r"const BUILD = (\d+);", open(os.path.join(ROOT, "js/core.js"), encoding="utf-8").read()).group(1))
    ok("s1 버전 표시", ("v%d" % build_now) in page.inner_text("#sbTop"))
    _cid = re.search(r'clientId: "([^"]*)"', open(os.path.join(ROOT, "js/data.js"), encoding="utf-8").read()).group(1)
    ok("s1 앱에 넣은 연결 값이 클라이언트 ID 모양(비어 있으면 통과)", _cid == "" or re.fullmatch(r"\d+-[a-z0-9]+\.apps\.googleusercontent\.com", _cid) is not None, _cid)
    page.fill("#cid", "엉뚱한 값")
    btn(page, "저장").click()
    flash(page, "클라이언트 ID 모양이 아닙니다")
    page.fill("#cid", CID)
    btn(page, "저장").click()
    has(page, "구글 계정으로 들어가기")
    shot(page, "phone_01_gate")
    no_overflow(page, "로그인 화면")

    # s2 로그인 왕복
    login(page, fake)
    a = fake.auth_log[-1]
    ok("s2 돌아올 주소가 앱 주소와 글자까지 같음", a.get("redirect_uri") == BASE, a.get("redirect_uri"))
    ok("s2 로그인 요청 값", a.get("response_type") == "token" and a.get("client_id") == CID and a.get("prompt") == "select_account" and len(a.get("state", "")) > 8, str(a))
    ok("s2 권한은 읽기 전용과 앱이 만든 파일 두 가지뿐", set(a.get("scope", "").split()) == {"openid", "email", READONLY, FILE}, a.get("scope"))
    ok("s2 돌아온 뒤 주소에서 표를 지움", "access_token" not in page.url and "#" not in page.url, page.url)
    ok("s2 자료실이 있는 계정인지 먼저 확인", ("GET", "/drive/v3/files/" + FOLDERS["root"]) in fake.calls)
    ok("s2 로그인만으로는 아무것도 만들지 않음", not app_folder(fake) and not any(m != "GET" for m, _ in fake.calls), str([c for c in fake.calls if c[0] != "GET"]))
    page.wait_for_function("() => document.getElementById('prepsPart') && document.getElementById('prepsPart').innerText.includes('아직 시작한 준비가 없습니다')")
    shot(page, "phone_02_prep_home")
    no_overflow(page, "준비 처음 화면")

    # s3 준비 시작
    page.select_option("#pkB", "41")
    page.select_option("#pkC", "19")
    page.fill("#fV", "가나다")
    btn(page, "준비 시작").click()
    flash(page, "절은 1-10 이나")
    page.fill("#fV", "1-10")
    page.fill("#fD", "2026-11-29")
    btn(page, "준비 시작").click()
    page.wait_for_selector(".spine")
    page.wait_for_selector(".scripture .v")
    ok("s3 내 기록 폴더를 드라이브 맨 위에 하나 만듦", len(app_folder(fake)) == 1 and app_folder(fake)[0]["parents"] == [])
    ps, pf = paras(fake, prep_name)
    ok("s3 준비 문서를 내 기록 폴더 안에 만듦", pf["parents"] == [app_folder(fake)[0]["id"]] and pf["mimeType"] == DOC)
    ok("s3 준비 문서에 단계마다 제목과 메모 자리", sum(1 for s, t, _ in ps if s == "HEADING_2") == NSTEPS and sum(1 for s, t, _ in ps if t.startswith("(메모 자리 ")) == NSTEPS and page.locator(".spine .step").count() == NSTEPS, NSTEPS)
    ok("s3 화면 제목이 본문", page.inner_text("#sbTop h1") == "누가복음 19:1-10", page.inner_text("#sbTop h1"))
    ok("s3 설교 날짜 표시", "11월 29일 주일 설교" in main_text(page))
    ok("s3 본문은 고른 절만 (10절)", page.locator(".scripture .v").count() == 10, str(page.locator(".scripture .v").count()))
    ok("s3 소제목 표시", page.locator(".scripture .vh").count() == 1)
    ok("s3 1단계의 역본 고르기에는 원어가 없음(원어는 3단계)", btn(page, "원어", "#step1").count() == 0)
    btn(page, "우리말성경").click()
    ok("s3 둘째 역본으로 바꿈", "나역 1절" in page.inner_text(".scripture"))
    btn(page, "둘 다").click()
    ok("s3 두 역본을 절마다 나란히", page.locator(".scripture .v2").count() == 10 and page.locator(".scripture .v:not(.v2)").count() == 10)
    ok("v11 설교 크기를 고르는 칸, 큰 설교는 열한 단계", page.locator("#pzS").count() == 1 and page.locator(".spine .step").count() == 11)
    page.select_option("#pzS", "S")
    ok("v11 작은 설교는 단계가 줄어듦", page.locator(".spine .step").count() < 11, str(page.locator(".spine .step").count()))
    ok("v12 작은 설교는 일곱 단계, 심방 부탁 말 칸이 보임", page.locator(".spine .step").count() == 7 and page.locator("#visitAsk").count() == 1 and page.locator("#vsA").count() == 1, str(page.locator(".spine .step").count()))
    page.select_option("#pzS", "L")
    ok("v20 열쇠가 없으면 풀어 쓰기 단추가 없음", btn(page, "메모를 제미나이로 풀어 쓰기").count() == 0)
    page.get_by_role("button", name="설정").first.click()
    page.fill("#aiKey", "틀린열쇠")
    btn(page, "저장하고 시험하기").click()
    flash(page, "너무 짧거나")
    page.fill("#aiKey", "sk-ant-test-0000")
    btn(page, "저장하고 시험하기").click()
    flash(page, "Google AI Studio 열쇠를 넣습니다")
    page.fill("#aiKey", "AQ.Ab8TESTKEY-0123456789")
    btn(page, "저장하고 시험하기").click()
    flash(page, "제미나이와 연결되었습니다")
    ok("v20 설정에 끝자리만 보이고 Claude 연결은 없음", "끝자리 6789" in page.inner_text("#aiSet") and "AQ.Ab8TESTKEY-0123456789" not in page.inner_text("#aiSet") and "sk-ant" not in main_text(page) and page.locator("#aiModel").count() == 0)
    ok("v20 버전 기록은 최근 것만 펼쳐짐", page.locator("details.pts summary", has_text="지난 버전").count() == 1 and not page.locator("details.pts", has_text="지난 버전").first.evaluate("e => e.open"))
    nav(page, "준비")
    ok("v20 풀어 쓰기 단추가 생기고 복사 단추와 Claude 창은 없음", btn(page, "메모를 제미나이로 풀어 쓰기").count() == 1 and btn(page, "메모를 글로 풀어 달라고 하기").count() == 0 and "Claude 창" not in main_text(page))
    page.select_option("#pzS", "S")
    ok("v20 심방 칸은 복사만 있고 제미나이로 보내지 않음", btn(page, "부탁 말 복사").count() >= 1 and btn(page, "여기서 Claude에게 묻기").count() == 0 and "제미나이로 보내지 않습니다" in page.inner_text("#visitAsk"))
    page.select_option("#pzS", "L")
    ok("v12 큰 설교에는 심방 부탁 말 칸이 없음", page.locator("#visitAsk").count() == 0)
    ok("v11 큰 설교로 되돌리면 다시 열한 단계", page.locator(".spine .step").count() == 11)
    shot(page, "phone_03_step1", top=True)
    btn(page, "장 전체 보기").click()
    ok("s3 장 전체 보기 (12절)", page.locator(".scripture .v:not(.v2)").count() == 12)
    btn(page, "본문만 보기").click()
    btn(page, "개역개정").click()
    no_overflow(page, "준비 단계 화면")

    # s4 메모 저장, 고치기, 없애기
    btn(page, "메모 저장").click()
    flash(page, "적은 것이 없습니다")
    page.fill("#memo1", "첫 줄 메모 😀\n둘째 줄")
    btn(page, "메모 저장").dblclick()
    flash(page, "메모를 저장했습니다")
    ps, pf = paras(fake, prep_name)
    sec = section(ps, 1)
    ok("s4 메모가 1단계 자리 바로 위에 들어감", len(sec) == 2 and re.match(r"^\d\d-\d\d \d\d:\d\d 첫 줄 메모 😀$", sec[0][1]) and sec[1][1] == "둘째 줄", str(sec))
    ok("s4 넣은 줄은 보통 글, 단계 제목은 그대로", all(x[0] == "NORMAL_TEXT" for x in sec) and sum(1 for x in ps if x[0] == "HEADING_2") == NSTEPS)
    ok("s4 화면에 메모 두 줄, 적던 칸은 비움", page.locator("#step1 .memos li").count() == 2 and page.input_value("#memo1") == "")
    ok("s4 메모가 있는 단계는 채워진 표시", "has" in page.get_attribute("#step1", "class"))
    page.locator("#step1 .memos .ed").first.click()
    ok("s4 고치기를 누르면 그 줄이 고치는 칸으로", "첫 줄 메모 😀" in page.input_value("#lineBox"))
    page.fill("#lineBox", "고친 첫 줄 😀")
    btn(page, "고친 것 저장").click()
    flash(page, "메모를 고쳤습니다")
    sec = section(paras(fake, prep_name)[0], 1)
    ok("s4 그 줄만 고쳐짐", [x[1] for x in sec] == ["고친 첫 줄 😀", "둘째 줄"] and all(x[0] == "NORMAL_TEXT" for x in sec), str(sec))
    page.locator("#step1 .memos .ed").nth(1).click()
    page.fill("#lineBox", "내가 고친 둘째 줄")
    retext(pf, "둘째 줄", "다른 곳에서 바꾼 줄")
    btn(page, "고친 것 저장").click()
    flash(page, "그사이 이 줄이 바뀌어 고치지 않았습니다")
    sec = section(paras(fake, prep_name)[0], 1)
    ok("s4 다른 곳에서 바뀐 줄은 덮어쓰지 않고 새로 불러옴", [x[1] for x in sec] == ["고친 첫 줄 😀", "다른 곳에서 바꾼 줄"] and "다른 곳에서 바꾼 줄" in page.inner_text("#step1 .memos"), str(sec))
    page.fill("#memo1", "없앨 줄")
    btn(page, "메모 저장").click()
    flash(page, "메모를 저장했습니다")
    page.locator("#step1 .memos .ed").nth(2).click()
    page.fill("#lineBox", "")
    btn(page, "고친 것 저장").click()
    flash(page, "비운 채로 저장하면")
    ok("s4 비운 채 한 번 눌러서는 없어지지 않음", len(section(paras(fake, prep_name)[0], 1)) == 3)
    btn(page, "고친 것 저장").click()
    flash(page, "메모 줄을 없앴습니다")
    sec = section(paras(fake, prep_name)[0], 1)
    ok("s4 한 번 더 누르면 그 줄만 없어짐", [x[1] for x in sec] == ["고친 첫 줄 😀", "다른 곳에서 바꾼 줄"], str(sec))

    # s5 예화: 앱 안에서 읽고 담기 + 꺾쇠 글자
    page.click("#step9 .sh")
    page.wait_for_selector("#step9 .links li")
    ok("s5 이 장에 걸린 예화 두 개", page.locator("#step9 .links li").count() == 2)
    ok("s5 제목의 꺾쇠는 글자로만 보임", "<b>굵게</b>" in page.locator("#step9 .links .lk").nth(1).inner_text() and page.locator("#step9 .links b").count() == 0)
    no_drive_links(page, "준비 단계")
    page.locator("#step9 .links .lk").first.click()
    page.wait_for_selector(".reader")
    ok("s5 자료를 누르면 앱 안에서 펼쳐짐", page.inner_text("#sbTop h1") == "시험용 예화 하나_찾아오심" and "시험용 예화 본문." in page.inner_text(".reader") and page.url.startswith(BASE))
    shot(page, "phone_04_reader")
    btn(page, "지금 준비에 담기 (9. 예화)").click()
    flash(page, "담았습니다")
    page.wait_for_selector(".keepbar .kept")
    btn(page, "읽던 자료 닫기").click()
    page.wait_for_selector("#step9 .kept")
    ok("s5 읽다가 담고 닫으면 하던 단계로 돌아옴", "open" in page.get_attribute("#step9", "class") and page.locator("#step9 .kept").count() == 1 and page.inner_text("#sbTop h1") == "누가복음 19:1-10")
    sec = section(paras(fake, prep_name)[0], 9)
    line = sec[-1]
    ok("s5 담은 줄이 7단계 자리에 들어감", re.match(r"^\d\d-\d\d \d\d:\d\d 담음: 시험용 예화 하나_찾아오심 \(1-10절\)$", line[1] or ""), str(line))
    lk = (line[2] or [None])[0]
    ok("s5 제목에만 링크가 걸림", lk and line[1].encode("utf-16-le")[lk[0] * 2:lk[1] * 2].decode("utf-16-le") == "시험용 예화 하나_찾아오심" and lk[2] == d(made["illust1"]), str(lk))
    page.locator("#step9 .links .lk").nth(1).click()
    page.wait_for_selector(".reader")
    ok("s5 자료 속의 꺾쇠와 위험한 링크는 글자로만 보이고 실행되지 않음", page.evaluate("window.__xss === undefined") and page.locator(".reader img, .reader script").count() == 0 and "<script>" in page.inner_text(".reader") and page.locator(".reader a").count() == 0)
    page.go_back()
    page.wait_for_selector("#step9 .links li")
    ok("s5 읽던 자료에서 뒤로 가면 하던 단계", page.inner_text("#sbTop h1") == "누가복음 19:1-10" and "open" in page.get_attribute("#step9", "class"))
    btn(page, "담기", "#step9").click()
    flash(page, "담았습니다")
    ok("s5 목록에서 바로 담기", page.locator("#step9 .kept").count() == 2 and page.locator("#step9 .links .b").count() == 0 and len(section(paras(fake, prep_name)[0], 9)) == 2)
    shot(page, "phone_05_step9")

    # s6 로고스 맡길 말 (6단계)
    page.click("#step6 .sh")
    btn(page, "로고스 연구 맡길 말 복사").click()
    flash(page, "복사했습니다")
    clip = page.evaluate("navigator.clipboard.readText()")
    ok("s6 맡길 말에 본문과 준비 문서 주소", "누가복음 19:1-10" in clip and pf["id"] in clip and "6. 자료 견주기" in clip, clip[:80])
    ok("s6 자료 견주기에 이 장의 지난 자료", page.locator("#step6 .links li").count() == 2)
    btn(page, "다음: 7. 문단신학").click()
    ok("s6 다음 단계 단추", "open" in page.get_attribute("#step7", "class"))
    page.click("#step7 .pts summary")
    ok("s6 길잡이를 펼치면 강의안 요점과 근거", "신학적 이동" in page.inner_text("#step7 .pts") and "근거:" in page.inner_text("#step7 .pts"))
    ok("s6 길잡이에 강의안 원문 단추", btn(page, "쿠루빌라 설교세미나 메모 원문", "#step7").count() == 1)

    # s30 원어: 낱말을 누르면 원형, 문법, 사전, 쓰인 곳
    w1 = LUKE19["v"]["1"]
    page.click("#step3 .sh")
    page.wait_for_selector("#step3 .ow .w")
    ok("s30 원어 단계에 고른 절의 헬라어 본문", page.locator("#step3 .ov").count() == 10 and page.locator("#step3 .ov").first.locator(".w").count() == len(w1) and page.locator("#step3 .w .ws").first.inner_text() == w1[0][0], str(page.locator("#step3 .ov").count()))
    ok("s30 절마다 우리말 한 줄이 함께 보임", "시험용 본문 가역 1절" in page.locator("#step3 .okr").first.inner_text())
    og = page.inner_text("#step3 .og")
    ok("s31 원어 길잡이: 보는 법과 먼저 볼 곳", "먼저 볼 곳" in og and "되풀이되는 낱말" in og and "드물게 쓰인 낱말" in og and "명령형" in og and "신약에 1번" in og and "해석은 들어 있지 않습니다" in og, og[:500])
    page.locator("#step3 .og .chip").last.click()
    page.wait_for_selector("#wp")
    ok("s31 길잡이의 낱말을 누르면 그 절에서 풀이가 열림", page.locator("#step3 .ov .w.on").count() == 1)
    btn(page, "닫기", "#wp").click()
    page.locator("#step3 .ov").first.locator(".w").nth(1).click()
    page.wait_for_function("() => { const p = document.getElementById('wp'); return p && p.innerText.includes('번 쓰였습니다') }")
    wp = page.inner_text("#wp")
    ok("s30 낱말 풀이: 번호, 우리말 문법 이름, 자료의 영어 풀이", w1[1][3] in wp and "동사" in wp and "분사" in wp and "Participle" in wp and w1[1][2] in wp, wp[:300])
    ok("s30 낱말 풀이: 사전 풀이와 쓰인 곳, 출처", "신약에" in wp and "STEP Bible" in wp and page.locator("#wp .lex").count() == 1 and page.locator("#wp .chip").count() > 5, wp[-200:])
    shot(page, "phone_06_word")
    no_overflow(page, "원어 화면")
    btn(page, "이 낱말을 메모에 담기").click()
    flash(page, "낱말을 3. 원어 칸의 메모에 담았습니다")
    sec = section(paras(fake, prep_name)[0], 3)
    ok("s30 낱말을 메모에 담으면 출처와 함께 들어감", len(sec) == 1 and w1[1][3] in sec[0][1] and "(눅 19:1)" in sec[0][1] and sec[0][1].endswith("[STEP Bible]"), str(sec))
    page.fill("#memo3", "지울 메모")
    btn(page, "메모 저장", "#step3").click()
    flash(page, "메모를 저장했습니다")
    page.locator("#step3 .memos .rm").nth(1).click()
    ok("s32 지우기는 한 번 누르면 되묻는다", page.locator("#step3 .memos .rm").nth(1).inner_text() == "정말 지우기" and len(section(paras(fake, prep_name)[0], 3)) == 2)
    page.locator("#step3 .memos .rm").nth(1).click()
    flash(page, "지웠습니다")
    sec = section(paras(fake, prep_name)[0], 3)
    ok("s32 담은 줄 하나만 지움", len(sec) == 1 and sec[0][1].endswith("[STEP Bible]") and page.locator("#step3 .memos li").count() == 1, str(sec))
    btn(page, "장 전체 보기").click()
    ok("s30 장 전체의 원어 본문", page.locator("#step3 .ov").count() == len(LUKE19["v"]))
    btn(page, "본문만 보기").click()

    # s31 개요와 원고: 앱 안에서 쓰고 고친다
    page.click("#step10 .sh")
    page.fill("#body10", "\n서론\n\n1. 첫째 대지\n[시험용 예화](%s)\n\n결론  \n\n" % d(made["illust1"]))
    ok("s31 쓰는 동안 저장 안 한 글이 있다고 알림", "저장하지 않은 글이 있습니다" in page.inner_text("#dirty10"))
    btn(page, "설교 지도 저장").click()
    flash(page, "설교 지도를 저장했습니다")
    sec = section(paras(fake, prep_name)[0], 10)
    ok("s31 개요가 문서의 그 칸에 들어감(빈 줄 유지)", [x[1] for x in sec] == ["서론", "", "1. 첫째 대지", "시험용 예화", "", "결론"] and all(x[0] == "NORMAL_TEXT" for x in sec), str(sec))
    ok("s31 글 속의 링크는 링크로 들어감", sec[3][2] == [(0, 6, d(made["illust1"]))] and not sec[2][2], str(sec[3]))
    ok("s31 저장한 뒤 화면", page.input_value("#body10") == "서론\n\n1. 첫째 대지\n[시험용 예화](%s)\n\n결론" % d(made["illust1"]) and "드라이브에 저장되어 있습니다" in page.inner_text("#dirty10") and page.inner_text("#step10 .cnt") == "쓴 글 있음")
    page.fill("#body10", "서론을 고침\n\n1. 첫째 대지\n2. 둘째 대지\n\n결론")
    btn(page, "설교 지도 저장").click()
    flash(page, "설교 지도를 저장했습니다")
    sec = section(paras(fake, prep_name)[0], 10)
    ok("s31 고쳐 쓰면 그 칸의 글만 새 글로 바뀜", [x[1] for x in sec] == ["서론을 고침", "", "1. 첫째 대지", "2. 둘째 대지", "", "결론"] and not any(x[2] for x in sec) and len(section(paras(fake, prep_name)[0], 9)) == 2, str(sec))
    retext(pf, "결론", "다른 기기에서 고친 결론")
    page.fill("#body10", "내가 다시 쓴 개요")
    btn(page, "설교 지도 저장").click()
    flash(page, "덮어쓰지 않았습니다")
    ok("s31 다른 곳에서 바뀐 칸은 덮어쓰지 않고 바뀐 글을 보여 줌", "다른 기기에서 고친 결론" in page.input_value("#step10 .copy") and page.input_value("#body10") == "내가 다시 쓴 개요" and section(paras(fake, prep_name)[0], 10)[-1][1] == "다른 기기에서 고친 결론")
    btn(page, "내 글로 저장").click()
    flash(page, "설교 지도를 저장했습니다")
    ok("s31 알고서 내 글로 저장", [x[1] for x in section(paras(fake, prep_name)[0], 10)] == ["내가 다시 쓴 개요"] and page.locator("#step10 .copy").count() == 0)
    drop_section(pf, "11. 원고")
    btn(page, "다음: 11. 원고").click()
    page.fill("#body11", "원고 첫 문단입니다.\n\n둘째 문단입니다.")
    page.reload()
    page.wait_for_selector("#body11")
    ok("s31 저장하기 전에 화면이 닫혀도 쓰던 원고가 남음", page.input_value("#body11") == "원고 첫 문단입니다.\n\n둘째 문단입니다." and "저장하지 않은 글이 있습니다" in page.inner_text("#dirty11"))
    btn(page, "원고 저장").click()
    flash(page, "원고를 저장했습니다")
    ps, _ = paras(fake, prep_name)
    k = next(i for i, x in enumerate(ps) if x[1] == "11. 원고")
    ok("s31 옛 문서에 없던 칸은 문서 끝에 제목과 함께 만듦", ps[k][0] == "HEADING_2" and [x[1] for x in ps[k + 1:]] == ["원고 첫 문단입니다.", "", "둘째 문단입니다.", "(메모 자리 11)"] and all(x[0] == "NORMAL_TEXT" for x in ps[k + 1:]), str(ps[k:]))
    shot(page, "phone_07_write")
    no_overflow(page, "쓰는 화면")

    # s32 준비한 것 한눈에 읽기
    btn(page, "준비한 것 한눈에 읽기").click()
    page.wait_for_selector(".reader")
    t = page.inner_text(".reader")
    ok("s32 준비한 것을 한 화면에서 읽음", all(x in t for x in ["1. 기도와 읽기", "고친 첫 줄 😀", "내가 다시 쓴 개요", "원고 첫 문단입니다."]) and "메모 자리" not in t and page.locator(".reader table").count() == 1, t[:200])
    ok("s32 그 안의 자료 링크도 앱 안에서 열림", page.locator(".reader .lk").count() >= 2 and page.locator(".reader a").count() == 0)
    page.locator(".reader .lk", has_text="시험용 예화 하나").first.click()
    has(page, "시험용 예화 본문.")
    btn(page, "읽던 자료 닫기").click()
    page.wait_for_selector(".reader")
    ok("s32 자료에서 자료로 갔다가 닫으면 앞의 자료로", page.inner_text("#sbTop h1") == "누가복음 19:1-10 준비")
    btn(page, "읽던 자료 닫기").click()
    page.wait_for_selector(".spine")

    # s7 목록으로, 다시 열기
    btn(page, "목록으로").click()
    page.wait_for_selector("#prepsPart .item")
    ok("s7 이어서 하기에 보임", page.locator("#prepsPart .item").count() == 1 and "누가복음 19:1-10" in page.inner_text("#prepsPart") and "11월 29일 주일 설교" in page.inner_text("#prepsPart"))
    page.click("#prepsPart .item")
    page.wait_for_selector("#step1 .memos li")
    ok("s7 다시 열어도 메모가 그대로", page.inner_text("#step1 .cnt") == "메모 2" and "고친 첫 줄 😀" in page.inner_text("#step1 .memos"))
    page.click("#step9 .sh")
    page.wait_for_selector("#step9 .memos .lk")
    ok("s7 담은 줄의 제목이 바르게 보이고 누르면 앱 안에서 열림", page.locator("#step9 .memos .lk").first.inner_text() == "시험용 예화 하나_찾아오심" and page.locator("#step9 .kept").count() == 2)

    # s8 같은 본문·날짜로 또 시작하면 있는 것을 연다
    btn(page, "목록으로").click()
    page.wait_for_selector("#fV")
    page.fill("#fV", "1-10")
    page.fill("#fD", "2026-11-29")
    btn(page, "준비 시작").click()
    flash(page, "이미 있어")
    page.wait_for_selector(".spine")
    ok("s8 같은 준비 문서를 두 개 만들지 않음", sum(1 for f in fake.files.values() if f["name"] == prep_name) == 1)

    # s22 뒤로 가기
    page.go_back()
    page.wait_for_selector("#fV")
    ok("s22 준비 안에서 뒤로 가면 목록", page.inner_text("#sbTop h1") == "설교 준비")
    nav(page, "독서")
    page.go_back()
    page.wait_for_selector("#fV")
    ok("s22 다른 탭에서 뒤로 가면 준비", page.locator("#sbNav [aria-current=page]").inner_text() == "준비")
    page.click("#prepsPart .item")
    page.wait_for_selector("#step1 .memos li")

    # s9 성경: 읽기, 묵상, 원어
    nav(page, "권별")
    page.wait_for_selector(".scripture .v")
    ok("s9 성경 탭은 보던 장을 엶", "누가복음 19장" in main_text(page) and page.locator(".scripture .v").count() == 12)
    ok("s9 이 장에 걸린 자료가 보임", page.locator("#matPart .links li").count() == 4)
    no_drive_links(page, "성경")
    page.select_option("#pkB", "18")
    has(page, "시편 1편 문서가 아직 없습니다")
    ok("s9 장 문서가 없어도 원어로는 볼 수 있음", btn(page, "원어로 보기").count() == 1)
    page.select_option("#pkC", "23")
    page.wait_for_selector(".scripture .v")
    ok("s9 시편 23편 6절과 표제", page.locator(".scripture .v").count() == 6 and page.inner_text(".scripture .vh") == "시험용 표제")
    btn(page, "읽었습니다").click()
    page.wait_for_selector(".done")
    ok("s9 읽은 것으로 표시", "오늘 읽었습니다" in main_text(page) and btn(page, "읽었습니다").count() == 0)
    ok("s9 묵상 칸은 없음", page.locator("#qtText").count() == 0 and "묵상 저장" not in main_text(page))
    shot(page, "phone_08_bible")
    no_overflow(page, "성경 화면")
    btn(page, "원어").click()
    page.wait_for_selector(".ow.h .w")
    ok("s9 히브리어는 오른쪽에서 왼쪽으로, 표제 절도 보임", page.get_attribute(".ow.h", "dir") == "rtl" and page.locator(".ov").count() == 7 and page.locator(".okr b").first.inner_text() == "표제")
    page.locator("#ov1 .w").nth(1).click()
    page.wait_for_function("() => { const p = document.getElementById('wp'); return p && p.innerText.includes('번 쓰였습니다') }")
    btn(page, "사전 풀이 더 보기").click()
    wp = page.inner_text("#wp")
    ok("s9 히브리어 낱말 풀이: 어근과 붙은 말, Strong과 BDB 풀이", "H7462B" in wp and "H9020" in wp and "Strong:" in wp and "BDB:" in wp and "구약에 167번" in wp and "분사" in wp, wp[:400])
    shot(page, "phone_09_hebrew")
    no_overflow(page, "히브리어 화면")
    page.locator("#wp .chip").first.click()
    page.wait_for_selector(".ov.hit")
    ok("s9 쓰인 곳을 누르면 그 장의 그 절로 감", page.locator("#sbNav [aria-current=page]").inner_text() == "권별" and "창세기 4장" in main_text(page) and page.get_attribute(".ov.hit", "id") == "ov2", main_text(page)[:60])
    page.select_option("#pkB", "18")
    page.select_option("#pkC", "23")
    page.wait_for_selector(".ow.h .w")
    btn(page, "개역개정").click()
    page.wait_for_selector(".scripture .v")
    btn(page, "다음 장").click()
    has(page, "시편 24편 문서가 아직 없습니다")
    btn(page, "앞 장").click()
    page.wait_for_selector(".scripture .v")
    ok("s9 앞 장·다음 장", "시편 23편" in main_text(page))

    # s10 독서 (습관 돕기)
    nav(page, "독서")
    has(page, "오늘은 아직 읽지 않았습니다")
    btn(page, "읽기 시작").click()
    flash(page, "책 제목을 적어 주십시오")
    ok("v11 새 책에 분야 칸이 있음", page.locator("#bkCat option").count() == 8)
    page.fill("#bkT", "시험용 책")
    btn(page, "책 정보 찾기").click()
    page.wait_for_selector("#bibPart .item")
    page.locator("#bibPart .item").first.click()
    ok("v13 책 정보를 고르면 쪽수가 채워짐", page.input_value("#bkTot") == "240" and "홍길동" in page.inner_text("#bibPart"), page.input_value("#bkTot"))
    page.fill("#bkTot", "200")
    btn(page, "읽기 시작").click()
    flash(page, "읽는 책에 놓았습니다")
    ok("s10 읽는 책에 놓임", page.locator(".shelf li").count() == 1 and "아직 읽은 기록이 없습니다" in page.inner_text(".shelf"))
    page.fill("#bkPg0", "50")
    btn(page, "읽었습니다").click()
    flash(page, "읽은 것으로 적었습니다")
    mt = main_text(page)
    ok("s10 읽었습니다만 눌러도 오늘 기록과 진도", "오늘 읽었습니다" in mt and "1일째" in mt and "50쪽까지" in mt and "25%" in mt and page.locator(".shelf .kept").count() == 1, mt[:300])
    ok("v13 읽는 책에 지은이와 표지가 보임", "홍길동" in page.inner_text(".shelf") and page.locator(".shelf img.cover").count() == 1)
    import datetime as _dt
    page.fill("#bkDue0", (_dt.date.today() + _dt.timedelta(days=9)).isoformat())
    page.locator("#bkDue0").dispatch_event("change")
    ok("v13 다 읽을 날을 정하면 오늘 몫이 나옴", "오늘 몫 15쪽" in page.inner_text(".shelf"), page.inner_text(".shelf")[:200])
    btn(page, "토론하기").click()
    page.wait_for_selector("#talkSec")
    ok("v13 토론하기 칸이 열림", "묻고 답합니다" in page.inner_text("#talkSec"))
    btn(page, "여기서 토론 시작").click()
    page.wait_for_selector("#talkSec .say.ai")
    page.fill("#talkIn", "내 답입니다")
    btn(page, "보내기").click()
    page.wait_for_selector("#talkSec .say.me")
    ok("v14 앱 안에서 토론이 오감", page.locator("#talkSec .say.ai").count() >= 1 and "시험용 책" in GEM_CALLS[-1][1]["contents"][0]["parts"][0]["text"] and GEM_CALLS[-1][1]["contents"][-1]["parts"][0]["text"] == "내 답입니다" and "지어내지 않는다" in GEM_CALLS[-1][1]["system_instruction"]["parts"][0]["text"], str(len(GEM_CALLS)))
    btn(page, "닫기").click()
    ok("v13 읽는 법 길잡이가 있음", "읽는 법 길잡이" in main_text(page))
    btn(page, "한 줄 남기기").click()
    btn(page, "남기기").click()
    flash(page, "적은 것이 없습니다")
    page.set_input_files("#bkPh", {"name": "p.png", "mimeType": "image/png", "buffer": b"\x89PNG\r\n\x1a\n" + b"0" * 64})
    page.wait_for_selector("#ocrSt:has-text('아래 칸에 넣었습니다')")
    ok("v13 사진에서 읽은 글이 남는 문장 칸에 들어감", "둘째 줄" in page.input_value("#bkX") and "image1" not in page.input_value("#bkX"), page.input_value("#bkX"))
    page.fill("#bkP", "45")
    page.fill("#bkR", "눅 19:1-10")
    page.fill("#bkX", "옮겨 적은 줄\n내 생각")
    btn(page, "남기기").click()
    flash(page, "남겼습니다")
    ps, _ = paras(fake, "독서_" + YM)
    ok("s10 이달 독서 문서에 쌓임", [x[1] for x in ps[1:]] == ["[독서] %s 시험용 책, 45쪽, 관련 본문 눅 19:1-10" % TODAY.isoformat(), "옮겨 적은 줄", "내 생각"], str(ps))
    btn(page, "한 줄 남기기").click()
    page.fill("#bkX", "둘째 기록")
    ok("v11 질문, 내 말로, 쓸 곳 칸이 있음", page.locator("#bkQ").count() == 1 and page.locator("#bkM").count() == 1 and page.locator("#bkU").count() == 1)
    page.check("#bkI")
    btn(page, "남기기").click()
    flash(page, "예화 모음에도")
    ps, _ = paras(fake, "독서_" + YM)
    pi, _ = paras(fake, "예화_" + YM)
    ok("s10 두 번째 기록은 같은 문서 끝에, 예화로 넘긴 것은 예화 문서에", len([p for p in ps if p[1].startswith("[독서]")]) == 2 and ps[-1][1] == "둘째 기록" and [x[1] for x in pi[1:]] == ["[예화] %s 시험용 책" % TODAY.isoformat(), "둘째 기록"] and sum(1 for f in fake.files.values() if f["name"] == "독서_" + YM) == 1, str(ps) + str(pi))
    btn(page, "이번 달에 남긴 것 보기").click()
    page.wait_for_selector(".notes li")
    ok("s10 이번 달에 남긴 것 세 덩이", page.locator(".notes li").count() == 3 and "둘째 기록" in page.inner_text(".notes li >> nth=0"))
    page.locator(".notes .rm").first.click()
    ok("s10 지우기는 한 번 누르면 되묻는다", page.locator(".notes .rm").first.inner_text() == "정말 지우기" and len(paras(fake, "예화_" + YM)[0]) == len(pi))
    page.locator(".notes .rm").first.click()
    flash(page, "지웠습니다")
    page.wait_for_function("() => document.querySelectorAll('.notes li').length === 2")
    pi, _ = paras(fake, "예화_" + YM)
    ok("s10 문서 끝의 덩이를 지움", not any("둘째 기록" in x[1] or "[예화]" in x[1] for x in pi), str(pi))
    page.locator(".notes .rm").nth(1).click()
    page.locator(".notes .rm").nth(1).click()
    flash(page, "지웠습니다")
    page.wait_for_function("() => document.querySelectorAll('.notes li').length === 1")
    ps, _ = paras(fake, "독서_" + YM)
    ok("s10 가운데 덩이만 지움", [x[1] for x in ps[1:]] == ["[독서] %s 시험용 책" % TODAY.isoformat(), "둘째 기록"], str(ps))
    btn(page, "한 줄 남기기").click()
    page.fill("#bkQ", "왜 그런가")
    page.fill("#bkM", "내 말로 적은 줄")
    btn(page, "남기기").click()
    flash(page, "남겼습니다")
    ps, _ = paras(fake, "독서_" + YM)
    ok("v11 질문과 내 말로가 꼬리표와 함께 쌓임", ps[-2][1] == "질문: 왜 그런가" and ps[-1][1] == "내 말로: 내 말로 적은 줄", str(ps[-3:]))
    ok("v11 올해 다 읽은 책 칸이 보임", "년에 다 읽은 책" in main_text(page))
    btn(page, "토론하기").click()
    page.wait_for_selector("#talkSec")
    btn(page, "여기서 토론 시작").click()
    page.wait_for_selector("#talkSec .say.ai")
    page.fill("#talkIn", "정리할 답")
    btn(page, "보내기").click()
    page.wait_for_selector("#talkIn")
    btn(page, "세 줄로 정리해 남기기").click()
    flash(page, "토론 정리를 이달 독서 기록에 남겼습니다")
    ps, _ = paras(fake, "독서_" + YM)
    ok("v14 토론 정리가 이달 독서 문서에 남음", any("토론 정리" in x[1] for x in ps), str(ps[-4:]))
    btn(page, "닫기").click()
    shot(page, "phone_10_book")
    no_overflow(page, "독서 화면")

    # s11 찾기
    nav(page, "찾기")
    btn(page, "찾기", "#sbMain").click()
    flash(page, "찾을 말을 적어 주십시오")
    page.fill("#q", "없는말없는말")
    page.press("#q", "Enter")
    has(page, "찾지 못했습니다")
    page.fill("#q", "시험용")
    page.press("#q", "Enter")
    page.wait_for_selector("#sbMain .links li")
    t = main_text(page)
    ok("s11 묶음별 결과", all(x in t for x in ["성경 3", "설교 요지 1", "예화 2", "원고 1", "내 기록"]), t[:300])
    ok("s11 파일 이름의 꺾쇠는 글자로만 보이고 실행되지 않음", page.locator("#sbMain img").count() == 0 and page.evaluate("window.__xss === undefined") and "<img src=x" in t)
    ok("s11 지금 준비에 담을 수 있음을 알림", "지금 준비(누가복음 19:1-10)" in t)
    no_drive_links(page, "찾기")
    sec = page.locator("#sbMain section", has_text="설교 요지 1")
    sec.locator(".lk").click()
    page.wait_for_selector(".reader table")
    ok("s11 찾은 자료를 앱 안에서 읽음: 표, 굵은 글씨, 목록", page.locator(".reader table td").count() == 2 and page.inner_text(".reader b") == "시험용 문장" and page.locator(".reader ul li").count() == 2)
    page.locator(".reader .lk", has_text="시험용 원고 전문").click()
    has(page, "시험용 원고 본문 둘째 문단.")
    ok("s11 자료 속 링크도 앱 안에서 이어 읽음", page.inner_text("#sbTop h1") == "시험용 원고 전문" and page.url.startswith(BASE))
    btn(page, "읽던 자료 닫기").click()
    page.wait_for_selector(".reader table")
    btn(page, "지금 준비에 담기 (6. 자료 견주기)").click()
    flash(page, "6. 자료 견주기 칸에 들어갔습니다")
    btn(page, "읽던 자료 닫기").click()
    page.wait_for_selector("#q")
    sec5 = section(paras(fake, prep_name)[0], 6)
    ok("s11 찾은 것을 읽다가 준비의 6단계에 담음", len(sec5) == 1 and "담음: 요지_2026-11-01_눅 19:1-10_시험용 요지 (설교 요지)" in sec5[0][1] and sec5[0][2] and page.locator("#sbMain section", has_text="설교 요지 1").locator(".kept").count() == 1, str(sec5))
    shot(page, "phone_11_find")
    no_overflow(page, "찾기 화면")
    page.locator("#sbMain").get_by_role("button", name="시편 23편", exact=True).click()
    page.wait_for_selector(".scripture .v")
    ok("s11 성경 결과를 누르면 그 장이 열림", page.locator("#sbNav [aria-current=page]").inner_text() == "권별" and "시편 23편" in main_text(page))

    # s12 나의 현황 + 드라이브와 합치기
    nav(page, "현황")
    ok("s12 오늘 칸에 세 가지 표시(묵상 칸을 뺐으므로)", page.locator(".day.today .mk.on").count() == 3, str(page.locator(".day.today .mk.on").count()))
    ok("s12 연속 1일", page.inner_text(".streak b") == "1")
    ok("s12 12주 표의 오늘 칸이 가장 짙음", "l3" in page.get_attribute(".g12 .c.now", "class") and page.locator(".g12 .c").count() == 84)
    btn(page, "지금 맞추기").click()
    page.wait_for_function("() => document.getElementById('syncLine').textContent.includes('드라이브와 맞춘 때')")
    af = fake.by_name("활동 기록.json")
    rem = json.loads(af["content"])
    day = rem["days"].get(TODAY.isoformat(), {})
    ok("s12 활동 기록이 드라이브에 올라감", day.get("read") == 1 and not day.get("qt") and day.get("book") == 2 and day.get("prep", 0) >= 8 and af["parents"] == [app_folder(fake)[0]["id"]], str(day))
    for i in range(1, 80):   # 다른 기기가 올린 지난 기록
        dd = (TODAY - datetime.timedelta(days=i)).isoformat()
        kinds = [k for j, k in enumerate(["read", "qt", "prep", "book"]) if (i * 7 + j * 3) % (j + 2) == 0 and i % 6 != 0]
        if i <= 3:
            kinds = ["read", "qt"][:i]
        if kinds:
            rem["days"][dd] = {k: 1 for k in kinds}
    rem["days"][TODAY.isoformat()]["read"] = 3
    rem["log"].append({"id": "1700000000000-other", "d": (TODAY - datetime.timedelta(days=1)).isoformat(), "k": "qt", "n": "다른 기기에서 한 묵상"})
    before = sum(v for r in rem["days"].values() for v in r.values())
    af["content"] = json.dumps(rem, ensure_ascii=False)
    btn(page, "지금 맞추기").click()
    page.wait_for_function("() => document.querySelectorAll('.g12 .c.l1, .g12 .c.l2, .g12 .c.l3').length > 20")
    loc = json.loads(page.evaluate("localStorage.getItem('sb.act')"))
    after = sum(v for r in loc["days"].values() for v in r.values())
    ok("s12 드라이브의 지난 기록을 받아 합침 (줄지 않음)", after == before and loc["days"][TODAY.isoformat()]["read"] == 3 and loc["days"][TODAY.isoformat()]["book"] == 2 and any(e["id"] == "1700000000000-other" for e in loc["log"]), "%d %d" % (before, after))
    ok("s12 연속 일수가 지난 기록까지 이어짐", int(page.inner_text(".streak b")) >= 4, page.inner_text(".streak b"))
    shot(page, "phone_12_me", top=True)
    no_overflow(page, "현황 화면")

    # s23 설정과 연결 점검
    page.click("#sbTop .ver")
    ok("s23 설정에 계정과 원어 자료 출처가 보임", fake.email in main_text(page) and "STEP Bible" in main_text(page) and "CC BY 4.0" in main_text(page))
    ok("v18 한도·붐빔인 모델은 넘기고 되는 모델을 기억함", any("/models/gemini-9-flash:generateContent" in c[0] for c in GEM_CALLS) and "/models/gemini-9-flash-lite:generateContent" in GEM_CALLS[-1][0] and "gemini-9-flash-lite" in page.inner_text("#aiSet"))
    btn(page, "점검하기").click()
    page.wait_for_function("() => document.querySelectorAll('.check li').length >= 6")
    ok("s23 연결 점검 여섯 줄이 모두 됨", page.locator(".check li.no").count() == 0 and page.locator(".check li.ok").count() == 6, page.inner_text(".check"))
    shot(page, "phone_13_set", full=True)
    no_overflow(page, "설정 화면")

    # s27 문서가 그사이 바뀌었으면 다시 읽고 한 번만 넣는다
    nav(page, "준비")
    page.wait_for_selector(".spine")
    ok("s27 다른 탭에 다녀와도 하던 준비가 그대로 열려 있음", page.inner_text("#sbTop h1") == "누가복음 19:1-10")
    page.click("#step2 .sh")
    page.fill("#memo2", "다시 넣기 시험")
    fake.fail_next = (":batchUpdate", 400, {"error": {"code": 400, "message": "The required revision ID 'a' does not match the latest revision 'b'.", "status": "FAILED_PRECONDITION"}})
    btn(page, "메모 저장").click()
    flash(page, "메모를 저장했습니다")
    ok("s27 바뀐 문서에는 다시 읽고 한 번만 넣음", sum(1 for x in paras(fake, prep_name)[0] if (x[1] or "").endswith("다시 넣기 시험")) == 1 and fake.fail_next is None)

    # s29 API가 꺼져 있을 때의 안내
    nav(page, "권별")
    page.wait_for_selector(".scripture .v")
    fake.fail_next = (fake.by_name("19_시편 023편")["id"] + "/export", 403, {"error": {"code": 403, "message": "Google Drive API has not been used in project 123 before or it is disabled.", "status": "PERMISSION_DENIED", "errors": [{"reason": "accessNotConfigured"}]}})
    page.reload()
    has(page, "API가 꺼져")
    ok("s29 API가 꺼져 있으면 무엇을 켜야 하는지 알림", "Drive API나 Docs API가 꺼져" in main_text(page))
    btn(page, "다시 불러오기").click()
    page.wait_for_selector(".scripture .v")
    ok("s29 다시 불러오기", page.locator(".scripture .v").count() == 6 and "오늘 읽었습니다" in main_text(page))

    # s14 쓰는 도중 로그인이 만료되어도 적던 글을 잃지 않는다
    nav(page, "준비")
    page.wait_for_selector("#step2 .sh")
    if page.locator("#memo2").count() == 0:
        page.click("#step2 .sh")
    page.fill("#memo2", "만료 시험 메모")
    fake.tokens.clear()
    n_auth = len(fake.auth_log)
    btn(page, "메모 저장").click()
    # 10판: 만료되면 묻지 않고 화면 없이 새로 받는다
    for _ in range(80):
        if len(fake.auth_log) > n_auth:
            break
        time.sleep(0.1)
    page.wait_for_selector("#memo2")
    a = fake.auth_log[-1]
    ok("s14 화면 없이 새로 받기 (prompt=none, 같은 계정)", len(fake.auth_log) == n_auth + 1 and a.get("prompt") == "none" and a.get("login_hint") == fake.email, str(a))
    ok("s14 돌아오면 하던 준비·단계·적던 글이 그대로", page.inner_text("#sbTop h1") == "누가복음 19:1-10" and page.input_value("#memo2") == "만료 시험 메모" and "open" in page.get_attribute("#step2", "class"))
    btn(page, "메모 저장").click()
    flash(page, "메모를 저장했습니다")
    ok("s14 다시 저장하면 들어감", sum(1 for x in paras(fake, prep_name)[0] if (x[1] or "").endswith("만료 시험 메모")) == 1)

    # s25 화면을 다시 열어도 적던 글이 남는다
    page.fill("#memo2", "닫혔다 열려도 남는 글")
    page.reload()
    page.wait_for_selector("#memo2")
    ok("s25 다시 열어도 적던 글이 남음", page.input_value("#memo2") == "닫혔다 열려도 남는 글")
    page.fill("#memo2", "")

    # s15 구글 로그인이 풀려 있으면 로그인 화면으로 (되풀이하지 않음)
    page.evaluate("() => { const a = JSON.parse(localStorage.getItem('sb.auth')); a.exp = Date.now() - 1000; localStorage.setItem('sb.auth', JSON.stringify(a)); localStorage.setItem('sb.silentAt', '0'); }")
    fake.session = False
    n_auth = len(fake.auth_log)
    page.reload()
    has(page, "구글 계정으로 들어가기")
    page.wait_for_timeout(700)
    ok("s15 화면 없는 새로 받기는 한 번만 시도", len(fake.auth_log) == n_auth + 1 and fake.auth_log[-1].get("prompt") == "none", str(len(fake.auth_log) - n_auth))
    login(page, fake)
    page.wait_for_selector(".spine")
    a = fake.auth_log[-1]
    ok("s15 다시 로그인하면 같은 계정으로, 하던 곳으로", a.get("login_hint") == fake.email and "prompt" not in a and page.inner_text("#sbTop h1") == "누가복음 19:1-10", str(a))

    # s26 구글이 마크다운을 받지 않으면 보통 글로 다시 만든다
    fake.no_markdown = True
    btn(page, "목록으로").click()
    page.wait_for_selector("#fV")
    page.select_option("#pkB", "18")
    page.select_option("#pkC", "23")
    page.fill("#fD", "2026-12-06")
    btn(page, "준비 시작").click()
    page.wait_for_selector(".spine")
    ok("s26 장 전체 준비 문서 이름", any(f["name"] == "준비_2026-12-06_시편 23편" for f in fake.files.values()) and page.inner_text("#sbTop h1") == "시편 23편")
    page.wait_for_selector(".scripture .v")
    ok("s26 절을 비우면 장 전체, 장 전체 보기 단추 없음", page.locator(".scripture .v").count() == 6 and btn(page, "장 전체 보기").count() == 0)
    fake.no_markdown = False

    # s18 새 판 적용: 같은 판으로 되풀이하지 않는다
    import re as _re
    core_src = open(os.path.join(ROOT, "js/core.js"), encoding="utf-8").read()
    cur = int(_re.search(r"const BUILD = (\d+);", core_src).group(1)); nxt = cur + 1   # 지금 판과 그다음 판
    navs = []
    page.on("domcontentloaded", lambda pg: navs.append(pg.url))
    page.route("**/version.json*", lambda r: r.fulfill(status=200, content_type="application/json", body='{"build": %d}' % nxt))
    page.evaluate("localStorage.removeItem('sb.updTry')")
    page.goto(BASE)
    page.wait_for_url(BASE + "?v=%d" % nxt)
    page.wait_for_selector("#sbFlash .bar")
    page.wait_for_timeout(900)
    ok("s18 새 판이 있으면 저절로 한 번 다시 엶 (되풀이 없음)", navs.count(BASE + "?v=%d" % nxt) == 1, str(navs))
    ok("s18 아직 옛 판이면 알림 띠와 지금 바꾸기", ("새 버전 v%d" % nxt) in page.inner_text("#sbFlash") and btn(page, "지금 바꾸기").count() == 1)
    core = core_src.replace("const BUILD = %d;" % cur, "const BUILD = %d;" % nxt)
    page.route("**/js/core.js*", lambda r: r.fulfill(status=200, content_type="text/javascript; charset=utf-8", body=core))
    btn(page, "지금 바꾸기").click()
    page.wait_for_function("() => document.getElementById('sbTop').innerText.includes('v%d')" % nxt)
    ok("s18 새 판으로 바뀌면 한 번 알림", ("새 버전 v%d로 바꿨습니다" % nxt) in page.inner_text("#sbFlash") and btn(page, "지금 바꾸기").count() == 0, page.inner_text("#sbFlash"))
    page.unroute("**/js/core.js*")
    page.unroute("**/version.json*")

    # s19 지키는 것
    ok("s19 지우기·옮기기·자료실 쓰기 요청이 한 번도 없음", not fake.violations and not any(m == "DELETE" for m, _ in fake.calls), str(fake.violations))
    ok("s19 내 기록 폴더는 끝까지 하나", len(app_folder(fake)) == 1)
    ok("s19 자료실 문서는 하나도 바뀌지 않음", all(f["rev"] == 1 and "units" not in f for f in fake.files.values() if f["vault"] and f["mimeType"] == DOC))
    ctx.close()
    return fake


def run_second_device(browser, fake):
    """다른 기기: 이 기기에만 있던 기록과 드라이브 기록이 합쳐지고, 어느 쪽도 줄지 않는다."""
    old = (TODAY - datetime.timedelta(days=100)).isoformat()
    local = {"app": "second-brain", "v": 1, "days": {old: {"read": 2}, TODAY.isoformat(): {"read": 1, "qt": 5}}, "log": [{"id": "1600000000000-local", "d": old, "k": "read", "n": "이 기기에만 있던 기록"}]}
    ctx, page = new_ctx(browser, fake, seed_ls={"sb.clientId": json.dumps(CID), "sb.act": json.dumps(local, ensure_ascii=False), "sb.ui": json.dumps({"tab": "me"})})
    af = fake.by_name("활동 기록.json")
    before = json.loads(af["content"])
    page.goto(BASE)
    page.wait_for_selector("#syncLine")
    ok("s13 로그인 전에도 이 기기의 기록은 보임", "이 기기에 저장되어 있습니다" in page.inner_text("#syncLine") and page.locator(".log li").count() == 1)
    page.click("#sbTop .ver")
    login(page, fake)
    page.wait_for_function("() => { const a = JSON.parse(localStorage.getItem('sb.act') || '{}'); return a.log && a.log.length > 3 }")
    page.wait_for_timeout(600)
    after, loc = json.loads(af["content"]), json.loads(page.evaluate("localStorage.getItem('sb.act')"))
    t = TODAY.isoformat()
    ok("s13 이 기기에만 있던 날이 드라이브에 더해짐", after["days"].get(old) == {"read": 2} and any(e["id"] == "1600000000000-local" for e in after["log"]), str(after["days"].get(old)))
    ok("s13 같은 날은 큰 쪽으로", after["days"][t]["qt"] == 5 and after["days"][t]["read"] == 3 and after["days"][t]["book"] == before["days"][t]["book"], str(after["days"][t]))
    ok("s13 드라이브에 있던 날은 하나도 빠지지 않음", all(after["days"].get(dd) == r for dd, r in before["days"].items() if dd != t) and len(after["log"]) >= len(before["log"]))
    ok("s13 두 곳이 같아짐", loc["days"] == after["days"])
    ok("s13 내 기록 폴더를 새로 만들지 않음", len(app_folder(fake)) == 1)
    ok("s13 지킨 것", not fake.violations, str(fake.violations))
    ctx.close()


def run_gates(browser):
    # s16 자료실이 없는 계정
    fake = Fake(FOLDERS, email="other@example.com")
    fake.has_vault = False
    ctx, page = new_ctx(browser, fake, seed_ls={"sb.clientId": json.dumps(CID)})
    page.goto(BASE)
    btn(page, "구글로 로그인").click()
    has(page, "자료실이 없습니다")
    ok("s16 자료실이 없는 계정은 받지 않고 알림", "other@example.com 계정에는 세컨브레인 자료실이 없습니다" in main_text(page))
    ok("s16 그 계정에는 아무것도 만들지 않음", not any(m != "GET" for m, _ in fake.calls) and not app_folder(fake), str(fake.calls))
    ok("s16 로그인 표를 버림", page.evaluate("JSON.parse(localStorage.getItem('sb.auth')).token") == "")
    btn(page, "구글로 로그인").click()
    has(page, "자료실이 없습니다")
    ok("s16 다시 누르면 계정을 고르게 함", fake.auth_log[-1].get("prompt") == "select_account" and "login_hint" not in fake.auth_log[-1], str(fake.auth_log[-1]))
    ctx.close()
    # s17 허락 화면에서 칸을 다 체크하지 않음 / 취소
    fake = Fake(FOLDERS)
    seed(fake)
    fake.grant = "partial"
    ctx, page = new_ctx(browser, fake, seed_ls={"sb.clientId": json.dumps(CID)})
    page.goto(BASE)
    btn(page, "구글로 로그인").click()
    has(page, "칸을 모두 체크")
    ok("s17 권한이 빠지면 받지 않고 이유를 알림", page.evaluate("JSON.parse(localStorage.getItem('sb.auth')).token") == "" and not any(p.startswith("/drive") for _, p in fake.calls))
    fake.grant = "deny"
    btn(page, "구글로 로그인").click()
    has(page, "취소되었습니다")
    ok("s17 다시 누르면 허락 화면을 다시 띄움", fake.auth_log[-1].get("prompt") == "consent", str(fake.auth_log[-1]))
    fake.grant = "all"
    login(page, fake)
    page.wait_for_selector("#prepsPart")
    ok("s17 모두 허락하면 들어감", "새 준비" in main_text(page))
    # 주소에 남의 표를 붙여 열어도 받지 않는다 (보낼 때 만든 확인 값이 없으므로)
    page.evaluate("localStorage.removeItem('sb.auth')")
    page.goto("about:blank")
    page.goto(BASE + "#access_token=stolen&token_type=Bearer&expires_in=3600&state=guess&scope=" + READONLY)
    has(page, "확인 값이 맞지 않아")
    ok("s17 확인 값이 다른 표는 받지 않음", page.evaluate("(JSON.parse(localStorage.getItem('sb.auth') || '{}').token || '')") == "" and "#" not in page.url)
    # 로그인하지 않아도 성경 원어와 현황은 열 수 없다/있다: 원어 자료는 로그인 뒤에 쓰는 화면 안에 있다
    ctx.close()


def run_looks(browser, fake):
    """아이패드 크기와 어두운 화면 캡처, 넘침 확인."""
    for tag, vp, scheme in (("ipad", IPAD, "light"), ("dark", PHONE, "dark")):
        ctx, page = new_ctx(browser, fake, viewport=vp, scheme=scheme, seed_ls={"sb.clientId": json.dumps(CID)})
        page.goto(BASE)
        login(page, fake)
        page.wait_for_selector("#prepsPart .item")
        shot(page, tag + "_01_prep_home")
        page.locator("#prepsPart .item", has_text="누가복음 19:1-10").click()
        page.wait_for_selector(".scripture .v")
        btn(page, "둘 다").click()
        shot(page, tag + "_02_step1")
        no_overflow(page, tag + " 준비 단계")
        page.click("#step3 .sh")
        page.wait_for_selector("#step3 .ow .w")
        page.locator("#step3 .ov").first.locator(".w").nth(1).click()
        page.wait_for_function("() => { const p = document.getElementById('wp'); return p && p.innerText.includes('번 쓰였습니다') }")
        shot(page, tag + "_03_word")
        no_overflow(page, tag + " 원어")
        page.click("#step10 .sh")
        page.wait_for_selector("#body10")
        shot(page, tag + "_04_write")
        nav(page, "현황")
        page.wait_for_function("() => document.querySelectorAll('.g12 .c.l1, .g12 .c.l2, .g12 .c.l3').length > 20")
        shot(page, tag + "_05_me")
        no_overflow(page, tag + " 현황")
        ctx.close()


with sync_playwright() as p:
    srv = serve()
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    t0 = time.time()
    fake = None
    for fn in (run_main, run_second_device, run_gates, run_looks):
        try:
            r = fn(b) if fn in (run_main, run_gates) else fn(b, fake)
            fake = r or fake
        except Exception as e:
            import traceback
            here = [f for f in traceback.extract_tb(e.__traceback__) if f.filename.endswith("test_app.py")][-1]
            errors.append("%s 에서 멈춤 (줄 %d: %s): %s" % (fn.__name__, here.lineno, here.line, str(e).split("\n")[0][:300]))
            if fn is run_main:
                break
    b.close()
    srv.shutdown()

bad = [r for r in results if not r[1]]
for e in errors:
    print("  오류 기록: " + e[:400])
print("화면 점검: 됨 %d, 안 됨 %d, 오류 기록 %d (%.0f초)" % (len(results) - len(bad), len(bad), len(errors), time.time() - t0))
sys.exit(1 if bad or errors else 0)
