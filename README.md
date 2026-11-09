# 한국심사자격인증원(KAR) 임시 홈페이지

보안 강화 작업(관리자 서버·홈페이지 분리, 약 2~3개월) 기간에 운영하는 **정적 임시 홈페이지**입니다.
서버 프로그램(PHP)·DB·로그인이 전혀 없는 HTML/CSS/JS 파일로만 구성되어 있으며, GitHub Pages(무료)로 배포합니다.

- GitHub 가입·업로드·Pages·도메인 연결·게시글 올리기 → [`docs/1_GitHub_가입_업로드_Pages_가이드.md`](docs/1_GitHub_가입_업로드_Pages_가이드.md)
- 온라인 신청(FormSubmit) 활성화·접수 주소 설정 → [`docs/2_FormSubmit_온라인신청_설정_가이드.md`](docs/2_FormSubmit_온라인신청_설정_가이드.md)
- 온라인 신청 폼 항목·문구 고치기 → [`docs/3_온라인신청_폼_소스_설명.md`](docs/3_온라인신청_폼_소스_설명.md)
- ★ 자격인증 신청(Apps Script + 구글 드라이브 + FormSubmit) 설정 → [`docs/4_AppsScript_구글드라이브_자격인증신청_연동_가이드.md`](docs/4_AppsScript_구글드라이브_자격인증신청_연동_가이드.md)
- 자격인증 신청 소스 설명 → [`docs/5_자격인증신청_소스_설명.md`](docs/5_자격인증신청_소스_설명.md) · Apps Script 원본 [`docs/apps-script/Code.gs`](docs/apps-script/Code.gs)

---

## 1. 폴더 구조

```
KAR-Temp-Homepage/
├─ index.html              화면 뼈대 + KAR 소개 · 비용 규정 내용(직접 수정)
├─ data.js                 ★ 운영 데이터 — 평소에는 이 파일만 고칩니다
├─ data/content-index.js   자격인증기준 이전 공고 이력(목록)
├─ data/notice-archive.js  공지사항 · 교육훈련 최근 3년 게시글(제목·날짜·첨부 목록)
├─ data/notice-bodies.js   게시글 본문 모음 (PC에서 직접 열어도 보이도록 한 파일로 묶음)
├─ 404.html                옛 주소(/kar_renewal/...)로 들어오면 임시 홈페이지로 안내
├─ assets/                 디자인(css) · 동작(js) · 로고(img) — 수정 불필요
│   ├─ css/cert-apply.css  자격인증 신청 디자인
│   └─ js/cert-apply.js    자격인증 신청 동작(Apps Script → 구글 드라이브 → FormSubmit 전송)
├─ docs/                   운영 가이드 ①~⑤ · apps-script/Code.gs(구글 드라이브 저장용 Apps Script)
├─ content/                게시물 본문 HTML
│   └─ img/                본문에 들어간 이미지
└─ files/                  내려받는 파일
    ├─ forms/qual/         자격인증 신청 서식
    ├─ forms/exam/         자격시험 서식
    ├─ forms/edu/          교육 · 연수 서식
    ├─ forms/etc/          사업자등록증 · 통장사본
    └─ notices/글번호/      공지 첨부파일
```

## 2. 자주 하는 작업

모든 작업은 GitHub 웹사이트에서 할 수 있습니다. 파일을 연 뒤 연필(✏️ Edit) 아이콘을 눌러 고치고, **Commit changes**를 누르면 1~2분 뒤 홈페이지에 반영됩니다.

### 2-1. 점검 시작일 넣기
`data.js` → `KAR.settings` 의 `maintenanceStart: ""` 따옴표 안에 날짜를 적습니다.
```js
maintenanceStart: "2026. 11. 10.(화)",
```

### 2-2. 서식 추가·교체
1. GitHub에서 `files/forms/분류폴더`로 이동 → **Add file → Upload files** 로 파일을 올립니다.
   - 파일명에 `#`, `%`, `?` 는 쓰지 마세요. 띄어쓰기 대신 `_` 를 권장합니다.
2. `data.js` → `KAR.formCategories` 의 해당 그룹 `items` 에 한 줄을 추가합니다.
```js
{ title: "서식 이름 (KAR-C-000-0)", files: ["files/forms/qual/올린_파일명.hwp"], isNew: true },
```
   - HWP·DOCX가 모두 있으면 `files: ["…hwp", "…docx"]` 처럼 나란히 적습니다.
   - 서식을 바꿀 때는 같은 이름으로 다시 올리면(덮어쓰기) `data.js` 를 고칠 필요가 없습니다.

### 2-3. 교육 과정 추가
`data.js` → `KAR.courses` 맨 아래에 기존 블록 하나를 복사해 붙이고 내용을 고칩니다.
- `deadline`(신청 마감일)이 지나면 자동으로 **접수 마감**이 표시됩니다.
- `endDate`(교육 마지막 날)가 지나면 카드가 자동으로 사라집니다. 지난 과정을 지울 필요가 없습니다.
- `**220,000원**` 처럼 별표 두 개로 감싸면 빨간 굵은 글씨가 됩니다.

