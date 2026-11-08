# ④ Firebase Storage + FormSubmit 자격인증 신청 연동 가이드

'자격인증 신청'은 로그인 없이 증빙서류를 받는 단방향 시스템입니다.

```
신청인 : 정보 입력 + 증빙서류 첨부(최대 3개, 파일당 30MB)
   │
   ├─①→ Google Firebase Storage : 파일 저장(로그인 없음) → 파일마다 고유 다운로드 URL 생성
   │
   └─②→ FormSubmit : 신청 내용 + 다운로드 URL → 담당자 메일
          · 신규 등록 · 승급 · 심사수행범위 추가 → kar0159@kar.re.kr
          · 갱신 · 전환                       → kar0156@kar.re.kr
```

| 항목 | 내용 |
|---|---|
| 비용 | Firebase는 **Blaze 요금제(카드 등록)** 가 필요하지만 무료 사용량 안에서는 0원. FormSubmit은 무료 |
| 무료 사용량 조건 | 버킷 위치가 **US-CENTRAL1 · US-EAST1 · US-WEST1** 중 하나일 때만 적용 (서울 등 다른 지역은 처음부터 요금 발생) |
| 저장 | 무료 사용량 약 5GB(Google Cloud Storage 'Always Free' 기준 — [요금 페이지](https://cloud.google.com/storage/pricing)에서 최신 값 확인) · 파일은 **30일 뒤 자동 삭제**(4단계) |
| 보안 | 로그인 없이 **새 파일 올리기만 허용**. 목록 보기·덮어쓰기·삭제 금지. 다운로드는 메일 링크(고유 토큰)로만 가능 |
| 설정할 곳 | `data.js` → `KAR.certApply` (★ 표시 3곳) + Firebase 보안 규칙(`docs/firebase/storage.rules`) |

> **왜 `allow read, write: if true;` 를 쓰지 않나요?**
> 그 규칙은 "누구나 모든 파일을 읽고·쓰고·지울 수 있음"이라는 뜻입니다. 누군가 버킷 목록을 조회해 **다른 신청인의 증빙서류(개인정보)를 전부 내려받거나**, 파일을 지우거나, 큰 파일을 반복해 올려 **요금을 발생**시킬 수 있습니다. 그래서 이 홈페이지는 같은 "로그인 없는 업로드"를 하면서도 위험한 권한만 뺀 규칙(아래 3단계)을 씁니다.

---

## 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com 접속 → 기관 구글 계정으로 로그인
   - 담당자 개인 계정보다 **기관 공용 계정** 권장 (인계 용이)
2. **프로젝트 만들기** → 이름 : `kar-cert-apply` (예시) → Google 애널리틱스는 **사용 안 함** → 만들기
3. 왼쪽 위 ⚙ **프로젝트 설정 → 일반** → 아래 **내 앱 → 웹(</>) 아이콘**
   - 앱 닉네임 : `KAR 임시 홈페이지` → 'Firebase 호스팅'은 체크하지 않음 → **앱 등록**
4. 화면에 나오는 `firebaseConfig` 값을 복사해 둡니다 (5단계에서 사용)

```js
const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "kar-cert-apply.firebaseapp.com",
  projectId: "kar-cert-apply",
  storageBucket: "kar-cert-apply.firebasestorage.app",   // ← 이 값이 꼭 필요
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcd..."
};
```
   - 나중에 다시 볼 때 : ⚙ 프로젝트 설정 → 일반 → 내 앱 → **SDK 설정 및 구성 → Config**
   - apiKey 는 비밀번호가 아닙니다(웹페이지에 공개되는 식별값). 실제 보호는 3단계 보안 규칙이 합니다.

## 2. Blaze 요금제 전환 (무료 범위 내 0원)
2026년 2월 3일부터 Cloud Storage for Firebase는 **Blaze(종량제) 프로젝트에서만** 사용할 수 있습니다.

1. 콘솔 왼쪽 아래 **Spark(무료)** 표시 옆 **업그레이드** → **Blaze** 선택
2. **Cloud Billing 계정 만들기** → 기관 법인카드 등록 → 완료
3. **예산 알림 설정(필수 권장)** : 업그레이드 화면 또는 https://console.cloud.google.com/billing → **예산 및 알림 → 예산 만들기**
   - 금액 : 예) **월 1,000원** → 알림 기준 50% · 90% · 100% → 받는 사람 : 담당자 메일
   - ⚠ 예산 알림은 **알려 주기만 하고 사용을 멈추지는 않습니다.** 알림 메일을 받으면 바로 확인하세요.

## 3. Storage 만들기 + 보안 규칙
1. 왼쪽 메뉴 **빌드(Build) → Storage → 시작하기**
2. **위치(Location) : `US-CENTRAL1`** (또는 US-EAST1 · US-WEST1) — ⚠ 한 번 정하면 바꿀 수 없음. 서울(asia-northeast3)을 고르면 무료 사용량이 적용되지 않습니다.
3. 보안 규칙 시작 모드는 아무거나 고른 뒤 **완료**
4. Storage 화면 위쪽 **규칙(Rules)** 탭 → 기존 내용을 모두 지우고 저장소의 `docs/firebase/storage.rules` 내용을 그대로 붙여 넣기 → **게시(Publish)**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /applications/{day}/{appId}/{fileName} {
      allow create: if request.resource.size > 0
                    && request.resource.size <= 30 * 1024 * 1024
                    && fileName.matches('(?i).+[.](pdf|hwp|docx|xlsx|jpg)')
                    && request.resource.contentType.matches(
                         'application/pdf|application/x-hwp|image/jpeg|' +
                         'application/vnd[.]openxmlformats-officedocument[.]wordprocessingml[.]document|' +
                         'application/vnd[.]openxmlformats-officedocument[.]spreadsheetml[.]sheet');
      allow get: if true;
      allow list, update, delete: if false;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

| 규칙 | 뜻 |
|---|---|
| `allow create` | 로그인 없이 **새 파일 올리기** 허용 — 30MB 이하, pdf·hwp·docx·xlsx·jpg 만 |
| `allow get` | 다운로드 링크를 만들 때 쓰는 파일 정보 조회. 폴더 이름에 무작위 16자리가 들어가 **주소를 추측할 수 없음** |
| `allow list, update, delete: if false` | 목록 보기 · 덮어쓰기 · 삭제 **금지** |
| 마지막 `match /{allPaths=**}` | 그 밖의 위치는 전부 차단 |

- 홈페이지 첨부 제한(개수·용량·형식)을 바꾸면 이 규칙의 숫자·형식도 **같이** 바꿔야 합니다.
- (선택) 시험 후 메일 링크가 정상이면 `allow get: if true;` 를 `if false;` 로 바꿔 더 잠글 수 있습니다. 바꾼 뒤 링크가 안 만들어지면 다시 `true` 로 돌립니다.

## 4. 30일 자동 삭제 설정 (수명 주기 규칙)
1. https://console.cloud.google.com/storage/browser 접속 → 위쪽에서 같은 프로젝트 선택
2. 버킷 `kar-cert-apply.firebasestorage.app` 클릭 → **수명 주기(Lifecycle)** 탭 → **규칙 추가**
3. 작업 : **객체 삭제(Delete object)** → 조건 : **경과 기간(Age) 30일** → 만들기
4. 업로드 후 30일이 지난 파일은 자동으로 지워지고 메일의 링크도 열리지 않습니다. **담당자는 30일 안에 내려받아 내부에 보관**합니다.

## 5. 홈페이지에 키값 · 메일 넣기 (data.js)
GitHub 저장소에서 `data.js` → 연필(Edit) → `KAR.certApply` 를 찾아 ★ 3곳을 바꿉니다.

```js
KAR.certApply = {
  // ★1. Firebase 설정값 — 1단계에서 복사한 값 (storageBucket 필수)
  firebaseConfig: {
    apiKey:            "AIza....",
    authDomain:        "kar-cert-apply.firebaseapp.com",
    projectId:         "kar-cert-apply",
    storageBucket:     "kar-cert-apply.firebasestorage.app",   // ← ★ 필수
    messagingSenderId: "1234567890",
    appId:             "1:1234567890:web:abcd...",
  },
  // ★2. 신청 유형별 접수 메일
  routes: {
    "신규 등록":       { to: "kar0159@kar.re.kr" },
    "승급":            { to: "kar0159@kar.re.kr" },
    "심사수행범위 추가": { to: "kar0159@kar.re.kr" },
    "갱신":            { to: "kar0156@kar.re.kr" },
    "전환":            { to: "kar0156@kar.re.kr" },
  },
  // ★3. 실패 시 안내 메일 · 메일 제목 머리말
  fallbackEmail: "kar0159@kar.re.kr (등록·승급) / kar0156@kar.re.kr (갱신·전환)",
  subjectPrefix: "[홈페이지 자격인증 신청]",
  ...
```
- `storageBucket` 이 예시값(`프로젝트ID…`)이면 화면에 "관리자 안내 : 설정되지 않음" 문구가 뜨고 제출되지 않습니다.
- 이 홈페이지는 외부 스크립트 없이 Firebase **REST 방식**으로 업로드하므로 실제로 쓰는 값은 `storageBucket` 하나입니다. 나머지 값은 확인·보관용입니다.
- **Commit changes** → 1~2분 뒤 반영

## 6. FormSubmit 연동 · 최초 1회 활성화 (Activate)
FormSubmit은 회원가입이 없고, 처음 메일을 받는 주소로 **확인 메일**을 1회 보냅니다. 승인 전에는 신청 메일이 전달되지 않습니다.

1. GitHub Pages 의 **실제 홈페이지 주소**에서 '자격인증 신청'에 시험 신청 (작은 PDF 1개 첨부)
   - 유형 **신규 등록** → kar0159 로, 유형 **갱신** → kar0156 으로 각각 1회
2. 각 메일함(메일나라)에서 **FormSubmit** 이 보낸 메일 → **Activate Form** 클릭
   - 없으면 스팸함 확인 → 메일나라 **수신 허용**에 `formsubmit.co` 등록
   - 같은 홈페이지의 '온라인 신청'으로 이미 활성화한 주소라도, 확인 메일이 오면 다시 승인합니다.
3. 다시 시험 신청 → 아래처럼 표 형식 메일이 오면 완료

| 메일 항목 | 예시 |
|---|---|
| 제목 | `[홈페이지 자격인증 신청] 승급 · 선임심사원 · 홍길동 (KAR-20261108-143015-AB12)` |
| 접수번호 · 신청 유형 · 신청 등급 · 인증 스킴 | KAR-20261108-143015-AB12 · 승급 · 선임심사원 · ISO 9001 (QMS), ISO 14001 (EMS) |
| 성명 · 생년월일 · 연락처 · 이메일 | 홍길동 · 1980-05-05 · 010-1234-5678 · hong@example.com |
| 증빙서류 1~3 | `신청서.hwp (200KB)` + 다운로드 링크(클릭 시 바로 다운로드) |
| 파일 보관 안내 | 30일 뒤 링크 만료 안내 |

- 메일에서 **답장**을 누르면 신청인 이메일로 바로 회신됩니다.
- (선택) 활성화 메일의 **임의 문자열**을 `routes` 의 메일 주소 자리에 넣으면 소스에서 주소가 보이지 않습니다.

## 7. 시험 체크리스트
- [ ] 신규 등록 → kar0159, 갱신 → kar0156 으로 메일 도착
- [ ] 메일의 증빙서류 링크 3개가 모두 열린다 (hwp · pdf · jpg 등)
- [ ] .png · .zip 등은 첨부 단계에서 거부되고, 30MB 초과 파일도 거부된다
- [ ] '제출 중...' → "접수가 완료되었습니다." 팝업 → 확인 시 폼 초기화
- [ ] Firebase 콘솔 → Storage → `applications/날짜/…` 폴더에 파일이 생긴다
- [ ] (다음 날) Google Cloud 결제 → 비용 0원 확인

## 8. 문제 해결
| 증상 | 확인할 것 |
|---|---|
| "파일 업로드가 거부되었습니다" | 3단계 규칙을 게시했는지 · 파일 형식/용량 · 규칙의 경로가 `applications` 인지 |
| "파일 업로드 중 문제가 발생" | Blaze 전환 여부(Spark면 402/403) · storageBucket 값 오타 · 회사 보안 프로그램 차단 |
| 메일이 안 옴 | FormSubmit 활성화 · 스팸함 · 메일나라 수신 허용 |
| 메일 링크가 안 열림 | 30일이 지나 자동 삭제됨 · 규칙의 `allow get` 을 false 로 바꾼 경우 |
| 비용 알림이 옴 | Storage 사용량 확인 → 대용량·반복 업로드가 있으면 버킷 폴더 정리, 필요 시 App Check(선택) 도입 검토 |

## 9. 개인정보 · 보안 메모
- 폼 아래 안내 : "※ 신청 시, 개인정보 이용에 동의한 것으로 간주하며, 첨부파일은 Google Firebase 서버에 30일간 보관 후 자동 삭제되고, 신청 내용은 FormSubmit 서버에 30일간 보관됩니다."
- 파일은 **미국 리전**에 저장됩니다. 개인정보처리방침의 '국외 이전 · 처리 위탁' 반영 여부를 개인정보 담당자와 확인하세요.
- Firebase 콘솔 접근 계정은 2단계 인증을 켜고, 담당자 외 권한을 주지 않습니다.
- 메일의 다운로드 링크는 링크를 아는 누구나 열 수 있으므로 **메일을 외부로 전달하지 않습니다.**

참고 : [Firebase Storage 요금·버킷 변경 FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) · [Firebase 요금](https://firebase.google.com/pricing) · [Storage 보안 규칙](https://firebase.google.com/docs/storage/security) · [FormSubmit 문서](https://formsubmit.co/documentation)
