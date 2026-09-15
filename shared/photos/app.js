// Photos app — store, virtualized justified grid, views, search, scrubber.
// All dynamic text rendered via textContent (OCR text and names are
// attacker-influenced content from iMessage senders — never innerHTML them).
(function () {
  'use strict';

  var TIER_NAME = { 0: 'library', 4: 'screenshot', 8: 'clutter' };
  var TIER_BITS = { library: 0, screenshot: 4, clutter: 8 };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  var S = {
    items: [], byId: {}, facets: { people: [], tags: [], conversations: [] },
    view: 'all', search: null,   // {idSet, chips:[{type,label}], q}
    list: [],                    // current filtered items
    layout: null, mounted: new Map(), labelsMounted: false,
    peopleLoaded: false,
    mergeFrom: null,     // null | 'arming' | the person being merged away
  };

  var el = {};

  function $(sel) { return document.querySelector(sel); }

  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = isErr ? 'error show' : 'show';
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.className = ''; }, 2600);
  }

  // ---------------- boot ----------------

  function boot() {
    el.scroll = $('.ph-scroll'); el.canvas = $('.ph-canvas');
    el.scrub = $('.ph-scrub'); el.count = $('.ph-count');
    el.chips = $('.ph-chips'); el.search = $('#ph-search-input');
    el.suggest = $('.ph-suggest');
    el.cardsPeople = $('#ph-people'); el.cardsChats = $('#ph-chats');

    PhotoAPI.library().then(function (r) {
      S.items = r.items.map(function (a) {
        var it = { id: a[0], ts: a[1], w: a[2] || 4, h: a[3] || 3, flags: a[4], bh: a[5] };
        S.byId[it.id] = it;
        return it;
      });
      S.facets = r.facets || S.facets;
      bindUI();
      applyHash();
      refresh();
    }).catch(function (e) {
      var wall = document.createElement('div');
      wall.className = 'ph-wall';
      wall.textContent = e.status === 403 ? 'This account is not authorized.'
        : e.status === 401 ? 'Please sign in from the main site.'
        : 'Could not load the library (' + e.message + ')';
      el.scroll.appendChild(wall);
    });
  }

  // ---------------- filtering ----------------

  function tierOf(it) { return it.flags & 12; }
  function isVideo(it) { return (it.flags & 1) === 1; }

  function computeList() {
    var v = S.view;
    return S.items.filter(function (it) {
      if (S.search) return S.search.idSet.has(it.id);
      if (v === 'all') return tierOf(it) === 0;
      if (v === 'videos') return isVideo(it) && tierOf(it) !== 8;
      if (v === 'screens') return tierOf(it) === 4;
      if (v === 'clutter') return tierOf(it) === 8;
      return false;
    });
  }

  function refresh() {
    S.list = computeList();
    var gridViews = { all: 1, videos: 1, screens: 1, clutter: 1 };
    var isGrid = !!gridViews[S.view] || !!S.search;
    el.scroll.style.display = isGrid ? '' : 'none';
    el.scrub.style.display = isGrid ? '' : 'none';
    el.cardsPeople.classList.toggle('open', S.view === 'people' && !S.search);
    el.cardsChats.classList.toggle('open', S.view === 'chats' && !S.search);
    document.querySelectorAll('.ph-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === S.view && !S.search);
    });
    renderChips();
    el.count.textContent = isGrid ? S.list.length.toLocaleString() + ' items' : '';
    if (S.view === 'people' && !S.peopleLoaded) loadPeople();
    if (S.view === 'chats') renderChats();
    if (isGrid) { layout(); el.scroll.scrollTop = 0; update(); }
    writeHash();
  }

  // ---------------- justified layout ----------------

  function layout() {
    var W = el.canvas.clientWidth;
    if (W < 10) return;
    var mobile = window.innerWidth < 768;
    var target = mobile ? 140 : 220;
    var gap = 4, headerH = 34;
    var rows = [], labels = [], y = 8;
    var i = 0, n = S.list.length, curMonth = null;

    while (i < n) {
      var it = S.list[i];
      var d = new Date(it.ts * 1000);
      var mk = d.getFullYear() + '-' + d.getMonth();
      if (mk !== curMonth) {
        curMonth = mk;
        labels.push({ y: y, text: MONTHS[d.getMonth()].toUpperCase() + ' ' + d.getFullYear(), year: d.getFullYear() });
        y += headerH;
      }
      // greedy row fill within the current month
      var row = [], sumW = 0, j = i;
      while (j < n) {
        var t = S.list[j];
        var td = new Date(t.ts * 1000);
        if ((td.getFullYear() + '-' + td.getMonth()) !== curMonth) break;
        var sw = (t.w / t.h) * target;
        row.push(t); sumW += sw; j++;
        if (sumW + gap * (row.length - 1) >= W) break;
      }
      var rowH = target;
      var avail = W - gap * (row.length - 1);
      var natural = row.reduce(function (s, t) { return s + (t.w / t.h) * target; }, 0);
      if (natural > avail) rowH = target * (avail / natural);
      else if (j < n || row.length > 1) rowH = Math.min(target * 1.25, target * (avail / natural));
      var x = 0, placed = [];
      row.forEach(function (t) {
        var w = (t.w / t.h) * rowH;
        placed.push({ it: t, x: x, w: w });
        x += w + gap;
      });
      rows.push({ y: y, h: rowH, tiles: placed });
      y += rowH + gap;
      i = j;
    }
    S.layout = { rows: rows, labels: labels, total: y + 24, width: W };
    el.canvas.style.height = S.layout.total + 'px';
    // month labels: mount all (cheap)
    el.canvas.querySelectorAll('.ph-month').forEach(function (m) { m.remove(); });
    labels.forEach(function (l) {
      var div = document.createElement('div');
      div.className = 'ph-month';
      div.style.top = (l.y - 2) + 'px';
      div.style.height = '30px';
      div.textContent = l.text;
      el.canvas.appendChild(div);
    });
    S.mounted.forEach(function (elm) { elm.remove(); });
    S.mounted.clear();
    renderScrubYears();
    if (!S.list.length) {
      var empty = document.createElement('div');
      empty.className = 'ph-empty ph-month';
      empty.style.position = 'static';
      empty.textContent = 'Nothing here.';
      el.canvas.appendChild(empty);
    }
  }

  // ---------------- virtualized render ----------------

  function update() {
    if (!S.layout) return;
    var top = el.scroll.scrollTop, vh = el.scroll.clientHeight;
    var lo = top - 1200, hi = top + vh + 1200;
    var rows = S.layout.rows;
    // binary search first row >= lo
    var a = 0, b = rows.length - 1, first = rows.length;
    while (a <= b) {
      var m = (a + b) >> 1;
      if (rows[m].y + rows[m].h >= lo) { first = m; b = m - 1; } else a = m + 1;
    }
    var want = new Set();
    for (var r = first; r < rows.length && rows[r].y <= hi; r++) {
      rows[r].tiles.forEach(function (p) {
        want.add(p.it.id);
        if (!S.mounted.has(p.it.id)) mountTile(p, rows[r]);
        else positionTile(S.mounted.get(p.it.id), p, rows[r]);
      });
    }
    S.mounted.forEach(function (elm, id) {
      if (!want.has(id)) { elm.remove(); S.mounted.delete(id); }
    });
  }

  function positionTile(div, p, row) {
    div.style.transform = 'translate(' + p.x + 'px,' + row.y + 'px)';
    div.style.width = p.w + 'px';
    div.style.height = row.h + 'px';
  }

  function mountTile(p, row) {
    var it = p.it;
    var div = document.createElement('button');
    div.className = 'ph-tile';
    div.style.left = '0'; div.style.top = '0';
    positionTile(div, p, row);
    var cv = document.createElement('canvas');
    if (it.bh) BlurHash.paint(it.bh, cv);
    div.appendChild(cv);
    var img = document.createElement('img');
    img.alt = ''; img.draggable = false;
    div.appendChild(img);
    if (isVideo(it) || (it.flags & 2)) {
      var badge = document.createElement('div');
      badge.className = 'badge';
      var sp = document.createElement('span');
      sp.textContent = isVideo(it) ? '▶' : 'LIVE';
      badge.appendChild(sp);
      div.appendChild(badge);
    }
    var dots = document.createElement('button');
    dots.className = 'dots';
    dots.textContent = '⋯';
    dots.addEventListener('click', function (ev) {
      ev.stopPropagation();
      openTierMenu(it, ev.clientX, ev.clientY);
    });
    div.appendChild(dots);
    div.addEventListener('click', function () {
      Lightbox.open(S.list, S.list.indexOf(it), onTierChanged);
    });
    el.canvas.appendChild(div);
    S.mounted.set(it.id, div);
    PhotoAPI.thumb(it.id).then(function (url) {
      if (!url || !S.mounted.has(it.id)) return;
      img.onload = function () { img.classList.add('on'); };
      img.onerror = function () {
        PhotoAPI.dropCached(it.id);
        PhotoAPI.thumb(it.id).then(function (u2) { if (u2) { img.src = u2; } });
      };
      img.src = url;
    });
  }

  // ---------------- tier menu ----------------

  function openTierMenu(it, x, y) {
    closeMenu();
    var menu = document.createElement('div');
    menu.className = 'ph-menu';
    ['library', 'screenshot', 'clutter'].forEach(function (tier) {
      var b = document.createElement('button');
      b.textContent = (TIER_BITS[tier] === tierOf(it) ? '✓ ' : '') +
        'Move to ' + (tier === 'library' ? 'Library' : tier === 'screenshot' ? 'Screenshots' : 'Clutter');
      if (TIER_BITS[tier] === tierOf(it)) b.className = 'cur';
      b.addEventListener('click', function () {
        closeMenu();
        setTier(it, tier);
      });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    var mw = 180;
    menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 130) + 'px';
    setTimeout(function () {
      document.addEventListener('click', closeMenu, { once: true });
    }, 0);
  }

  function closeMenu() {
    var m = document.querySelector('.ph-menu');
    if (m) m.remove();
  }

  function setTier(it, tier) {
    var prev = TIER_NAME[tierOf(it)];
    if (prev === tier) return;
    it.flags = (it.flags & ~12) | TIER_BITS[tier];
    refresh();
    PhotoAPI.setTier(it.id, tier).then(function () {
      toast('Moved to ' + tier + '.');
    }).catch(function () {
      it.flags = (it.flags & ~12) | TIER_BITS[prev];
      refresh();
      toast('Could not move item.', true);
    });
  }

  function onTierChanged(id, tier) {
    var it = S.byId[id];
    if (it) { it.flags = (it.flags & ~12) | TIER_BITS[tier]; refresh(); }
  }

  // ---------------- scrubber ----------------

  function renderScrubYears() {
    el.scrub.querySelectorAll('.year').forEach(function (n) { n.remove(); });
    if (!S.layout || !S.layout.labels.length) return;
    var seen = {}, total = S.layout.total;
    S.layout.labels.forEach(function (l) {
      if (seen[l.year]) return;
      seen[l.year] = true;
      var d = document.createElement('div');
      d.className = 'year';
      d.style.top = Math.min(96, (l.y / total) * 100) + '%';
      d.textContent = String(l.year);
      el.scrub.appendChild(d);
    });
  }

  function bindScrubber() {
    var bubble = el.scrub.querySelector('.bubble');
    function monthAt(scrollY) {
      if (!S.layout) return '';
      var lbls = S.layout.labels, cur = lbls[0];
      for (var i = 0; i < lbls.length; i++) {
        if (lbls[i].y <= scrollY + 40) cur = lbls[i]; else break;
      }
      return cur ? cur.text : '';
    }
    function seek(clientY, doScroll) {
      var r = el.scrub.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
      var max = el.scroll.scrollHeight - el.scroll.clientHeight;
      if (doScroll) el.scroll.scrollTop = pct * max;
      bubble.style.top = (pct * 100) + '%';
      bubble.textContent = monthAt(pct * max);
    }
    var dragging = false;
    el.scrub.addEventListener('pointerdown', function (e) {
      dragging = true; el.scrub.classList.add('active');
      el.scrub.setPointerCapture(e.pointerId);
      seek(e.clientY, true);
    });
    el.scrub.addEventListener('pointermove', function (e) {
      seek(e.clientY, dragging);
    });
    el.scrub.addEventListener('pointerup', function () {
      dragging = false; el.scrub.classList.remove('active');
    });
  }

  // ---------------- search ----------------

  function renderChips() {
    while (el.chips.firstChild) el.chips.removeChild(el.chips.firstChild);
    el.chips.classList.toggle('has', !!S.search);
    if (!S.search) return;
    S.search.chips.forEach(function (c) {
      var chip = document.createElement('span');
      chip.className = 'ph-chip';
      var label = document.createElement('span');
      label.textContent = (c.type === 'text' ? '' : c.type + ': ') + c.label;
      chip.appendChild(label);
      var x = document.createElement('button');
      x.textContent = '×';
      x.setAttribute('aria-label', 'Clear');
      x.addEventListener('click', clearSearch);
      chip.appendChild(x);
      el.chips.appendChild(chip);
    });
  }

  function clearSearch() {
    S.search = null;
    el.search.value = '';
    refresh();
  }

  function runSearch(q, chipOverride) {
    if (!q) { clearSearch(); return; }
    PhotoAPI.search(q).then(function (r) {
      S.search = {
        idSet: new Set(r.ids),
        chips: (chipOverride ? [chipOverride] : (r.chips && r.chips.length ? r.chips : [{ type: 'text', label: q }])),
        q: q,
      };
      hideSuggest();
      refresh();
      if (!r.ids.length) toast('No matches.');
    }).catch(function () { toast('Search failed.', true); });
  }

  function suggestions(q) {
    var out = [], ql = q.toLowerCase();
    if (!ql) return out;
    S.facets.people.forEach(function (p) {
      if (p.name && p.name.toLowerCase().indexOf(ql) >= 0 && out.length < 3) {
        out.push({ kind: 'person', label: p.name, run: 'person:' + p.id });
      }
    });
    S.facets.conversations.forEach(function (c) {
      if (c.name.toLowerCase().indexOf(ql) >= 0 && out.length < 6) {
        out.push({ kind: c.kind === 'group' ? 'group' : 'chat', label: c.name, run: 'conversation:' + c.id });
      }
    });
    S.facets.tags.forEach(function (t) {
      if (t.name.toLowerCase().indexOf(ql) >= 0 && out.length < 9) {
        out.push({ kind: 'tag', label: t.name, run: t.name });
      }
    });
    return out;
  }

  function showSuggest(list) {
    while (el.suggest.firstChild) el.suggest.removeChild(el.suggest.firstChild);
    if (!list.length) { hideSuggest(); return; }
    list.forEach(function (s) {
      var b = document.createElement('button');
      var k = document.createElement('span');
      k.className = 'kind'; k.textContent = s.kind;
      var l = document.createElement('span');
      l.textContent = s.label;
      b.appendChild(k); b.appendChild(l);
      b.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        el.search.value = s.label;
        runSearch(s.run, { type: s.kind, label: s.label });
      });
      el.suggest.appendChild(b);
    });
    el.suggest.classList.add('open');
  }

  function hideSuggest() { el.suggest.classList.remove('open'); }

  // ---------------- people view ----------------

  function loadPeople() {
    S.peopleLoaded = true;
    PhotoAPI.people().then(function (r) {
      renderPeople(r.people || []);
    }).catch(function () { toast('Could not load people.', true); });
  }

  // Scale + offset a whole photo so the face box fills most of the circular
  // container. The old code used a fixed scale(1.6); the median cover face is
  // under 10% of its photo's width, so it needs ~6x — 1.6x just showed the
  // group shot. Needs natural dimensions, so it runs on load.
  var FACE_TARGET = 0.62;          // face box should span ~62% of the circle
  function zoomToFace(img, bb) {
    function place() {
      var ar = img.naturalHeight / img.naturalWidth;
      if (!ar || !bb[2] || !bb[3]) return;
      // Render the image k times the container width, so the bbox lands at
      // FACE_TARGET of it. Bound the zoom: past ~12x there are no pixels left.
      var k = Math.min(FACE_TARGET / bb[2], 12);
      var left = 50 - k * 100 * (bb[0] + bb[2] / 2);
      var top = 50 - k * ar * 100 * (bb[1] + bb[3] / 2);
      // Keep the frame covered — never let the circle show blank corners.
      left = Math.max(Math.min(left, 0), 100 - k * 100);
      top = Math.max(Math.min(top, 0), 100 - k * ar * 100);
      img.style.width = (k * 100) + '%';
      img.style.height = 'auto';
      img.style.left = left.toFixed(1) + '%';
      img.style.top = top.toFixed(1) + '%';
      img.classList.add('zoom');
    }
    if (img.complete && img.naturalWidth) place();
    else img.addEventListener('load', place, { once: true });
  }

  function renderPeople(people) {
    var root = el.cardsPeople;
    while (root.firstChild) root.removeChild(root.firstChild);

    var head = document.createElement('div');
    head.className = 'ph-people-head';
    var h = document.createElement('h2');
    h.textContent = 'People (' + people.length + ')';
    head.appendChild(h);

    // Merge mode: pick the duplicate, then pick who it really is.
    var mergeBtn = document.createElement('button');
    mergeBtn.type = 'button';
    mergeBtn.className = 'ph-merge-btn';
    mergeBtn.textContent = S.mergeFrom ? 'Cancel merge' : 'Merge duplicates';
    mergeBtn.addEventListener('click', function () {
      S.mergeFrom = S.mergeFrom ? null : 'arming';
      renderPeople(people);
    });
    head.appendChild(mergeBtn);
    root.appendChild(head);

    if (S.mergeFrom) {
      var hint = document.createElement('p');
      hint.className = 'ph-merge-hint';
      hint.textContent = S.mergeFrom === 'arming'
        ? 'Click the duplicate face — the one you want to get rid of.'
        : 'Now click the person it should be merged into. Their name is kept.';
      root.appendChild(hint);
    }

    // Two circles that resolve to the same name are the duplicates worth
    // merging. Counting confirmed names alongside suggestions catches the
    // common case: one cluster already named, its twin still unnamed.
    var byLabel = {};
    people.forEach(function (p) {
      var k = (p.name || p.name_suggestion || '').trim().toLowerCase();
      if (k) byLabel[k] = (byLabel[k] || 0) + 1;
    });

    var grid = document.createElement('div');
    grid.className = 'ph-people-grid';
    people.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'ph-person';
      var label = (p.name || p.name_suggestion || '').trim().toLowerCase();
      var isDupe = label && byLabel[label] > 1;
      if (isDupe) card.classList.add('maybe-dupe');
      if (S.mergeFrom && S.mergeFrom !== 'arming' && S.mergeFrom.id === p.id) {
        card.classList.add('merge-src');
      }
      var face = document.createElement('div');
      face.className = 'face';
      if (p.cover_url) {
        var img = document.createElement('img');
        img.alt = '';
        img.src = p.cover_url;
        if (p.cover_cropped) {
          // Already a square crop of one face — just fill the circle.
          img.className = 'crop';
        } else if (p.cover_bbox && p.cover_bbox.length === 4) {
          zoomToFace(img, p.cover_bbox);
        }
        face.appendChild(img);
      }
      face.style.cursor = 'pointer';
      face.addEventListener('click', function () {
        if (S.mergeFrom) return pickForMerge(p, people);
        S.view = 'all';
        runSearch('person:' + p.id, { type: 'person', label: p.name || 'Unnamed person' });
      });
      card.appendChild(face);
      if (p.name) {
        var nm = document.createElement('div');
        nm.className = 'nm'; nm.textContent = p.name;
        nm.style.cursor = 'pointer';
        nm.title = 'Click to rename';
        nm.addEventListener('click', function () { editName(card, p, nm); });
        card.appendChild(nm);
      } else {
        var input = document.createElement('input');
        input.placeholder = 'Add name';
        input.maxLength = 60;
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') saveName(p, input.value, input);
        });
        input.addEventListener('blur', function () {
          if (input.value.trim()) saveName(p, input.value, input);
        });
        card.appendChild(input);
        // A name inferred from the conversation these faces arrived in. One
        // click confirms it; it is never applied on its own.
        if (p.name_suggestion) {
          var sug = document.createElement('button');
          sug.type = 'button';
          sug.className = 'ph-suggest';
          sug.textContent = p.name_suggestion + '?';
          sug.title = 'Suggested from ' + (p.name_source || 'conversation metadata');
          sug.addEventListener('click', function (ev) {
            ev.stopPropagation();
            saveName(p, p.name_suggestion, sug);
          });
          card.appendChild(sug);
        }
      }
      var ct = document.createElement('div');
      ct.className = 'ct';
      ct.textContent = p.face_count + ' photos';
      if (isDupe) {
        ct.textContent += ' · also elsewhere';
        ct.title = 'Another face resolves to the same name — "Merge duplicates" joins them.';
      }
      card.appendChild(ct);
      grid.appendChild(card);
    });
    root.appendChild(grid);
  }

  // Two-step merge: first click marks the duplicate, second click names the
  // survivor. Confirmed before it runs, because it is not reversible from here.
  function pickForMerge(p, people) {
    if (S.mergeFrom === 'arming') {
      S.mergeFrom = p;
      return renderPeople(people);
    }
    var src = S.mergeFrom;
    if (src.id === p.id) { S.mergeFrom = 'arming'; return renderPeople(people); }
    var srcLabel = src.name || src.face_count + ' photos';
    var dstLabel = p.name || p.face_count + ' photos';
    if (!window.confirm(
        'Merge "' + srcLabel + '" into "' + dstLabel + '"?\n\n' +
        (src.face_count + p.face_count) + ' photos will end up under ' + dstLabel +
        '. This cannot be undone from here.')) return;
    S.mergeFrom = null;
    PhotoAPI.mergePerson(src.id, p.id).then(function (r) {
      var n = r.person && r.person.face_count;
      toast('Merged — ' + (p.name || 'that person') + ' now has ' + n + ' photos.');
      S.peopleLoaded = false;
      S.facets.people = S.facets.people.filter(function (f) { return f.id !== src.id; });
      loadPeople();
    }).catch(function () {
      toast('Could not merge those two.', true);
      loadPeople();
    });
  }

  function editName(card, p, nmEl) {
    var input = document.createElement('input');
    input.value = p.name || '';
    input.maxLength = 60;
    card.replaceChild(input, nmEl);
    input.focus();
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') saveName(p, input.value, input);
    });
    input.addEventListener('blur', function () { saveName(p, input.value, input); });
  }

  function saveName(p, name, inputEl) {
    name = name.trim();
    if (!name || name === p.name) { S.peopleLoaded = false; if (S.view === 'people') loadPeople(); return; }
    PhotoAPI.updatePerson(p.id, { name: name }).then(function () {
      p.name = name;
      var fp = S.facets.people.filter(function (f) { return f.id === p.id; })[0];
      if (fp) fp.name = name; else S.facets.people.push({ id: p.id, name: name });
      toast('Named ' + name + '.');
      S.peopleLoaded = false;
      if (S.view === 'people') loadPeople();
    }).catch(function () { toast('Could not save name.', true); });
  }

  // ---------------- chats view ----------------

  function renderChats() {
    var root = el.cardsChats;
    while (root.firstChild) root.removeChild(root.firstChild);
    [['person', 'People'], ['group', 'Groups']].forEach(function (pair) {
      var subset = S.facets.conversations.filter(function (c) { return c.kind === pair[0]; });
      if (!subset.length) return;
      var h = document.createElement('h2');
      h.textContent = pair[1] + ' (' + subset.length + ')';
      root.appendChild(h);
      var grid = document.createElement('div');
      grid.className = 'ph-conv-grid';
      subset.forEach(function (c) {
        var b = document.createElement('button');
        b.className = 'ph-conv';
        var nm = document.createElement('div');
        nm.className = 'nm'; nm.textContent = c.name;
        var ct = document.createElement('div');
        ct.className = 'ct'; ct.textContent = c.count + ' items';
        b.appendChild(nm); b.appendChild(ct);
        b.addEventListener('click', function () {
          S.view = 'all';
          runSearch('conversation:' + c.id, { type: c.kind === 'group' ? 'group' : 'chat', label: c.name });
        });
        grid.appendChild(b);
      });
      root.appendChild(grid);
    });
  }

  // ---------------- hash state ----------------

  function writeHash() {
    var h = '#' + S.view;
    if (S.search && S.search.q) h += '&q=' + encodeURIComponent(S.search.q);
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  function applyHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var parts = h.split('&');
    if (['all', 'videos', 'people', 'chats', 'screens', 'clutter'].indexOf(parts[0]) >= 0) {
      S.view = parts[0];
    }
    parts.forEach(function (p) {
      if (p.indexOf('q=') === 0) {
        var q = decodeURIComponent(p.slice(2));
        el.search.value = q;
        runSearch(q);
      }
    });
  }

  // ---------------- UI wiring ----------------

  function bindUI() {
    document.querySelectorAll('.ph-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        S.search = null; el.search.value = '';
        S.view = b.dataset.view;
        refresh();
      });
    });
    el.scroll.addEventListener('scroll', function () {
      window.requestAnimationFrame(update);
    });
    var rT = null;
    window.addEventListener('resize', function () {
      clearTimeout(rT);
      rT = setTimeout(function () { layout(); update(); }, 150);
    });
    el.search.addEventListener('input', function () {
      showSuggest(suggestions(el.search.value.trim()));
    });
    el.search.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { runSearch(el.search.value.trim()); }
      if (ev.key === 'Escape') { hideSuggest(); el.search.blur(); }
    });
    el.search.addEventListener('blur', function () { setTimeout(hideSuggest, 150); });
    bindScrubber();
  }

  window.PhotosApp = { boot: boot, toast: toast };
})();