### 2-4. 공지사항 올리기
1. 본문을 넣습니다. 둘 중 편한 방법을 쓰세요.
   - **(권장)** `data/notice-bodies.js` 맨 아래 `};` 바로 위에 한 덩어리를 추가합니다. PC에서 index.html 을 직접 열어도 보입니다.
     ```
     "content/notices/20261115.html": `
     <p>본문 문단</p>
     <h3>소제목</h3>
     `,
     ```
   - 또는 `content/notices/20261115.html` 파일을 새로 만들어 올립니다. (GitHub Pages 주소에서만 보이고, PC에서 직접 열면 보이지 않습니다)
   - 본문은 `<p>문단</p>`, `<h3>소제목</h3>`, `<ul><li>목록</li></ul>` 정도면 충분합니다.
2. 첨부파일은 `files/notices/20261115/` 폴더에 올립니다.
3. `data.js` → `KAR.notices` **맨 위**에 블록을 추가합니다.
```js
{
  date: "2026-11-15", category: "공지",
  title: "공지 제목",
  content: "content/notices/20261115.html",
  files: [
    { name: "첨부파일 표시 이름.pdf", path: "files/notices/20261115/첨부파일.pdf" },
  ]
},
```
   - `category` 는 `"공지"` 또는 `"교육"`, 상단 고정은 `pinned: true`
   - 첨부파일은 **게시일이 접속일 기준 최근 3개월 이내인 글에만** 표시됩니다(그보다 오래된 글은 자동으로 숨김). `path` 가 없는 항목은 표시되지 않습니다.

### 2-5. 온라인 신청(접수 메일 · 항목 · 안내 문구) 바꾸기
`data.js` → `KAR.onlineForms` 에서 신청별로 고칩니다. 자세한 방법은 ②·③ 가이드를 참고하세요.
- `endpoint` : 접수 메일 주소(`https://formsubmit.co/ajax/주소`) — 처음 한 번 FormSubmit 활성화 필요
- `cc` : 참조 주소 · `subject` : 메일 제목 · `attach` : 첨부 영역 사용 여부
- `fields` : 입력 항목 · `privacy` : 폼 아래 ※ 안내 2번째 줄 · `alert` : 폼 위 빨간 강조 문구
- 탭 순서 = 맨 앞 '자격인증 신청'(index.html 고정) 다음 `KAR.onlineForms` 에 적힌 순서 (현재 자격인증 신청 › 교육 › 자격시험 › 자격인증서 발급 › 영수증 신청·출력)
- '교육 신청' 탭의 신청 폼 위에는 교육 과정 안내(과정 카드 + HWP 신청 방법)가 함께 표시됩니다. 과정 내용은 `KAR.courses`, HWP 안내 문구는 index.html 의 `edu-guide` 에서 고칩니다.
- ※ 안내 1·3번째 줄 = `KAR.formFootnotes` · 첨부 한도 · 전송 방식 = `KAR.formSubmit`

### 2-5-1. 자격인증 신청 (증빙서류 업로드) 바꾸기
'온라인 신청' 섹션의 첫 번째 탭(index.html 의 `panel-qual`)입니다.
`data.js` → `KAR.certApply` 에서 고칩니다. (④·⑤ 가이드 참고)
- ★`appsScriptUrl` : Apps Script 웹 앱 URL · ★`routes` : 신청 유형별 접수 메일(등록·승급·범위추가 → kar0159, 갱신·전환 → kar0156)
- `maxTotalMB`(15) · `maxFiles`(0 = 제한 없음) · `accept` : 첨부 제한 — 바꾸면 Code.gs 의 MAX_TOTAL_MB · ALLOWED_EXT 도 함께 변경
- `types` · `grades` · `schemes` : 선택 항목 · `footnotes` : 폼 아래 ※ 안내

### 2-6. 자격인증기준 올리기 (GitHub 저장소 연동)
[현행본] 자격인증기준은 별도 저장소 **kar0156-debug/KAR-Qualification-Criteria** 에서 관리합니다.
1. 그 저장소에 기준 HTML 파일을 올립니다. 파일 이름 규칙 : `[현행본] 기준명_시행일 2026.06.05.html`
   - `[현행본]` → '현행본' 배지, 맨 뒤 날짜 → 시행일로 자동 표시, 최신 시행일 순 정렬
2. 끝입니다. 홈페이지가 열릴 때 저장소 목록을 자동으로 읽어 옵니다(`data.js` → `KAR.criteria.autoSync: true`).
   - 개정으로 대체된 기준은 저장소에서 지우거나, `KAR.criteria.hide` 에 파일 이름을 적어 숨깁니다.
   - GitHub 접속이 일시적으로 안 될 때를 대비해 `KAR.criteria.files` 목록도 가끔 맞춰 두면 좋습니다.
