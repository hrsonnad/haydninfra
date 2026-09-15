// charts.js — tiny dependency-free SVG charts.
// The page CSP allows scripts only from self + jsdelivr, and blocks external
// stylesheets/fetches, so hand-rolled SVG is simpler and safer than pulling a
// charting library. Everything returns an SVG string.

window.PFCharts = (function () {
  'use strict';

  // Palette: distinguishable in both themes, ordered so the first few carry
  // the largest slices.
  var PALETTE = ['#3d6b96', '#2f6f4e', '#b4542f', '#8a6ea8', '#c2913a',
                 '#4f8f8a', '#a4546e', '#6b7f4a', '#9a5b3d', '#5c6b8a',
                 '#7a8a99', '#b0a27c'];

  function color(i) { return PALETTE[i % PALETTE.length]; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    var a = Math.abs(n);
    if (a >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
    return '$' + n.toFixed(0);
  }

  // ---- donut -----------------------------------------------------------
  // items: [{label, value}] already sorted desc
  function donut(items, opts) {
    opts = opts || {};
    var size = opts.size || 210, thick = opts.thick || 30;
    var cx = size / 2, cy = size / 2, r = (size - thick) / 2 - 2;
    var total = items.reduce(function (s, x) { return s + x.value; }, 0) || 1;
    var a0 = -Math.PI / 2, parts = [];

    items.forEach(function (it, i) {
      var frac = it.value / total;
      var a1 = a0 + frac * Math.PI * 2;
      // a full-circle arc degenerates; draw it as two halves
      if (frac > 0.9999) {
        parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
          '" fill="none" stroke="' + color(i) + '" stroke-width="' + thick + '"/>');
      } else if (frac > 0.0005) {
        var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        var large = (a1 - a0) > Math.PI ? 1 : 0;
        parts.push('<path d="M' + x0.toFixed(2) + ' ' + y0.toFixed(2) +
          ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' +
          y1.toFixed(2) + '" fill="none" stroke="' + color(i) +
          '" stroke-width="' + thick + '"><title>' + esc(it.label) + ' — ' +
          money(it.value) + ' (' + (frac * 100).toFixed(1) + '%)</title></path>');
      }
      a0 = a1;
    });

    var mid = opts.centerTop || '';
    var sub = opts.centerSub || '';
    return '<svg class="pf-chart" viewBox="0 0 ' + size + ' ' + size +
      '" style="max-width:' + size + 'px;margin:0 auto" role="img">' +
      parts.join('') +
      (mid ? '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" ' +
        'font-size="17" font-weight="600" fill="currentColor" ' +
        'font-family="ui-monospace,Menlo,monospace">' + esc(mid) + '</text>' : '') +
      (sub ? '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" ' +
        'font-size="9.5" fill="currentColor" opacity=".55">' + esc(sub) +
        '</text>' : '') +
      '</svg>';
  }

  function legend(items, total) {
    return '<div class="pf-legend">' + items.map(function (it, i) {
      return '<div><span class="sw" style="background:' + color(i) + '"></span>' +
        esc(it.label) + ' <span class="faint">' +
        (it.value / total * 100).toFixed(1) + '%</span></div>';
    }).join('') + '</div>';
  }

  // ---- horizontal bars -------------------------------------------------
  function hbars(items, opts) {
    opts = opts || {};
    var rowH = opts.rowH || 24, labelW = opts.labelW || 92,
        valW = opts.valW || 74, w = opts.width || 460;
    var h = items.length * rowH + 8;
    var max = Math.max.apply(null, items.map(function (x) { return x.value; })) || 1;
    var barW = w - labelW - valW - 10;

    var rows = items.map(function (it, i) {
      var y = i * rowH + 4;
      var bw = Math.max(1, it.value / max * barW);
      return '<text x="0" y="' + (y + rowH / 2 + 3.5) + '" font-size="11.5" ' +
          'fill="currentColor" opacity=".75">' + esc(it.label) + '</text>' +
        '<rect x="' + labelW + '" y="' + (y + 4) + '" width="' + bw.toFixed(1) +
          '" height="' + (rowH - 11) + '" rx="2" fill="' +
          (it.color || color(opts.mono ? 0 : i)) + '" opacity="' +
          (it.dim ? '.4' : '.8') + '"><title>' + esc(it.label) + ' — ' +
          money(it.value) + '</title></rect>' +
        '<text x="' + w + '" y="' + (y + rowH / 2 + 3.5) + '" text-anchor="end" ' +
          'font-size="11" font-family="ui-monospace,Menlo,monospace" ' +
          'fill="currentColor" opacity=".6">' + esc(it.note || money(it.value)) +
          '</text>';
    }).join('');

    return '<svg class="pf-chart" viewBox="0 0 ' + w + ' ' + h +
      '" role="img">' + rows + '</svg>';
  }

  // ---- paired before/after bars ----------------------------------------
  // items: [{label, before, after}]
  function beforeAfter(items, opts) {
    opts = opts || {};
    var rowH = 34, labelW = 104, valW = 128, w = opts.width || 520;
    var h = items.length * rowH + 20;
    var max = Math.max.apply(null, items.map(function (x) {
      return Math.max(x.before, x.after); })) || 1;
    var barW = w - labelW - valW - 10;
    var fmt = opts.fmt || function (v) { return v.toFixed(1) + '%'; };

    var rows = items.map(function (it, i) {
      var y = i * rowH + 6;
      var b = Math.max(1, it.before / max * barW);
      var a = Math.max(1, it.after / max * barW);
      var d = it.after - it.before;
      var dCol = Math.abs(d) < 0.05 ? 'currentColor'
        : (opts.lowerIsBetter === false ? (d > 0 ? '#2f6f4e' : '#b4542f')
                                        : (d < 0 ? '#2f6f4e' : '#b4542f'));
      return '<text x="0" y="' + (y + 13) + '" font-size="11.5" ' +
          'fill="currentColor" opacity=".75">' + esc(it.label) + '</text>' +
        '<rect x="' + labelW + '" y="' + (y + 2) + '" width="' + b.toFixed(1) +
          '" height="9" rx="2" fill="currentColor" opacity=".28"/>' +
        '<rect x="' + labelW + '" y="' + (y + 14) + '" width="' + a.toFixed(1) +
          '" height="9" rx="2" fill="' + (opts.afterColor || '#3d6b96') +
          '" opacity=".85"/>' +
        '<text x="' + w + '" y="' + (y + 10) + '" text-anchor="end" ' +
          'font-size="10.5" font-family="ui-monospace,Menlo,monospace" ' +
          'fill="currentColor" opacity=".45">' + fmt(it.before) + '</text>' +
        '<text x="' + w + '" y="' + (y + 22) + '" text-anchor="end" ' +
          'font-size="10.5" font-family="ui-monospace,Menlo,monospace" ' +
          'fill="' + dCol + '">' + fmt(it.after) +
          (Math.abs(d) >= 0.05 ? '  (' + (d > 0 ? '+' : '') + d.toFixed(1) + ')' : '') +
          '</text>';
    }).join('');

    return '<svg class="pf-chart" viewBox="0 0 ' + w + ' ' + h +
      '" role="img">' + rows + '</svg>';
  }

  return { donut: donut, legend: legend, hbars: hbars,
           beforeAfter: beforeAfter, color: color, esc: esc };
})();
