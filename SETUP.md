# 처음 올릴 때 할 일

목사님이 직접 해야 하는 설정을 순서대로 적는다. 비밀번호와 인증 코드는 목사님만 넣는다. 화면의 메뉴 이름은 구글이 바꿀 수 있어서, 다르게 보이면 화면을 찍어 Claude에게 물으면 된다.

## 가. 저장소와 주소 (GitHub)

1. Claude 와 GitHub 계정을 잇는다. 한 번만 하면 된다. 먼저 브라우저의 claude.ai 가 Claude 와 대화하는 앱과 같은 계정(같은 이메일)으로 로그인되어 있는지 본다. 계정이 다르면 연결이 그 대화에 닿지 않는다. 그다음 아래 주소에서 GitHub 를 찾아 「연결」을 누르고, GitHub 화면에서 승인한다.

https://claude.ai/customize/connectors

   또는 아래 주소를 열었을 때 GitHub 연결 안내가 뜨면 그대로 따라가도 된다.

https://claude.ai/code

2. GitHub 에서 새 저장소를 만든다. 이름 `second-brain`, 공개(Public), 「Add a README」에 체크한다. (빈 저장소가 아니라 README 가 있는 저장소여야 한다.)

https://github.com/new

   Claude GitHub 앱 설치는 비공개 저장소를 쓸 때 필요하다고 안내되어 있다. 공개 저장소에 올릴 때 막히면 아래에서 설치하고 `second-brain` 을 고른다.

https://github.com/apps/claude/installations/new

3. Claude 가 파일을 올린 뒤, 저장소의 Settings → Pages 에서 Source 를 「Deploy from a branch」, Branch 를 `main` 과 `/ (root)` 로 고르고 Save.
4. 몇 분 뒤 아래 주소에서 앱이 열린다.

https://danielkang3927-collab.github.io/second-brain/

## 나. 구글 로그인 연결 값 (Google Cloud)

자료실이 있는 구글 계정으로 한다. 컴퓨터에서 하는 편이 쉽다.

1. 아래 주소에서 새 프로젝트를 만든다. 이름은 「세컨브레인」.

https://console.cloud.google.com/projectcreate

2. 「API 및 서비스 → 라이브러리」에서 두 가지를 찾아 「사용」을 누른다: Google Drive API, Google Docs API.
3. 「Google 인증 플랫폼」(Google Auth Platform)을 열고 시작한다. 앱 이름 「세컨브레인」, 지원 이메일은 본인, 대상은 「외부」.
4. 「대상」(Audience)의 테스트 사용자에 본인 Gmail 주소를 더한다. 게시 상태는 「테스트」 그대로 둔다.
5. 「데이터 액세스」(Data Access)에서 범위 두 가지를 더한다.

https://www.googleapis.com/auth/drive.readonly

https://www.googleapis.com/auth/drive.file

6. 「클라이언트」(Clients)에서 클라이언트를 만든다. 유형은 「웹 애플리케이션」.
   - 승인된 자바스크립트 원본

https://danielkang3927-collab.github.io

   - 승인된 리디렉션 URI (끝의 빗금까지 글자 그대로)

https://danielkang3927-collab.github.io/second-brain/

7. 만들어진 「클라이언트 ID」(`…apps.googleusercontent.com` 으로 끝나는 값)를 복사해 Claude 에게 알려 주거나, 앱 첫 화면에 붙여 넣는다. 공개 값이라 알려도 된다. 「클라이언트 보안 비밀」은 쓰지 않으니 누구에게도 주지 않는다.

## 다. 처음 열어서 확인

1. 앱 주소를 열고 「구글로 로그인」을 누른다. 자료실이 있는 계정을 고른다.
2. 「Google에서 확인하지 않은 앱」 안내가 나오면 계속 진행한다(내가 만든 내 앱이라 나오는 안내다).
3. 허락 화면에서 드라이브 권한 칸 두 개를 모두 체크한다. 하나라도 빠지면 앱이 받지 않고 다시 묻는다.
4. 앱의 설정 → 「연결 점검」을 눌러 여섯 줄이 모두 「됨」인지 본다. 「안 됨」이 있으면 그 줄을 Claude 에게 알려 준다.
5. 아이폰은 사파리의 공유 → 「홈 화면에 추가」로 올린다.

## 알아 둘 것

- 게시 상태가 「테스트」이면 구글이 일주일쯤마다 허락을 다시 물을 수 있다. 번거로우면 그때 「앱 게시」로 바꾸는 것을 Claude 와 의논한다.
- 로그인은 한 시간마다 새로 받는다. 앱을 열 때 저절로 되고, 화면이 잠깐 구글에 다녀온다.
