/* ==========================================================================
   한국심사자격인증원 — 자격인증 신청 (Firebase Storage + FormSubmit)
   --------------------------------------------------------------------------
   처리 순서
     1) 입력값·첨부파일 검사 (확장자 .pdf .hwp .docx .xlsx .jpg / 파일당 30MB / 최대 3개)
     2) 파일을 Firebase Storage 에 업로드 (로그인 없음, REST 방식 — 외부 스크립트 불필요)
        → 업로드 결과의 다운로드 토큰으로 '다운로드 URL' 생성
     3) 신청 내용 + 다운로드 URL 을 FormSubmit 으로 전송 → 신청 유형별 담당자 메일 수신
     4) "접수가 완료되었습니다." 팝업

   ※ 설정값(Firebase 키 · 받는 메일)은 data.js → KAR.certApply 에서만 바꿉니다.
     이 파일은 고칠 필요가 없습니다.
   ========================================================================== */
(function () {
  'use strict';
  var K = window.KAR || {};
  var CFG = K.certApply;
  if (!CFG) return;

  var FIREBASE_API = 'https://firebasestorage.googleapis.com/v0/b/';
  var FORMSUBMIT_API = 'https://formsubmit.co/ajax/';
  var MB = 1024 * 1024;

  // 확장자 → 업로드 시 지정할 파일 형식(MIME). Firebase 보안 규칙(storage.rules)과 같아야 합니다.
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
  function fmtSize(b) {
    return b >= MB ? (b / MB).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
  }
  function extOf(name) {
    var m = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
    return m ? m[0] : '';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function randHex(len) {
    var a = new Uint8Array(Math.ceil(len / 2));
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').slice(0, len);
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  /* ---------- 설정 확인 ---------- */
  var bucket = String((CFG.firebaseConfig || {}).storageBucket || '').trim()
    .replace(/^gs:\/\//, '').replace(/\/+$/, '');
  var configured = bucket && !/프로젝트ID|여기에/.test(bucket);

  /* ---------- 신청 유형 · 등급별 제출 서류 안내 (data.js → KAR.requiredDocs 재사용) ---------- */
  function findRows(titleWord) {
    var g = (K.requiredDocs || []).filter(function (x) { return x.title.indexOf(titleWord) > -1; })[0];
    return g ? g.rows : [];
  }
  function pickRow(rows, word) {
    return rows.filter(function (r) { return r[0].indexOf(word) > -1; })[0];
  }
  function docsFor(type, grade) {
    if (!type) return null;
    var row;
    if (type === '신규 등록' || type === '승급') {
      var reg = findRows('등록');
      if (grade === '심사원보') row = pickRow(reg, '심사원보');
      else if (grade === '검증심사원') row = pickRow(reg, '검증');
      else if (grade) row = pickRow(reg, '선임');
    } else if (type === '갱신') {
      var ren = findRows('갱신');
      if (grade === '심사원보') row = pickRow(ren, '심사원보');
      else if (grade) row = pickRow(ren, '이상');
    } else if (type === '전환') {
      row = pickRow(findRows('기타'), '전환');
    } else if (type === '심사수행범위 추가') {
      row = pickRow(findRows('기타'), '심사수행범위');
    }
    return row || null;
  }
  function renderDocs() {
    var type = (document.querySelector('input[name="신청 유형"]:checked') || {}).value;
    var grade = $('ca-grade').value;
    var box = $('ca-docs'), row = docsFor(type, grade);
    if (!row) {
      box.innerHTML = '<p class="ca-docs__empty">' + (type && !grade && type !== '전환' && type !== '심사수행범위 추가'
        ? '신청 등급을 선택하면 제출 서류가 안내됩니다.'
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
    $('ca-types').innerHTML = (CFG.types || []).map(function (t, i) {
      return '<label class="ca-chip"><input type="radio" name="신청 유형" value="' + esc(t) + '" required' +
        (i === 0 ? '' : '') + '><span>' + esc(t) + '</span></label>';
    }).join('');
    $('ca-grade').insertAdjacentHTML('beforeend', (CFG.grades || []).map(function (g) {
      return '<option value="' + esc(g) + '">' + esc(g) + '</option>';
    }).join(''));
    $('ca-schemes').innerHTML = (CFG.schemes || []).map(function (s) {
      return '<label class="ca-check"><input type="checkbox" name="인증 스킴" value="' + esc(s) + '"><span>' + esc(s) + '</span></label>';
    }).join('');
    $('ca-drop-hint').textContent = (CFG.accept || []).join(' ') + ' · 파일당 ' + CFG.maxFileMB + 'MB 이하 · 최대 ' + CFG.maxFiles + '개';
    $('ca-file').setAttribute('accept', (CFG.accept || []).join(','));
    $('ca-foot').innerHTML = (CFG.footnotes || []).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
    if (!configured) $('ca-setup').hidden = false;
  }

  /* ---------- 첨부파일 (드래그 앤 드롭 + 클릭) ---------- */
  var files = [];
  function addFiles(list) {
    var allowed = (CFG.accept || []).map(function (x) { return x.toLowerCase(); });
    Array.prototype.forEach.call(list, function (f) {
      var ext = extOf(f.name);
      if (allowed.indexOf(ext) < 0) {                       // ① 확장자 필터
        toast('「' + f.name + '」은(는) 올릴 수 없는 형식입니다. (' + allowed.join(' ') + ' 만 가능)'); return;
      }
      if (f.size > CFG.maxFileMB * MB) {                     // ② 파일 1개당 용량 제한
        toast('「' + f.name + '」은(는) ' + fmtSize(f.size) + '로, 파일당 ' + CFG.maxFileMB + 'MB를 넘습니다.'); return;
      }
      if (f.size === 0) { toast('「' + f.name + '」은(는) 빈 파일입니다.'); return; }
      if (files.some(function (x) { return x.name === f.name && x.size === f.size; })) return; // 같은 파일 중복
      if (files.length >= CFG.maxFiles) {                    // ③ 개수 제한
        toast('파일은 최대 ' + CFG.maxFiles + '개까지 첨부할 수 있습니다. 여러 서류는 PDF 1개로 합쳐 주세요.'); return;
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
    if (files.length) $('ca-file-msg').hidden = true;
  }
  function bindDrop() {
    var dz = $('ca-drop'), input = $('ca-file');
    dz.addEventListener('click', function () { input.click(); });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
    });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });
    $('ca-filelist').addEventListener('click', function (e) {
      var b = e.target.closest('.fi-del'); if (!b) return;
      files.splice(+b.dataset.i, 1); renderFiles();
    });
  }

  /* ---------- Firebase Storage 업로드 (REST) ---------- */
  // 저장 위치 : applications/2026-11-08/KAR-20261108-143015-ab12_<무작위16자>/1_파일명.pdf
  //   - 폴더 이름에 무작위 문자열을 넣어 다른 사람이 주소를 추측할 수 없게 합니다.
  function safeName(n) { return String(n).replace(/[\\/:*?"<>|#%\[\]\u0000-\u001f]/g, '_').slice(-120); }
  function uploadOne(file, path, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', FIREBASE_API + encodeURIComponent(bucket) + '/o?uploadType=media&name=' + encodeURIComponent(path));
      xhr.setRequestHeader('Content-Type', MIME[extOf(file.name)] || 'application/octet-stream');
      xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        var j = {}; try { j = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(j);
        else reject(new Error(xhr.status === 403 ? 'FIREBASE_RULES' : 'FIREBASE_' + xhr.status));
      };
      xhr.onerror = function () { reject(new Error('FIREBASE_NETWORK')); };
      xhr.send(file);
    });
  }
  function downloadUrl(meta, path) {
    var tokenP = meta && meta.downloadTokens
      ? Promise.resolve(meta.downloadTokens)
      // 업로드 응답에 토큰이 없으면 파일 정보를 한 번 더 조회합니다(보안 규칙의 allow get 필요).
      : fetch(FIREBASE_API + encodeURIComponent(bucket) + '/o/' + encodeURIComponent(path), { credentials: 'omit' })
          .then(function (r) { return r.ok ? r.json() : {}; })
          .then(function (j) { return j.downloadTokens || ''; });
    return tokenP.then(function (tokens) {
      var token = String(tokens || '').split(',')[0];
      return FIREBASE_API + encodeURIComponent(bucket) + '/o/' + encodeURIComponent(path) +
        '?alt=media' + (token ? '&token=' + encodeURIComponent(token) : '');
    });
  }

  /* ---------- 제출 ---------- */
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
    if (m === 'FIREBASE_RULES') return '파일 업로드가 거부되었습니다. 파일 형식·용량을 확인해 주세요.' + tail;
    if (m.indexOf('FIREBASE') === 0) return '파일 업로드 중 문제가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.' + tail;
    if (m === 'NOT_ACTIVATED') return '접수 메일 주소의 사용 승인(활성화)이 아직 완료되지 않았습니다. 담당자에게 알려 주세요.' + tail;
    return '신청서를 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.' + tail;
  }
  function validate(form) {
    form.classList.add('was-checked');
    var ok = form.checkValidity();
    var schemeOk = !!form.querySelector('input[name="인증 스킴"]:checked');
    $('ca-scheme-msg').hidden = schemeOk;
    $('ca-file-msg').hidden = files.length > 0;
    if (!ok) { var bad = form.querySelector(':invalid'); if (bad) { bad.focus(); if (bad.reportValidity) bad.reportValidity(); } }
    else if (!schemeOk) $('ca-schemes').scrollIntoView({ block: 'center', behavior: 'smooth' });
    else if (!files.length) $('ca-drop').focus();
    return ok && schemeOk && files.length > 0;
  }

  function submit(e) {
    e.preventDefault();
    var form = $('ca-form');
    showError('');
    if (!validate(form)) return;
    if ($('ca-honey').value) return;                         // 로봇 제출은 무시

    var v = function (n) { var x = form.querySelector('[name="' + n + '"]'); return x ? x.value.trim() : ''; };
    var type = (form.querySelector('input[name="신청 유형"]:checked') || {}).value;
    var route = (CFG.routes || {})[type];
    var schemes = Array.prototype.map.call(form.querySelectorAll('input[name="인증 스킴"]:checked'), function (x) { return x.value; });
    var now = new Date();
    var ymd = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
    var applyNo = 'KAR-' + ymd + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '-' + randHex(4).toUpperCase();
    var folder = (CFG.storageFolder || 'applications') + '/' + ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6) +
      '/' + applyNo + '_' + randHex(16);

    setLoading(true);
    var total = files.reduce(function (s, f) { return s + f.size; }, 0), done = 0;
    var links = [];

    var chain = Promise.resolve();
    if (!configured) chain = Promise.reject(new Error('NOT_CONFIGURED'));
    if (!route || !route.to) chain = Promise.reject(new Error('NOT_CONFIGURED'));

    // ① 파일을 하나씩 Firebase Storage 에 업로드
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        var path = folder + '/' + (i + 1) + '_' + safeName(f.name);
        return uploadOne(f, path, function (r) {
          progress('파일 업로드 중 (' + (i + 1) + '/' + files.length + ') · ' + f.name, (done + f.size * r) / total * 0.9);
        }).then(function (meta) { return downloadUrl(meta, path); })
          .then(function (url) { done += f.size; links.push({ name: f.name, size: f.size, url: url }); });
      });
    });

    // ② 신청 내용 + 다운로드 링크 → FormSubmit
    chain.then(function () {
      progress('신청서 전송 중…', 0.95);
      var fd = new FormData();
      fd.append('_subject', (CFG.subjectPrefix || '') + ' ' + type + ' · ' + v('신청 등급') + ' · ' + v('성명') + ' (' + applyNo + ')');
      fd.append('_template', 'table');
      fd.append('_captcha', 'false');
      fd.append('_replyto', v('이메일'));                    // 메일 '답장' → 신청인
      fd.append('접수번호', applyNo);
      fd.append('신청 유형', type);
      fd.append('신청 등급', v('신청 등급'));
      fd.append('인증 스킴', schemes.join(', '));
      fd.append('성명', v('성명'));
      fd.append('생년월일', v('생년월일'));
      fd.append('연락처', v('연락처'));
      fd.append('이메일', v('이메일'));
      links.forEach(function (l, i) {
        fd.append('증빙서류 ' + (i + 1), l.name + ' (' + fmtSize(l.size) + ')\n' + l.url);
      });
      fd.append('파일 보관 안내', '첨부 링크는 업로드 후 ' + (CFG.keepDays || 30) + '일이 지나면 자동 삭제되어 열리지 않습니다. 기간 안에 내려받아 보관해 주세요.');
      return fetch(FORMSUBMIT_API + route.to, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) {
          if (j.success === true || j.success === 'true') return;
          if (/activat/i.test(String(j.message || ''))) throw new Error('NOT_ACTIVATED');
          throw new Error('FORMSUBMIT');
        });
    }).then(function () {
      progress('완료', 1);
      setLoading(false);
      openDone(applyNo);
    }).catch(function (err) {
      setLoading(false);
      showError(errText(err));
    });
  }

  /* ---------- 접수 완료 팝업 ---------- */
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
    document.getElementById('panel-qual').scrollIntoView({ behavior: 'smooth' });
  }
  function resetAll() {
    var form = $('ca-form');
    form.reset(); form.classList.remove('was-checked');
    files = []; renderFiles(); renderDocs(); showError('');
    $('ca-scheme-msg').hidden = true; $('ca-file-msg').hidden = true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('ca-form')) return;
    try {
      build(); bindDrop();
      $('ca-form').addEventListener('submit', submit);
      $('ca-form').addEventListener('reset', function () { setTimeout(resetAll, 0); });
      $('ca-form').addEventListener('change', function (e) {
        if (e.target.name === '신청 유형' || e.target.name === '신청 등급') renderDocs();
        if (e.target.name === '인증 스킴') $('ca-scheme-msg').hidden = true;
      });
      $('ca-done-ok').addEventListener('click', closeDone);
      $('ca-done').addEventListener('cancel', function (e) { e.preventDefault(); closeDone(); });
    } catch (err) {
      if (window.console) console.error('[KAR] 자격인증 신청 오류 — data.js 의 KAR.certApply 를 확인하세요.', err);
    }
  });
})();
