/* ================================================================
   Camzy — Admin Chatbot Messages (dynamic topics)
   Manages the list of chatbot topics shown as suggestion buttons in
   the storefront chat widget. Every topic has:
     • a stable, auto-generated key (technical → never shown/edited)
     • a button label («متن دکمه») — what the customer sees
     • an answer («پاسخ چت‌بات») — what the bot replies
   Persisted as JSON in the `chat.topics` setting, so added/edited/
   deleted topics survive server restarts. Falls back to the built-in
   defaults when no topics are stored.

   Safety: unsaved edits are never dropped silently — leaving the view
   or reloading warns first, and deletions ask for confirmation.
   ================================================================ */
(function () {
  'use strict';

  var API_BASE = '/api';
  var ANSWER_MAX = 20000; /* server-side cap for a single answer */
  var DEFAULT_TOPICS = [
    { key: 'shipping', label: 'شرایط ارسال و هزینه', answer: 'هزینه ارسال برای سفارش‌های بالای ۵۰۰ هزار تومان رایگان است. ارسال به سراسر کشور در کمتر از ۴۸ ساعت کاری انجام می‌شود.' },
    { key: 'return', label: 'شرایط بازگشت کالا', answer: 'شما ۷ روز ضمانت بازگشت کالا بدون قید و شرط دارید. در صورت عدم رضایت از محصول، می‌توانید آن را بازگردانید.' },
    { key: 'warranty', label: 'گارانتی و اصالت', answer: 'تمامی محصولات با ضمانت اصالت کالا و گارانتی معتبر ارائه می‌شوند. ما نمایندگی رسمی برندهای هایکویژن، داهوا، یونیکنیو، تیاندی، ویوتک و سایر برندهای معتبر نظارتی هستیم.' },
    { key: 'categories', label: 'دسته‌بندی محصولات', answer: 'ما ۱۲ دسته‌بندی محصول داریم: دوربین مداربسته، دستگاه DVR/NVR، سیستم‌های امنیتی، لنز و تجهیزات تصویربرداری، تجهیزات شبکه نظارتی، لوازم جانبی دوربین، ایمنی و حفاظت، کابینت و رک، تجهیزات نصب و راه‌اندازی، ذخیره‌سازی و مانیتورینگ، سیم و کابل دوربین و تجهیزات جانبی تخصصی.' },
    { key: 'brands', label: 'برندهای موجود', answer: 'برندهای موجود شامل هایکویژن، داهوا، یونیکنیو، تیاندی، ویوتک، فریتک، اکسیس، ویژن هانوا، زایکل، یوبیکویتی، سیگیت، وسترن دیجیتال، تی‌پی‌لینک و سپکو هستند.' },
    { key: 'payment', label: 'روش‌های پرداخت', answer: 'پرداخت به صورت آنلاین از طریق درگاه بانکی انجام می‌شود. همچنین امکان پرداخت در محل برای سفارش‌های تهران وجود دارد.' },
    { key: 'account', label: 'حساب کاربری', answer: 'با ایجاد حساب کاربری می‌توانید سفارش‌های خود را پیگیری کنید، لیست علاقه‌مندی‌ها داشته باشید و اطلاعات خود را مدیریت کنید.' },
    { key: 'contact', label: 'اطلاعات تماس', answer: '' }
  ];

  var TRASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  var CHAT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>';

  /* ── helpers ───────────────────────────────────────────────── */
  function $(sel) { return document.querySelector(sel); }
  function toast(msg, type) {
    if (window.CamzyAdmin && window.CamzyAdmin.showToast) window.CamzyAdmin.showToast(msg, type);
  }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n); } }
  function adminToken() {
    try {
      var s = JSON.parse(localStorage.getItem('as_admin_session') || 'null');
      return (s && s.token) || '';
    } catch (e) { return ''; }
  }
  async function api(path, opts) {
    var headers = { 'Content-Type': 'application/json' };
    var t = adminToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    var res = await fetch(API_BASE + path, Object.assign({ headers: headers }, opts || {}));
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function pick(t) { return { key: t.key, label: t.label, answer: t.answer }; }

  /* Textareas grow with their content where the browser supports
     `field-sizing: content`; older engines get a JS auto-grow so a long
     answer is never hidden behind an inner scrollbar. */
  var AUTO_GROW = !(window.CSS && CSS.supports && CSS.supports('field-sizing', 'content'));
  function autoGrow(ta) {
    if (!ta || !AUTO_GROW) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(320, Math.max(92, ta.scrollHeight + 2)) + 'px';
  }
  function autoGrowAll(root) {
    if (!AUTO_GROW || !root) return;
    var tas = root.querySelectorAll('textarea[data-cb-field="answer"]');
    for (var i = 0; i < tas.length; i++) autoGrow(tas[i]);
  }

  /* ── state ─────────────────────────────────────────────────── */
  var topics = [];        /* working copy: {key, label, answer}          */
  var savedTopics = [];   /* last known persisted state (for dirty check) */
  var newKeys = {};       /* keys created in this session (not yet saved) */
  var saving = false;
  var pendingDelete = -1; /* index waiting for delete confirmation       */

  var listEl, addBtn, saveBtn, dirtyBanner, dirtyDetail, dirtySaveBtn,
      dirtyDiscardBtn, statusEl, delModal, delText, delConfirmBtn;

  function normalizeKey(k) {
    return String(k || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  }

  /* Keys are technical and invisible to the admin: they are generated
     once for every new topic and then stay stable for its whole life. */
  function nextKey() {
    var max = 0;
    topics.forEach(function (t) {
      var m = /^topic-(\d+)$/.exec(String(t.key || ''));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    var n = max + 1;
    var key = 'topic-' + n;
    while (topics.some(function (t) { return t.key === key; })) { n++; key = 'topic-' + n; }
    return key;
  }

  function loadFromSettings(s) {
    var parsed = null;
    if (s && typeof s['chat.topics'] === 'string' && s['chat.topics'].trim()) {
      try {
        var arr = JSON.parse(s['chat.topics']);
        if (Array.isArray(arr)) parsed = arr;
      } catch (e) {}
    }
    if (!parsed || !parsed.length) {
      // Fall back to defaults, honoring any saved individual chat.* values
      parsed = DEFAULT_TOPICS.map(function (d) {
        var label = s ? s['chat.' + d.key + '.label'] : undefined;
        var answer = s ? s['chat.' + d.key + '.answer'] : undefined;
        return {
          key: d.key,
          label: (typeof label === 'string' && label.trim()) ? label : d.label,
          answer: (typeof answer === 'string') ? answer : d.answer
        };
      });
    }
    // Normalize + dedupe
    var seen = new Set();
    var out = [];
    for (var i = 0; i < parsed.length; i++) {
      var t = parsed[i] || {};
      var key = normalizeKey(t.key);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key: key, label: String(t.label || '').trim(), answer: String(t.answer == null ? '' : t.answer) });
    }
    if (!out.length) {
      out = DEFAULT_TOPICS.map(function (d) { return { key: d.key, label: d.label, answer: d.answer }; });
    }
    topics = out;
  }

  /* ── dirty tracking ────────────────────────────────────────── */
  function diff() {
    var sm = {};
    savedTopics.forEach(function (t) { sm[t.key] = t; });
    var added = 0, removed = 0, changed = 0;
    var seen = {};
    topics.forEach(function (t) {
      seen[t.key] = true;
      var s = sm[t.key];
      if (!s) { added++; return; }
      if (String(s.label == null ? '' : s.label) !== String(t.label == null ? '' : t.label) ||
          String(s.answer == null ? '' : s.answer) !== String(t.answer == null ? '' : t.answer)) changed++;
    });
    Object.keys(sm).forEach(function (k) { if (!seen[k]) removed++; });
    var parts = [];
    if (added) parts.push(fa(added) + ' گزینهٔ جدید');
    if (removed) parts.push(fa(removed) + ' گزینهٔ حذف‌شده');
    if (changed) parts.push(fa(changed) + ' مورد ویرایش‌شده');
    return { count: added + removed + changed, text: parts.join(' و ') };
  }
  function isDirty() { return diff().count > 0; }

  function updateDirty() {
    var d = diff();
    if (dirtyBanner) dirtyBanner.hidden = d.count === 0;
    if (dirtyDetail && d.count) dirtyDetail.textContent = d.text + ' — تا زمانی که «ذخیره تغییرات» را نزنید روی چت‌بات سایت اعمال نمی‌شود.';
    return d.count;
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.className = 'cb-foot__status' + (kind ? ' is-' + kind : '');
  }

  /* ── rendering ─────────────────────────────────────────────── */
  function itemHtml(t, i) {
    var label = String(t.label == null ? '' : t.label);
    var answer = String(t.answer == null ? '' : t.answer);
    var hasLabel = label.trim().length > 0;
    var isNew = !!newKeys[t.key];
    var head =
      '<div class="cb-item__head">' +
        '<span class="cb-item__num">' + fa(i + 1) + '</span>' +
        '<span class="cb-item__chip' + (hasLabel ? '' : ' is-empty') + '" title="نمایش دکمه به مشتری">' +
          (hasLabel ? escapeHtml(label) : 'هنوز متن دکمه نوشته نشده') +
        '</span>' +
        (isNew ? '<span class="cb-item__tag cb-item__tag--new">جدید</span>' : '') +
        '<span class="cb-item__tag cb-item__tag--warn" data-cb-warn' + (answer.trim() ? ' hidden' : '') + '>پاسخ خالی</span>' +
        '<span class="cb-item__spacer"></span>' +
        '<button type="button" class="cb-del" data-cb-del="' + i + '" aria-label="حذف گزینه" title="حذف این گزینه">' + TRASH_SVG + '<span>حذف</span></button>' +
      '</div>';
    var body =
      '<div class="cb-item__body">' +
        '<div class="cb-field" data-cb-wrap="label">' +
          '<label class="adm-field__label" for="cb-label-' + i + '">متن دکمه *</label>' +
          '<input class="input" type="text" id="cb-label-' + i + '" data-cb-field="label" value="' + escapeAttr(label) + '" placeholder="مثلاً: شرایط ارسال و هزینه" autocomplete="off">' +
          '<span class="adm-field__hint">متنی که مشتری روی دکمهٔ پیشنهادی چت‌بات می‌بیند.</span>' +
        '</div>' +
        '<div class="cb-field" data-cb-wrap="answer">' +
          '<label class="adm-field__label" for="cb-answer-' + i + '">پاسخ چت‌بات</label>' +
          '<textarea class="input" id="cb-answer-' + i + '" data-cb-field="answer" rows="3" maxlength="' + ANSWER_MAX + '" placeholder="پاسخی که چت‌بات به مشتری می‌دهد…">' + escapeHtml(answer) + '</textarea>' +
          '<div class="cb-field__row">' +
            '<span class="adm-field__hint">اختیاری — اگر خالی بماند، چت‌بات برای این گزینه پاسخی ندارد.</span>' +
            '<span class="cb-count" data-cb-count="' + i + '">' + fa(answer.length) + ' کاراکتر</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    return '<div class="cb-item' + (isNew ? ' is-new' : '') + '" data-cb-item="' + i + '">' + head + body + '</div>';
  }

  function render() {
    if (!listEl) return;
    if (!topics.length) {
      listEl.innerHTML =
        '<div class="cb-state">' +
          '<span class="cb-state__icon">' + CHAT_SVG + '</span>' +
          '<span class="cb-state__title">هنوز گزینه‌ای برای چت‌بات تعریف نشده است</span>' +
          '<span class="cb-state__text">با دکمهٔ «افزودن گزینه» یک دکمهٔ پیشنهادی بسازید؛ متن دکمه و پاسخ چت‌بات را بنویسید و در پایان «ذخیره تغییرات» را بزنید.</span>' +
          '<button type="button" class="btn btn-accent btn-sm" data-cb-add>' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
            'افزودن گزینه</button>' +
        '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < topics.length; i++) html += itemHtml(topics[i], i);
    listEl.innerHTML = html;
    autoGrowAll(listEl);
  }

  function renderLoading() {
    if (!listEl) return;
    listEl.innerHTML =
      '<div class="cb-skeleton">' +
        '<div class="cb-skeleton__row"></div><div class="cb-skeleton__row"></div><div class="cb-skeleton__row"></div>' +
      '</div>';
  }

  function renderError(message) {
    if (!listEl) return;
    listEl.innerHTML =
      '<div class="cb-state cb-state--error">' +
        '<span class="cb-state__icon">' + CHAT_SVG + '</span>' +
        '<span class="cb-state__title">دریافت پیام‌های چت‌بات ممکن نشد</span>' +
        '<span class="cb-state__text">' + escapeHtml(message || 'ارتباط با سرور برقرار نشد.') + ' — تا زمانی که اطلاعات دریافت نشود، چیزی تغییر داده نمی‌شود.</span>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-cb-retry>تلاش دوباره</button>' +
      '</div>';
  }

  /* Live-update the parts that depend on a field (no re-render → no focus loss). */
  function refreshItem(idx) {
    if (!listEl) return;
    var item = listEl.querySelector('[data-cb-item="' + idx + '"]');
    if (!item) return;
    var t = topics[idx];
    if (!t) return;
    var chip = item.querySelector('.cb-item__chip');
    if (chip) {
      var hasLabel = String(t.label || '').trim().length > 0;
      chip.textContent = hasLabel ? String(t.label) : 'هنوز متن دکمه نوشته نشده';
      chip.classList.toggle('is-empty', !hasLabel);
    }
    var warn = item.querySelector('[data-cb-warn]');
    if (warn) warn.hidden = !!String(t.answer || '').trim();
    var count = item.querySelector('[data-cb-count]');
    if (count) count.textContent = fa(String(t.answer || '').length) + ' کاراکتر';
  }

  function clearInvalid(idx) {
    if (!listEl || idx == null) return;
    var item = listEl.querySelector('[data-cb-item="' + idx + '"]');
    if (!item) return;
    item.classList.remove('is-invalid');
    var fields = item.querySelectorAll('.cb-field.is-invalid');
    for (var i = 0; i < fields.length; i++) fields[i].classList.remove('is-invalid');
  }

  function markInvalid(idx, field, message) {
    toast(message, 'danger');
    if (!listEl) return;
    var item = listEl.querySelector('[data-cb-item="' + idx + '"]');
    if (!item) return;
    item.classList.add('is-invalid');
    var wrap = item.querySelector('[data-cb-wrap="' + field + '"]');
    if (wrap) wrap.classList.add('is-invalid');
    var input = item.querySelector('[data-cb-field="' + field + '"]');
    if (input) {
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
      if (input.scrollIntoView) input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* ── data flow ─────────────────────────────────────────────── */
  async function load() {
    if (!listEl) return;
    if (isDirty()) { updateDirty(); return; } /* never drop unsaved edits */
    if (!topics.length) renderLoading();
    try {
      var s = await api('/settings');
      loadFromSettings(s);
      savedTopics = topics.map(pick);
      newKeys = {};
      render();
      updateDirty();
      setStatus('');
    } catch (e) {
      var msg = e.message || 'خطا در دریافت پیام‌های چت‌بات';
      if (topics.length) {
        /* A refresh failed but the list is already on screen — keep it and
           report the problem instead of replacing the admin's view. */
        setStatus('به‌روزرسانی فهرست ناموفق بود: ' + msg, 'err');
      } else {
        renderError(msg);
      }
      toast(msg, 'danger');
    }
  }

  function addTopic() {
    var t = { key: nextKey(), label: '', answer: '' };
    topics.push(t);
    newKeys[t.key] = true;
    render();
    updateDirty();
    setStatus('گزینهٔ جدید اضافه شد — پس از تکمیل، «ذخیره تغییرات» را بزنید.', 'busy');
    if (!listEl) return;
    var item = listEl.querySelector('[data-cb-item="' + (topics.length - 1) + '"]');
    if (!item) return;
    if (item.scrollIntoView) item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var input = item.querySelector('[data-cb-field="label"]');
    if (input) { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }
  }

  function openDelModal(idx) {
    var t = topics[idx];
    if (!t || !delModal) return;
    pendingDelete = idx;
    var name = String(t.label || '').trim() || 'بدون متن دکمه';
    if (delText) delText.textContent = 'آیا گزینهٔ «' + name + '» حذف شود؟';
    delModal.classList.add('is-open');
    delModal.setAttribute('aria-hidden', 'false');
    if (delConfirmBtn) delConfirmBtn.focus();
  }
  function closeDelModal() {
    if (delModal) {
      delModal.classList.remove('is-open');
      delModal.setAttribute('aria-hidden', 'true');
    }
    pendingDelete = -1;
  }
  function confirmDelete() {
    if (pendingDelete < 0) return;
    var t = topics[pendingDelete];
    topics.splice(pendingDelete, 1);
    if (t) delete newKeys[t.key];
    closeDelModal();
    render();
    updateDirty();
    setStatus('گزینه حذف شد — برای اعمال روی سایت «ذخیره تغییرات» را بزنید.', 'busy');
    toast('گزینه حذف شد', 'success');
  }

  function discardChanges() {
    if (!isDirty()) return;
    if (!window.confirm('تغییرات ذخیره‌نشده بازگردانده شوند؟')) return;
    topics = savedTopics.map(pick);
    newKeys = {};
    render();
    updateDirty();
    setStatus('');
    toast('تغییرات بازگردانی شد', 'info');
  }

  async function save() {
    if (saving || !listEl) return;
    var seen = {};
    for (var i = 0; i < topics.length; i++) {
      var t = topics[i];
      t.key = normalizeKey(t.key);
      t.label = String(t.label == null ? '' : t.label).trim();
      t.answer = String(t.answer == null ? '' : t.answer);
      if (!t.key) { markInvalid(i, 'label', 'کلید موضوع (ردیف ' + fa(i + 1) + ') الزامی است'); return; }
      if (!t.label) { markInvalid(i, 'label', 'متن دکمه (ردیف ' + fa(i + 1) + ') الزامی است'); return; }
      if (t.answer.length > ANSWER_MAX) { markInvalid(i, 'answer', 'متن پاسخ (ردیف ' + fa(i + 1) + ') بیش از حد مجاز است'); return; }
      if (seen[t.key]) { markInvalid(i, 'label', 'کلید تکراری: ' + t.key); return; }
      seen[t.key] = true;
    }
    saving = true;
    setSaveBusy(true);
    setStatus('در حال ذخیره…', 'busy');
    try {
      var payload = { 'chat.topics': JSON.stringify(topics.map(pick)) };
      var s = await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
      loadFromSettings(s);
      savedTopics = topics.map(pick);
      newKeys = {};
      render();
      updateDirty();
      setStatus('ذخیره شد — تغییرات روی چت‌بات سایت اعمال شد.', 'ok');
      toast('پیام‌های چت‌بات با موفقیت ذخیره شد', 'success');
    } catch (e) {
      setStatus('ذخیره ناموفق بود: ' + (e.message || ''), 'err');
      toast(e.message || 'ذخیره ناموفق بود', 'danger');
    } finally {
      saving = false;
      setSaveBusy(false);
    }
  }

  function setSaveBusy(busy) {
    if (saveBtn) {
      saveBtn.disabled = !!busy;
      saveBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    if (dirtySaveBtn) dirtySaveBtn.disabled = !!busy;
    if (addBtn) addBtn.disabled = !!busy;
  }

  /* ── wiring ────────────────────────────────────────────────── */
  function init() {
    listEl = $('#cb-topics-list');
    addBtn = $('#cb-add-topic');
    saveBtn = $('#cb-save');
    dirtyBanner = $('#cb-dirty-banner');
    dirtyDetail = $('#cb-dirty-detail');
    dirtySaveBtn = $('#cb-dirty-save');
    dirtyDiscardBtn = $('#cb-dirty-discard');
    statusEl = $('#cb-status');
    delModal = $('#cb-delete-modal');
    delText = $('#cb-del-text');
    delConfirmBtn = $('#cb-del-confirm');
    if (!listEl) return;

    if (addBtn) addBtn.addEventListener('click', function () { addTopic(); });
    if (saveBtn) saveBtn.addEventListener('click', function () { save(); });
    if (dirtySaveBtn) dirtySaveBtn.addEventListener('click', function () { save(); });
    if (dirtyDiscardBtn) dirtyDiscardBtn.addEventListener('click', function () { discardChanges(); });

    /* Delegated list events (add / retry / delete buttons live in markup). */
    listEl.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-cb-add],[data-cb-retry],[data-cb-del]') : null;
      if (!el) return;
      e.preventDefault();
      if (el.hasAttribute('data-cb-add')) addTopic();
      else if (el.hasAttribute('data-cb-retry')) load();
      else if (el.hasAttribute('data-cb-del')) openDelModal(Number(el.getAttribute('data-cb-del')));
    });

    /* Field edits: update the model in place (keeps focus & caret). */
    listEl.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
      var field = el.getAttribute('data-cb-field');
      if (!field) return;
      var item = el.closest ? el.closest('[data-cb-item]') : null;
      if (!item) return;
      var idx = Number(item.getAttribute('data-cb-item'));
      var t = topics[idx];
      if (!t) return;
      if (field === 'label') t.label = el.value;
      else if (field === 'answer') { t.answer = el.value; autoGrow(el); }
      else return;
      refreshItem(idx);
      clearInvalid(idx);
      updateDirty();
    });

    /* Delete-confirmation modal */
    if (delModal) {
      delModal.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('[data-cb-del-close]') : null;
        if (el) closeDelModal();
      });
    }
    if (delConfirmBtn) delConfirmBtn.addEventListener('click', confirmDelete);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && delModal && delModal.classList.contains('is-open')) closeDelModal();
    });

    /* Unsaved-changes guards */
    window.addEventListener('beforeunload', function (e) {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });

    load();
  }

  /* ── view integration ──────────────────────────────────────── */
  function isChatbotViewActive() {
    var sec = document.querySelector('section[data-view="chatbot-messages"]');
    return !!(sec && sec.classList.contains('is-active'));
  }

  function discardLocalEdits() {
    topics = savedTopics.map(pick);
    newKeys = {};
    render();
    updateDirty();
  }

  var LEAVE_MESSAGE = 'تغییرات ذخیره‌نشده در پیام‌های چت‌بات دارید. اگر از این بخش خارج شوید، این تغییرات از بین می‌رود. ادامه می‌دهید؟';

  /* The sidebar handler switches views on its own, so the guard lives in the
     capture phase: cancelling stops the navigation before it happens. */
  function initNavGuard() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('.admin-nav__link[data-view]') : null;
      if (!link) return;
      var target = link.getAttribute('data-view');
      if (target === 'chatbot-messages' || target === 'settings') return;
      if (!isDirty() || !isChatbotViewActive()) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      discardLocalEdits();
    }, true);
  }

  /* Refresh the list whenever the view becomes visible (the sidebar switches
     views without going through window.CamzyAdmin.showView). */
  function initViewWatcher() {
    if (typeof MutationObserver === 'undefined') return;
    [['chatbot-messages'], ['settings']].forEach(function (pair) {
      var sec = document.querySelector('section[data-view="' + pair[0] + '"]');
      if (!sec) return;
      var wasActive = sec.classList.contains('is-active');
      new MutationObserver(function () {
        var active = sec.classList.contains('is-active');
        if (active === wasActive) return;
        wasActive = active;
        if (active) load();
      }).observe(sec, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function initViewHooks() {
    try {
      var orig = window.CamzyAdmin && window.CamzyAdmin.showView;
      if (orig && !orig.__chatbotHooked) {
        var wrapped = function (n) {
          var leaving = (n !== 'chatbot-messages' && n !== 'settings');
          if (leaving && isDirty() && isChatbotViewActive()) {
            if (!window.confirm(LEAVE_MESSAGE)) {
              try { if (window.history && window.history.replaceState) window.history.replaceState(null, '', '#/chatbot-messages'); } catch (_) {}
              orig('chatbot-messages');
              return;
            }
            discardLocalEdits();
          }
          orig(n);
        };
        wrapped.__chatbotHooked = true;
        window.CamzyAdmin.showView = wrapped;
      }
    } catch (_) {}
    window.addEventListener('hashchange', function () {
      try {
        var h = (location.hash || '').replace(/^#\/?/, '');
        if (h === 'chatbot-messages' || h === 'settings') load();
      } catch (_) {}
    });
  }

  init();
  initNavGuard();
  initViewHooks();
  initViewWatcher();
  window.CamzyAdminChatbot = { reload: load };
})();
