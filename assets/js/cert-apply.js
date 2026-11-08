/* ==========================================================================
   한국심사자격인증원 — 자격인증 신청 (Firebase Storage + FormSubmit)
   --------------------------------------------------------------------------
   ┌ 관리자가 바꾸는 곳 (이 파일은 고치지 않습니다) ───────────────────────┐
   │ ★ Firebase Config      : data.js → KAR.certApply.firebaseConfig       │
   │                          (storageBucket 필수)                          │
   │ ★ FormSubmit 받는 메일 : data.js → KAR.certApply.routes               │
   │                          (신청 유형별 Action 이메일 주소)               │
   └────────────────────────────────────────────────────────────────────────┘

   처리 순서 (async / await 로 한 단계씩 끝난 뒤 다음 단계 진행)
     ① 입력값 · 첨부파일 검사
     ② 파일을 Firebase Storage 에 하나씩 업로드  → await
     ③ 업로드된 파일마다 다운로드 URL 확보         → await
        (URL 이 하나라도 없으면 메일을 보내지 않고 오류 안내)
     ④ 다운로드 URL 을 폼의 숨김 input 에 대입
          <input type="hidden" name="첨부파일_링크">        : 전체 링크
          <input type="hidden" name="첨부파일1_링크"> …     : 파일별 링크
     ⑤ 숨김 input 까지 채워진 폼 전체(new FormData(form))를 FormSubmit 으로 전송 → await
     ⑥ "접수가 완료되었습니다." 팝업
   ========================================================================== */
