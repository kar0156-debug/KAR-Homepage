/* ==========================================================================
   한국심사자격인증원 — 자격인증 신청 (Google Apps Script + 구글 드라이브 + FormSubmit)
   --------------------------------------------------------------------------
   ┌ 관리자가 바꾸는 곳 (이 파일은 고치지 않습니다) ───────────────────────┐
   │ ★ Apps Script 웹 앱 URL : data.js → KAR.certApply.appsScriptUrl       │
   │ ★ FormSubmit 받는 메일  : data.js → KAR.certApply.routes              │
   │                           (신청 유형별 Action 이메일 주소)              │
   │ ★ 드라이브 저장 폴더    : docs/apps-script/Code.gs → CONFIG.FOLDER_ID  │
   └────────────────────────────────────────────────────────────────────────┘

   처리 순서 (async / await 로 한 단계씩 끝난 뒤 다음 단계 진행)
     ① 입력값 · 첨부파일 검사 (확장자 / 첨부 합계 15MB 초과 시 경고)
     ② 첨부파일을 Base64 로 변환                         → await
     ③ Apps Script 웹 앱으로 POST → 구글 드라이브 저장    → await
        (응답 JSON : 신청 폴더 링크 + 파일별 링크)
     ④ 드라이브 링크를 폼의 숨김 input 에 대입
          <input type="hidden" name="첨부파일_폴더">  : 신청 폴더 링크
          <input type="hidden" name="첨부파일_링크">  : 파일 링크 전체
          <input type="hidden" name="첨부파일1_링크"> … : 파일별 링크
     ⑤ 폼 전체(new FormData(form))를 FormSubmit 으로 전송 → await → 담당자 메일
     ⑥ "접수가 완료되었습니다." 팝업
   ========================================================================== */
