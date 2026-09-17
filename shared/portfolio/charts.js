// charts.js — dependency-free SVG charts.
// The page CSP allows scripts only from self + jsdelivr and blocks external
// stylesheets, so hand-rolled SVG beats pulling a charting library.
// Colour is reserved for data; everything structural is grey.

window.PFCharts = (function () {
  'use strict';

  var PALETTE = ['#8ab4f8', '#81c995', '#fdd663', '#c58af9', '#f28b82',
                 '#78d9ec', '#fbbc9d', '#aecbfa', '#a8dab5', '#fde293',
                 '#d7aefb', '#f6aea9'];
  var GREY = '#dadce0', INK3 = '#80868b';

  function color(i) { return PALETTE[i % PALETTE.length]; }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    return (n < 0 ? '-$' : '$') +
      Math.abs(Math.round(n)).toLocaleString('en-US');
  }

  // ---- donut -----------------------------------------------------------
  function donut(items, opts) {
    opts = opts || {};
    var size = opts.size || 200, thick = opts.thick || 26;
    var cx = size / 2, cy = size / 2, r = (size - thick) / 2 - 1;
    var total = items.reduce(function (s, x) { return s + x.value; }, 0) || 1;
    var a0 = -Math.PI / 2, parts = [];

    items.forEach(function (it, i) {
      var frac = it.value / total;
      if (frac <= 0.0005) { return; }
      var a1 = a0 + frac * Math.PI * 2;
      if (frac > 0.9995) {
        parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
          '" fill="none" stroke="' + color(i) + '" stroke-width="' + thick +
          '" data-i="' + i + '"><title>' + esc(it.label) + ' — ' +
          money(it.value) + ' (100%)</title></circle>');
      } else {
        var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        parts.push('<path d="M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r +
          ' ' + r + ' 0 ' + ((a1 - a0) > Math.PI ? 1 : 0) + ' 1 ' + x1.toFixed(2) +
          ' ' + y1.toFixed(2) + '" fill="none" stroke="' + color(i) +
          '" stroke-width="' + thick + '" stroke-linecap="butt" data-i="' + i +
        '"><title>' +
          esc(it.label) + ' — ' + money(it.value) + ' (' +
          (frac * 100).toFixed(1) + '%)</title></path>');
      }
      a0 = a1;
    });

    return '<svg class="chart" viewBox="0 0 ' + size + ' ' + size +
      '" style="max-width:' + size + 'px" role="img">' + parts.join('') +
      (opts.centerTop ? '<text x="' + cx + '" y="' + (cy + 1) +
        '" text-anchor="middle" font-size="17" fill="#202124" ' +
        'font-family="Roboto Mono,monospace">' + esc(opts.centerTop) + '</text>' : '') +
      (opts.centerSub ? '<text x="' + cx + '" y="' + (cy + 17) +
        '" text-anchor="middle" font-size="10.5" fill="' + INK3 + '">' +
        esc(opts.centerSub) + '</text>' : '') + '</svg>';
  }

  function legend(items, total) {
    return '<div class="legend">' + items.map(function (it, i) {
      return '<div data-i="' + i + '"><span class="sw" style="background:' +
        color(i) + '"></span><span class="legend__l">' + esc(it.label) +
        '</span><span class="legend__v">' + money(it.value) + '</span>' +
        '<span class="legend__p">' + (it.value / total * 100).toFixed(1) +
        '%</span></div>';
    }).join('') + '</div>';
  }

  // Before/after as a dumbbell: one row per holding, a dot for now and a dot
  // for after, joined by a line.
  //
  // This replaced a pair of stacked bars per row. Two bars meant comparing two
  // lengths from a shared left edge, which is the thing eyes are worst at, and
  // it cost two rows of height per holding. Here the distance between the dots
  // IS the change and the direction is just which dot sits left.
  //
  // Deliberately no red/green. The old version coloured a decrease green and
  // an increase red, so cutting Tesla read as "good" and buying the ETF that
  // replaces it read as "bad" -- but both are the plan working as intended.
  // Direction is not goodness, so it does not get a goodness colour.
  function dumbbell(items, opts) {
    opts = opts || {};
    var w = opts.width || 480, labelW = opts.labelW || 86, valW = 120;
    var rowH = 26, top = 18;
    var axisW = w - labelW - valW - 10;
    var max = Math.max.apply(null, items.map(function (it) {
      return Math.max(it.before, it.after, it.target || 0); })) || 1;
    max = Math.ceil(max / 10) * 10;
    var X = function (v) { return labelW + (v / max) * axisW; };

    var ticks = [0, max / 2, max].map(function (v) {
      return '<line x1="' + X(v) + '" y1="' + (top - 6) + '" x2="' + X(v) +
        '" y2="' + (top + items.length * rowH - 8) + '" stroke="#f1f3f4"/>' +
        '<text x="' + X(v) + '" y="' + (top - 10) + '" text-anchor="middle" ' +
        'font-size="9" fill="' + INK3 + '">' + v + '%</text>';
    }).join('');

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' +
        (top + items.length * rowH) + '" role="img">' + ticks +
      items.map(function (it, i) {
        var y = top + i * rowH + 7;
        var x0 = X(it.before), x1 = X(it.after), d = it.after - it.before;
        var tip = it.label + '\n' + it.before.toFixed(1) + '% \u2192 ' +
          it.after.toFixed(1) + '%  (' + (d >= 0 ? '+' : '') + d.toFixed(1) +
          ' pts)' + (it.target != null ? '\ntarget ' + it.target + '%' : '');
        return '<g data-tip="' + esc(tip) + '">' +
          '<rect x="0" y="' + (y - 11) + '" width="' + w + '" height="' + rowH +
            '" fill="transparent"/>' +
          // Clip rather than let a long theme name run under the axis; the
          // full name is in the tooltip.
          '<text x="0" y="' + (y + 4) + '" font-size="11.5" fill="#202124">' +
            esc(it.label.length > 13 ? it.label.slice(0, 12) + '\u2026'
                                     : it.label) + '</text>' +
          (it.target != null ? '<line x1="' + X(it.target) + '" y1="' + (y - 7) +
            '" x2="' + X(it.target) + '" y2="' + (y + 7) +
            '" stroke="#5f6368" stroke-width="1" stroke-dasharray="2 2"/>' : '') +
          '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y +
            '" stroke="#c6dafc" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="' + x0 + '" cy="' + y + '" r="3.6" fill="#fff" ' +
            'stroke="#9aa0a6" stroke-width="1.6"/>' +
          '<circle cx="' + x1 + '" cy="' + y + '" r="4.2" fill="#1a73e8"/>' +
          '<text x="' + (w - 46) + '" y="' + (y + 4) + '" text-anchor="end" ' +
            'font-size="10.5" font-family="Roboto Mono,monospace" fill="' +
            INK3 + '">' + it.before.toFixed(1) + '</text>' +
          '<text x="' + (w - 36) + '" y="' + (y + 4) + '" text-anchor="middle" ' +
            'font-size="10" fill="#bdc1c6">\u2192</text>' +
          '<text x="' + w + '" y="' + (y + 4) + '" text-anchor="end" ' +
            'font-size="10.5" font-family="Roboto Mono,monospace" ' +
            'fill="#202124">' + it.after.toFixed(1) + '</text>' +
          '</g>';
      }).join('') + '</svg>';
  }

  // ---- horizontal bars -------------------------------------------------
  function hbars(items, opts) {
    opts = opts || {};
    var rowH = 28, labelW = opts.labelW || 74, valW = opts.valW || 76,
        w = opts.width || 420;
    var h = items.length * rowH;
    var max = Math.max.apply(null, items.map(function (x) { return x.value; })) || 1;
    var barW = w - labelW - valW;

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
      items.map(function (it, i) {
        var y = i * rowH;
        var bw = Math.max(2, it.value / max * barW);
        return '<text x="0" y="' + (y + rowH / 2 + 4) + '" font-size="12.5" ' +
            'fill="#5f6368">' + esc(it.label) + '</text>' +
          '<rect x="' + labelW + '" y="' + (y + 6) + '" width="' + bw.toFixed(1) +
            '" height="' + (rowH - 14) + '" rx="2" fill="' +
            (it.color || color(opts.mono ? 0 : i)) + '"><title>' + esc(it.label) +
            ' — ' + money(it.value) + '</title></rect>' +
          '<text x="' + w + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end" ' +
            'font-size="12" font-family="Roboto Mono,monospace" fill="' + INK3 +
            '">' + esc(it.note || money(it.value)) + '</text>';
      }).join('') + '</svg>';
  }

  // ---- before / after --------------------------------------------------
  function beforeAfter(items, opts) {
    opts = opts || {};
    var rowH = 36, labelW = 96, valW = 118, w = opts.width || 480;
    var h = items.length * rowH;
    var max = Math.max.apply(null, items.map(function (x) {
      return Math.max(x.before, x.after, x.target || 0); })) || 1;
    var barW = w - labelW - valW;
    var fmt = opts.fmt || function (v) { return v.toFixed(1) + '%'; };

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
      items.map(function (it, i) {
        var y = i * rowH + 4;
        var b = Math.max(2, it.before / max * barW);
        var a = Math.max(2, it.after / max * barW);
        var d = it.after - it.before;
        var tgt = it.target !== undefined && it.target !== null
          ? '<line x1="' + (labelW + it.target / max * barW) + '" y1="' + (y - 1) +
            '" x2="' + (labelW + it.target / max * barW) + '" y2="' + (y + 23) +
            '" stroke="#5f6368" stroke-width="1.5" stroke-dasharray="2 2">' +
            '<title>target ' + fmt(it.target) + '</title></line>' : '';
        return '<text x="0" y="' + (y + 14) + '" font-size="12.5" ' +
            'fill="#5f6368">' + esc(it.label) + '</text>' +
          '<rect x="' + labelW + '" y="' + y + '" width="' + b.toFixed(1) +
            '" height="9" rx="2" fill="' + GREY + '"/>' +
          '<rect x="' + labelW + '" y="' + (y + 12) + '" width="' + a.toFixed(1) +
            '" height="9" rx="2" fill="' + (opts.afterColor || '#8ab4f8') + '"/>' +
          tgt +
          '<text x="' + w + '" y="' + (y + 8) + '" text-anchor="end" ' +
            'font-size="11.5" font-family="Roboto Mono,monospace" fill="' + INK3 +
            '">' + fmt(it.before) + '</text>' +
          '<text x="' + w + '" y="' + (y + 21) + '" text-anchor="end" ' +
            'font-size="11.5" font-family="Roboto Mono,monospace" fill="' +
            (Math.abs(d) < 0.05 ? INK3 : (d < 0 ? '#188038' : '#c5221f')) + '">' +
            fmt(it.after) + (Math.abs(d) >= 0.05
              ? '  ' + (d > 0 ? '+' : '') + d.toFixed(1) : '') + '</text>';
      }).join('') + '</svg>';
  }

  // ---- line chart (trim curve) -----------------------------------------
  // pts: [{x, y}] in data units. Draws tax cost against shares sold.
  function line(pts, opts) {
    opts = opts || {};
    var w = opts.width || 460, h = opts.height || 170;
    var padL = 52, padR = 12, padT = 12, padB = 28;
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xMax = Math.max.apply(null, xs) || 1;
    var yMax = Math.max.apply(null, ys) || 1;
    var X = function (v) { return padL + v / xMax * (w - padL - padR); };
    var Y = function (v) { return h - padB - v / yMax * (h - padT - padB); };

    var path = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1);
    }).join(' ');
    var area = path + ' L' + X(pts[pts.length - 1].x).toFixed(1) + ' ' +
      Y(0).toFixed(1) + ' L' + X(pts[0].x).toFixed(1) + ' ' + Y(0).toFixed(1) + ' Z';

    var gridY = [0, 0.5, 1].map(function (f) {
      var v = yMax * f;
      return '<line x1="' + padL + '" y1="' + Y(v) + '" x2="' + (w - padR) +
        '" y2="' + Y(v) + '" stroke="' + GREY + '" stroke-width="1"/>' +
        '<text x="' + (padL - 7) + '" y="' + (Y(v) + 3.5) + '" text-anchor="end" ' +
        'font-size="10.5" font-family="Roboto Mono,monospace" fill="' + INK3 +
        '">' + (opts.fmtY ? opts.fmtY(v) : Math.round(v)) + '</text>';
    }).join('');

    var gridX = [0, 0.25, 0.5, 0.75, 1].map(function (f) {
      var v = xMax * f;
      return '<text x="' + X(v) + '" y="' + (h - 9) + '" text-anchor="middle" ' +
        'font-size="10.5" font-family="Roboto Mono,monospace" fill="' + INK3 +
        '">' + (opts.fmtX ? opts.fmtX(v) : Math.round(v)) + '</text>';
    }).join('');

    var marks = (opts.marks || []).map(function (m) {
      return '<circle cx="' + X(m.x) + '" cy="' + Y(m.y) + '" r="3.5" ' +
        'fill="#1a73e8"><title>' + esc(m.label) + '</title></circle>';
    }).join('');

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
      gridY + gridX +
      '<path d="' + area + '" fill="#8ab4f8" opacity=".18"/>' +
      '<path d="' + path + '" fill="none" stroke="#1a73e8" stroke-width="2" ' +
      'stroke-linejoin="round"/>' + marks + '</svg>';
  }

  return { donut: donut, legend: legend, hbars: hbars, beforeAfter: beforeAfter, dumbbell: dumbbell,
           line: line, color: color, esc: esc, money: money };
})();

