/* ==========================================================================
   한국심사자격인증원 — 첨부파일 → 구글 드라이브 업로드 (공통)
   --------------------------------------------------------------------------
   교육 · 자격시험 · 영수증 신청(app.js)이 사용합니다. (자격인증 신청은 cert-apply.js)
   ★ 웹 앱 URL : data.js → KAR.certApply.appsScriptUrl  (모든 신청이 같은 주소 사용)
   ★ 저장 폴더 : docs/apps-script/Code.gs → CONFIG.FOLDERS

   KARDrive.upload({ category, applyNo, name, files, honey }) → Promise
     성공 : { folderUrl, files: [{ name, size, url }] }
     실패 : Error('SCRIPT_…')
   ※ Apps Script 는 브라우저 사전 요청(CORS preflight)에 응답하지 않으므로
     Content-Type: text/plain 의 fetch '단순 요청'으로만 보냅니다(진행률 감시 X).
   ========================================================================== */
(function () {
  'use strict';
  var MIME = {
    pdf: 'application/pdf', hwp: 'application/x-hwp', hwpx: 'application/hwp+zip',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', zip: 'application/zip',
  };
  function ext(n) { return (String(n).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function scriptUrl() { return String(((window.KAR || {}).certApply || {}).appsScriptUrl || '').trim(); }

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(new Error('READ_FAILED')); };
      r.readAsDataURL(file);
    });
  }

  window.KARDrive = {
    configured: function () { return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(scriptUrl()); },
    newApplyNo: function () {
      var d = new Date(), a = new Uint8Array(2); window.crypto.getRandomValues(a);
      return 'KAR-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
        pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '-' +
        Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').toUpperCase();
    },
    upload: async function (o) {
      if (!this.configured()) throw new Error('SCRIPT_NOT_CONFIGURED');
      var list = [];
      for (var i = 0; i < o.files.length; i++) {
        var f = o.files[i];
        list.push({ name: f.name, mimeType: MIME[ext(f.name)] || f.type || 'application/octet-stream', data: await toBase64(f) });
      }
      var res, text;
      try {
        res = await fetch(scriptUrl(), {
          method: 'POST', redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ category: o.category, applyNo: o.applyNo, name: o.name || '', honey: o.honey || '', files: list }),
        });
        text = await res.text();
      } catch (e) { throw new Error('SCRIPT_NETWORK'); }
      var j; try { j = JSON.parse(text); } catch (e) { throw new Error('SCRIPT_BAD_RESPONSE'); }
      if (window.console) console.info('[KAR 드라이브 업로드]', j);
      if (!j.ok) throw new Error('SCRIPT_' + (j.error || 'FAILED'));
      var links = (j.files || []).filter(function (x) { return x && x.url; });
      if (!j.folderUrl || links.length !== o.files.length) throw new Error('LINK_MISSING');
      return { folderUrl: j.folderUrl, files: links };
    },
  };
})();
