/**
 * =====================================================================
 *  한국심사자격인증원 — 자격인증 신청 증빙서류 수신 (Google Apps Script 웹 앱)
 * ---------------------------------------------------------------------
 *  홈페이지(GitHub Pages)의 '자격인증 신청' 폼이 보낸 첨부파일(Base64)을
 *  구글 드라이브의 지정 폴더에 저장하고, 폴더·파일 링크를 JSON 으로 돌려줍니다.
 *  → 홈페이지가 이 링크를 FormSubmit 메일에 넣어 담당자에게 보냅니다.
 *
 *  · 신청자는 구글 계정·로그인 없이 업로드합니다 (웹 앱 액세스 : '모든 사용자').
 *  · 파일은 공개 공유하지 않습니다. 저장 폴더를 공유받은 담당자 계정만 열 수 있습니다.
 *  · 30일이 지난 신청 폴더는 매일 1회 자동으로 휴지통으로 옮깁니다(휴지통은 30일 뒤 영구 삭제).
 *
 *  ▶ 관리자가 바꾸는 곳 : 아래 CONFIG 의 ★ FOLDER_ID 한 곳
 *  ▶ 설치 순서 : docs/4_AppsScript_구글드라이브_자격인증신청_연동_가이드.md
 * =====================================================================
 */

var CONFIG = {
  // ★ 증빙서류를 저장할 구글 드라이브 폴더 ID
  //   드라이브에서 폴더를 열었을 때 주소창의  https://drive.google.com/drive/folders/【이 부분】
  FOLDER_ID: '여기에_폴더_ID_붙여넣기',

  MAX_TOTAL_MB: 15,                                   // 신청 1건 첨부 합계 한도(MB) — 홈페이지 data.js 의 maxTotalMB 와 같게
  ALLOWED_EXT: ['pdf', 'hwp', 'docx', 'xlsx', 'jpg'], // 허용 확장자 — data.js 의 accept 와 같게
  KEEP_DAYS: 30,                                      // 보관 기간(일) — 지나면 휴지통으로 이동
  MAX_PER_10MIN: 40,                                  // 10분당 최대 접수 건수(대량 업로드 방지)
};

/* ---------------------------------------------------------------------
 *  POST : 파일 받기
 *  요청 본문(JSON, Content-Type: text/plain) 예)
 *  { "applyNo": "KAR-20261109-143015-AB12", "name": "홍길동", "type": "갱신",
 *    "honey": "", "files": [ { "name": "신청서.hwp", "mimeType": "application/x-hwp", "data": "<Base64>" } ] }
 *  응답(JSON) 예)
 *  { "ok": true, "folderName": "...", "folderUrl": "https://drive.google.com/drive/folders/...",
 *    "files": [ { "name": "1_신청서.hwp", "size": 204800, "url": "https://drive.google.com/file/d/.../view" } ] }
 * --------------------------------------------------------------------- */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return reply_({ ok: false, error: 'EMPTY_REQUEST' });
    var req = JSON.parse(e.postData.contents);

    if (req.honey) return reply_({ ok: false, error: 'REJECTED' });                 // 로봇 차단용 숨김칸
    if (!/^KAR-\d{8}-\d{6}-[0-9A-F]{4}$/.test(String(req.applyNo || ''))) return reply_({ ok: false, error: 'BAD_APPLY_NO' });
    var files = req.files || [];
    if (!files.length) return reply_({ ok: false, error: 'NO_FILES' });
    if (!underRateLimit_()) return reply_({ ok: false, error: 'TOO_MANY_REQUESTS' });

    // 1) 검사 : 확장자 · 합계 용량 (저장 전에 모두 확인)
    var blobs = [], total = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var name = safeName_(f.name);
      var ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
      if (!ext || CONFIG.ALLOWED_EXT.indexOf(ext.toLowerCase()) < 0) return reply_({ ok: false, error: 'BAD_TYPE', file: name });
      var bytes = Utilities.base64Decode(String(f.data || ''));
      total += bytes.length;
      if (total > CONFIG.MAX_TOTAL_MB * 1024 * 1024) return reply_({ ok: false, error: 'TOO_LARGE' });
      if (!bytes.length) return reply_({ ok: false, error: 'EMPTY_FILE', file: name });
      blobs.push(Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', (i + 1) + '_' + name));
    }

    // 2) 저장 : 신청마다 하위 폴더 '접수번호_성명_유형'
    var root = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    var folderName = [req.applyNo, safeName_(req.name || '').slice(0, 20), safeName_(req.type || '').slice(0, 20)]
      .filter(String).join('_');
    var folder = root.createFolder(folderName);
    var saved = blobs.map(function (b) {
      var file = folder.createFile(b);
      return { name: file.getName(), size: file.getSize(), url: file.getUrl() };
    });

    // ※ 공개 공유(setSharing)는 하지 않습니다 → 상위 폴더를 공유받은 담당자 계정만 열람 가능
    return reply_({ ok: true, folderName: folderName, folderUrl: folder.getUrl(), files: saved });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
}

/* GET : 동작 확인용 (브라우저에서 웹 앱 주소를 열면 {"ok":true,...} 가 보이면 정상) */
function doGet() {
  return reply_({ ok: true, service: 'KAR 자격인증 신청 증빙서류 수신', maxTotalMB: CONFIG.MAX_TOTAL_MB });
}

/* ---------------------------------------------------------------------
 *  30일 지난 신청 폴더 → 휴지통   (setupDailyCleanup 으로 매일 자동 실행)
 * --------------------------------------------------------------------- */
function cleanupOldFolders() {
  var limit = new Date(Date.now() - CONFIG.KEEP_DAYS * 24 * 60 * 60 * 1000);
  var it = DriveApp.getFolderById(CONFIG.FOLDER_ID).getFolders(), n = 0;
  while (it.hasNext()) {
    var f = it.next();
    if (f.getDateCreated() < limit) { f.setTrashed(true); n++; }
  }
  console.log('휴지통으로 옮긴 신청 폴더 : ' + n + '개');
}

/* 처음 한 번만 직접 실행 : 매일 새벽 3~4시에 cleanupOldFolders 자동 실행 등록 */
function setupDailyCleanup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cleanupOldFolders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupOldFolders').timeBased().everyDays(1).atHour(3).create();
  console.log('자동 정리 예약 완료 (매일 03시대)');
}

/* 처음 한 번만 직접 실행 : 드라이브 권한 승인 + 폴더 ID 확인 */
function checkSetup() {
  var folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  console.log('저장 폴더 확인 : ' + folder.getName() + ' / ' + folder.getUrl());
}

/* ---------- 도우미 ---------- */
function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function safeName_(s) {
  return String(s || '').replace(/[\\\/:*?"<>|#%\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(-120) || 'file';
}
function underRateLimit_() {
  var cache = CacheService.getScriptCache();
  var key = 'cnt_' + Math.floor(Date.now() / 600000);   // 10분 단위
  var n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 660);
  return n <= CONFIG.MAX_PER_10MIN;
}
