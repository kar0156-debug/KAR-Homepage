# ① GitHub 가입 · 파일 업로드 · GitHub Pages 가이드

> 임시 홈페이지는 **GitHub Pages(무료)**로 운영합니다. 서버·DB가 없는 정적 파일이라 해킹될 서버 프로그램이 없고, 카페24 도메인은 DNS만 바꾸면 되므로 **추가 호스팅 비용이 없습니다.**

전체 흐름
```
[1] GitHub 가입 → [2] 저장소(Public) 만들기 → [3] 파일 올리기 → [4] Pages 켜기(github.io 주소로 확인)
→ [5] 자격인증 신청(④ Apps Script 가이드) · 온라인 신청(② FormSubmit 가이드) 활성화 → [6] 카페24 DNS 연결 → [7] 평소 운영(게시글·서식 올리기)
```

---

## 1. GitHub 가입 (이미 `kar0156-debug` 계정이 있으면 건너뜀)
1. https://github.com 접속 → 오른쪽 위 **Sign up**
2. 이메일 입력 : 기관 메일(예: `kar0156@kar.re.kr`) 권장 — 담당자가 바뀌어도 인계가 쉽습니다.
3. 비밀번호 · 사용자 이름(Username, 예: `kar0156-debug`) 입력 → 사람 확인 퍼즐 → 이메일로 온 **인증 코드** 입력
4. 가입 후 **2단계 인증(2FA)**을 꼭 켭니다 : 오른쪽 위 프로필 사진 → **Settings → Password and authentication → Enable two-factor authentication** (휴대폰 인증 앱 또는 SMS)
   - 저장소에 홈페이지 전체가 들어 있으므로, 계정이 털리면 홈페이지가 바뀔 수 있습니다.

## 2. 저장소(Repository) 만들기
1. 오른쪽 위 **+ → New repository**
2. **Repository name** : `KAR-Temp-Homepage`
3. **Public** 선택 (무료 계정의 GitHub Pages는 Public 저장소에서만 동작)
   - Public = 누구나 파일을 볼 수 있음 → 아래 "업로드 전 보안 점검"을 반드시 지킵니다.
   - `data.js` 에 넣는 Apps Script 웹 앱 URL 과 접수 메일 주소도 공개됩니다. 웹 앱 URL 로는 파일 올리기만 가능하고 목록·내려받기·삭제는 할 수 없습니다(④ 가이드). **구글 계정 비밀번호는 절대 올리지 않습니다.**
   - 신청인이 올린 증빙서류는 GitHub가 아니라 기관 구글 드라이브(비공개)에 저장되므로 저장소에는 개인정보가 쌓이지 않습니다.
4. 나머지(README, .gitignore 등)는 체크하지 않고 **Create repository**

## 3. 파일 올리기 (웹 화면에서 직접)
1. 받은 `KAR-Temp-Homepage_v7.zip` 의 압축을 풉니다.
2. 저장소 첫 화면의 **uploading an existing file** 링크(또는 **Add file → Upload files**) 클릭
3. 압축을 푼 `KAR-Temp-Homepage` 폴더 **안의 내용 전체**를 마우스로 끌어다 놓습니다.
   - `index.html, data.js, 404.html, README.md, robots.txt, .nojekyll` 파일과 `assets, content, data, docs, files` 폴더
   - 폴더째 끌어다 놓으면 하위 폴더 구조가 그대로 올라갑니다.
   - `.nojekyll` 처럼 점(.)으로 시작하는 파일은 윈도우 탐색기에서 숨겨져 있을 수 있습니다. **[보기 → 숨긴 항목]**을 켜고 함께 올립니다.
   - 웹 화면은 **한 번에 100개**까지 올라갑니다. 현재 파일은 약 90개라 한 번에 됩니다. 넘으면 `files` 폴더를 따로 올리세요.
   - 자격인증 신청에 필요한 파일 : `index.html` · `data.js` · `assets/css/cert-apply.css` · `assets/js/cert-apply.js` (모두 위 전체 업로드에 포함)
4. 맨 아래 **Commit changes** 클릭 → 업로드 완료

