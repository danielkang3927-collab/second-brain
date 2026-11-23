"""올리기 전 점검: 버전 번호 네 곳이 같은지, 저장소에 넣으면 안 되는 것이 없는지 본다.

실행: python3 tests/check_release.py <저장소 폴더>
"""
import sys, os, re, json, subprocess

ROOT = os.path.abspath(sys.argv[1])
read = lambda p: open(os.path.join(ROOT, p), encoding="utf-8").read()
bad = []


def ok(name, cond, detail=""):
    print(("됨    " if cond else "안 됨 ") + name + ((" → " + str(detail)) if not cond and detail != "" else ""))
    if not cond:
        bad.append(name)


html, core, data = read("index.html"), read("js/core.js"), read("js/data.js")
n = int(re.search(r'name="sb-build" content="(\d+)"', html).group(1))
ok("index.html 의 ?v= 가 모두 판 번호와 같음", set(re.findall(r"\?v=(\d+)", html)) == {str(n)}, set(re.findall(r"\?v=(\d+)", html)))
ok("js/core.js 의 BUILD", re.search(r"const BUILD = (\d+);", core).group(1) == str(n))
ok("version.json", json.loads(read("version.json"))["build"] == n)
ok("바뀐 내용 맨 위가 이 판", re.search(r"CHANGELOG: \[\s*\{ v: (\d+),", data).group(1) == str(n))
ok("화면 파일 네 개를 차례대로 부름", re.findall(r'<script src="js/(\w+)\.js', html) == ["data", "core", "drive", "app"])
ok("화면 파일 안에 끼워 넣은 스크립트가 없음", not re.search(r"<script(?![^>]*\bsrc=)", html) and not re.search(r"\son\w+=", html))

# 넣으면 안 되는 것
texts = {p: read(p) for p in ["index.html", "js/data.js", "js/core.js", "js/drive.js", "js/app.js"]}
ok("비밀 값처럼 보이는 것이 없음", not any(re.search(r"client_secret|AIza[0-9A-Za-z_-]{20,}|-----BEGIN|password\s*[:=]", t, re.I) for t in texts.values()))
ok("지우거나 옮기는 요청이 코드에 없음", not any(re.search(r'method:\s*"DELETE"|trashed["\']?\s*:\s*true|/trash\b|removeParents|addParents', t) for t in texts.values()))
ok("이메일 주소가 코드에 없음", not any(re.search(r"[\w.+-]+@(gmail|naver|daum|kakao)\.", t) for t in texts.values()))
ok("드라이브 권한은 읽기 전용과 앱이 만든 파일 두 가지뿐", re.search(r'scope: "([^"]+)"', data).group(1).split() == ["openid", "email", "https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"])
info = json.loads(read("data/orig/info.json"))
ok("원어 자료가 1,189장", info["counts"]["chapters"] == 1189 and len(os.listdir(os.path.join(ROOT, "data/orig/c"))) == 1189)
ok("원어 자료의 받은 날이 data.js 와 같음", re.search(r'ver: "([\d-]+)"', data).group(1) == info["made"], info["made"])
sample = json.loads(read("data/orig/lex/H0.json"))
ok("히브리어 사전에 허락이 필요한 풀이 칸을 넣지 않음", sample["m"] == [] and all(e[5] == -1 for e in sample["w"].values()))
for name in ("SPEC.md", "SOURCES.md", "SETUP.md", "RELEASE.md", "README.md"):
    ok(name + " 있음", os.path.exists(os.path.join(ROOT, name)))
r = subprocess.run(["node", "tests/unit.test.js"], cwd=ROOT, capture_output=True, text=True)
ok("단위 점검", r.returncode == 0, r.stdout.strip()[-200:])
print("올리기 전 점검: 안 됨 %d" % len(bad))
sys.exit(1 if bad else 0)