// ---- sankey + stacked composition -------------------------------------
// Added after the original IIFE so the module stays readable; both attach to
// the same PFCharts namespace.
(function (C) {
  'use strict';
  var esc = C.esc, money = C.money;
  var INK3 = '#80868b';

  // nodes: [{id, label, col, color}]   links: [{from, to, value}]
  // Three columns: what was sold, the account it sat in, what it became.
  // Laying it out this way makes the binding constraint visible — proceeds
  // cannot cross from one account into another.
  function sankey(nodes, links, opts) {
    opts = opts || {};
    var w = opts.width || 900, gap = 5, pad = 4;
    var cols = {};
    nodes.forEach(function (n) { (cols[n.col] = cols[n.col] || []).push(n); });
    var nCols = Object.keys(cols).length;

    // node value = max(in, out) so a pass-through account is sized correctly
    var val = {};
    nodes.forEach(function (n) { val[n.id] = 0; });
    var inn = {}, out = {};
    links.forEach(function (l) {
      out[l.from] = (out[l.from] || 0) + l.value;
      inn[l.to] = (inn[l.to] || 0) + l.value;
    });
    nodes.forEach(function (n) {
      val[n.id] = Math.max(inn[n.id] || 0, out[n.id] || 0); });

    // tallest column drives the scale
    var colTotal = Object.keys(cols).map(function (c) {
      return cols[c].reduce(function (s, n) { return s + val[n.id]; }, 0); });
    var maxTotal = Math.max.apply(null, colTotal) || 1;
    var maxCount = Math.max.apply(null, Object.keys(cols).map(function (c) {
      return cols[c].length; }));
    var hTarget = opts.height || Math.max(420, maxCount * 34);
    var scale = (hTarget - (maxCount - 1) * gap) / maxTotal;

    var NODE_W = 11, labelW = opts.labelW || 150;
    var colX = {};
    Object.keys(cols).sort().forEach(function (c, i) {
      colX[c] = labelW + i * ((w - labelW * 2 - NODE_W) / Math.max(1, nCols - 1));
    });

    // Each node carries a two- or three-line label block beside it, and that
    // block needs vertical room whether or not the node itself is tall. Sizing
    // on value alone let small nodes sit 15px apart under 21px of text, so the
    // labels ran into each other. Reserve the label height as a minimum pitch
    // and let the chart grow taller instead of overlapping.
    // The label block is not centred on the node: a two-line block runs from
    // about 4.5px above the midpoint to 17px below it, and a three-line block
    // (with `sub`) from 11 above to 22 below. Spacing on a symmetric average
    // left the lower line of one block almost touching the upper line of the
    // next, so measure the real extents and clear them with a little padding.
    var MIN_H = 10, PAD = 5;
    function topOf(n) { return n.sub ? -11 : -4.5; }
    function botOf(n) { return n.sub ? 22 : 17; }
    var HALO = ' paint-order="stroke" stroke="#fff" stroke-width="3"' +
               ' stroke-linejoin="round"';
    var pos = {}, colH = [];
    Object.keys(cols).forEach(function (c) {
      var list = cols[c].sort(function (a, b) { return val[b.id] - val[a.id]; });
      var y = 0;
      list.forEach(function (n, i) {
        var nh = Math.max(MIN_H, val[n.id] * scale);
        pos[n.id] = { x: colX[c], y: y, h: nh, col: +c };
        var nx = list[i + 1];
        if (!nx) { y += nh; return; }
        // centre-to-centre distance must clear this block's bottom and the
        // next block's top
        var need = botOf(n) - topOf(nx) + PAD;
        var nxh = Math.max(MIN_H, val[nx.id] * scale);
        y += nh + Math.max(gap, need - (nh + nxh) / 2);
      });
      colH.push(y);
    });
    // Grow to fit rather than clipping past the viewBox, which is what the
    // old fixed height did once any node hit the floor.
    var h = Math.max(hTarget, Math.max.apply(null, colH));

    // ribbons, tracked per node so parallel links stack instead of overlap
    var offOut = {}, offIn = {};
    var ribbons = links.slice().sort(function (a, b) { return b.value - a.value; })
      .map(function (l) {
        var a = pos[l.from], b = pos[l.to];
        if (!a || !b) return '';
        var lh = Math.max(1.5, l.value * scale);
        var y0 = a.y + (offOut[l.from] = (offOut[l.from] || 0)) ;
        var y1 = b.y + (offIn[l.to] = (offIn[l.to] || 0));
        offOut[l.from] += lh; offIn[l.to] += lh;
        var x0 = a.x + NODE_W, x1 = b.x, mx = (x0 + x1) / 2;
        return '<path d="M' + x0 + ' ' + y0 + ' C' + mx + ' ' + y0 + ' ' + mx +
          ' ' + y1 + ' ' + x1 + ' ' + y1 + ' L' + x1 + ' ' + (y1 + lh) +
          ' C' + mx + ' ' + (y1 + lh) + ' ' + mx + ' ' + (y0 + lh) + ' ' +
          x0 + ' ' + (y0 + lh) + ' Z" fill="' + (l.color || '#8ab4f8') +
          '" opacity="' + (l.opacity || '.33') + '"><title>' + esc(l.label || '') + ' ' +
          money(l.value) + '</title></path>';
      }).join('');

    var boxes = nodes.map(function (n) {
      var p = pos[n.id]; if (!p) return '';
      // First column labels to the left; every other column to the right,
      // so interior labels trail into open space instead of being
      // right-anchored back across their own incoming ribbons.
      var right = p.col > 0;
      var lx = right ? p.x + NODE_W + 7 : p.x - 7;
      return '<rect x="' + p.x + '" y="' + p.y + '" width="' + NODE_W +
          '" height="' + p.h + '" rx="2" fill="' + (n.color || '#5f6368') +
          '"><title>' + esc(n.label) + ' ' + money(val[n.id]) + '</title></rect>' +
        ('<text x="' + lx + '" y="' + (p.y + p.h / 2 + (n.sub ? -3 : 3.5)) +
          '" text-anchor="' + (right ? 'start' : 'end') + '" font-size="11" ' +
          'fill="#5f6368"' + HALO + '>' + esc(n.label) + '</text>' +
          '<text x="' + lx + '" y="' + (p.y + p.h / 2 + (n.sub ? 9 : 15)) +
          '" text-anchor="' + (right ? 'start' : 'end') + '" font-size="9.5" ' +
          'fill="' + INK3 + '" font-family="Roboto Mono,monospace"' + HALO + '>' +
          money(val[n.id]) + '</text>' +
          (n.sub ? '<text x="' + lx + '" y="' + (p.y + p.h / 2 + 20) +
            '" text-anchor="' + (right ? 'start' : 'end') + '" font-size="9" ' +
            'fill="' + INK3 + '"' + HALO + '>' + esc(n.sub) + '</text>' : ''));
    }).join('');

    var heads = (opts.headers || []).map(function (t, i) {
      return '<text x="' + (colX[i] + NODE_W / 2) + '" y="-12" ' +
        'text-anchor="middle" font-size="11" fill="' + INK3 + '">' +
        esc(t) + '</text>'; }).join('');

    return '<svg class="chart" viewBox="0 -28 ' + w + ' ' + (h + 28 + 26) +
      '" role="img">' + heads + ribbons + boxes + '</svg>';
  }

  // One stacked bar per account, before over after.
  // One bar per group on a SHARED scale, so bar length reads as size and the
  // segments read as composition. A group may carry more than one series --
  // one bar for "now" and one for "after" -- which is how the same picture
  // serves both the current book and a proposed one.
  //
  // Segments carry data-tip rather than <title>: a native SVG tooltip is slow
  // to appear, cannot be styled, and cannot show a folded block's contents on
  // more than one line. C.tips() wires the real thing.
  function stackedRows(groups, opts) {
    opts = opts || {};
    var w = opts.width || 880, labelW = opts.labelW || 178, valW = 84;
    var barW = w - labelW - valW, barH = opts.barH || 22, gapY = 5;

    var gs = groups.map(function (g) {
      return { label: g.label, tag: g.tag,
               series: g.series || [{ name: '', segs: g.segs, total: g.total }] };
    });
    var nS = Math.max.apply(null, gs.map(function (g) { return g.series.length; }));
    var rowH = 26 + nS * (barH + gapY) + 8;
    var max = 1;
    gs.forEach(function (g) { g.series.forEach(function (sr) {
      if (sr.total > max) max = sr.total; }); });

    function segs(sr, y) {
      var x = labelW;
      return sr.segs.map(function (it) {
        var sw = it.value / max * barW, mid = x + sw / 2;
        var tip = it.tip || (it.label + '  ' + money(it.value) + '  ' +
          (it.value / (sr.total || 1) * 100).toFixed(1) + '%');
        var r = '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' +
          Math.max(0.6, sw).toFixed(1) + '" height="' + barH + '" fill="' +
          (it.muted ? '#dadce0' : C.color(it.ci)) + '" data-tip="' + esc(tip) +
          '" aria-label="' + esc(tip) + '"/>' +
          // Only label a segment wide enough to hold its own name.
          (sw > 38 ? '<text x="' + mid.toFixed(1) + '" y="' + (y + barH / 2 + 4) +
            '" text-anchor="middle" font-size="10" fill="' +
            (it.muted ? '#5f6368' : '#fff') + '" font-weight="500" ' +
            'pointer-events="none">' + esc(it.label) + '</text>' : '');
        x += sw;
        return r;
      }).join('');
    }

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' +
        (gs.length * rowH) + '" role="img">' +
      gs.map(function (g, i) {
        var y0 = i * rowH + 6;
        return '<text x="0" y="' + (y0 + 10) + '" font-size="12.5" ' +
            'fill="#202124">' + esc(g.label) + '</text>' +
          '<text x="0" y="' + (y0 + 24) + '" font-size="10.5" fill="' + INK3 +
            '">' + esc(g.tag || '') + '</text>' +
          g.series.map(function (sr, si) {
            var y = y0 + 26 + si * (barH + gapY);
            return (sr.name ? '<text x="' + (labelW - 9) + '" y="' +
                (y + barH / 2 + 3.5) + '" text-anchor="end" font-size="9.5" ' +
                'fill="' + INK3 + '">' + esc(sr.name) + '</text>' : '') +
              segs(sr, y) +
              '<text x="' + w + '" y="' + (y + barH / 2 + 4) +
                '" text-anchor="end" font-size="11.5" ' +
                'font-family="Roboto Mono,monospace" fill="' +
                (si === g.series.length - 1 ? '#202124' : INK3) + '">' +
                money(sr.total) + '</text>';
          }).join('');
      }).join('') + '</svg>';
  }

  // A floating tooltip for any element carrying data-tip, delegated from a
  // container. Inline handlers are blocked by the page CSP, so this binds from
  // the loaded file; one listener per container rather than per segment.
  function tips(root) {
    if (!root || root.__tips) return;
    root.__tips = 1;
    var box = document.getElementById('pf-tip');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pf-tip';
      document.body.appendChild(box);
    }
    root.addEventListener('mousemove', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-tip]');
      if (!t) { box.classList.remove('on'); return; }
      box.textContent = t.getAttribute('data-tip');
      box.classList.add('on');
      // Flip to the left of the cursor near the right edge so the tip is
      // never cut off by the viewport.
      var w = box.offsetWidth, x = e.clientX + 14;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
      box.style.left = x + 'px';
      box.style.top = (e.clientY + 16) + 'px';
    });
    root.addEventListener('mouseleave', function () { box.classList.remove('on'); });
  }


  function stackedCompare(groups, opts) {
    opts = opts || {};
    var w = opts.width || 880, labelW = 186, rowH = 58, barH = 17;
    var h = groups.length * rowH;
    var max = Math.max.apply(null, groups.map(function (g) {
      return Math.max(g.beforeTotal, g.afterTotal); })) || 1;
    var barW = w - labelW - 92;

    function seg(items, total, y) {
      var x = labelW;
      return items.map(function (it, i) {
        var sw = it.value / max * barW;
        var r = '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' +
          Math.max(0.6, sw).toFixed(1) + '" height="' + barH + '" fill="' +
          C.color(it.ci) + '"><title>' + esc(it.label) + ' ' + money(it.value) +
          ' · ' + (it.value / (total || 1) * 100).toFixed(1) + '%</title></rect>';
        x += sw;
        return r;
      }).join('');
    }

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
      groups.map(function (g, i) {
        var y = i * rowH + 4;
        return '<text x="0" y="' + (y + 13) + '" font-size="12.5" ' +
            'fill="#202124">' + esc(g.label) + '</text>' +
          '<text x="0" y="' + (y + 28) + '" font-size="10.5" fill="' + INK3 +
            '">' + esc(g.tag || '') + '</text>' +
          '<text x="' + (labelW - 10) + '" y="' + (y + 12) + '" ' +
            'text-anchor="end" font-size="9.5" fill="' + INK3 + '">now</text>' +
          '<text x="' + (labelW - 10) + '" y="' + (y + 33) + '" ' +
            'text-anchor="end" font-size="9.5" fill="' + INK3 + '">after</text>' +
          seg(g.before, g.beforeTotal, y) +
          seg(g.after, g.afterTotal, y + 21) +
          '<text x="' + w + '" y="' + (y + 12) + '" text-anchor="end" ' +
            'font-size="11" font-family="Roboto Mono,monospace" fill="' + INK3 +
            '">' + money(g.beforeTotal) + '</text>' +
          '<text x="' + w + '" y="' + (y + 33) + '" text-anchor="end" ' +
            'font-size="11" font-family="Roboto Mono,monospace" fill="#202124">' +
            money(g.afterTotal) + '</text>';
      }).join('') + '</svg>';
  }

  C.sankey = sankey;
  C.stackedCompare = stackedCompare;
  C.stackedRows = stackedRows;
  C.tips = tips;
})(window.PFCharts);
