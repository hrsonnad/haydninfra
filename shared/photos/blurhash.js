// Minimal blurhash decoder (public algorithm) — decodes to a small canvas.
(function () {
  'use strict';
  var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
  function b83(str, from, to) {
    var v = 0;
    for (var i = from; i < to; i++) v = v * 83 + CHARS.indexOf(str[i]);
    return v;
  }
  function sRGB(l) {
    var v = Math.max(0, Math.min(1, l));
    return v <= 0.0031308 ? Math.round(v * 12.92 * 255 + 0.5)
      : Math.round((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5);
  }
  function linear(v) {
    var x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  }
  function signPow(v, e) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), e); }

  function decode(hash, width, height) {
    if (!hash || hash.length < 6) return null;
    var sizeFlag = b83(hash, 0, 1);
    var nx = (sizeFlag % 9) + 1, ny = Math.floor(sizeFlag / 9) + 1;
    var maxAc = (b83(hash, 1, 2) + 1) / 166;
    var colors = [];
    var dc = b83(hash, 2, 6);
    colors.push([linear(dc >> 16), linear((dc >> 8) & 255), linear(dc & 255)]);
    for (var i = 1; i < nx * ny; i++) {
      var v = b83(hash, 4 + i * 2, 6 + i * 2);
      colors.push([
        signPow((Math.floor(v / (19 * 19)) - 9) / 9, 2) * maxAc,
        signPow((Math.floor(v / 19) % 19 - 9) / 9, 2) * maxAc,
        signPow((v % 19 - 9) / 9, 2) * maxAc,
      ]);
    }
    var px = new Uint8ClampedArray(width * height * 4);
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var r = 0, g = 0, b = 0;
        for (var j = 0; j < ny; j++) {
          for (var k = 0; k < nx; k++) {
            var basis = Math.cos(Math.PI * x * k / width) * Math.cos(Math.PI * y * j / height);
            var c = colors[k + j * nx];
            r += c[0] * basis; g += c[1] * basis; b += c[2] * basis;
          }
        }
        var p = (y * width + x) * 4;
        px[p] = sRGB(r); px[p + 1] = sRGB(g); px[p + 2] = sRGB(b); px[p + 3] = 255;
      }
    }
    return px;
  }

  window.BlurHash = {
    paint: function (hash, canvas) {
      try {
        var w = 24, h = 24;
        var px = decode(hash, w, h);
        if (!px) return;
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        var img = new ImageData(px, w, h);
        ctx.putImageData(img, 0, 0);
      } catch (e) { /* decorative only */ }
    },
  };
})();
