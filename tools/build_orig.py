"""원어 자료 만들기: 공개 자료를 앱이 읽는 장별 묶음으로 모양만 바꾼다. 내용은 고치지 않는다.

쓰는 법: python3 tools/build_orig.py <STEPBible-Data 폴더> <openscriptures/HebrewLexicon 폴더> <나올 폴더(data/orig)>

자료와 사용 조건 (자세한 것은 SOURCES.md)
- STEPBible-Data (Tyndale House Cambridge, STEPBible.org) CC BY 4.0
    TAGNT(헬라어 신약), TAHOT(히브리어 구약): 낱말, 음역, 영어 풀이, 사전 번호, 문법 약호
    TBESG: 헬라어 표제어, 짧은 뜻, 풀이(Abbott-Smith 바탕)
    TBESH: 히브리어 표제어와 짧은 뜻만 쓴다. 풀이 칸은 Online Bible의 허락이 필요하다고 적혀 있어 넣지 않는다.
    TEGMC, TEHMC: 문법 약호 풀이
- openscriptures/HebrewLexicon CC BY 4.0 (Strong 히브리어 사전과 BDB의 본문은 저작권이 끝난 자료)
    HebrewStrong.xml: Strong 사전 풀이, BrownDriverBriggs.xml: BDB 요약, LexicalIndex.xml: 번호 이음
"""
import sys, os, re, json, glob, collections, html, datetime, subprocess
import xml.etree.ElementTree as ET

STEP, OSHL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
BOOKS = "Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev".split()
BNO = {b: i + 1 for i, b in enumerate(BOOKS)}
WORD = re.compile(r"^([1-3A-Za-z]{3})\.(\d+)\.(\d+)([^#\t]*)#(\d+)=([^\t]*)$")
CHUNK = 250
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))


def one(pattern):
    hits = sorted(glob.glob(os.path.join(STEP, pattern)))
    if not hits:
        raise SystemExit("자료를 찾지 못했다: " + pattern)
    return hits


def write(rel, obj):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(dump(obj))
    return os.path.getsize(path)


