/* ASCII ripple background.
   A grid of faint ASCII characters covers the page. Moving the cursor (or a
   finger) drops "stones" into a 2D wave simulation; where the water moves, the
   characters are refracted, brightened and tinted red. No dependencies. */
(function () {
  'use strict';
  var cv = document.querySelector('canvas.ascii-bg');
  if (!cv || !cv.getContext) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ctx = cv.getContext('2d');
  var base = document.createElement('canvas'), btx = base.getContext('2d');

  var RAMP = ' .,:;-~=+*x%#@';
  var BG = '#0a0a0a';
  var FONT = '"JetBrains Mono", ui-monospace, Consolas, monospace';
  var CW, CH, FS, cols, rows, DPR, W, H;
  var cur, prev, chars, shade, shown; // shown: what each cell currently displays (-1 = base texture)
  var atlas = document.createElement('canvas'), LEVELS = 10, TW, TH;
  var last = null, lastInput = 0, energy = 0, idleT = 0, lastStep = 0;
  var MIN = 4; // ripples weaker than this are invisible, so they are neither tracked nor drawn
  var box = null, oldBox = null; // cells that moved this frame / last frame

  function noise(x, y) { // cheap smooth value noise from a few sines
    return (Math.sin(x * 0.11 + y * 0.07) + Math.sin(x * 0.05 - y * 0.13 + 1.7) + Math.sin((x + y) * 0.031 + 4.2)) / 6 + 0.5;
  }

  function build() {
    W = window.innerWidth; H = Math.max(window.innerHeight, document.documentElement.clientHeight);
    // explicit CSS size: on phones 100vh is taller than the visible area, which would stretch the text
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    box = oldBox = null;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var small = W < 700;
    FS = small ? 11 : 13; CW = Math.round(FS * 0.68); CH = Math.round(FS * 1.35);
    cols = Math.ceil(W / CW) + 1; rows = Math.ceil(H / CH) + 1;
    cv.width = base.width = Math.round(W * DPR);
    cv.height = base.height = Math.round(H * DPR);
    cur = new Float32Array(cols * rows); prev = new Float32Array(cols * rows);
    chars = new Uint8Array(cols * rows); shade = new Float32Array(cols * rows);
    shown = new Int16Array(cols * rows).fill(-1);

    btx.setTransform(DPR, 0, 0, DPR, 0, 0);
    btx.fillStyle = BG; btx.fillRect(0, 0, W, H);
    btx.font = FS + 'px ' + FONT; btx.textBaseline = 'top';
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var v = noise(x, y), i = y * cols + x;
        var ci = Math.max(1, Math.min(RAMP.length - 4, Math.round(v * v * (RAMP.length - 3)) + (Math.random() < 0.08 ? 1 : 0)));
        chars[i] = ci; shade[i] = 0.07 + v * 0.13;
        btx.fillStyle = 'rgba(200,200,210,' + shade[i].toFixed(3) + ')';
        btx.fillText(RAMP[ci], x * CW, y * CH);
      }
    }
    // glyph atlas: every character at every brightness level, on the page background
    TW = Math.round(CW * DPR); TH = Math.round(CH * DPR);
    atlas.width = TW * RAMP.length; atlas.height = TH * LEVELS;
    var at = atlas.getContext('2d');
    at.fillStyle = BG; at.fillRect(0, 0, atlas.width, atlas.height);
    at.setTransform(DPR, 0, 0, DPR, 0, 0);
    at.font = FS + 'px ' + FONT; at.textBaseline = 'top';
    for (var l = 0; l < LEVELS; l++) {
      var t = l / (LEVELS - 1);
      // faint grey -> red, the strongest crests turn pinkish white
      var R = Math.round(130 + 125 * t), G = Math.round(120 - 90 * t + (t > 0.75 ? 150 * (t - 0.75) * 4 : 0)), B = Math.round(130 - 85 * t + (t > 0.75 ? 140 * (t - 0.75) * 4 : 0));
      at.fillStyle = 'rgba(' + R + ',' + Math.min(G, 255) + ',' + Math.min(B, 255) + ',' + (0.22 + t * 0.5).toFixed(3) + ')';
      for (var k = 1; k < RAMP.length; k++) at.fillText(RAMP[k], k * TW / DPR, l * TH / DPR);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
  }

  function drop(px, py, power) {
    var cx = Math.floor(px / CW), cy = Math.floor(py / CH);
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var x = cx + dx, y = cy + dy;
      if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1) cur[y * cols + x] += power * (dx || dy ? 0.5 : 1);
    }
  }

  function simulate() {
    var c = cur, p = prev, e = 0, x0 = cols, x1 = -1, y0 = rows, y1 = -1;
    for (var y = 1; y < rows - 1; y++) {
      var r = y * cols;
      for (var x = 1; x < cols - 1; x++) {
        var i = r + x;
        var n = (c[i - 1] + c[i + 1] + c[i - cols] + c[i + cols]) * 0.5 - p[i];
        n *= 0.955;
        p[i] = n;
        var a = n < 0 ? -n : n;
        if (a > MIN) {
          if (a > e) e = a;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    prev = c; cur = p; energy = e;
    oldBox = box;
    box = x1 < 0 ? null : { x0: x0, x1: x1, y0: y0, y1: y1 };
  }

  function render() {
    // visit the cells where the water moves now or moved last frame, and redraw
    // only those whose glyph or brightness actually changed
    if (!box && !oldBox) return;
    var b0 = box || oldBox, b1 = oldBox || box;
    var X0 = Math.min(b0.x0, b1.x0), X1 = Math.max(b0.x1, b1.x1), Y0 = Math.min(b0.y0, b1.y0), Y1 = Math.max(b0.y1, b1.y1);
    var c = cur, n = RAMP.length;
    for (var y = Y0; y <= Y1; y++) {
      var py = Math.round(y * CH * DPR);
      for (var x = X0; x <= X1; x++) {
        var i = y * cols + x, h = c[i], a = h < 0 ? -h : h, code = -1, ci = 0, lv = 0;
        if (a >= MIN) {
          // refraction: read the character from a cell shifted by the slope
          var ox = Math.max(-3, Math.min(3, Math.round((c[i + 1] - c[i - 1]) / 18)));
          var oy = Math.max(-3, Math.min(3, Math.round((c[i + cols] - c[i - cols]) / 18)));
          var sx = Math.max(0, Math.min(cols - 1, x + ox)), sy = Math.max(0, Math.min(rows - 1, y + oy));
          var t = Math.min((a - MIN) / 56, 1);
          ci = Math.min(n - 1, chars[sy * cols + sx] + Math.round(t * 5));
          lv = Math.min(LEVELS - 1, Math.floor(t * LEVELS));
          code = ci * LEVELS + lv;
        }
        if (code === shown[i]) continue;
        shown[i] = code;
        var px = Math.round(x * CW * DPR);
        if (code < 0) ctx.drawImage(base, px, py, TW, TH, px, py, TW, TH);
        else ctx.drawImage(atlas, ci * TW, lv * TH, TW, TH, px, py, TW, TH);
      }
    }
  }

  function frame(now) {
    // fixed ~60 steps per second, so ripples move at the same speed on 120/240 Hz screens
    if (!document.hidden && now - lastStep >= 15) {
      lastStep = now;
      if (now - lastInput > 2600 && now - idleT > 1900) { // gentle idle rain
        idleT = now;
        drop(Math.random() * W, Math.random() * H, 60 + Math.random() * 50);
      }
      simulate(); render();
    }
    requestAnimationFrame(frame);
  }

  function onMove(e) {
    var x = e.clientX, y = e.clientY, now = performance.now();
    if (last) {
      var dx = x - last.x, dy = y - last.y, d = Math.hypot(dx, dy);
      var steps = Math.min(12, Math.ceil(d / CW));
      var power = Math.min(140, 30 + d * 1.6) / Math.max(steps, 1);
      for (var s = 1; s <= steps; s++) drop(last.x + dx * s / steps, last.y + dy * s / steps, power);
    }
    last = { x: x, y: y }; lastInput = now;
  }

  var rt;
  function start() {
    build();
    if (reduced) return; // static texture only
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', function (e) { drop(e.clientX, e.clientY, 420); lastInput = performance.now(); }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { last = null; });
    // a finger lifted here and put down elsewhere must not draw a line between the two
    ['pointerup', 'pointercancel'].forEach(function (t) {
      window.addEventListener(t, function (e) { if (e.pointerType !== 'mouse') last = null; }, { passive: true });
    });
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (window.innerWidth !== W || window.innerHeight > H) build(); }, 150);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