(function () {
  'use strict';
  var K = window.KAR || {};
  var CFG = K.certApply;
  if (!CFG) {
    // data.js 를 읽지 못했거나 KAR.certApply 가 없으면 : 제출을 막고 안내 (첨부 없는 메일 방지)
    document.addEventListener('DOMContentLoaded', function () {
      var form = document.getElementById('ca-form'); if (!form) return;
      var msg = '설정 파일(data.js)을 읽지 못해 지금은 자격인증 신청을 제출할 수 없습니다. ' +
        '신청서와 증빙서류를 kar0159@kar.re.kr (등록·승급) / kar0156@kar.re.kr (갱신·전환) 로 보내 주세요.';
      var box = document.getElementById('ca-setup');
      if (box) { box.textContent = '※ 관리자 안내 : data.js 에 KAR.certApply 설정이 없거나 data.js 문법 오류로 읽히지 않습니다.'; box.hidden = false; }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = document.getElementById('ca-error');
        if (err) { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'center' }); } else alert(msg);
      });
      if (window.console) console.error('[KAR 자격인증 신청] data.js 의 KAR.certApply 를 찾을 수 없습니다.');
    });
    return;
  }

  var FORMSUBMIT = 'https://formsubmit.co/';
  var MB = 1024 * 1024;
  var MAX_TOTAL = (CFG.maxTotalMB || 15) * MB;

  // 확장자 → 파일 형식(MIME). 드라이브에 저장할 때 파일 종류로 쓰입니다.
  var MIME = {
    '.pdf':  'application/pdf',
    '.hwp':  'application/x-hwp',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.jpg':  'image/jpeg',
  };

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtSize(b) { return b >= MB ? (b / MB).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB'; }
  function extOf(name) { var m = String(name).toLowerCase().match(/\.[a-z0-9]+$/); return m ? m[0] : ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function randHex(len) {
    var a = new Uint8Array(Math.ceil(len / 2));
    window.crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').slice(0, len);
  }
  function toast(msg) {
    var t = $('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function totalSize(list) { return list.reduce(function (s, f) { return s + f.size; }, 0); }
  function overLimitMessage(total) {
    return '첨부파일 합계가 ' + fmtSize(total) + '로, 신청 1건당 한도(' + (CFG.maxTotalMB || 15) + 'MB)를 넘습니다.\n\n' +
      '· 스캔 해상도를 낮추거나 PDF 를 압축해 용량을 줄여 주세요.\n' +
      '· 그래도 크면 일부 서류는 ' + CFG.fallbackEmail + ' 로 보내 주세요.';
  }

  /* ---------- 시험용 처리 기록 (data.js → KAR.certApply.debug: true 일 때만 화면 표시) ---------- */
  function log(msg, data) {
    if (window.console) console.info('[KAR 자격인증 신청] ' + msg, data === undefined ? '' : data);
    if (!CFG.debug) return;
    var box = $('ca-debug');
    if (!box) {
      box = document.createElement('pre'); box.id = 'ca-debug'; box.className = 'ca-debug';
      $('ca-form').appendChild(box);
    }
    box.textContent += '• ' + msg + (data === undefined ? '' : ' : ' + (typeof data === 'string' ? data : JSON.stringify(data, null, 1))) + '\n';
  }

  /* ---------- 설정 확인 ---------- */
  var scriptUrl = String(CFG.appsScriptUrl || '').trim();
  var configured = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(scriptUrl);

  /* ---------- 신청 유형 · 등급별 제출 서류 안내 (data.js → KAR.requiredDocs 재사용) ---------- */
  function findRows(word) {
    var g = (K.requiredDocs || []).filter(function (x) { return x.title.indexOf(word) > -1; })[0];
    return g ? g.rows : [];
  }
  function pickRow(rows, word) { return rows.filter(function (r) { return r[0].indexOf(word) > -1; })[0]; }
  function docsFor(type, grade) {
    if (type === '신규 등록' || type === '승급') {
      var reg = findRows('등록');
      if (grade === '심사원보') return pickRow(reg, '심사원보');
      if (grade === '검증심사원') return pickRow(reg, '검증');
      if (grade) return pickRow(reg, '선임');
    } else if (type === '갱신') {
      var ren = findRows('갱신');
      if (grade === '심사원보') return pickRow(ren, '심사원보');
      if (grade) return pickRow(ren, '이상');
    } else if (type === '전환') return pickRow(findRows('기타'), '전환');
    else if (type === '심사수행범위 추가') return pickRow(findRows('기타'), '심사수행범위');
    return null;
  }
  function selectedType() { var r = document.querySelector('#ca-form input[name="신청 유형"]:checked'); return r ? r.value : ''; }
  function renderDocs() {
    var type = selectedType(), grade = $('ca-grade').value, box = $('ca-docs'), row = docsFor(type, grade);
    if (!row) {
      box.innerHTML = '<p class="ca-docs__empty">' + (type && !grade ? '신청 등급을 선택하면 제출 서류가 안내됩니다.'
        : '신청 유형과 등급을 선택하면 제출 서류가 여기에 안내됩니다.') + '</p>';
      return;
    }
    var items = row[1].split(/,\s*(?![^()\[\]]*[)\]])/).map(function (s) { return '<li>' + esc(s.trim()) + '</li>'; }).join('');
    box.innerHTML = '<div class="ca-docs__hd"><b>' + esc(type) + (grade ? ' · ' + esc(grade) : '') +
      '</b> 제출 서류 <span>(' + esc(row[0]) + ')</span></div><ul>' + items + '</ul>' +
      (row[2] ? '<p class="ca-docs__note">※ ' + esc(row[2]) + '</p>' : '') +
      '<p class="ca-docs__link"><a href="#forms" data-tab="qual">자격인증 신청 서식 내려받기 ›</a>' +
      '<span> · 여러 서류는 PDF 1개로 합쳐 올리면 편리합니다.</span></p>';
  }

  /* ---------- 화면 구성 ---------- */
  function build() {
    $('ca-types').innerHTML = (CFG.types || []).map(function (t) {
      return '<label class="ca-chip"><input type="radio" name="신청 유형" value="' + esc(t) + '" required><span>' + esc(t) + '</span></label>';
    }).join('');
    $('ca-grade').insertAdjacentHTML('beforeend', (CFG.grades || []).map(function (g) {
      return '<option value="' + esc(g) + '">' + esc(g) + '</option>';
    }).join(''));
    // 인증 스킴 체크박스는 name 없이 두고, 제출 때 선택값을 숨김 input '인증 스킴' 에 합쳐 넣습니다.
    $('ca-schemes').innerHTML = (CFG.schemes || []).map(function (s) {
      return '<label class="ca-check"><input type="checkbox" data-scheme value="' + esc(s) + '"><span>' + esc(s) + '</span></label>';
    }).join('');
    $('ca-drop-hint').textContent = (CFG.accept || []).join(' ') + ' · 첨부 합계 ' + (CFG.maxTotalMB || 15) + 'MB 이하' +
      (CFG.maxFiles ? ' · 최대 ' + CFG.maxFiles + '개' : '');
    $('ca-file').setAttribute('accept', (CFG.accept || []).join(','));
    $('ca-foot').innerHTML = (CFG.footnotes || []).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
    if (!configured) $('ca-setup').hidden = false;
  }

  /* ---------- 첨부파일 (드래그 앤 드롭 + 클릭) ---------- */
  var files = [];
  function addFiles(list) {
    var allowed = (CFG.accept || []).map(function (x) { return x.toLowerCase(); });
    var overWarned = false;
    Array.prototype.forEach.call(list, function (f) {
      var ext = extOf(f.name);
      if (allowed.indexOf(ext) < 0) {                       // ① 확장자 필터
        toast('「' + f.name + '」은(는) 올릴 수 없는 형식입니다. (' + allowed.join(' ') + ' 만 가능)'); return;
      }
      if (f.size === 0) { toast('「' + f.name + '」은(는) 빈 파일입니다.'); return; }
      if (files.some(function (x) { return x.name === f.name && x.size === f.size; })) return;
      if (CFG.maxFiles && files.length >= CFG.maxFiles) {    // 개수 제한(설정한 경우만)
        toast('파일은 최대 ' + CFG.maxFiles + '개까지 첨부할 수 있습니다.'); return;
      }
      var after = totalSize(files) + f.size;
      if (after > MAX_TOTAL) {                               // ② 첨부 합계 15MB 초과 → 경고 알림
        if (!overWarned) alert('「' + f.name + '」을(를) 더하면 ' + overLimitMessage(after));
        overWarned = true;
        return;
      }
      files.push(f);
    });
    renderFiles();
  }
  function renderFiles() {
    $('ca-filelist').innerHTML = files.map(function (f, i) {
      return '<li><span class="fi-ext">' + esc(extOf(f.name).slice(1).toUpperCase()) + '</span>' +
        '<span class="fi-name">' + esc(f.name) + '</span><span class="fi-size">' + fmtSize(f.size) + '</span>' +
        '<button type="button" class="fi-del" data-i="' + i + '" aria-label="' + esc(f.name) + ' 삭제">×</button></li>';
    }).join('');
    var total = totalSize(files), meter = $('ca-meter');
    meter.hidden = !files.length;
    meter.classList.toggle('is-full', total > MAX_TOTAL * 0.9);
    $('ca-meter-bar').style.width = Math.min(100, total / MAX_TOTAL * 100) + '%';
    $('ca-meter-txt').textContent = '합계 ' + fmtSize(total) + ' / ' + (CFG.maxTotalMB || 15) + 'MB (' + files.length + '개)';
    if (files.length) $('ca-file-msg').hidden = true;
  }
  function bindDrop() {
    var dz = $('ca-drop'), input = $('ca-file');
    dz.addEventListener('click', function () { input.click(); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); }); });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });
    $('ca-filelist').addEventListener('click', function (e) {
      var b = e.target.closest('.fi-del'); if (!b) return;
      files.splice(+b.dataset.i, 1); renderFiles();
    });
  }

  /* ---------- ② Base64 변환 ---------- */
  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };   // "data:...;base64," 앞부분 제거
      r.onerror = function () { reject(new Error('READ_FAILED')); };
      r.readAsDataURL(file);
    });
  }

  /* ---------- ③ Apps Script 웹 앱으로 전송 → 드라이브 저장 ---------- */
  //   Content-Type 을 text/plain 으로 보내야 브라우저 사전 요청(CORS preflight) 없이 바로 전달됩니다.
  function postToAppsScript(payload, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', scriptUrl);
      xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
      xhr.timeout = 180000;                                   // 3분
      xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        var j = null; try { j = JSON.parse(xhr.responseText); } catch (e) { /* JSON 이 아님 */ }
        if (!j) { log('Apps Script 응답이 JSON 이 아님(HTTP ' + xhr.status + ')', String(xhr.responseText || '').slice(0, 300)); return reject(new Error('SCRIPT_BAD_RESPONSE')); }
        resolve(j);
      };
      xhr.onerror = function () { reject(new Error('SCRIPT_NETWORK')); };
      xhr.ontimeout = function () { reject(new Error('SCRIPT_TIMEOUT')); };
      xhr.send(JSON.stringify(payload));
    });
  }
  async function uploadToDrive(info) {
    var list = [];
    for (var i = 0; i < files.length; i++) {                 // 파일을 하나씩 Base64 로 변환
      progress('파일 준비 중 (' + (i + 1) + '/' + files.length + ') · ' + files[i].name, 0.05 + i / files.length * 0.1);
      list.push({ name: files[i].name, mimeType: MIME[extOf(files[i].name)] || 'application/octet-stream', data: await toBase64(files[i]) });
    }
    var payload = { applyNo: info.applyNo, name: info.name, type: info.type, honey: $('ca-honey').value, files: list };
    log('Apps Script 로 전송 (파일 ' + list.length + '개, 합계 ' + fmtSize(totalSize(files)) + ')', scriptUrl);
    var res = await postToAppsScript(payload, function (r) {
      progress('구글 드라이브에 업로드 중… ' + Math.round(r * 100) + '%', 0.15 + r * 0.7);
    });
    log('Apps Script 응답', res);
    if (!res.ok) throw new Error('SCRIPT_' + (res.error || 'FAILED'));
    var links = (res.files || []).filter(function (f) { return f && f.url; });
    if (!res.folderUrl || links.length !== files.length) throw new Error('LINK_MISSING');
    return { folderUrl: res.folderUrl, folderName: res.folderName, files: links };
  }

  /* ---------- ④ 드라이브 링크를 숨김 input 에 대입 ---------- */
  function fillHiddenInputs(info, drive) {
    $('ca-h-subject').value = (CFG.subjectPrefix || '') + ' ' + info.type + ' · ' + info.grade + ' · ' + info.name + ' (' + info.applyNo + ')';
    $('ca-h-replyto').value = info.email;                   // 메일 '답장' → 신청인
    $('ca-h-no').value = info.applyNo;
    $('ca-h-schemes').value = info.schemes.join(', ');
    $('ca-h-folder').value = drive.folderUrl;               // ★ 신청 폴더 링크
    $('ca-h-links').value = drive.files.map(function (f) { return f.url; }).join(' , ');   // ★ 파일 링크 전체
    var box = $('ca-h-files'); box.innerHTML = '';
    drive.files.forEach(function (f, i) {                   // ★ 파일별 이름 / 링크
      [['첨부파일' + (i + 1) + '_이름', files[i].name + ' (' + fmtSize(files[i].size) + ')'], ['첨부파일' + (i + 1) + '_링크', f.url]].forEach(function (kv) {
        var h = document.createElement('input');
        h.type = 'hidden'; h.name = kv[0]; h.value = kv[1];
        box.appendChild(h);
      });
    });
    var keep = document.createElement('input');
    keep.type = 'hidden'; keep.name = '파일 보관 안내';
    keep.value = '링크는 담당자 구글 계정으로 로그인해야 열립니다. 업로드 후 ' + (CFG.keepDays || 30) + '일이 지나면 자동 삭제되니 기간 안에 내려받아 보관해 주세요.';
    box.appendChild(keep);
  }

  /* ---------- ⑤ FormSubmit 전송 ---------- */
  async function sendAjax(form, to) {
    var fd = new FormData(form);                             // 숨김 input 까지 모두 포함
    var entries = []; fd.forEach(function (v, k) { entries.push(k + ' = ' + v); });
    log('FormSubmit 으로 보내는 값', entries.join('\n  '));
    if (!fd.get('첨부파일_링크')) throw new Error('LINK_MISSING');   // 링크 없이 보내지 않음
    var res = await fetch(FORMSUBMIT + 'ajax/' + to, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
    var j = {}; try { j = await res.json(); } catch (e) { /* 무시 */ }
    log('FormSubmit 응답', j);
    if (j.success === true || j.success === 'true') return;
    if (/activat/i.test(String(j.message || ''))) throw new Error('NOT_ACTIVATED');
    throw new Error('FORMSUBMIT');
  }
  function sendPost(form, to, applyNo) {                      // 예비 방식 : 일반 폼 제출
    form.action = FORMSUBMIT + to;
    var next = document.createElement('input');
    next.type = 'hidden'; next.name = '_next';
    next.value = location.href.split('#')[0].split('?')[0] + '?caSent=' + encodeURIComponent(applyNo) + '#apply';
    $('ca-h-files').appendChild(next);
    $('ca-file').disabled = true;                             // 파일 자체는 FormSubmit 으로 보내지 않음(링크만 전송)
    log('일반 폼 제출(post) → ' + form.action);
    HTMLFormElement.prototype.submit.call(form);
  }

  /* ---------- 화면 상태 ---------- */
  function setLoading(on) {
    var b = $('ca-submit');
    b.disabled = on; b.classList.toggle('is-loading', on);
    b.querySelector('.lbl').textContent = on ? '제출 중...' : '자격인증 신청서 제출';
    $('ca-reset').disabled = on;
    $('ca-progress').hidden = !on;
  }
  function progress(text, ratio) {
    $('ca-progress-text').textContent = text;
    $('ca-progress-bar').style.width = Math.round(Math.min(1, ratio) * 100) + '%';
  }
  function showError(msg) {
    var e = $('ca-error'); e.innerHTML = msg; e.hidden = !msg;
    if (msg) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function errText(err) {
    var m = String(err && err.message || err);
    var tail = ' 계속 안 되면 신청서와 증빙서류를 <b>' + esc(CFG.fallbackEmail) + '</b> 로 보내 주세요.';
    if (m === 'NOT_CONFIGURED') return '자격인증 신청 기능이 아직 설정되지 않았습니다.' + tail;
    if (m === 'SCRIPT_TOO_LARGE') return '첨부파일 합계가 ' + (CFG.maxTotalMB || 15) + 'MB를 넘습니다. 용량을 줄여 다시 제출해 주세요.' + tail;
    if (m === 'SCRIPT_BAD_TYPE') return '올릴 수 없는 형식의 파일이 있습니다. (' + esc((CFG.accept || []).join(' ')) + ' 만 가능)' + tail;
    if (m === 'SCRIPT_TOO_MANY_REQUESTS') return '지금 신청이 많아 잠시 접수가 제한되었습니다. 10분 뒤 다시 시도해 주세요.' + tail;
    if (m === 'SCRIPT_TIMEOUT') return '업로드 시간이 너무 오래 걸려 중단되었습니다. 인터넷 연결을 확인하거나 용량을 줄여 다시 시도해 주세요.' + tail;
    if (m === 'LINK_MISSING') return '업로드한 파일의 링크를 받지 못해 신청서를 보내지 않았습니다. 잠시 후 다시 시도해 주세요.' + tail;
    if (m.indexOf('SCRIPT_') === 0 || m === 'READ_FAILED') return '증빙서류 업로드 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' + tail;
    if (m === 'NOT_ACTIVATED') return '접수 메일 주소의 사용 승인(활성화)이 아직 완료되지 않았습니다. 담당자에게 알려 주세요.' + tail;
    return '신청서를 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.' + tail;
  }
  function validate(form) {
    form.classList.add('was-checked');
    var ok = form.checkValidity();
    var schemeOk = !!form.querySelector('input[data-scheme]:checked');
    $('ca-scheme-msg').hidden = schemeOk;
    $('ca-file-msg').hidden = files.length > 0;
    if (!ok) { var bad = form.querySelector(':invalid'); if (bad) { bad.focus(); if (bad.reportValidity) bad.reportValidity(); } return false; }
    if (!schemeOk) { $('ca-schemes').scrollIntoView({ block: 'center', behavior: 'smooth' }); return false; }
    if (!files.length) { $('ca-drop').focus(); return false; }
    var total = totalSize(files);
    if (total > MAX_TOTAL) { alert(overLimitMessage(total)); return false; }   // 제출 직전 15MB 재확인
    return true;
  }

  /* ---------- 제출 (①~⑥) ---------- */
  var busy = false;
  async function handleSubmit(e) {
    e.preventDefault();                                       // 브라우저 기본 제출 중지 → 업로드가 끝난 뒤 직접 전송
    if (busy) return;
    var form = $('ca-form');
    showError('');
    if (!validate(form)) return;                              // ①
    if ($('ca-honey').value) return;                          // 로봇 제출 무시

    var type = selectedType();
    var route = (CFG.routes || {})[type];
    var now = new Date();
    var ymd = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
    var info = {
      type: type, grade: $('ca-grade').value, name: $('ca-name').value.trim(), email: $('ca-email').value.trim(),
      schemes: Array.prototype.map.call(form.querySelectorAll('input[data-scheme]:checked'), function (x) { return x.value; }),
      applyNo: 'KAR-' + ymd + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '-' + randHex(4).toUpperCase(),
    };

    busy = true; setLoading(true);
    var navigating = false;
    try {
      if (!configured || !route || !route.to) throw new Error('NOT_CONFIGURED');
      log('접수번호 ' + info.applyNo + ' · 받는 메일 ' + route.to);

      var drive = await uploadToDrive(info);                  // ②③ Base64 → Apps Script → 드라이브 (끝날 때까지 대기)
      fillHiddenInputs(info, drive);                          // ④ 숨김 input 에 드라이브 링크 대입
      progress('신청서 전송 중…', 0.92);

      if (CFG.sendMode === 'post') { navigating = true; sendPost(form, route.to, info.applyNo); return; }
      await sendAjax(form, route.to);                         // ⑤ 메일 전송 완료까지 대기

      progress('완료', 1);
      openDone(info.applyNo);                                 // ⑥
    } catch (err) {
      log('오류', String(err && err.message || err));
      showError(errText(err));
    } finally {
      busy = false;
      if (!navigating) setLoading(false);
    }
  }

  /* ---------- ⑥ 접수 완료 팝업 ---------- */
  function openDone(no) {
    var d = $('ca-done');
    $('ca-done-no').textContent = no;
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    $('ca-done-ok').focus();
  }
  function closeDone() {
    var d = $('ca-done');
    if (d.close) d.close(); else d.removeAttribute('open');
    resetAll();
    $('panel-qual').scrollIntoView({ behavior: 'smooth' });
  }
  function resetAll() {
    var form = $('ca-form');
    form.reset(); form.classList.remove('was-checked');
    files = []; renderFiles(); renderDocs(); showError('');
    $('ca-h-files').innerHTML = ''; $('ca-h-links').value = ''; $('ca-h-folder').value = '';
    $('ca-file').disabled = false;
    $('ca-scheme-msg').hidden = true; $('ca-file-msg').hidden = true;
  }
  function showSentFromUrl() {                                 // 'post' 방식으로 돌아왔을 때
    var m = location.search.match(/[?&]caSent=([\w-]+)/); if (!m) return;
    var tab = document.getElementById('tab-qual'); if (tab) tab.click();
    openDone(decodeURIComponent(m[1]));
    if (history.replaceState) history.replaceState(null, '', location.pathname + '#apply');
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('ca-form')) return;
    try {
      build(); bindDrop(); renderFiles();
      $('ca-form').addEventListener('submit', handleSubmit);
      $('ca-form').addEventListener('reset', function () { setTimeout(resetAll, 0); });
      $('ca-form').addEventListener('change', function (e) {
        if (e.target.name === '신청 유형' || e.target.name === '신청 등급') renderDocs();
        if (e.target.hasAttribute('data-scheme')) $('ca-scheme-msg').hidden = true;
      });
      $('ca-done-ok').addEventListener('click', closeDone);
      $('ca-done').addEventListener('cancel', function (e) { e.preventDefault(); closeDone(); });
      setTimeout(showSentFromUrl, 0);
    } catch (err) {
      if (window.console) console.error('[KAR] 자격인증 신청 오류 — data.js 의 KAR.certApply 를 확인하세요.', err);
    }
  });
})();