- '기준 보기'는 원문 HTML을 **스크립트 실행이 차단된 창**에 띄우므로 기준 파일에 스크립트를 넣지 마세요(동작하지 않습니다).
- 저장소는 Public 이어야 합니다. GitHub Pages 설정은 필요 없습니다.

### 2-6-1. 비용 규정 수정
`index.html` 에서 `[비용 규정]` 주석을 찾아 그 아래 표의 금액·비고를 고칩니다.
- 대분류 탭(① ISO / ② 국제통용발자국)은 `fee-tabs`, 세부 탭(자격인증 / 필기시험)은 각 대분류 안의 `kf-sub` 입니다.
- 표 한 줄 형식 : `<tr><td data-label="항목">심사원</td><td data-label="금액" class="num">120,000</td><td data-label="비고"></td></tr>`
  (`data-label` 은 휴대폰 화면에서 카드형으로 바뀔 때 쓰이므로 지우지 마세요)

### 2-7. KAR 소개 수정
`index.html` 에서 `[KAR 소개] 연혁` 처럼 탭 이름이 적힌 주석을 찾아 그 아래 내용을 고칩니다. (탭 버튼은 `about-tabs`)
'찾아오시는 길' 탭은 `KAR.contact` 연락처로 자동 구성되며, 약도 이미지는 `content/img/about_img_map.png` 입니다.
사진·서명·로고·조직도를 바꾸려면 KAR-Picture-BASIC 저장소에 **같은 파일 이름으로 덮어 올리면** 홈페이지에 그대로 반영됩니다.

### 2-8. 자격인증 공고 일정 추가 (2027년)
`data.js` → `KAR.announcements.dates` 에 `["제542차", "2027-01-05"],` 형식으로 이어서 적습니다. 지난 공고는 흐리게, 다음 공고는 강조 표시됩니다.

## 3. 업로드 전 보안 점검 (필수)
이 저장소는 **Public(공개)** 입니다. 올리는 파일은 누구나 볼 수 있습니다.
- [ ] 개인정보(성명+연락처, 주민번호, 계좌 실명 명단 등)가 들어간 파일이 아닌가?
- [ ] 내부 결재 문서, 심의 자료, 수료자 명단 등 내부 자료가 아닌가?
- [ ] HWP 서식에 이전 작성자의 입력값이 남아 있지 않은가? (빈 양식인지 확인)
- [ ] 파일 '속성 → 문서 정보'에 작성자 개인 정보가 남아 있지 않은가?

> 현재 올라간 파일은 기존 홈페이지에 이미 공개되어 있던 서식·공지 첨부파일입니다. 그래도 한 번씩 열어 확인해 주세요.
> 특히 `files/forms/etc/` 의 사업자등록증·통장사본, 「제31회 심사원 컨퍼런스 정부포상 결과」·「현장 사진」 공지(실명·사진 포함)는 계속 공개해도 되는지 확인이 필요합니다.

## 4. 문제 해결
| 증상 | 원인 · 조치 |
|---|---|
| 수정 후 화면 일부가 비어 있음 | `data.js` 의 따옴표(`"`)·쉼표(`,`)·괄호 누락이 대부분입니다. GitHub의 **History**에서 직전 버전과 비교해 고치거나 되돌립니다. |
| 서식 다운로드 시 404 | `data.js` 에 적은 경로와 실제 파일명이 한 글자라도 다르면 생깁니다(대소문자·띄어쓰기 포함). |
| 수정이 반영되지 않음 | 1~2분 기다린 뒤 `Ctrl + F5` 로 새로 고칩니다. 저장소의 **Actions** 탭에서 배포 진행 상황을 볼 수 있습니다. |
| 온라인 신청 메일이 안 옴 | FormSubmit 활성화 여부 · 스팸함 · 메일나라 수신 허용(`formsubmit.co`)을 확인합니다(② 가이드 6항). |

## 5. 보안 설계 요약
- 서버 측 코드·DB·로그인·회원가입 없음 (GitHub Pages는 정적 파일만 제공)
- 온라인 신청은 FormSubmit 을 거쳐 담당자 메일로만 전달되며 홈페이지에는 저장되지 않음 (FormSubmit 서버 30일 보관, 첨부파일 미보관)
- 자격인증 신청 증빙서류는 기관 구글 드라이브(비공개, 담당자 계정만 열람)에 저장 — Apps Script 웹 앱은 파일 올리기만 가능, 30일 후 자동 휴지통
- Content-Security-Policy 적용: 외부 스크립트 차단, 데이터 전송은 formsubmit.co · script.google.com(googleusercontent.com) 으로만 허용, 외부 화면 삽입 차단
- HTTPS 강제(Enforce HTTPS) 적용 권장

## 6. 용량 참고
- 현재 사이트 전체 약 10MB (서식 39개, 공지 첨부 27개)
- GitHub Pages 권장 한도: **사이트 1GB**, 파일 1개 100MB 미만
- 서식이 1GB에 가까워지면 서식만 별도 저장소로 옮기고 `data.js` 의 `fileBase` 에 그 저장소 raw 주소를 적으면 됩니다.
