/**
 * =====================================================================
 *  한국심사자격인증원 — 온라인 신청 첨부파일 수신 (Google Apps Script 웹 앱)
 * ---------------------------------------------------------------------
 *  홈페이지(GitHub Pages)의 온라인 신청이 보낸 첨부파일(Base64)을
 *  구글 드라이브의 신청별 폴더에 저장하고, 폴더·파일 링크를 JSON 으로 돌려줍니다.
 *  → 홈페이지가 이 링크를 FormSubmit 메일에 넣어 담당자에게 보냅니다.
 *
 *  · 신청자는 구글 계정·로그인 없이 업로드합니다 (웹 앱 액세스 : '모든 사용자').
 *  · 파일은 공개 공유하지 않습니다. 저장 폴더를 공유받은 담당자 계정만 열 수 있습니다.
 *  · 신청 1건마다 하위 폴더 「접수번호_성명」을 만들어 저장합니다.
 *  · 30일이 지난 신청 폴더는 매일 1회 자동으로 휴지통으로 옮깁니다(휴지통은 30일 뒤 영구 삭제).
 *    ※ 아래 FOLDERS 의 신청별 폴더 자체는 지우지 않습니다.
 *
 *  ▶ 관리자가 바꾸는 곳 : CONFIG 의 ★ FOLDER_ID / ★ FOLDERS
 *  ▶ 코드를 바꾼 뒤에는 : 배포 → 배포 관리 → ✏ 수정 → 버전 '새 버전' → 배포 (웹 앱 URL 유지)
 * =====================================================================
 */

var CONFIG = {
  // ★ 상위 폴더 ID (드라이브 주소창 https://drive.google.com/drive/folders/【이 부분】)
  FOLDER_ID: '1p0LkO6wWG62CT4jihIPPk3ULeawBpXdS',

  // ★ 신청 구분 → 저장할 하위 폴더 이름 (상위 폴더 안에 있는 폴더 이름과 같게)
  //   왼쪽 값은 홈페이지가 보내는 구분값입니다. 바꾸지 마세요.
  //   폴더가 없으면 이 이름으로 자동으로 만듭니다.
  FOLDERS: {
    'edu':             '[edu] KAR-교육 신청',
    'exam':            '[0159] KAR-자격시험 신청',
    'receipt':         '[0157] KAR-영수증 신청ㆍ출력',
    '신규 등록':        '[0159] KAR-자격인증신청(신규 등록)',
    '승급':             '[0159] KAR-자격인증신청(승급)',
    '심사수행범위 추가': '[0159] KAR-자격인증신청(심사수행범위 추가)',
    '갱신':             '[0156] KAR-자격인증신청(갱신)',
    '전환':             '[0156] KAR-자격인증신청(전환)',
  },

  MAX_TOTAL_MB: 15,                                   // 신청 1건 첨부 합계 한도(MB)
  ALLOWED_EXT: ['pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'zip'],
  KEEP_DAYS: 30,                                      // 보관 기간(일) — 지나면 휴지통으로 이동
  MAX_PER_10MIN: 40,                                  // 10분당 최대 접수 건수(대량 업로드 방지)
};

/* ---------------------------------------------------------------------
 *  POST : 파일 받기
 *  요청 본문(JSON, Content-Type: text/plain) 예)
 *  { "category": "갱신", "applyNo": "KAR-20261109-143015-AB12", "name": "홍길동", "honey": "",
 *    "files": [ { "name": "신청서.hwp", "mimeType": "application/x-hwp", "data": "<Base64>" } ] }
 *  응답(JSON) 예)
 *  { "ok": true, "folderName": "...", "folderUrl": "https://drive.google.com/drive/folders/...",
 *    "files": [ { "name": "1_신청서.hwp", "size": 204800, "url": "https://drive.google.com/file/d/.../view" } ] }
 * --------------------------------------------------------------------- */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return reply_({ ok: false, error: 'EMPTY_REQUEST' });
    var req = JSON.parse(e.postData.contents);

    if (req.honey) return reply_({ ok: false, error: 'REJECTED' });                 // 로봇 차단용 숨김칸
    var category = String(req.category || req.type || '');                         // req.type : 이전 버전 호환
    if (!CONFIG.FOLDERS[category]) return reply_({ ok: false, error: 'BAD_CATEGORY', category: category });
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
      if (!bytes.length) return reply_({ ok: false, error: 'EMPTY_FILE', file: name });
      total += bytes.length;
      if (total > CONFIG.MAX_TOTAL_MB * 1024 * 1024) return reply_({ ok: false, error: 'TOO_LARGE' });
      blobs.push(Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', (i + 1) + '_' + name));
    }

    // 2) 저장 : 신청별 폴더 > 「접수번호_성명」
    var target = categoryFolder_(category);
    var folderName = [req.applyNo, safeName_(req.name || '').slice(0, 30)].filter(function (x) { return x && x !== 'file'; }).join('_');
    var folder = target.createFolder(folderName);
    var saved = blobs.map(function (b) {
      var file = folder.createFile(b);
      return { name: file.getName(), size: file.getSize(), url: file.getUrl() };
    });

    // ※ 공개 공유(setSharing)는 하지 않습니다 → 상위 폴더를 공유받은 담당자 계정만 열람 가능
    return reply_({ ok: true, category: category, folderName: target.getName() + ' / ' + folderName, folderUrl: folder.getUrl(), files: saved });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
}