def chunk_of(strong):
    return strong[0] + str(int(strong[1:5]) // CHUNK)


# ---------- 본문 ----------
chapters = collections.OrderedDict()          # (책, 장) -> {절: [낱말]}
index = collections.defaultdict(lambda: [0, collections.Counter(), []])   # 사전 번호 -> [횟수, 책별 횟수, 절 목록]
used_morph = {"G": set(), "H": set()}
counts = collections.Counter()


def add_index(strong, b, c, v):
    e = index[strong]
    e[0] += 1
    e[1][b] += 1
    ref = "%d.%d.%d" % (b, c, v)
    if not e[2] or e[2][-1] != ref:
        e[2].append(ref)


for path in one("Translators Amalgamated OT+NT/TAGNT*"):
    for line in open(path, encoding="utf-8"):
        r = line.rstrip("\n").split("\t")
        m = WORD.match(r[0])
        if not m or len(r) < 5:
            continue
        b, c, v, typ = BNO[m.group(1)], int(m.group(2)), int(m.group(3)), m.group(6)
        gm = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", r[1])
        surface, translit = (gm.group(1), gm.group(2)) if gm else (r[1].strip(), "")
        pairs = [p.split("=", 1) for p in r[3].split(" + ") if "=" in p]
        strongs, morphs = [p[0].strip() for p in pairs], [p[1].strip() for p in pairs]
        in_na = typ[:1] in ("N", "n")
        w = [surface, translit, r[2].strip(), "+".join(strongs), "+".join(morphs)]
        if not in_na:
            w.append(1)                      # NA 본문에 없는 낱말(TR, 비잔틴 등에만 있음)
        chapters.setdefault((b, c), collections.OrderedDict()).setdefault(v, []).append(w)
        counts["nt_words"] += 1
        used_morph["G"].update(morphs)
        if in_na:
            for s in strongs:
                add_index(s, b, c, v)

for path in one("Translators Amalgamated OT+NT/TAHOT*"):
    for line in open(path, encoding="utf-8"):
        r = line.rstrip("\n").split("\t")
        m = WORD.match(r[0])
        if not m or len(r) < 6:
            continue
        b, c, v, typ = BNO[m.group(1)], int(m.group(2)), int(m.group(3)), m.group(6)
        main = typ[:1] in ("L", "Q", "R")
        w = [r[1].strip(), r[2].strip(), r[3].strip(), r[4].strip(), r[5].strip()]
        if not main:
            w.append(1)                      # 레닌그라드 사본에 없는 낱말(칠십인역 바탕 등)
        chapters.setdefault((b, c), collections.OrderedDict()).setdefault(v, []).append(w)
        counts["ot_words"] += 1
        parts = r[5].strip().split("/")
        lang = parts[0][:1]
        for i, pz in enumerate(parts):
            code = pz if i == 0 else lang + pz
            if len(code) > 1:
                used_morph["H"].add(code)
        if main:
            for s in re.findall(r"\{(H\d{4}[A-Za-z]?)\}", r[4]):
                add_index(s, b, c, v)

sizes = collections.Counter()
for (b, c), verses in chapters.items():
    sizes["c"] += write("c/%02d_%03d.json" % (b, c), {"b": b, "c": c, "v": {str(v): ws for v, ws in verses.items()}})
counts["chapters"] = len(chapters)

# ---------- 문법 약호: 자료의 풀이를 우리말 용어로 한 낱말씩 옮긴다. 표에 없는 말은 영어 그대로 둔다 ----------
KO = {
    "Noun": "명사", "Verb": "동사", "Preposition": "전치사", "Conjunction": "접속사", "Particle": "불변화사", "Suffix": "접미어", "Adjective": "형용사",
    "Definite article": "정관사", "Personal pronoun": "인칭대명사", "Adverb": "부사", "Pronoun": "대명사", "Negative Particle": "부정 불변화사",
    "Demonstrative pronoun": "지시대명사", "Relative pronoun": "관계대명사", "Interrogative pronoun": "의문대명사", "Indefinite pronoun": "부정대명사",
    "Interjection": "감탄사", "Reflexive pronoun": "재귀대명사", "Possessive pronoun": "소유대명사", "Correlative pronoun": "상관대명사",
    "Interrogative Particle": "의문 불변화사", "Reciprocal pronoun": "상호대명사",
    "Common": "보통", "Personal": "인칭", "Proper": "고유", "Definite article (Hebrew)": "정관사(히브리어)", "Definite article (Aramaic)": "정관사(아람어)",
    "Consecutive": "와우 연속", "Participle": "분사", "Participle passive": "수동 분사", "Imperfect": "미완료", "Consecutive Imperfect": "와우 연속 미완료",
    "Perfect": "완료", "Consecutive Perfect": "와우 연속 완료", "Definite": "한정", "Object indicator": "목적격 표지", "Infinitive": "부정사", "Numerical": "수사",
    "Negative": "부정", "Conditional": "조건", "Relative": "관계", "Imperative": "명령", "Demonstrative": "지시", "Interrogative": "의문", "Directional": "방향",
    "Conjunction+Imperfect": "접속사+미완료", "Numerical position": "서수", "Title": "칭호",
    "Absolute": "절대형", "Construct": "연계형",
    "Third": "3인칭", "Second": "2인칭", "First": "1인칭", "3rd": "3인칭", "2nd": "2인칭", "1st": "1인칭", "1st Person": "1인칭", "2nd Person": "2인칭", "2nd Singular": "2인칭 단수",
    "Singular": "단수", "Plural": "복수", "Dual": "쌍수", "Masculine": "남성", "Feminine": "여성", "Neuter": "중성", "Either gender": "남녀 공통",
    "Qal": "칼", "Niphal": "니팔", "Piel": "피엘", "Pual": "푸알", "Hiphil": "히필", "Hophal": "호팔", "Hithpael": "히트파엘",
    "Nominative": "주격", "Accusative": "대격", "Genitive": "속격", "Dative": "여격", "Vocative": "호격",
    "Active": "능동태", "Passive": "수동태", "Middle": "중간태", "Middle or Passive": "중간태 또는 수동태", "Middle Deponent": "중간태 디포넌트",
    "Passive Deponent": "수동태 디포넌트", "Middle or Passive Deponent": "중간태 또는 수동태 디포넌트",
    "Indicative": "직설법", "Subjunctive": "가정법", "Optative": "희구법",
    "Present": "현재", "Aorist": "부정과거", "2nd Aorist": "제2부정과거", "Future": "미래", "2nd Future": "제2미래", "2nd Perfect": "제2완료",
    "Pluperfect": "과거완료", "2nd Pluperfect": "제2과거완료", "Comparative": "비교급", "Superlative": "최상급",
    "Individual": "인명", "Location": "지명",
    "Gentilic": "족속 이름", "Location Gentilic": "지명에서 온 족속 이름", "Person Gentilic": "사람 이름에서 온 족속 이름", "Individual Gentilic": "개인 이름에서 온 족속 이름",
    "Correlative or Interrogative pronoun": "상관 또는 의문대명사", "Particle or Disjunctive": "불변화사 또는 이접사", "Adverb or adverb and particle combined": "부사(또는 부사와 불변화사의 결합)",
    "Contracted form": "축약형", "Indeclinable Numeral": "불변화 수사", "Indeclinable Letter": "불변화 글자", "Attic Greek form": "아티카식 형태", "Paragogic Hé": "덧붙은 헤", "Paragogic Nun": "덧붙은 눈",
    # 아람어와 드문 어간은 우리말 표기 옆에 원래 이름을 함께 둔다
    "Peal": "페알(Peal)", "Pael": "파엘(Pael)", "Haphel": "하펠(Haphel)", "Aphel": "아펠(Aphel)", "Shaphel": "샤펠(Shaphel)", "Peil": "페일(Peil)", "Hitpeel": "히트페엘(Hitpeel)",
    "Hitpaal": "히트파알(Hitpaal)", "Hitpael": "히트파엘(Hitpael)", "Hishtaphel": "히쉬타펠(Hishtaphel)", "Hothpaal": "호트파알(Hothpaal)", "Nithpael": "니트파엘(Nithpael)",
    "Tiphil": "티필(Tiphil)", "Ishtaphel": "이쉬타펠(Ishtaphel)",
}
# 같은 영어가 자리에 따라 뜻이 다른 것은 자리 이름과 함께 본다
KO_AT = {("Mood", "Imperative"): "명령법", ("Tense", "Imperfect"): "미완료", ("Tense", "Perfect"): "완료", ("Form", "Imperative"): "명령", ("Extra", "Negative"): "부정", ("Extra", "Interrogative"): "의문",
         ("Name type", "Title"): "칭호", ("Gender", "Location"): "지명", ("Gender", "Title"): "칭호", ("State", "Definite"): "한정형"}
SKIP_KEYS = {"Original language"}


def morph_table(pattern):
    table = {}
    lines = open(one(pattern)[0], encoding="utf-8").read().split("\n")
    for i, line in enumerate(lines):
        if "\tFunction=" in line:
            code, exp = line.split("\t")[:2]
            plain = lines[i + 1].strip().strip('"').strip() if i + 1 < len(lines) and lines[i + 1].startswith("\t") else ""
            table[code] = (exp, plain)
    return table


def ko_of(exp):
    out, unknown = [], False
    for kv in re.sub(r"\(hence[^)]*\)", "", exp).split(";"):
        if "=" not in kv:
            continue
        k, v = [x.strip() for x in kv.split("=", 1)]
        if not v or k in SKIP_KEYS:
            continue
        t = KO_AT.get((k, v)) or KO.get(v)
        if not t:
            unknown = True
            t = v
        out.append(t)
    return " ".join(out), unknown


morph = {"G": {}, "H": {}}
unknown_terms = collections.Counter()
for key, pattern in (("G", "Morphology codes/TEGMC*"), ("H", "Morphology codes/TEHMC*")):
    table = morph_table(pattern)
    for code in sorted(used_morph[key]):
        if code in table:
            ko, unk = ko_of(table[code][0])
            morph[key][code] = [ko, table[code][1] or re.sub(r"\s*\(hence[^)]*\)", "", table[code][0])]
            if unk:
                unknown_terms[code] += 1
        else:
            counts["morph_missing_" + key] += 1
sizes["morph"] = write("morph.json", morph)

# ---------- 사전 ----------
def clean(t):
    t = re.sub(r"<\s*br\s*/?\s*>", "\n", t, flags=re.I)
    t = re.sub(r"<\s*/?\s*b\s*>", "**", t, flags=re.I)
    t = re.sub(r"<[^>]*>", "", t)
    t = html.unescape(t)
    t = re.sub(r"^_+", lambda m: "  " * (len(m.group(0)) // 2), t, flags=re.M)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" ?\n ?", "\n", t)
    t = re.sub(r"\*\*\s*\*\*", "", t)
    return t.strip()


def lex_rows(pattern):
    for line in open(one(pattern)[0], encoding="utf-8"):
        r = line.rstrip("\n").split("\t")
        if len(r) >= 7 and re.match(r"^[GH]\d{4}[A-Za-z]?$", r[0]):
            yield r


lex = collections.defaultdict(dict)        # 묶음 -> {번호: [표제어, 음역, 품사, 짧은 뜻, 이음, 풀이 번호]}
means = collections.defaultdict(list)      # 묶음 -> 풀이 글 (같은 글은 한 번만)
mean_at = collections.defaultdict(dict)
used = set(index.keys())
for path, with_meaning in (("Lexicons/TBESG*", True), ("Lexicons/TBESH*", False)):
    for r in lex_rows(path):
        d, _, rel = r[1].partition("=")
        d, rel = d.strip(), rel.strip()
        note = (rel + " " + r[2].strip().strip(",")).strip() if rel else ""
        for key in dict.fromkeys([d, r[0]]):
            ck = chunk_of(key)
            if key in lex[ck]:
                continue
            mi = -1
            if with_meaning and len(r) > 7 and r[7].strip():
                text = clean(r[7])
                if text not in mean_at[ck]:
                    mean_at[ck][text] = len(means[ck])
                    means[ck].append(text)
                mi = mean_at[ck][text]
            lex[ck][key] = [r[3].strip(), r[4].strip(), r[5].strip(), r[6].strip(), note, mi]

# Strong 히브리어 사전 (본문은 저작권이 끝남)
def strip_ns(root):
    for el in root.iter():
        if "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def flat(el):
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


strong_h = {}
for e in strip_ns(ET.parse(os.path.join(OSHL, "HebrewStrong.xml")).getroot()).iter("entry"):
    eid = e.get("id", "")
    if not re.match(r"^H\d+$", eid):
        continue
    parts = []
    for tag, label in (("source", ""), ("meaning", ""), ("usage", "KJV: ")):
        x = e.find(tag)
        if x is not None and flat(x):
            parts.append(label + flat(x))
    if parts:
        strong_h["H%04d" % int(eid[1:])] = " ".join(parts)

# BDB 요약 (본문은 저작권이 끝남)
def bdb_text(e):
    out = []

    def walk(el, depth):
        if el.tag == "status":
            return
        if el.tag == "sense":
            out.append("\n" + "  " * depth + (el.get("n", "") + ". " if el.get("n") else ""))
        if el.tag == "def":
            out.append("**")
        if el.text:
            out.append(el.text)
        for ch in el:
            walk(ch, depth + (1 if el.tag == "sense" else 0))
            if ch.tail:
                out.append(ch.tail)
        if el.tag == "def":
            out.append("**")

    walk(e, 0)
    t = "".join(out)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\s*\n\s*(?=\n)", "", t)
    t = "\n".join(x.rstrip() for x in t.split("\n") if x.strip())
    page = e.find("status")
    return t.strip(), (page.get("p") if page is not None else "")


bdb = {}
for e in strip_ns(ET.parse(os.path.join(OSHL, "BrownDriverBriggs.xml")).getroot()).iter("entry"):
    text, page = bdb_text(e)
    if text:
        bdb[e.get("id")] = (text + (" (BDB %s쪽)" % page if page else ""))
bdb_by_strong = collections.defaultdict(list)
for x in strip_ns(ET.parse(os.path.join(OSHL, "LexicalIndex.xml")).getroot()).iter("xref"):
    if re.match(r"^\d+$", x.get("strong") or "") and x.get("bdb") in bdb:
        key = "H%04d" % int(x.get("strong"))
        if bdb[x.get("bdb")] not in bdb_by_strong[key]:
            bdb_by_strong[key].append(bdb[x.get("bdb")])

for ck in sorted(lex):
    obj = {"w": lex[ck], "m": means[ck]}
    if ck[0] == "H":
        bases = sorted({k[:5] for k in lex[ck]})
        obj["s"] = {k: strong_h[k] for k in bases if k in strong_h}
        obj["b"] = {k: bdb_by_strong[k] for k in bases if k in bdb_by_strong}
    sizes["lex"] += write("lex/%s.json" % ck, obj)
counts["lex_entries"] = sum(len(v) for v in lex.values())
counts["strong_h"] = len(strong_h)
counts["bdb_entries"] = len(bdb)

# ---------- 쓰임 찾기 (낱말마다 몇 번, 어느 책, 어느 절) ----------
REFS_MAX = 400
idx = collections.defaultdict(dict)
for s, (n, by_book, refs) in index.items():
    refs = sorted(set(refs), key=lambda x: tuple(int(k) for k in x.split(".")))        # 성경 차례대로
    idx[chunk_of(s)][s] = [n, [[b, k] for b, k in sorted(by_book.items())], refs if len(refs) <= REFS_MAX else None]
for ck in sorted(idx):
    sizes["idx"] += write("idx/%s.json" % ck, idx[ck])
counts["index_words"] = len(index)
missing = [s for s in used if s not in lex[chunk_of(s)] and s[:5] not in lex[chunk_of(s)]]
counts["lex_missing"] = len(missing)


def rev(path):
    try:
        return subprocess.check_output(["git", "-C", path, "log", "-1", "--format=%H %cs"], text=True).strip()
    except Exception:
        return ""


info = {"made": datetime.date.today().isoformat(), "stepbible": rev(STEP), "hebrewlexicon": rev(OSHL), "counts": dict(counts), "bytes": dict(sizes),
        "morph_untranslated": sorted(unknown_terms)[:40], "lex_missing": sorted(missing)[:40], "chunk": CHUNK, "refs_max": REFS_MAX}
write("info.json", info)
print(json.dumps(info, ensure_ascii=False, indent=1))
