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
  var cur, prev, chars, shade;
  var atlas = document.createElement('canvas'), LEVELS = 10, TW, TH, clean = false;
  var last = null, lastInput = 0, energy = 0, idleT = 0;

  function noise(x, y) { // cheap smooth value noise from a few sines
    return (Math.sin(x * 0.11 + y * 0.07) + Math.sin(x * 0.05 - y * 0.13 + 1.7) + Math.sin((x + y) * 0.031 + 4.2)) / 6 + 0.5;
  }

  function build() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var small = W < 700;
    FS = small ? 11 : 13; CW = Math.round(FS * 0.68); CH = Math.round(FS * 1.35);
    cols = Math.ceil(W / CW) + 1; rows = Math.ceil(H / CH) + 1;
    cv.width = base.width = Math.round(W * DPR);
    cv.height = base.height = Math.round(H * DPR);
    cur = new Float32Array(cols * rows); prev = new Float32Array(cols * rows);
    chars = new Uint8Array(cols * rows); shade = new Float32Array(cols * rows);

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
    clean = true;
  }

  function drop(px, py, power) {
    var cx = Math.floor(px / CW), cy = Math.floor(py / CH);
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var x = cx + dx, y = cy + dy;
      if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1) cur[y * cols + x] += power * (dx || dy ? 0.5 : 1);
    }
  }

  function simulate() {
    var c = cur, p = prev, e = 0;
    for (var y = 1; y < rows - 1; y++) {
      var r = y * cols;
      for (var x = 1; x < cols - 1; x++) {
        var i = r + x;
        var n = (c[i - 1] + c[i + 1] + c[i - cols] + c[i + cols]) * 0.5 - p[i];
        n *= 0.968;
        p[i] = n;
        if (n > e) e = n; else if (-n > e) e = -n;
      }
    }
    prev = c; cur = p; energy = e;
  }

  function render() {
    if (energy < 0.8) {
      if (!clean) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(base, 0, 0); clean = true; }
      return;
    }
    clean = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    var c = cur, n = RAMP.length;
    for (var y = 1; y < rows - 1; y++) {
      for (var x = 1; x < cols - 1; x++) {
        var i = y * cols + x, h = c[i], a = h < 0 ? -h : h;
        if (a < 0.8) continue;
        // refraction: read the character from a cell shifted by the slope
        var ox = Math.max(-3, Math.min(3, Math.round((c[i + 1] - c[i - 1]) / 18)));
        var oy = Math.max(-3, Math.min(3, Math.round((c[i + cols] - c[i - cols]) / 18)));
        var sx = Math.max(0, Math.min(cols - 1, x + ox)), sy = Math.max(0, Math.min(rows - 1, y + oy));
        var t = Math.min(a / 60, 1);
        var ci = Math.min(n - 1, chars[sy * cols + sx] + Math.round(t * 5));
        var lv = Math.min(LEVELS - 1, Math.floor(t * LEVELS));
        ctx.drawImage(atlas, ci * TW, lv * TH, TW, TH, Math.round(x * CW * DPR), Math.round(y * CH * DPR), TW, TH);
      }
    }
  }

  function frame(now) {
    if (!document.hidden) {
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
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (window.innerWidth !== W || Math.abs(window.innerHeight - H) > 120) build(); }, 150);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
