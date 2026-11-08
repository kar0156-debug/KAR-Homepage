/* ==========================================================================
   한국심사자격인증원 임시 홈페이지 — 화면 동작
   ※ 내용 수정은 data.js 에서 합니다. 이 파일은 고칠 필요가 없습니다.
   ========================================================================== */
(function () {
  'use strict';
  var K = window.KAR || {};
  var S = K.settings || {};
  var C = K.contact || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 공통 도우미 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === false || attrs[k] == null) return;
      e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    if (html != null) e.innerHTML = html;
    return e;
  }
  // 파일 주소: http로 시작하면 그대로, 아니면 settings.fileBase + 경로
  function fileUrl(p) {
    if (/^https?:\/\//.test(p)) return p;
    return (S.fileBase || '') + encodeURI(p).replace(/#/g, '%23');
  }
  function fileExt(p) {
    var m = decodeURIComponent(p).toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/);
    return m ? m[1] : 'file';
  }
  function fileName(p) {
    try { return decodeURIComponent(p.split('/').pop().split('?')[0]); } catch (e) { return p; }
  }
  function today() {
    var d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }
  function parseDate(s) {
    if (!s) return null;
    var m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(s) { return String(s || '').replace(/-/g, '.'); }
  function rich(s) { // **굵게 빨강** 표시
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }
  function mailto(addr, subject, body) {
    return 'mailto:' + addr + '?subject=' + encodeURIComponent(subject || '') + (body ? '&body=' + encodeURIComponent(body) : '');
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function copy(text) {
    function done() { toast('복사했습니다 : ' + text); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.className = 'sr'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast(text); }
      document.body.removeChild(ta);
    }
  }
  // 이전 게시물 본문 HTML 불러오기 (같은 사이트의 content 폴더)
  var cache = {};
  function loadDoc(path) {
    if (cache[path]) return Promise.resolve(cache[path]);
    // 게시글 본문 모음(data/notice-bodies.js)에 있으면 그것을 사용 — PC에서 파일을 직접 열어도 보임
    var NB = K.noticeBodies || {};
    if (NB[path]) return Promise.resolve(cache[path] = NB[path]);
    return fetch(encodeURI(path), { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (t) { cache[path] = t; return t; });
  }
  function fillDoc(target, path) {
    target.innerHTML = '<p class="doc-loading">불러오는 중…</p>';
    return loadDoc(path).then(function (html) {
      target.innerHTML = html;
      $$('a', target).forEach(function (a) { a.target = '_blank'; a.rel = 'noopener'; });
      $$('table', target).forEach(function (tb) { // 넓은 표는 가로 스크롤
        if (tb.parentNode.classList.contains('tbl-scroll') || tb.classList.contains('kf-table')) return;
        var w = el('div', { 'class': 'tbl-scroll' }); tb.parentNode.insertBefore(w, tb); w.appendChild(tb);
      });
    }).catch(function () {
      target.innerHTML = '<p class="doc-loading">본문을 불러오지 못했습니다. 잠시 후 다시 시도하거나 ' + esc(C.tel) + '로 문의해 주세요.</p>';
    });
  }
  // 탭 공통 (키보드 좌우 이동 지원)
  function bindTabs(box, onSelect) {
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[role="tab"]'); if (!b) return;
      select(b);
    });
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tabs = $$('button[role="tab"]', box), i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); select(n);
    });
    function select(b) {
      $$('button[role="tab"]', box).forEach(function (x) {
        var on = x === b; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1;
      });
      onSelect(b);
    }
    return select;
  }

  /* ---------- 1. 기본 정보 채우기 ---------- */
  function initBasics() {
    var period = (S.maintenanceStart ? S.maintenanceStart + '부터 ' : '') + (S.maintenancePeriod || '약 2~3개월') + '간';
    $('#mt-period').textContent = period;
    $('#ft-addr').textContent = C.name + ' · ' + C.address + ' · 전화 ' + C.tel + ' · 팩스 ' + C.fax + ' · 이메일 ' + C.email;
    $('#ft-updated').textContent = fmtDate(S.lastUpdated);
    $$('.js-address').forEach(function (e) { e.textContent = '(' + C.postcode + ') ' + C.address; });

    var desks = C.desks || [];
    var qual = desks[0] || {}, edu = desks[1] || {};
    $$('.js-qual-mail').forEach(function (e) { e.textContent = qual.email; });
    $$('.js-edu-mail').forEach(function (e) { e.textContent = edu.email; });
    $$('.js-edu-mailto').forEach(function (a) {
      a.href = mailto(edu.email, '[교육신청] 교육명 / 성명', '교육명:\n성명:\n연락처:\n\n※ 작성한 신청서(HWP)를 첨부해 주세요.');
      a.textContent = '✉ 신청서 메일 보내기 (' + edu.email + ')';
    });
    $$('.js-copy').forEach(function (b) { if (b.dataset.copy === 'edu@kar.re.kr') b.dataset.copy = edu.email; });
    var acc = K.accounts || [];
    if (acc[1]) $$('.js-edu-account').forEach(function (e) { e.textContent = acc[1].bank + ' ' + acc[1].number + ' (예금주 : ' + acc[1].holder + ')'; });
    if (acc[0]) $$('.js-qual-account').forEach(function (e) { e.textContent = acc[0].bank + ' ' + acc[0].number; });

  }

  /* ---------- 1-1. 찾아오시는 길 (KAR 소개 > 찾아오시는 길 탭) ---------- */
  function renderContact(root) {
    root.innerHTML = '';
    root.appendChild(document.importNode($('#tpl-contact').content, true));
    var kv = $('#contact-kv', root), desks = C.desks || [];
    [['주소', '(' + C.postcode + ') ' + C.address], ['전화', C.tel], ['팩스', C.fax], ['이메일', C.email], ['운영', C.hours]]
      .forEach(function (r) { kv.appendChild(el('dt', null, esc(r[0]))); kv.appendChild(el('dd', null, esc(r[1]))); });
    var q = encodeURIComponent('가산디지털1로 168 우림라이온스밸리');
    $('#map-btns', root).innerHTML =
      '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://map.naver.com/p/search/' + q + '">네이버 지도</a>' +
      '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://map.kakao.com/?q=' + q + '">카카오맵</a>' +
      '<button class="btn btn-line btn-sm js-copy" type="button" data-copy="' + esc(C.address) + '">주소 복사</button>';
    var tb = $('#desk-list', root);
    desks.forEach(function (d) {
      tb.appendChild(el('tr', null, '<td>' + esc(d.task) + '</td><td><a href="mailto:' + esc(d.email) + '">' + esc(d.email) + '</a><br>' + esc(d.tel) + '</td>'));
    });
  }

  /* ---------- 1-2. KAR 소개 ---------- */
  var selectAboutTab;
  function initAbout() {
    // 각 탭 내용은 index.html 안에 들어 있고, 여기서는 보이기/숨기기만 합니다.
    var tabs = $('#about-tabs'), contact = $('#about-p-contact');
    if (contact) renderContact(contact);
    selectAboutTab = bindTabs(tabs, function (b) {
      $$('#about .about-panel').forEach(function (p) { p.hidden = p.id !== b.getAttribute('aria-controls'); });
    });
  }

  /* ---------- 2. 온라인 신청 (FormSubmit) ----------
     - 폼 구성은 data.js 의 KAR.onlineForms 에서 읽어 자동으로 그립니다.
     - 제출 : FormSubmit AJAX 주소(endpoint)로 입력값 + 첨부파일을 보내면 담당자 메일로 도착합니다.
     - 이 영역은 고칠 필요가 없습니다. 주소·항목 변경은 data.js 에서 하세요. */
  var selectApplyTab;
  var FS = K.formSubmit || {};
  var MAX_BYTES = (FS.maxTotalMB || 10) * 1024 * 1024;
  var MAX_FILES = FS.maxFiles || 5;
  var ACCEPT = FS.accept || [];
  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }
  var uid = 0;
  function fieldHtml(f, fid) {
    var id = fid + '-f' + (++uid);
    var name = esc(f.label);
    var req = f.required ? ' required' : '';
    var star = f.required ? '<em class="req" aria-hidden="true">*</em><span class="sr">(필수)</span>' : '';
    var desc = f.desc ? '<p class="of-desc" id="' + id + '-d">' + esc(f.desc).replace(/\n/g, '<br>') + '</p>' : '';
    var dby = f.desc ? ' aria-describedby="' + id + '-d"' : '';
    var ph = f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '';
    var show = f.showIf ? ' data-show-field="' + esc(f.showIf.field) + '" data-show-value="' + esc(f.showIf.value) + '"' : '';
    if (f.type === 'section') {
      return '<div class="of-section"' + show + '><h4>' + esc(f.title) + '</h4>' + (f.desc ? '<p>' + esc(f.desc).replace(/\n/g, '<br>') + '</p>' : '') + '</div>';
    }
    var inner = '';
    if (f.type === 'radio') {
      inner = '<fieldset class="of-field" data-label="' + name + '"' + show + '><legend>' + name + star + '</legend>' + desc +
        '<div class="of-choices">' + f.options.map(function (o, i) {
          return '<label class="of-choice"><input type="radio" name="' + name + '" value="' + esc(o) + '"' + (i === 0 ? req : '') + dby + '><span>' + esc(o) + '</span></label>';
        }).join('') + '</div></fieldset>';
      return inner;
    }
    if (f.type === 'agree') {
      return '<fieldset class="of-field of-agree" data-label="' + name + '"' + show + '><legend>' + name + star + '</legend>' +
        '<div class="of-pledge" tabindex="0" role="region" aria-label="' + name + ' 내용">' + esc(f.desc || '').replace(/\n/g, '<br>') + '</div>' +
        '<label class="of-choice of-choice--agree"><input type="checkbox" name="' + name + '" value="' + esc(f.agreeText || '동의') + '"' + req + '><span>' + esc(f.agreeText || '동의') + '합니다</span></label></fieldset>';
    }
    var control;
    if (f.type === 'select') {
      control = '<select id="' + id + '" name="' + name + '"' + req + dby + '><option value="">선택해 주세요</option>' +
        f.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
    } else if (f.type === 'textarea') {
      control = '<textarea id="' + id + '" name="' + name + '" rows="3"' + req + ph + dby + '></textarea>';
    } else {
      var type = f.type === 'date' ? 'date' : (f.type === 'email' ? 'email' : 'text');
      control = '<input id="' + id + '" type="' + type + '" name="' + (f.replyTo ? 'email' : name) + '"' + req + ph + dby +
        (type === 'email' ? ' autocomplete="email" inputmode="email"' : '') + (f.replyTo ? ' data-label="' + name + '"' : '') + '>';
    }
    return '<div class="of-field"' + show + '><label for="' + id + '">' + name + star + '</label>' + desc + control + '</div>';
  }
  function formHtml(f) {
    var hidden =
      '<input type="hidden" name="_subject" value="' + esc(f.subject || ('[홈페이지 온라인 신청] ' + f.title)) + '">' +
      '<input type="hidden" name="_template" value="' + esc(FS.template || 'table') + '">' +
      '<input type="hidden" name="_captcha" value="false">' +
      (f.cc ? '<input type="hidden" name="_cc" value="' + esc(f.cc) + '">' : '') +
      '<input type="hidden" name="신청 구분" value="' + esc(f.title) + '">' +
      // 자동 입력 로봇 차단용 숨김칸(사람에게는 보이지 않음)
      '<div class="of-hp" aria-hidden="true"><label>비워 두세요<input type="text" name="_honey" tabindex="-1" autocomplete="off"></label></div>';
    var drop = f.attach ?
      '<div class="of-field of-files"><span class="of-files__label" id="' + f.id + '-fl">첨부파일 <small>(선택)</small></span>' +
        '<div class="dropzone" tabindex="0" role="button" aria-describedby="' + f.id + '-fl ' + f.id + '-fh">' +
          '<input type="file" class="dropzone__input" multiple accept="' + esc(ACCEPT.join(',')) + '" tabindex="-1" aria-hidden="true">' +
          '<span class="dropzone__icon" aria-hidden="true"></span>' +
          '<strong>파일을 이곳에 끌어다 놓거나 <u>클릭하여 선택</u>하세요</strong>' +
          '<span class="dropzone__hint" id="' + f.id + '-fh">' + esc(f.attachHint || '') + (f.attachHint ? ' · ' : '') +
            '최대 ' + MAX_FILES + '개, 합계 ' + (FS.maxTotalMB || 10) + 'MB 이하 · ' + esc(ACCEPT.join(' ').replace(/\./g, '').toUpperCase()) + '</span>' +
        '</div>' +
        '<ul class="filelist" aria-live="polite"></ul>' +
        '<div class="filemeter" hidden><span class="filemeter__bar"><i></i></span><span class="filemeter__txt"></span></div>' +
      '</div>' : '';
    return '<form class="of-form" novalidate data-endpoint="' + esc(f.endpoint) + '">' + hidden +
      f.fields.map(function (x) { return fieldHtml(x, f.id); }).join('') + drop +
      '<p class="of-error" role="alert" hidden></p>' +
      '<div class="of-actions"><button type="submit" class="btn btn-navy of-submit"><span class="spin" aria-hidden="true"></span><span class="of-submit__txt">신청서 제출</span></button>' +
      '<button type="reset" class="btn btn-line">다시 쓰기</button></div>' +
      '</form>' +
      '<div class="of-done" role="status" tabindex="-1" hidden>' +
        '<span class="of-done__icon" aria-hidden="true">✓</span>' +
        '<h4>신청이 접수되었습니다</h4>' +
        '<p>담당자가 확인 후 연락드리겠습니다. 접수 확인이 필요하시면 ' + esc(C.tel) + ' 로 문의해 주세요.</p>' +
        '<button type="button" class="btn btn-line of-again">새 신청서 작성</button>' +
      '</div>';
  }

  // 조건부 항목 보이기/숨기기 (숨긴 항목은 입력을 꺼서 메일에 포함되지 않게 함)
  function updateVisibility(form) {
    var changed = true, guard = 0;
    while (changed && guard++ < 6) {
      changed = false;
      $$('[data-show-field]', form).forEach(function (el) {
        var fieldName = el.getAttribute('data-show-field'), want = el.getAttribute('data-show-value');
        var ctrl = $$('[name="' + CSS.escape(fieldName) + '"]', form).filter(function (c) { return !c.disabled; });
        var val = '';
        ctrl.forEach(function (c) { if (c.type === 'radio' || c.type === 'checkbox') { if (c.checked) val = c.value; } else val = c.value; });
        var on = val === want;
        if (el.hidden === on) { el.hidden = !on; changed = true; }
        $$('input,select,textarea', el).forEach(function (c) { if (c.disabled !== !on) { c.disabled = !on; changed = true; } });
      });
    }
  }

  // [예비 방식] FormSubmit 일반 전송 — data.js 의 KAR.formSubmit.mode 를 "post" 로 바꾸면 사용
  // (첨부파일이 메일에 오지 않는 등 AJAX 방식에 문제가 있을 때). 전송 후 이 페이지로 돌아와 완료 안내를 띄웁니다.
  function postSubmit(fd, endpoint, id) {
    var f2 = el('form', { method: 'POST', action: endpoint.replace('/ajax/', '/'), enctype: 'multipart/form-data', 'class': 'sr' });
    var dtMap = {};
    fd.forEach(function (v, k) {
      if (typeof v === 'string') { var i = el('input', { type: 'hidden', name: k }); i.value = v; f2.appendChild(i); }
      else { (dtMap[k] = dtMap[k] || new DataTransfer()).items.add(v); }
    });
    Object.keys(dtMap).forEach(function (k) { var fi = el('input', { type: 'file', name: k }); fi.files = dtMap[k].files; f2.appendChild(fi); });
    var next = el('input', { type: 'hidden', name: '_next' });
    next.value = location.href.split('#')[0].split('?')[0] + '?sent=' + encodeURIComponent(id) + '#apply';
    f2.appendChild(next);
    document.body.appendChild(f2); f2.submit();
  }
  function showSentFromUrl() {   // 일반 전송 후 돌아왔을 때 완료 안내
    var m = location.search.match(/[?&]sent=([\w-]+)/); if (!m) return;
    var b = $('#apply-tabs button[data-id="' + m[1] + '"]'); if (b && selectApplyTab) selectApplyTab(b);
    var panel = $('#panel-' + m[1]); if (!panel) return;
    $('.of-form', panel).hidden = true; $('.of-done', panel).hidden = false;
    if (history.replaceState) history.replaceState(null, '', location.pathname + '#apply');
  }

  function initApply() {
    var forms = K.onlineForms || [];
    var tabs = $('#apply-tabs'), panels = $('#apply-panels');
    var foot = K.formFootnotes || {};
    // index.html 에 직접 들어 있는 탭(자격인증 신청)을 맨 앞에 둡니다.
    var statics = $$('.apply-panel[data-static-tab]', panels);
    statics.forEach(function (p, i) {
      var id = p.id.replace(/^panel-/, '');
      tabs.appendChild(el('button', { role: 'tab', type: 'button', id: 'tab-' + id, 'aria-controls': p.id,
        'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? 0 : -1, 'data-id': id }, esc(p.dataset.staticTab)));
      p.hidden = i !== 0;
    });
    var off = statics.length;
    forms.forEach(function (f, j) {
      var i = j + off;
      tabs.appendChild(el('button', { role: 'tab', type: 'button', id: 'tab-' + f.id, 'aria-controls': 'panel-' + f.id,
        'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? 0 : -1, 'data-id': f.id }, esc(f.title)));
      var notes = (f.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
      var p = el('div', { 'class': 'apply-panel', role: 'tabpanel', id: 'panel-' + f.id, 'aria-labelledby': 'tab-' + f.id, hidden: i !== 0 });
      p.innerHTML =
        '<div class="apply-hd"><div><h3>' + esc(f.title) + '</h3><p>' + esc(f.desc) + '</p></div></div>' +
        (f.alert ? '<p class="apply-alert" role="note">' + esc(f.alert) + '</p>' : '') +
        (notes ? '<ul class="apply-notes">' + notes + '</ul>' : '') +
        '<div class="of-wrap" id="apply-form-' + esc(f.id) + '">' + formHtml(f) + '</div>' +
        '<ul class="priv">' + [foot.first, f.privacy, foot.last].filter(Boolean).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
      panels.appendChild(p);
      setupForm(p, f);
    });
    // '교육 신청' 탭 : 신청 폼 위에 교육 과정 안내(index.html 의 #edu-guide)를 넣습니다.
    var guide = $('#edu-guide'), eduPanel = $('#panel-edu');
    if (guide && eduPanel) eduPanel.insertBefore(guide, $('.apply-alert, .apply-notes, .of-wrap', eduPanel));
    selectApplyTab = bindTabs(tabs, function (b) {
      $$('.apply-panel', panels).forEach(function (p) { p.hidden = p.id !== b.getAttribute('aria-controls'); });
    });
    showSentFromUrl();
  }

  function setupForm(panel, f) {
    var form = $('.of-form', panel), done = $('.of-done', panel), err = $('.of-error', panel);
    var btn = $('.of-submit', form), btnTxt = $('.of-submit__txt', form);
    var files = [];
    updateVisibility(form);
    form.addEventListener('change', function () { updateVisibility(form); });
    form.addEventListener('reset', function () {
      files = []; renderFiles();
      setTimeout(function () { updateVisibility(form); err.hidden = true; }, 0);
    });

    // --- 파일 첨부 (드래그 앤 드롭 + 클릭) ---
    var dz = $('.dropzone', form), input = $('.dropzone__input', form), list = $('.filelist', form), meter = $('.filemeter', form);
    function total() { return files.reduce(function (s, x) { return s + x.size; }, 0); }
    function renderFiles() {
      if (!list) return;
      list.innerHTML = files.map(function (x, i) {
        return '<li><span class="fi-ext">' + esc((x.name.split('.').pop() || '').toUpperCase().slice(0, 4)) + '</span>' +
          '<span class="fi-name">' + esc(x.name) + '</span><span class="fi-size">' + fmtSize(x.size) + '</span>' +
          '<button type="button" class="fi-del" data-i="' + i + '" aria-label="' + esc(x.name) + ' 삭제">×</button></li>';
      }).join('');
      var t = total(), pct = Math.min(100, Math.round(t / MAX_BYTES * 100));
      meter.hidden = !files.length;
      $('i', meter).style.width = pct + '%';
      meter.classList.toggle('is-full', pct >= 90);
      $('.filemeter__txt', meter).textContent = '합계 ' + fmtSize(t) + ' / ' + (FS.maxTotalMB || 10) + 'MB (' + files.length + '/' + MAX_FILES + '개)';
    }
    function addFiles(fl) {
      var msgs = [];
      Array.prototype.forEach.call(fl, function (file) {
        var ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
        if (ACCEPT.length && ACCEPT.indexOf(ext) < 0) { msgs.push('「' + file.name + '」은(는) 첨부할 수 없는 형식입니다.'); return; }
        if (files.length >= MAX_FILES) { msgs.push('파일은 최대 ' + MAX_FILES + '개까지 첨부할 수 있습니다.'); return; }
        if (total() + file.size > MAX_BYTES) { msgs.push('「' + file.name + '」을(를) 더하면 합계 ' + (FS.maxTotalMB || 10) + 'MB를 넘습니다. 큰 파일은 담당자 이메일로 따로 보내 주세요.'); return; }
        if (files.some(function (x) { return x.name === file.name && x.size === file.size; })) return;
        files.push(file);
      });
      renderFiles();
      if (msgs.length) toast(msgs[0]);
    }
    if (dz) {
      dz.addEventListener('click', function () { input.click(); });
      dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
      });
      ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function () { dz.classList.remove('is-over'); });
      });
      dz.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer) addFiles(e.dataTransfer.files); });
      list.addEventListener('click', function (e) {
        var b = e.target.closest('.fi-del'); if (!b) return;
        files.splice(+b.dataset.i, 1); renderFiles();
      });
    }

    // --- 제출 ---
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      form.classList.add('was-checked');
      if (!form.checkValidity()) {
        var bad = $(':invalid', form);
        err.textContent = '입력하지 않았거나 형식이 맞지 않는 항목이 있습니다. 표시된 항목을 확인해 주세요.';
        err.hidden = false;
        if (bad) { bad.focus(); if (bad.reportValidity) bad.reportValidity(); }
        return;
      }
      var fd = new FormData(form);   // 숨긴(비활성) 항목은 자동으로 빠짐
      // 수신 이메일(회신 주소) 항목은 메일 표에 원래 이름으로도 표시
      $$('input[name="email"]:not(:disabled)', form).forEach(function (x) { if (x.dataset.label && x.value) fd.append(x.dataset.label, x.value); });
      files.forEach(function (file, i) { fd.append(i === 0 ? 'attachment' : 'attachment' + (i + 1), file, file.name); });
      if (fd.get('_honey')) return;   // 로봇으로 판단 — 조용히 무시
      btn.disabled = true; form.setAttribute('aria-busy', 'true'); btn.classList.add('is-loading');
      btnTxt.textContent = '제출 중...';
      if ((FS.mode || 'ajax') === 'post') { postSubmit(fd, form.dataset.endpoint, f.id); return; }
      fetch(form.dataset.endpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return { success: r.ok ? 'true' : 'false' }; }); })
        .then(function (j) {
          var ok = j && (j.success === true || j.success === 'true');
          if (!ok) throw new Error((j && j.message) || '전송 실패');
          form.reset(); files = []; renderFiles();
          form.hidden = true; done.hidden = false; done.focus();
        })
        .catch(function (x) {
          var m = String((x && x.message) || '');
          err.textContent = (/activ/i.test(m)
            ? '접수 메일 주소의 사용 승인(활성화)이 아직 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.'
            : '제출하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.') +
            ' 계속 안 되면 ' + C.tel + ' 로 연락하시거나 신청서를 ' + (f.fallbackEmail || C.email) + ' 로 보내 주세요.';
          err.hidden = false;
        })
        .then(function () {
          btn.disabled = false; form.removeAttribute('aria-busy'); btn.classList.remove('is-loading');
          btnTxt.textContent = '신청서 제출';
        });
    });
    $('.of-again', done).addEventListener('click', function () {
      done.hidden = true; form.hidden = false; updateVisibility(form);
      var first = $('input:not([type=hidden]),select,textarea', form); if (first) first.focus();
    });
  }

  /* ---------- 3. 교육 과정 카드 ---------- */
  function initCourses() {
    var box = $('#course-list'), now = today();
    var list = (K.courses || []).filter(function (c) {
      var end = parseDate(c.endDate); return !end || end >= now;
    });
    if (!list.length) { box.innerHTML = '<p class="empty">현재 모집 중인 교육이 없습니다. 공지사항을 확인해 주세요.</p>'; return; }
    var eduMail = ((C.desks || [])[1] || {}).email || C.email;
    list.forEach(function (c, i) {
      var dl = parseDate(c.deadline), closed = dl && dl < now;
      var card = el('article', { 'class': 'course' + (closed ? ' is-closed' : '') });
      var lines = (c.lines || []).map(function (l) {
        return '<li><span class="k">' + esc(l[0]) + '</span><span>' + rich(l[1]) + '</span></li>';
      }).join('');
      card.innerHTML =
        '<div class="course-hd"><span>' + (i + 1) + '. ' + esc(c.title) + '</span><span class="st' + (closed ? ' closed' : '') + '">' + (closed ? '접수 마감' : '접수 중') + '</span></div>' +
        '<ul>' + lines + '</ul>' +
        '<div class="deadline">신청기한 : ' + esc(c.deadlineText || fmtDate(c.deadline)) + '</div>' +
        '<div class="course-btns">' +
          (closed ? '<span class="btn" aria-disabled="true">접수 마감</span>'
                  : '<a class="btn btn-navy" href="#apply-form-edu">신청하기</a>') +
          (c.applyFile ? '<a class="btn btn-line" href="' + esc(fileUrl(c.applyFile)) + '" download>신청서 다운로드</a>' : '') +
          (c.detailUrl ? '<a class="btn btn-line" href="' + esc(c.detailUrl) + '" target="_blank" rel="noopener">자세히 보기</a>' : '') +
        '</div>';
      box.appendChild(card);
    });
  }

  /* ---------- 4. 서식 다운로드 ---------- */
  function initForms() {
    var cats = K.formCategories || [];
    var tabs = $('#form-tabs'), list = $('#form-list'), desc = $('#form-desc'), search = $('#form-search');
    var current = cats[0] && cats[0].id;
    cats.forEach(function (c, i) {
      var n = c.groups.reduce(function (s, g) { return s + g.items.length; }, 0);
      tabs.appendChild(el('button', { role: 'tab', type: 'button', 'data-id': c.id, 'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? 0 : -1 },
        esc(c.name) + ' <span class="small">(' + n + ')</span>'));
    });
    function hl(text, q) {
      if (!q) return esc(text);
      var i = text.toLowerCase().indexOf(q.toLowerCase());
      if (i < 0) return esc(text);
      return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
    }
    function render() {
      var q = search.value.trim();
      var src = q ? cats : cats.filter(function (c) { return c.id === current; });
      var html = '';
      var cat = cats.filter(function (c) { return c.id === current; })[0];
      desc.textContent = q ? '전체 분류에서 "' + q + '" 검색 결과입니다.' : (cat && cat.desc) || '';
      src.forEach(function (c) {
        c.groups.forEach(function (g) {
          var items = g.items.filter(function (it) { return !q || it.title.toLowerCase().indexOf(q.toLowerCase()) > -1; });
          if (!items.length) return;
          html += '<div class="fgroup"><h3>' + (q ? esc(c.name) + ' › ' : '') + esc(g.name) + '</h3><table class="ftable"><tbody>';
          items.forEach(function (it) {
            var btns = it.files.map(function (f) {
              var ext = fileExt(f);
              return '<a class="ftype ' + ext + '" href="' + esc(fileUrl(f)) + '" download="' + esc(fileName(f)) + '" aria-label="' + esc(it.title) + ' ' + ext.toUpperCase() + ' 다운로드">' + ext.toUpperCase() + '</a>';
            }).join('');
            html += '<tr><td>' + hl(it.title, q) + (it.isNew ? '<span class="new">NEW</span>' : '') + '</td><td class="dl">' + btns + '</td></tr>';
          });
          html += '</tbody></table></div>';
        });
      });
      list.innerHTML = html || '<p class="empty">검색 결과가 없습니다. 다른 낱말로 찾아보시거나 ' + esc(C.tel) + '로 문의해 주세요.</p>';
    }
    var sel = bindTabs(tabs, function (b) { current = b.dataset.id; search.value = ''; render(); });
    search.addEventListener('input', render);
    render();
    initForms.select = function (id) {
      var b = $('button[data-id="' + id + '"]', tabs); if (b) sel(b);
    };

    // 제출서류 안내
    var rd = $('#required-docs-body');
    (K.requiredDocs || []).forEach(function (sec) {
      var rows = sec.rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + (r[2] ? '<br><span class="small">※ ' + esc(r[2]) + '</span>' : '') + '</td></tr>';
      }).join('');
      rd.appendChild(el('div', null, '<h4>' + esc(sec.title) + '</h4><table class="tbl"><tbody>' + rows + '</tbody></table>'));
    });

    // 자격인증 공고 일정
    var A = K.announcements || { dates: [] }, now = today(), nextMarked = false;
    $('#ann-note').textContent = A.note || '';
    var ul = $('#ann-list');
    A.dates.forEach(function (d) {
      var dt = parseDate(d[1]), cls = '';
      if (dt < now) cls = 'past'; else if (!nextMarked) { cls = 'next'; nextMarked = true; }
      ul.appendChild(el('li', { 'class': cls || null }, '<b>' + esc(d[0]) + (cls === 'next' ? ' · 다음 공고' : '') + '</b>' + fmtDate(d[1])));
    });
  }

  /* ---------- 5. 자격인증기준 (GitHub 저장소 연동) ---------- */
  var CR = K.criteria || {};
  function critRaw(path) {
    return 'https://raw.githubusercontent.com/' + CR.owner + '/' + CR.repo + '/' + (CR.branch || 'main') + '/' +
      path.split('/').map(encodeURIComponent).join('/');
  }
  function critGithub(path) {
    return 'https://github.com/' + CR.owner + '/' + CR.repo + '/blob/' + (CR.branch || 'main') + '/' +
      path.split('/').map(encodeURIComponent).join('/');
  }
  // "[현행본] 품질경영시스템(ISO 9001) ... 개정_2025.1.8.html" → 제목·날짜·현행본 여부
  function critInfo(path) {
    var name = path.split('/').pop().replace(/\.html?$/i, '');
    var current = /^\s*\[현행본\]/.test(name);
    var title = name.replace(/^\s*\[현행본\]\s*/, '').trim();
    var m = title.match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})\.?\s*$/);
    var date = m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
    return { path: path, title: title, date: date, current: current };
  }
  function critList(files) {
    var hide = CR.hide || [];
    return files.filter(function (f) { return /\.html?$/i.test(f) && hide.indexOf(f.split('/').pop()) < 0; })
      .map(critInfo).sort(function (a, b) { return b.date.localeCompare(a.date) || a.title.localeCompare(b.title); });
  }
  function loadCriteria() {
    var fallback = Promise.resolve({ files: CR.files || [], live: false });
    if (!CR.autoSync || !CR.owner) return fallback;
    var key = 'kar-crit-' + CR.repo;
    try { var c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c) return Promise.resolve({ files: c, live: true }); } catch (e) {}
    var url = 'https://api.github.com/repos/' + CR.owner + '/' + CR.repo + '/git/trees/' + (CR.branch || 'main') + '?recursive=1';
    return fetch(url, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw r.status; return r.json(); })
      .then(function (j) {
        var pre = CR.folder ? CR.folder.replace(/\/?$/, '/') : '';
        var files = (j.tree || []).filter(function (x) { return x.type === 'blob' && x.path.indexOf(pre) === 0 && (pre || x.path.indexOf('/') < 0); })
          .map(function (x) { return x.path; });
        if (!files.length) throw 'empty';
        try { sessionStorage.setItem(key, JSON.stringify(files)); } catch (e) {}
        return { files: files, live: true };
      }).catch(function () { return { files: (CR.files || []).map(function (f) { return (CR.folder ? CR.folder.replace(/\/?$/, '/') : '') + f; }), live: false }; });
  }
  function initStandards() {
    var ul = $('#crit-list'), s = $('#crit-search'), src = $('#crit-src'), items = [];
    function render() {
      var q = s.value.trim().toLowerCase();
      var list = items.filter(function (x) { return !q || x.title.toLowerCase().indexOf(q) > -1; });
      ul.innerHTML = '';
      if (!list.length) { ul.innerHTML = '<li class="empty">검색 결과가 없습니다.</li>'; return; }
      list.forEach(function (x) {
        var li = el('li', { 'class': 'crit-item' },
          (x.current ? '<span class="no">현행본</span>' : '') +
          '<span class="t">' + esc(x.title) + '</span>' +
          (x.date ? '<span class="d">시행 ' + fmtDate(x.date) + '</span>' : '') +
          '<span class="crit-btns"><button type="button" class="btn btn-navy btn-sm js-view">기준 보기</button>' +
          '<a class="btn btn-line btn-sm" href="' + esc(critGithub(x.path)) + '" target="_blank" rel="noopener" title="GitHub 저장소 원본">원본 ↗</a></span>');
        $('.js-view', li).addEventListener('click', function () { openCriteria(x); });
        ul.appendChild(li);
      });
    }
    loadCriteria().then(function (r) {
      items = critList(r.files);
      src.innerHTML = '총 ' + items.length + '건 · 출처 : <a href="https://github.com/' + esc(CR.owner) + '/' + esc(CR.repo) + '" target="_blank" rel="noopener">GitHub ' + esc(CR.repo) + '</a>' +
        (r.live ? '' : ' (저장된 목록 표시 중)');
      render();
    });
    s.addEventListener('input', render);

    var arch = K.standardsArchive || [], ol = $('#arch-list'), as = $('#arch-search');
    $('#arch-count').textContent = arch.length;
    function renderArch() {
      var q = as.value.trim().toLowerCase();
      ol.innerHTML = arch.filter(function (a) { return !q || a.title.toLowerCase().indexOf(q) > -1; })
        .map(function (a) { return '<li><span>' + esc(a.no) + '</span><em>' + esc(a.title) + '</em><span>' + fmtDate(a.date) + '</span></li>'; }).join('')
        || '<li><em>검색 결과가 없습니다.</em></li>';
    }
    as.addEventListener('input', renderArch); renderArch();
  }
  // 기준 원문 보기: 저장소 파일을 받아 '스크립트 실행이 차단된' 창에 표시
  function openCriteria(x) {
    prepModal(x.title, '자격인증기준' + (x.date ? ' · 시행 ' + fmtDate(x.date) : ''));
    var doc = $('#modal-doc');
    $('.warn-inline', modal).hidden = true;
    doc.innerHTML = '<p class="doc-loading">불러오는 중…</p>';
    $('#modal-att').innerHTML = '<p class="crit-links"><a class="btn btn-line btn-sm" href="' + esc(critGithub(x.path)) + '" target="_blank" rel="noopener">GitHub에서 보기 ↗</a> ' +
      '<button type="button" class="btn btn-line btn-sm js-print">인쇄</button></p>';
    var cacheKey = 'crit:' + x.path;
    (cache[cacheKey] ? Promise.resolve(cache[cacheKey]) :
      fetch(critRaw(x.path), { credentials: 'omit' }).then(function (r) { if (!r.ok) throw r.status; return r.text(); })
        .then(function (h) { cache[cacheKey] = h; return h; }))
      .then(function (html) {
        doc.innerHTML = '';
        var fr = el('iframe', { 'class': 'crit-frame', title: x.title + ' 원문', sandbox: 'allow-popups allow-popups-to-escape-sandbox allow-modals' });
        fr.srcdoc = html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">');
        doc.appendChild(fr);
        $('.js-print', modal).onclick = function () {
          var w = window.open('', '_blank'); if (!w) return;
          w.document.open(); w.document.write(html); w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 400);
        };
      }).catch(function () {
        doc.innerHTML = '<p class="doc-loading">원문을 불러오지 못했습니다. <a href="' + esc(critGithub(x.path)) + '" target="_blank" rel="noopener">GitHub에서 보기</a>를 이용하거나 ' + esc(C.tel) + '로 문의해 주세요.</p>';
      });
    showModal();
  }

  /* ---------- 6. 수수료 ---------- */
  function initFees() {
    // 대분류(① ISO / ② 국제통용발자국) 탭 — 내용은 index.html 안에 있음
    var sec = $('#fees');
    bindTabs($('#fee-tabs'), function (b) {
      $$('#fees .fee-body').forEach(function (p) { p.hidden = p.id !== b.getAttribute('aria-controls'); });
    });
    // 각 대분류 안의 '자격인증 / 필기시험' 세부 탭
    function showSub(b) {
      var box = b.closest('.fee-body');
      $$('.kf-sub button[role="tab"]', box).forEach(function (x) {
        var on = x === b; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1;
      });
      $$('.kf-pane', box).forEach(function (p) { p.hidden = p.dataset.pane !== b.dataset.sub; });
    }
    sec.addEventListener('click', function (e) {
      var b = e.target.closest('.kf-sub button[role="tab"]'); if (b) showSub(b);
    });
    sec.addEventListener('keydown', function (e) {
      var b = e.target.closest('.kf-sub button[role="tab"]');
      if (!b || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      var all = $$('.kf-sub button[role="tab"]', b.closest('.kf-sub')), i = all.indexOf(b);
      var n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      n.focus(); showSub(n);
    });
  }

  /* ---------- 7. 공지사항 · 교육훈련 ---------- */
  // 첨부파일은 '접속한 날 기준 최근 3개월 이내' 게시글 중, 내려받을 수 있는 파일(path 있음)만 제공
  function attachments(n) {
    if (!n || !n.files || !n.files.length) return [];
    var d = parseDate(n.date), lim = today(); lim.setMonth(lim.getMonth() - 3);
    if (!d || d < lim) return [];
    return n.files.filter(function (f) { return !!f.path; });
  }
  // 본문이 있는 글(KAR.notices) + 최근 3년 목록(KAR.noticeArchive)을 합쳐서 표시
  function allPosts() {
    var full = (K.notices || []).map(function (n) {
      var m = String(n.content || '').match(/(\d+)\.html$/);
      return { date: n.date, category: n.category, title: n.title, pinned: !!n.pinned, num: m && m[1], post: n };
    });
    var have = {};
    full.forEach(function (x) { if (x.num) have[x.num] = 1; });
    var arch = (K.noticeArchive || []).filter(function (a) { return !have[a.num]; })
      .map(function (a) { return { date: a.date, category: a.category, title: a.title, num: a.num, post: a.content ? a : null }; });
    return full.concat(arch).sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return b.pinned ? 1 : -1;
      return String(b.date).localeCompare(String(a.date));
    });
  }
  var selectBoardTab;
  function initBoard() {
    var all = allPosts(), PER = 15, page = 1, cat = '전체';
    var board = $('#board-list'), pager = $('#board-pager'), search = $('#board-search');
    function item(n, short) {
      var li = el('li', { 'class': n.post ? 'has-body' : 'no-body' });
      var inner = short
        ? '<span class="t">' + (n.pinned ? '<span class="pin">필독</span>' : '') + esc(n.title) + '</span><span class="d">' + fmtDate(n.date) + '</span>'
        : '<span class="cat' + (n.category === '교육' ? ' edu' : '') + '">' + (n.pinned ? '필독' : (n.category === '교육' ? '교육훈련' : '공지사항')) + '</span>' +
          '<span class="t">' + esc(n.title) + '</span>' +
          (attachments(n.post).length ? '<span class="clip">첨부 ' + attachments(n.post).length + '</span>' : '') +
          '<span class="d">' + fmtDate(n.date) + '</span>';
      if (n.post) {
        var b = el('button', { type: 'button' }, inner);
        b.addEventListener('click', function () { openModal(n.post); });
        li.appendChild(b);
      } else li.appendChild(el('div', { 'class': 'row' }, inner));
      return li;
    }
    ['공지', '교육'].forEach(function (c) {
      var ul = $(c === '공지' ? '#news-notice' : '#news-edu');
      all.filter(function (n) { return n.category === c; }).slice(0, 5).forEach(function (n) { ul.appendChild(item(n, true)); });
    });
    function render() {
      var q = search.value.trim().toLowerCase();
      var list = all.filter(function (n) {
        return (cat === '전체' || n.category === cat || n.pinned) && (!q || n.title.toLowerCase().indexOf(q) > -1);
      });
      var pages = Math.max(1, Math.ceil(list.length / PER));
      if (page > pages) page = pages;
      board.innerHTML = '';
      list.slice((page - 1) * PER, page * PER).forEach(function (n) { board.appendChild(item(n, false)); });
      if (!list.length) board.innerHTML = '<li class="empty">검색 결과가 없습니다.</li>';
      // 페이지 번호
      var html = '', start = Math.max(1, page - 4), end = Math.min(pages, start + 9);
      start = Math.max(1, end - 9);
      if (page > 1) html += '<button type="button" data-p="' + (page - 1) + '" aria-label="이전 페이지">‹</button>';
      for (var i = start; i <= end; i++) html += '<button type="button" data-p="' + i + '"' + (i === page ? ' aria-current="page"' : '') + '>' + i + '</button>';
      if (page < pages) html += '<button type="button" data-p="' + (page + 1) + '" aria-label="다음 페이지">›</button>';
      pager.innerHTML = pages > 1 ? html : '';
    }
    pager.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-p]'); if (!b) return;
      page = +b.dataset.p; render();
      $('#board').scrollIntoView({ behavior: 'smooth' });
    });
    selectBoardTab = bindTabs($('#board-tabs'), function (b) { cat = b.dataset.cat; page = 1; render(); });
    search.addEventListener('input', function () { page = 1; render(); });
    render();
    $$('[data-board-filter]').forEach(function (a) {
      a.addEventListener('click', function () { selectBoardTab($('#board-tabs button[data-cat="' + a.dataset.boardFilter + '"]')); });
    });
    $$('[data-open-notice]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var n = (K.notices || []).filter(function (x) { return x.content === a.dataset.openNotice; })[0];
        if (n) { e.preventDefault(); openModal(n); }
      });
    });
  }

  /* ---------- 게시글 창 ---------- */
  var modal, lastFocus;
  function prepModal(title, meta) {
    lastFocus = document.activeElement;
    $('#modal-title').textContent = title;
    $('#modal-meta').textContent = meta;
    $('.warn-inline', modal).hidden = false;
  }
  function showModal() {
    if (!modal.open) { if (modal.showModal) modal.showModal(); else modal.setAttribute('open', ''); }
    $('.modal-body', modal).scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }
  function openModal(n) {
    prepModal(n.title, n.meta || ((n.category === '교육' ? '교육훈련' : '공지사항') + ' · ' + fmtDate(n.date)));
    fillDoc($('#modal-doc'), n.content);
    var att = $('#modal-att');
    var files = attachments(n);
    att.innerHTML = files.length
      ? '<h3>첨부파일</h3><ul>' + files.map(function (f) {
          return '<li><a href="' + esc(fileUrl(f.path)) + '" download="' + esc(fileName(f.path)) + '">' + esc(f.name) + '</a></li>';
        }).join('') + '</ul>'
      : '';
    showModal();
  }
  function closeModal() {
    if (modal.close) modal.close(); else modal.removeAttribute('open');
  }
  function initModal() {
    modal = $('#modal');
    $('#modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    modal.addEventListener('close', function () {
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    });
  }

  /* ---------- 메뉴 · 바로가기 · 기타 ---------- */
  function initNav() {
    var btn = $('.menu-btn'), gnb = $('#gnb');
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', open); gnb.classList.toggle('open', open);
      btn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    $$('a', gnb).forEach(function (a) { a.addEventListener('click', function () {
      btn.setAttribute('aria-expanded', 'false'); gnb.classList.remove('open');
    }); });

    // data-tab 링크: 해당 신청 탭/서식 분류를 열고 이동
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-tab]'); if (!a) return;
      var id = a.dataset.tab;
      if (a.getAttribute('href') === '#apply' && selectApplyTab) {
        var b = $('#apply-tabs button[data-id="' + id + '"]'); if (b) selectApplyTab(b);
      } else if (a.getAttribute('href') === '#forms' && initForms.select) initForms.select(id);
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-about]'); if (!a || !selectAboutTab) return;
      var b = $('#about-tabs button[data-id="' + a.dataset.about + '"]'); if (b) selectAboutTab(b);
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('.js-copy'); if (b) copy(b.dataset.copy);
    });

    // 현재 위치 메뉴 강조 + 맨 위로 버튼
    var links = $$('a', gnb), top = $('.to-top');
    var secs = links.map(function (a) { return $(a.getAttribute('href')); });
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        top.classList.toggle('show', window.scrollY > 600);
        var y = window.scrollY + 120, cur = -1;
        secs.forEach(function (s, i) { if (s && s.offsetTop <= y) cur = i; });
        links.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
      });
    }, { passive: true });
  }

  /* ---------- 시작 ---------- */
  function safe(fn, name) {
    try { fn(); } catch (e) { if (window.console) console.error('[KAR] ' + name + ' 오류 — data.js 를 확인하세요.', e); }
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.KAR || !K.settings) {
      document.body.insertAdjacentHTML('afterbegin', '<p class="noscript">data.js 를 읽지 못했습니다. 따옴표·쉼표 누락 여부를 확인해 주세요.</p>');
    }
    safe(initModal, '게시글 창'); safe(initBasics, '기본 정보'); safe(initAbout, 'KAR 소개'); safe(initApply, '온라인 신청');
    safe(initCourses, '교육 과정'); safe(initForms, '서식'); safe(initStandards, '자격인증기준');
    safe(initFees, '수수료'); safe(initBoard, '공지사항'); safe(initNav, '메뉴');
  });
})();
