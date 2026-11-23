# 새 판을 낼 때

1. 번호를 한꺼번에 올린다. 네 곳이 같아야 한다.
   - `index.html`: `<meta name="sb-build" content="N">` 과 모든 `?v=N`
   - `js/core.js`: `const BUILD = N;`
   - `version.json`: `{"build": N}`
   - `js/data.js`: `CHANGELOG` 맨 위에 `{ v: N, d: "날짜", t: ["바뀐 내용"] }`
2. 기능이 바뀌었으면 `SPEC.md` 의 해당 번호를 고친다.
3. 점검을 모두 돌린다.

```
node tests/unit.test.js
python3 tests/test_app.py . /tmp/shots
python3 tests/check_release.py .
```

4. 캡처(휴대폰, 아이패드, 어두운 화면)를 눈으로 본다.
5. 올린 뒤 실제 주소에서 버전 표시가 바뀌었는지 본다.
6. 보고할 때 확인한 것과 확인하지 못한 것을 나누어 적는다. 가짜 서버 점검만으로 「된다」고 하지 않는다.

원어 자료를 새로 받았으면 `js/data.js` 의 `ORIG.ver` 와 `SOURCES.md` 의 받은 판·받은 날을 함께 고친다.