(function () {
  'use strict';
  var K = window.KAR || {};
  var CFG = K.certApply;
  if (!CFG) return;

  var FIREBASE_API = 'https://firebasestorage.googleapis.com/v0/b/';
  var FORMSUBMIT = 'https://formsubmit.co/';
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
  var bucket = String((CFG.firebaseConfig || {}).storageBucket || '').trim()
    .replace(/^gs:\/\//, '').replace(/\/+$/, '');
  var configured = !!bucket && !/프로젝트ID|여기에/.test(bucket);

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
      if (files.some(function (x) { return x.name === f.name && x.size === f.size; })) return;
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

  /* ---------- ② Firebase Storage 업로드 (파일 1개) ---------- */
  //   저장 위치 : applications/2026-11-08/KAR-20261108-143015-AB12_<무작위16자>/KAR-20261108-143015-AB12_1.pdf
  function objectUrl(path) { return FIREBASE_API + encodeURIComponent(bucket) + '/o/' + encodeURIComponent(path); }

  function uploadFile(file, path, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', FIREBASE_API + encodeURIComponent(bucket) + '/o?uploadType=media&name=' + encodeURIComponent(path));
      xhr.setRequestHeader('Content-Type', MIME[extOf(file.name)] || 'application/octet-stream');
      xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        var j = {}; try { j = JSON.parse(xhr.responseText || '{}'); } catch (e) { /* 무시 */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(j);
        else reject(new Error(xhr.status === 403 ? 'FIREBASE_RULES' : 'FIREBASE_' + xhr.status));
      };
      xhr.onerror = function () { reject(new Error('FIREBASE_NETWORK')); };
      xhr.send(file);
    });
  }

  /* ---------- ③ 다운로드 URL 확보 ---------- */
  //   업로드 응답(meta)의 downloadTokens 로 URL 을 만들고,
  //   응답에 토큰이 없으면 파일 정보를 다시 조회(GET)해 토큰을 받아옵니다(보안 규칙 allow get 필요).
  async function getDownloadUrl(meta, path) {
    var token = meta && meta.downloadTokens ? String(meta.downloadTokens).split(',')[0] : '';
    var readable = false;                                   // 보안 규칙 allow get 으로 토큰 없이도 열 수 있는지
    if (!token) {
      for (var t = 0; t < 3 && !token; t++) {              // 최대 3번 재시도
        if (t) await new Promise(function (r) { setTimeout(r, 700); });
        try {
          var res = await fetch(objectUrl(path), { credentials: 'omit' });
          if (res.ok) {
            readable = true;
            var j = await res.json();
            token = j.downloadTokens ? String(j.downloadTokens).split(',')[0] : '';
          } else log('파일 정보 조회 실패(HTTP ' + res.status + ') — 보안 규칙의 allow get 을 확인하세요', path);
        } catch (e) { log('파일 정보 조회 오류', String(e)); }
      }
    }
    if (token) return objectUrl(path) + '?alt=media&token=' + encodeURIComponent(token);
    if (readable) { log('토큰이 없어 allow get 규칙으로 여는 링크를 사용합니다', path); return objectUrl(path) + '?alt=media'; }
    throw new Error('LINK_MISSING');
  }

  /* ---------- ②+③ 모든 파일 업로드 → 링크 목록 ---------- */
  async function uploadAll(folder, applyNo) {
    var total = files.reduce(function (s, f) { return s + f.size; }, 0), done = 0, links = [];
    for (var i = 0; i < files.length; i++) {                // 순서대로 하나씩 await
      // 저장 파일 이름은 영문·숫자만 사용 → 메일 속 링크가 짧고 깨지지 않음 (원래 파일 이름은 '첨부파일N_이름' 에 표시)
      //   예) .../KAR-20261108-143015-AB12_2.pdf
      var f = files[i], path = folder + '/' + applyNo + '_' + (i + 1) + extOf(f.name);
      log('업로드 시작 (' + (i + 1) + '/' + files.length + ')', path);
      var meta = await uploadFile(f, path, function (r) {
        progress('파일 업로드 중 (' + (i + 1) + '/' + files.length + ') · ' + f.name, (done + f.size * r) / total * 0.85);
      });
      log('업로드 완료 · 응답', { name: meta.name, size: meta.size, downloadTokens: meta.downloadTokens ? '있음' : '없음' });
      progress('다운로드 링크 만드는 중 (' + (i + 1) + '/' + files.length + ')', (done + f.size) / total * 0.9);
      var url = await getDownloadUrl(meta, path);
      log('다운로드 URL', url);
      done += f.size;
      links.push({ name: f.name, size: f.size, url: url });
    }
    return links;
  }

  /* ---------- ④ 다운로드 URL 을 숨김 input 에 대입 ---------- */
  function fillHiddenInputs(form, info, links) {
    $('ca-h-subject').value = (CFG.subjectPrefix || '') + ' ' + info.type + ' · ' + info.grade + ' · ' + info.name + ' (' + info.applyNo + ')';
    $('ca-h-replyto').value = info.email;                   // 메일 '답장' → 신청인
    $('ca-h-no').value = info.applyNo;
    $('ca-h-schemes').value = info.schemes.join(', ');
    // ★ 전체 링크 : <input type="hidden" name="첨부파일_링크">  (줄바꿈 없이 ' , ' 로 구분)
    $('ca-h-links').value = links.map(function (l) { return l.url; }).join(' , ');
    // ★ 파일별 숨김 input : 첨부파일1_이름 / 첨부파일1_링크 …
    var box = $('ca-h-files'); box.innerHTML = '';
    links.forEach(function (l, i) {
      [['첨부파일' + (i + 1) + '_이름', l.name + ' (' + fmtSize(l.size) + ')'], ['첨부파일' + (i + 1) + '_링크', l.url]].forEach(function (kv) {
        var h = document.createElement('input');
        h.type = 'hidden'; h.name = kv[0]; h.value = kv[1];
        box.appendChild(h);
      });
    });
    var keep = document.createElement('input');
    keep.type = 'hidden'; keep.name = '파일 보관 안내';
    keep.value = '첨부 링크는 업로드 후 ' + (CFG.keepDays || 30) + '일이 지나면 자동 삭제되어 열리지 않습니다. 기간 안에 내려받아 보관해 주세요.';
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
    if (m === 'FIREBASE_RULES') return '파일 업로드가 거부되었습니다. 파일 형식·용량을 확인해 주세요.' + tail;
    if (m === 'LINK_MISSING') return '업로드한 파일의 다운로드 링크를 만들지 못해 신청서를 보내지 않았습니다. 잠시 후 다시 시도해 주세요.' + tail;
    if (m.indexOf('FIREBASE') === 0) return '파일 업로드 중 문제가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.' + tail;
    if (m === 'NOT_ACTIVATED') return '접수 메일 주소의 사용 승인(활성화)이 아직 완료되지 않았습니다. 담당자에게 알려 주세요.' + tail;
    return '신청서를 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.' + tail;
  }
  function validate(form) {
    form.classList.add('was-checked');
    var ok = form.checkValidity();
    var schemeOk = !!form.querySelector('input[data-scheme]:checked');
    $('ca-scheme-msg').hidden = schemeOk;
    $('ca-file-msg').hidden = files.length > 0;
    if (!ok) { var bad = form.querySelector(':invalid'); if (bad) { bad.focus(); if (bad.reportValidity) bad.reportValidity(); } }
    else if (!schemeOk) $('ca-schemes').scrollIntoView({ block: 'center', behavior: 'smooth' });
    else if (!files.length) $('ca-drop').focus();
    return ok && schemeOk && files.length > 0;
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
    var folder = (CFG.storageFolder || 'applications') + '/' + ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6) +
      '/' + info.applyNo + '_' + randHex(16);

    busy = true; setLoading(true);
    var navigating = false;
    try {
      if (!configured || !route || !route.to) throw new Error('NOT_CONFIGURED');
      log('접수번호 ' + info.applyNo + ' · 받는 메일 ' + route.to);

      var links = await uploadAll(folder, info.applyNo);                    // ②③ 업로드 + URL (모두 끝날 때까지 대기)
      if (links.length !== files.length || links.some(function (l) { return !l.url; })) throw new Error('LINK_MISSING');

      fillHiddenInputs(form, info, links);                    // ④ 숨김 input 에 링크 대입
      progress('신청서 전송 중…', 0.95);

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
    $('ca-h-files').innerHTML = ''; $('ca-h-links').value = '';
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
      build(); bindDrop();
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
