# 세컨브레인

설교 준비를 한곳에서 하는 개인용 웹앱. 구글 드라이브의 자료실을 읽고, 준비한 글과 기록을 드라이브에 남긴다. 읽기와 쓰기는 모두 앱 안에서 한다.

- 설계 기준: [SPEC.md](SPEC.md). 기능을 바꾸면 이 문서도 함께 고친다.
- 원어 자료의 출처와 사용 조건: [SOURCES.md](SOURCES.md)
- 처음 올릴 때 할 일: [SETUP.md](SETUP.md)
- 새 판을 낼 때: [RELEASE.md](RELEASE.md)

## 파일

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 틀과 모양 |
| `js/data.js` | 책 목록, 준비 단계, 폴더 번호, 연결 값, 바뀐 내용 |
| `js/core.js` | 계산: 제목, 장 문서 읽기, 준비 문서 읽고 고치기, 자료 글 바꾸기, 활동 기록 |
| `js/drive.js` | 구글 로그인과 드라이브·문서 요청 |
| `js/app.js` | 화면과 단추 |
| `data/orig/` | 원어 자료(공개 자료를 장별로 나눈 것) |
| `tools/build_orig.py` | 원어 자료 만들기 |
| `tests/` | 자동 점검(가짜 구글 서버) |

## 자동 점검

```
node tests/unit.test.js
python3 tests/test_app.py . /tmp/shots
python3 tests/check_release.py .
```

## 지킬 것

- 키와 비밀번호는 저장소에 올리지 않는다. 이 앱에는 둘 다 없다.
- 공개 저장소이므로 가족·성도 실명, 자료실의 글, 성경 번역본 본문을 넣지 않는다.
- 기록은 지우거나 덮어쓰지 않고 합친다.
