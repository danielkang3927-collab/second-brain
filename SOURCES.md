# 원어 자료의 출처와 사용 조건

앱의 원어 화면이 쓰는 자료(`data/orig`)는 아래 공개 자료를 앱이 읽기 좋게 장별 묶음으로 모양만 바꾼 것이다. 내용은 고치지 않았다. 다시 만들려면 `tools/build_orig.py` 를 쓴다.

## 1. STEP Bible 자료

- 만든 곳: Tyndale House Cambridge, STEPBible.org
- 사용 조건: CC BY 4.0
- 출처 주소

https://stepbible.github.io/STEPBible-Data/

- 받은 판: 5de0a47f35f0fc13dfe1430d104e5db8a4285f9c (2026-11-02), 받은 날 2026-11-23
- 쓴 것
  - TAGNT (Translators Amalgamated Greek NT): 헬라어 신약의 낱말, 음역, 영어 풀이, 사전 번호, 문법 약호
  - TAHOT (Translators Amalgamated Hebrew OT): 히브리어 구약의 낱말, 음역, 영어 풀이, 사전 번호, 문법 약호
  - TBESG (Brief lexicon of Extended Strongs for Greek): 헬라어 표제어, 짧은 뜻, 풀이(Abbott-Smith 바탕)
  - TBESH (Brief lexicon of Extended Strongs for Hebrew): 히브리어 표제어, 음역, 품사, 짧은 뜻
  - TEGMC, TEHMC: 문법 약호 풀이
- 바꾼 점
  - 장별, 번호 묶음별 JSON 으로 나누었다. 앱에 필요한 칸만 담았다(이문, 스페인어 풀이 등은 담지 않음).
  - 헬라어는 NA 본문에 있는 낱말을 본문으로, 그 밖의 낱말(자료의 종류 표시가 N 으로 시작하지 않는 것)은 따로 표시했다. 히브리어는 L, Q, R 로 시작하는 낱말을 본문으로 했다.
  - TBESG 풀이의 꾸밈 표시(`<b>`, `<BR />`, `<ref>`)를 글자 표시로 바꾸었다.
  - TBESH 의 풀이 칸은 넣지 않았다. 자료에 「Abridged BDB by Online Bible 바탕이며, 쓰려면 Online Bible 의 허락을 받아야 한다」고 적혀 있기 때문이다.
  - 문법 약호에 우리말 이름을 붙였다. 자료의 영어 풀이를 용어표대로 한 낱말씩 옮긴 것이고, 영어 풀이를 함께 보여 준다.
- 자료에 고칠 곳이 보이면 STEPBible@gmail.com 으로 알리는 것이 자료 쪽의 부탁이다.

## 2. OpenScriptures Hebrew Lexicon

- 사용 조건: CC BY 4.0. Strong 히브리어 사전과 Brown-Driver-Briggs 의 본문은 저작권이 끝난 자료다.
- 출처 주소

https://github.com/openscriptures/HebrewLexicon

- 받은 판: 21c9add13bc727d3a951361778e97e3ff7afd1ce (2019-09-02), 받은 날 2026-11-23
- 쓴 것: `HebrewStrong.xml`(Strong 풀이), `BrownDriverBriggs.xml`(BDB 요약과 쪽수), `LexicalIndex.xml`(번호 이음)
- 바꾼 점: Strong 번호별로 묶어 글로 바꾸었다. 같은 번호에 BDB 표제어가 여럿이면 모두 싣는다.

## 3. 넣지 않은 것

- 성경 번역본 본문(개역개정, 우리말성경 등)은 이 저장소에 없다. 앱은 로그인한 사람의 드라이브에서 읽는다.
- Full LSJ, 칠십인역, 주석류는 넣지 않았다.