> **이전 버전(v1~v6)을 이미 올렸다면?** 같은 방법으로 덮어 올리면 됩니다. 다만 새 버전에서 **없어진 파일·폴더는 저절로 지워지지 않습니다.** (v7 기준 지울 것 : `docs/2_구글폼_설정_가이드.md`, `docs/1_배포_및_도메인_연결_가이드.md`, `content/notices/` 폴더가 남아 있다면 삭제) — 파일을 열고 오른쪽 위 **⋯ → Delete file → Commit changes**

### 업로드 전 보안 점검 (매번)
- [ ] 개인정보(성명+연락처, 주민번호, 계좌 실명 명단 등)가 들어간 파일이 아닌가?
- [ ] 내부 결재·심의 자료, 내부 명단이 아닌가?
- [ ] HWP 서식에 이전 작성자의 입력값이 남아 있지 않은가? (빈 양식인지 확인)
- [ ] 비밀번호·인증키 같은 비밀 정보가 적혀 있지 않은가?

## 4. GitHub Pages 켜기 (무료 호스팅)
1. 저장소 위쪽 **Settings → (왼쪽 메뉴) Pages**
2. **Build and deployment → Source : Deploy from a branch**
3. **Branch : main / 폴더 : / (root) → Save**
4. 1~2분 뒤 같은 화면 위쪽에 주소가 표시됩니다 : `https://kar0156-debug.github.io/KAR-Temp-Homepage/`
   - 진행 상황은 저장소 위쪽 **Actions** 탭에서 볼 수 있습니다(초록 체크 = 완료).
5. 이 주소로 접속해 확인합니다.
   - [ ] 첫 화면·메뉴 / KAR 소개 탭 / 서식 다운로드(HWP·PDF 실제로 열기)
   - [ ] 자격인증기준 '기준 보기' / 공지사항 본문 / 비용 규정 탭
   - [ ] 자격인증 신청 화면 (실제 제출 시험은 ④ Apps Script 가이드 순서대로)
   - [ ] 온라인 신청 4개 탭 (실제 제출 시험은 ② FormSubmit 가이드 순서대로)
   - [ ] 휴대폰에서도 잘 보이는가

**도메인을 바꾸기 전에 이 주소로 충분히 확인하세요.** 문제가 있어도 기존 홈페이지에는 영향이 없습니다.

## 5. 자격인증 신청 · 온라인 신청 활성화
1. **④ Google Apps Script + 구글 드라이브 자격인증 신청 연동 가이드** 1~6단계 : 드라이브 폴더 · Apps Script 붙여 넣기 · 권한 승인 · 웹 앱 배포 → `data.js` 의 `KAR.certApply.appsScriptUrl` 입력 → kar0159 · kar0156 활성화
2. **② FormSubmit 온라인 신청 설정 가이드** : 온라인 신청 4개 접수 주소 활성화
(활성화 전에는 신청 메일이 오지 않습니다)

## 6. 카페24 도메인 연결

### 6-1. 시작 전 확인 (중요)
1. **현재 DNS 설정을 캡처해 보관**합니다. (되돌릴 때 필요)
2. `kar.re.kr` 의 **네임서버가 카페24인지** 확인합니다. 서버 호스팅 업체·IDC 네임서버라면 그 업체 화면에서 바꿔야 합니다.
3. **메일(MX) 레코드는 절대 건드리지 않습니다.** `@kar.re.kr`(메일나라) 메일이 끊길 수 있습니다.
4. 같은 도메인을 쓰는 다른 서비스(관리자 서버, 영문 사이트 `kar.re.kr:90` 등)가 있는지 개발 담당과 확인합니다.

### 6-2. 바꿀 레코드
| 호스트 | 유형 | 값 | 비고 |
|---|---|---|---|
| `www` | CNAME | `kar0156-debug.github.io.` | 기존 www 레코드는 삭제 후 등록 |
| `@` (루트) | A | `185.199.108.153` | 4개 모두 등록, 기존 루트 A 레코드 삭제 |
| `@` | A | `185.199.109.153` | |
| `@` | A | `185.199.110.153` | |
| `@` | A | `185.199.111.153` | |

- CNAME 값에는 저장소 이름을 붙이지 않습니다.
- 카페24 : **나의서비스관리 → 도메인 관리 → DNS 관리 → 대상 도메인 → 별칭(CNAME) 관리 / IP 연결(A) 관리** (메뉴 이름은 화면 개편에 따라 다를 수 있음. 루트 A 레코드 메뉴가 없으면 카페24 1:1 문의)
- 반영까지 보통 수십 분, 길게는 24~48시간

