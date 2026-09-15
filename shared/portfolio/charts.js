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
          '" fill="none" stroke="' + color(i) + '" stroke-width="' + thick + '"/>');
      } else {
        var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        parts.push('<path d="M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r +
          ' ' + r + ' 0 ' + ((a1 - a0) > Math.PI ? 1 : 0) + ' 1 ' + x1.toFixed(2) +
          ' ' + y1.toFixed(2) + '" fill="none" stroke="' + color(i) +
          '" stroke-width="' + thick + '" stroke-linecap="butt"><title>' +
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
      return '<div><span class="sw" style="background:' + color(i) + '"></span>' +
        esc(it.label) + ' <span class="faint">' +
        (it.value / total * 100).toFixed(1) + '%</span></div>';
    }).join('') + '</div>';
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

  return { donut: donut, legend: legend, hbars: hbars, beforeAfter: beforeAfter,
           line: line, color: color, esc: esc, money: money };
})();