/* GET : 동작 확인용 (브라우저에서 웹 앱 주소를 열면 {"ok":true,...} 가 보이면 정상) */
function doGet() {
  return reply_({ ok: true, service: 'KAR 온라인 신청 첨부파일 수신', maxTotalMB: CONFIG.MAX_TOTAL_MB, categories: Object.keys(CONFIG.FOLDERS) });
}

/* ---------------------------------------------------------------------
 *  신청별 폴더 찾기 (이름의 띄어쓰기·가운뎃점(·ㆍ・) 차이는 같은 것으로 봄 · 없으면 만듦)
 * --------------------------------------------------------------------- */
function categoryFolder_(category) {
  var want = CONFIG.FOLDERS[category];
  var root = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  var it = root.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (norm_(f.getName()) === norm_(want)) return f;
  }
  console.log('폴더가 없어 새로 만듭니다 : ' + want);
  return root.createFolder(want);
}
function norm_(s) { return String(s || '').replace(/[\s·ㆍ・•]/g, '').toLowerCase(); }

/* ---------------------------------------------------------------------
 *  30일 지난 신청 폴더(「KAR-날짜…」) → 휴지통   (setupDailyCleanup 으로 매일 자동 실행)
 *  신청별 폴더 안의 접수 폴더만 대상이며, 신청별 폴더 자체는 지우지 않습니다.
 * --------------------------------------------------------------------- */
function cleanupOldFolders() {
  var limit = new Date(Date.now() - CONFIG.KEEP_DAYS * 24 * 60 * 60 * 1000);
  var isApply = function (f) { return /^KAR-\d{8}-/.test(f.getName()); };
  var root = DriveApp.getFolderById(CONFIG.FOLDER_ID), n = 0;
  var parents = root.getFolders();
  while (parents.hasNext()) {
    var p = parents.next();
    if (isApply(p)) {                                          // 이전 버전에서 상위 폴더에 바로 만든 접수 폴더
      if (p.getDateCreated() < limit) { p.setTrashed(true); n++; }
      continue;
    }
    var kids = p.getFolders();
    while (kids.hasNext()) {
      var k = kids.next();
      if (isApply(k) && k.getDateCreated() < limit) { k.setTrashed(true); n++; }
    }
  }
  console.log('휴지통으로 옮긴 접수 폴더 : ' + n + '개');
}

/* 처음 한 번만 직접 실행 : 매일 새벽 3~4시에 cleanupOldFolders 자동 실행 등록 */
function setupDailyCleanup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cleanupOldFolders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupOldFolders').timeBased().everyDays(1).atHour(3).create();
  console.log('자동 정리 예약 완료 (매일 03시대)');
}

/* 처음 한 번만 직접 실행 : 드라이브 권한 승인 + 상위 폴더 · 신청별 폴더 확인 */
function checkSetup() {
  var root = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  console.log('상위 폴더 : ' + root.getName() + ' / ' + root.getUrl());
  Object.keys(CONFIG.FOLDERS).forEach(function (k) {
    var f = categoryFolder_(k);
    console.log('[' + k + '] → ' + f.getName());
  });
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