### 6-3. GitHub에 도메인 등록 · HTTPS
1. 저장소 **Settings → Pages → Custom domain** 에 `www.kar.re.kr` → **Save** (자동으로 생기는 `CNAME` 파일은 지우지 않음)
2. "DNS check successful" 확인 → 인증서 발급 후(최대 24시간) **Enforce HTTPS** 체크
3. (권장) 계정 **Settings → Pages → Add a domain** 에서 `kar.re.kr` 소유 인증(TXT 레코드)
4. **도메인을 바꾼 뒤 자격인증 신청 · 온라인 신청을 한 번 더 시험 제출**해 정상 접수되는지 확인합니다.

## 7. 평소 운영 — 웹 화면에서 고치기
모든 수정은 GitHub 웹에서 : 파일 열기 → 연필(✏️ **Edit this file**) → 수정 → **Commit changes** → 1~2분 뒤 반영 (`Ctrl + F5` 로 새로 고침)

### 7-1. 신규 게시글(공지사항·교육훈련) 올리기
1. **본문 넣기** : `data/notice-bodies.js` 열기 → 연필 → 맨 아래 `};` **바로 위**에 붙여 넣기
   ```
   "content/notices/20261115.html": `
   <p>한국심사자격인증원에서 ○○을 안내합니다.</p>
   <h3>1. 일시</h3>
   <p>2026. 11. 20.(금) 14:00</p>
   `,
   ```
   - 글번호(`20261115`)는 날짜처럼 겹치지 않는 아무 숫자
   - 본문 안에 백틱(`` ` ``) 문자는 쓰지 않습니다.
2. **첨부파일 올리기**(있을 때) : 저장소에서 **Add file → Upload files** → 파일을 끌어다 놓기 전에, 위쪽 경로 칸에 `files/notices/20261115/` 를 직접 입력하면 새 폴더가 만들어집니다.
3. **목록에 등록** : `data.js` → `KAR.notices = [` 바로 아래에 추가
   ```js
   {
     date: "2026-11-15", category: "공지",          // "공지" 또는 "교육"
     title: "게시글 제목",
     content: "content/notices/20261115.html",      // 1번의 이름과 같게
     files: [
       { name: "[붙임] 신청서.hwp", path: "files/notices/20261115/신청서.hwp" },
     ]
   },
   ```
   - 첨부파일은 게시일이 **최근 3개월 이내**인 글에만 표시됩니다(자동).
   - 맨 위 고정은 `pinned: true`
4. **Commit changes** → 1~2분 뒤 홈페이지 '공지사항·교육훈련'에서 확인

### 7-2. 서식 추가·교체
1. `files/forms/분류폴더`(qual·exam·edu·etc)로 이동 → **Add file → Upload files**
   - 교체는 **같은 파일 이름**으로 올리면 덮어써져 data.js 수정이 필요 없습니다.
2. 새 서식이면 `data.js` → `KAR.formCategories` 해당 그룹에 한 줄 추가
   ```js
   { title: "서식 이름 (KAR-C-000-0)", files: ["files/forms/qual/파일명.hwp"], isNew: true },
   ```

### 7-3. 실수했을 때 되돌리기
파일 화면 오른쪽 위 **History** → 이전 버전 선택 → 내용을 복사해 다시 붙여 넣고 Commit. 화면이 하얗게 나오면 대부분 data.js 의 따옴표(`"`)·쉼표(`,`) 누락입니다.

## 비용 · 한도
| 항목 | 내용 |
|---|---|
| GitHub Pages | 무료 (Public 저장소) · 사이트 권장 1GB 이하 · 월 전송 권장 100GB |
| 카페24 | 기존 도메인 유지비 외 추가 비용 없음 |
| 온라인 신청(FormSubmit) | 무료 · 첨부 합계 10MB/건 (② 가이드 참고) |
| 자격인증 신청(Apps Script + 구글 드라이브) | 무료 · 카드 등록 없음 · 첨부 합계 15MB/건 · 30일 자동 정리 (④ 가이드) |
