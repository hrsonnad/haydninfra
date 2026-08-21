// Lightbox — full-screen viewer: zoom/pan, video playback, Live Photos, info panel.
(function () {
  'use strict';

  var lb, stage, infoPanel, liveBadge;
  var list = [], idx = -1, detail = null, onTier = null;
  var zoom = 1, panX = 0, panY = 0, dragging = false, dragStart = null;
  var touchX = null;

  function $(s) { return document.querySelector(s); }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function fmtBytes(b) {
    if (!b) return '';
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
    return Math.round(b / 1024) + ' KB';
  }

  function open(itemList, i, tierCallback) {
    if (i < 0) return;
    list = itemList; idx = i; onTier = tierCallback;
    lb = $('.ph-lb'); stage = lb.querySelector('.stage');
    infoPanel = lb.querySelector('.info'); liveBadge = lb.querySelector('.livebadge');
    lb.classList.add('open');
    document.addEventListener('keydown', onKey);
    load();
  }

  function close() {
    lb.classList.remove('open');
    infoPanel.classList.remove('open');
    clearStage();
    document.removeEventListener('keydown', onKey);
    idx = -1;
  }

  function clearStage() {
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    zoom = 1; panX = panY = 0;
    liveBadge.style.display = 'none';
  }

  function nav(delta) {
    var n = idx + delta;
    if (n < 0 || n >= list.length) return;
    idx = n;
    load();
  }

  function load() {
    clearStage();
    var it = list[idx];
    var spin = document.createElement('div');
    spin.className = 'ph-empty';
    spin.textContent = '…';
    spin.style.color = '#666';
    stage.appendChild(spin);
    detail = null;
    renderInfo(null);
    PhotoAPI.photo(it.id).then(function (d) {
      if (idx < 0 || list[idx].id !== it.id) return;
      detail = d;
      clearStage();
      d.photo.is_video ? renderVideo(d) : renderImage(d);
      renderInfo(d);
      // preload neighbors' thumbs
      [idx - 1, idx + 1].forEach(function (n) {
        if (n >= 0 && n < list.length) PhotoAPI.thumb(list[n].id);
      });
    }).catch(function () {
      spin.textContent = 'Could not load.';
    });
  }

  function renderImage(d) {
    var img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.src = d.urls.full || d.urls.medium || d.urls.thumb;
    stage.appendChild(img);
    applyTransform(img);

    stage.onwheel = function (ev) {
      ev.preventDefault();
      var nz = Math.max(1, Math.min(6, zoom * (ev.deltaY < 0 ? 1.15 : 0.87)));
      if (nz === 1) { panX = panY = 0; }
      zoom = nz;
      applyTransform(img);
    };
    img.onpointerdown = function (ev) {
      if (zoom <= 1) return;
      dragging = true; dragStart = { x: ev.clientX - panX, y: ev.clientY - panY };
      img.setPointerCapture(ev.pointerId);
    };
    img.onpointermove = function (ev) {
      if (!dragging) return;
      panX = ev.clientX - dragStart.x; panY = ev.clientY - dragStart.y;
      applyTransform(img);
    };
    img.onpointerup = function () { dragging = false; };
    img.ondblclick = function () {
      zoom = zoom > 1 ? 1 : 2.5;
      if (zoom === 1) { panX = panY = 0; }
      applyTransform(img);
    };

    if (d.photo.has_live && d.urls.live) {
      liveBadge.style.display = 'block';
      var playing = null;
      liveBadge.style.cursor = 'pointer';
      liveBadge.onclick = function () {
        if (playing) return;
        playing = document.createElement('video');
        playing.className = 'live-clip';
        playing.src = d.urls.live;
        playing.muted = true; playing.autoplay = true; playing.playsInline = true;
        playing.onended = function () { playing.remove(); playing = null; };
        stage.appendChild(playing);
      };
    }
  }

  function applyTransform(img) {
    img.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
    img.style.cursor = zoom > 1 ? 'grab' : 'zoom-in';
  }

  function renderVideo(d) {
    var v = document.createElement('video');
    v.controls = true; v.autoplay = true; v.playsInline = true;
    if (d.urls.poster) v.poster = d.urls.poster;
    v.src = d.urls.playback || d.urls.download;
    stage.appendChild(v);
  }

  // ---------------- info panel ----------------

  function renderInfo(d) {
    while (infoPanel.firstChild) infoPanel.removeChild(infoPanel.firstChild);
    var h = document.createElement('h3');
    h.textContent = 'Info';
    infoPanel.appendChild(h);
    if (!d) return;
    var p = d.photo;

    addRow('Date', fmtDate(p.taken_at));

    (d.sources || []).forEach(function (s) {
      var conv = s.conversations || {};
      var who = s.sender === 'Me' ? 'You' : s.sender;
      addRow(conv.kind === 'group' ? 'Group chat' : 'Conversation',
        (conv.name || s.conversation_id) + ' — sent by ' + who, true);
    });

    var facts = [];
    if (p.width) facts.push(p.width + '×' + p.height);
    if (p.duration_s) facts.push(Math.round(p.duration_s) + 's');
    if (p.bytes) facts.push(fmtBytes(p.bytes));
    if (p.camera) facts.push(p.camera);
    if (facts.length) addRow('Details', facts.join(' · '));

    var people = (d.faces || []).map(function (f) {
      return f.people && f.people.name ? f.people.name : null;
    }).filter(function (n, i, a) { return n && a.indexOf(n) === i; });
    if (people.length) addRow('People', people.join(', '), true);

    var tags = (d.tags || []).map(function (t) { return t.photo_labels ? t.photo_labels.name : null; }).filter(Boolean);
    if (tags.length) {
      var row = document.createElement('div');
      row.className = 'row';
      var lbl = document.createElement('div');
      lbl.className = 'lbl'; lbl.textContent = 'Tags';
      row.appendChild(lbl);
      var tr = document.createElement('div');
      tr.className = 'tagrow';
      tags.slice(0, 10).forEach(function (t) {
        var tag = document.createElement('span');
        tag.className = 'tag'; tag.textContent = t;
        tr.appendChild(tag);
      });
      row.appendChild(tr);
      infoPanel.appendChild(row);
    }

    if (p.ocr_excerpt) addRow('Text in photo', p.ocr_excerpt, true);

    // tier selector
    var row = document.createElement('div');
    row.className = 'row';
    var lbl = document.createElement('div');
    lbl.className = 'lbl'; lbl.textContent = 'Category';
    row.appendChild(lbl);
    var sel = document.createElement('select');
    [['library', 'Library'], ['screenshot', 'Screenshots'], ['clutter', 'Clutter']].forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[0]; opt.textContent = o[1];
      if (p.tier === o[0]) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      var tier = sel.value;
      PhotoAPI.setTier(p.id, tier).then(function () {
        PhotosApp.toast('Moved to ' + tier + '.');
        if (onTier) onTier(p.id, tier);
      }).catch(function () { PhotosApp.toast('Could not move item.', true); });
    });
    row.appendChild(sel);
    infoPanel.appendChild(row);
  }

  function addRow(label, value, strong) {
    var row = document.createElement('div');
    row.className = 'row';
    var lbl = document.createElement('div');
    lbl.className = 'lbl'; lbl.textContent = label;
    var val = document.createElement('div');
    val.className = 'val';
    if (strong) {
      var b = document.createElement('b');
      b.textContent = value;
      val.appendChild(b);
    } else {
      val.textContent = value;
    }
    row.appendChild(lbl); row.appendChild(val);
    infoPanel.appendChild(row);
  }

  // ---------------- controls ----------------

  function onKey(ev) {
    if (ev.key === 'Escape') close();
    else if (ev.key === 'ArrowLeft') nav(-1);
    else if (ev.key === 'ArrowRight') nav(1);
    else if (ev.key === 'i' || ev.key === 'I') infoPanel.classList.toggle('open');
  }

  function init() {
    lb = $('.ph-lb');
    lb.querySelector('.nav.prev').addEventListener('click', function () { nav(-1); });
    lb.querySelector('.nav.next').addEventListener('click', function () { nav(1); });
    lb.querySelector('.close-btn').addEventListener('click', close);
    lb.querySelector('.info-btn').addEventListener('click', function () {
      lb.querySelector('.info').classList.toggle('open');
    });
    lb.querySelector('.dl-btn').addEventListener('click', function () {
      if (!detail || !detail.urls.download) return;
      var a = document.createElement('a');
      a.href = detail.urls.download;
      a.rel = 'noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    // swipe on touch
    lb.querySelector('.stage').addEventListener('touchstart', function (ev) {
      if (ev.touches.length === 1) touchX = ev.touches[0].clientX;
    }, { passive: true });
    lb.querySelector('.stage').addEventListener('touchend', function (ev) {
      if (touchX === null) return;
      var dx = ev.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 60 && zoom <= 1) nav(dx > 0 ? -1 : 1);
      touchX = null;
    }, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', init);
  window.Lightbox = { open: open, close: close };
})();
