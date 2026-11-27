/* ASCII ripple background.
   A grid of faint ASCII characters covers the page. Moving the cursor (or a
   finger) drops "stones" into a 2D wave simulation; where the water moves, the
   characters are refracted, brightened and tinted red. Where the prism's
   light falls (main.js publishes it as window.__prismLight), the characters
   take the colour of the beam, and the glass itself is drawn with / \ _
   characters (main.js no longer paints the prism, everything is ASCII).
   No dependencies. */
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
  // light: a tiny canvas with one pixel per cell; the prism's beam polygons are
  // painted into it and read back as "which hue, how bright" for each cell
  var HUES = 12, LITLV = 3, WHITE = HUES;          // hue buckets 0..11 plus white
  var lc = document.createElement('canvas'), lx = lc.getContext('2d', { willReadFrequently: true });
  var lit, litBox = null, oldLitBox = null, litAtlas = document.createElement('canvas'), stepN = 0;
  // the glass: edge glyphs (bright) and the inside of the prism (dim)
  var EDGE = '/\\_|-*.', EDGE_B = 100, EDGE_D = 120, edgeAtlas = document.createElement('canvas');

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
    lit = new Int16Array(cols * rows).fill(-1); litBox = oldLitBox = null;
    lc.width = cols; lc.height = rows;

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
    // lit glyph atlas: every character in every beam hue at three brightness levels
    litAtlas.width = TW * RAMP.length; litAtlas.height = TH * (HUES + 1) * LITLV;
    var la = litAtlas.getContext('2d');
    la.fillStyle = BG; la.fillRect(0, 0, litAtlas.width, litAtlas.height);
    la.setTransform(DPR, 0, 0, DPR, 0, 0);
    la.font = 'bold ' + FS + 'px ' + FONT; la.textBaseline = 'top';
    for (var hh = 0; hh <= HUES; hh++) {
      for (var lv = 0; lv < LITLV; lv++) {
        var a = (0.5 + lv * 0.22).toFixed(2);
        la.fillStyle = hh === WHITE ? 'rgba(235,235,240,' + (0.22 + lv * 0.12).toFixed(2) + ')' : 'hsla(' + Math.round(hh * 275 / (HUES - 1)) + ',100%,' + (58 + lv * 8) + '%,' + a + ')';
        for (var kk = 1; kk < RAMP.length; kk++) la.fillText(RAMP[kk], kk * TW / DPR, (hh * LITLV + lv) * TH / DPR);
      }
    }
    edgeAtlas.width = TW * EDGE.length; edgeAtlas.height = TH * 2;
    var ea = edgeAtlas.getContext('2d');
    ea.fillStyle = BG; ea.fillRect(0, 0, edgeAtlas.width, edgeAtlas.height);
    ea.setTransform(DPR, 0, 0, DPR, 0, 0);
    ea.font = 'bold ' + FS + 'px ' + FONT; ea.textBaseline = 'top';
    for (var e = 0; e < EDGE.length; e++) {
      ea.fillStyle = 'rgba(244,244,248,.96)'; ea.fillText(EDGE[e], e * TW / DPR, 0);
      ea.fillStyle = 'rgba(180,190,225,.32)'; ea.fillText(EDGE[e], e * TW / DPR, TH / DPR);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
  }

  // the prism's outline and body, rasterised into the lit grid
  function glass(L, mark) {
    if (!L.tri) return;
    var t = L.tri.map(function (p) { return { x: p.x, y: p.y + L.top }; }); // hero -> viewport
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    t.forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    function side(a, b, x, y) { return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) > 0; }
    var s0 = side(t[0], t[1], t[2].x, t[2].y);
    for (var y = Math.max(1, Math.floor(minY / CH)); y <= Math.min(rows - 2, Math.ceil(maxY / CH)); y++) {
      for (var x = Math.max(1, Math.floor(minX / CW)); x <= Math.min(cols - 2, Math.ceil(maxX / CW)); x++) {
        var cx = (x + 0.5) * CW, cy = (y + 0.5) * CH;
        if (side(t[0], t[1], cx, cy) === s0 && side(t[1], t[2], cx, cy) === s0 && side(t[2], t[0], cx, cy) === s0 && lit[y * cols + x] < 0)
          mark(x, y, EDGE_D + 6); // a quiet dotted body where no colour falls
      }
    }
    for (var e = 0; e < 3; e++) {
      var a = t[e], b = t[(e + 1) % 3], dx = b.x - a.x, dy = b.y - a.y;
      // glyph that follows the edge: / \ _ |
      var g = Math.abs(dy) < Math.abs(dx) * 0.4 ? 2 : Math.abs(dx) < Math.abs(dy) * 0.3 ? 3 : (dx * dy > 0 ? 1 : 0);
      var n = Math.ceil(Math.hypot(dx, dy) / (Math.min(CW, CH) * 0.5));
      for (var s = 0; s <= n; s++) {
        var px = Math.floor((a.x + dx * s / n) / CW), py = Math.floor((a.y + dy * s / n) / CH);
        if (px > 0 && py > 0 && px < cols - 1 && py < rows - 1) mark(px, py, EDGE_B + g);
      }
    }
    if (L.entry) { // where the light enters, a bright spark
      var ex = Math.floor(L.entry.x / CW), ey = Math.floor((L.entry.y + L.top) / CH);
      if (ex > 0 && ey > 0 && ex < cols - 1 && ey < rows - 1) mark(ex, ey, EDGE_B + 5);
    }
  }

  function updateLight() {
    var L = window.__prismLight;
    oldLitBox = litBox; litBox = null;
    if (!L || (!L.polys.length && !L.tri)) { if (oldLitBox) lit.fill(-1); return; }
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.clearRect(0, 0, cols, rows);
    // hero coordinates -> cell coordinates
    lx.setTransform(1 / CW, 0, 0, 1 / CH, 0, L.top / CH);
    L.polys.forEach(function (q) {
      // red channel encodes the hue bucket, green the brightness (fading along the beam)
      var R = (q.h + 1) * 18, g = lx.createLinearGradient(q.g0.x, q.g0.y, q.g1.x, q.g1.y);
      g.addColorStop(0, 'rgb(' + R + ',255,0)'); g.addColorStop(1, 'rgb(' + R + ',0,0)');
      lx.fillStyle = g; lx.beginPath(); lx.moveTo(q.pts[0].x, q.pts[0].y);
      for (var i = 1; i < q.pts.length; i++) lx.lineTo(q.pts[i].x, q.pts[i].y);
      lx.closePath(); lx.fill();
    });
    var d = lx.getImageData(0, 0, cols, rows).data, x0 = cols, x1 = -1, y0 = rows, y1 = -1;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x, o = i * 4, v = d[o + 1] / 255;
        // a cell is lit when the light covers a fair part of it; how bright is the beam's own fade
        if (d[o + 3] < 25 || v < 0.08) { lit[i] = -1; continue; }
        var hh = Math.max(0, Math.min(WHITE, Math.round(d[o] / 18) - 1));
        lit[i] = hh * LITLV + Math.min(LITLV - 1, Math.floor(v * LITLV));
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    glass(L, function (x, y, v) {
      lit[y * cols + x] = v;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    });
    if (x1 >= 0) litBox = { x0: Math.max(1, x0), x1: Math.min(cols - 2, x1), y0: Math.max(1, y0), y1: Math.min(rows - 2, y1) };
    if (oldLitBox && !litBox) lit.fill(-1);
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

  function union(list) {
    var u = null;
    list.forEach(function (b) {
      if (!b) return;
      if (!u) u = { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 };
      else { u.x0 = Math.min(u.x0, b.x0); u.x1 = Math.max(u.x1, b.x1); u.y0 = Math.min(u.y0, b.y0); u.y1 = Math.max(u.y1, b.y1); }
    });
    return u;
  }

  function render() {
    // visit the cells where the water moves (now or last frame) or the light
    // falls (now or last update); redraw only those whose look changed
    var u = union([box, oldBox, litBox, oldLitBox]);
    oldLitBox = null;
    if (!u) return;
    var c = cur, n = RAMP.length;
    for (var y = u.y0; y <= u.y1; y++) {
      var py = Math.round(y * CH * DPR);
      for (var x = u.x0; x <= u.x1; x++) {
        var i = y * cols + x, h = c[i], a = h < 0 ? -h : h, code = -1, ci = 0, lv = 0, L = lit[i];
        var t = a >= MIN ? Math.min((a - MIN) / 56, 1) : 0;
        if (a >= MIN) {
          // refraction: read the character from a cell shifted by the slope
          var ox = Math.max(-3, Math.min(3, Math.round((c[i + 1] - c[i - 1]) / 18)));
          var oy = Math.max(-3, Math.min(3, Math.round((c[i + cols] - c[i - cols]) / 18)));
          var sx = Math.max(0, Math.min(cols - 1, x + ox)), sy = Math.max(0, Math.min(rows - 1, y + oy));
          ci = chars[sy * cols + sx];
        } else ci = chars[i];
        if (L >= EDGE_B) {
          code = 5000 + L;
        } else if (L >= 0) {
          // in the light: the beam's colour, denser characters where it is brighter
          ci = Math.min(n - 1, (L >= WHITE * LITLV ? ci + 1 : Math.max(ci, 4) + 2 + (L % LITLV) * 2) + Math.round(t * 3)); // the white beam stays quiet behind the text
          code = 1000 + L * n + ci;
        } else if (a >= MIN) {
          ci = Math.min(n - 1, ci + Math.round(t * 5));
          lv = Math.min(LEVELS - 1, Math.floor(t * LEVELS));
          code = ci * LEVELS + lv;
        }
        if (code === shown[i]) continue;
        shown[i] = code;
        var px = Math.round(x * CW * DPR);
        if (code < 0) ctx.drawImage(base, px, py, TW, TH, px, py, TW, TH);
        else if (code >= 5000) ctx.drawImage(edgeAtlas, ((L - EDGE_B) % 20) * TW, (L >= EDGE_D ? 1 : 0) * TH, TW, TH, px, py, TW, TH);
        else if (code >= 1000) ctx.drawImage(litAtlas, ci * TW, L * TH, TW, TH, px, py, TW, TH);
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
      simulate();
      if (stepN++ % 3 === 0) updateLight();
      render();
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
    if (reduced) { // static texture plus the resting prism
      var still = function () {
        var L = window.__prismLight, hero = document.querySelector('.hero');
        if (L && hero) L.top = hero.getBoundingClientRect().top; // the light scrolls away with the hero
        updateLight(); render();
      };
      setTimeout(still, 400);
      var sq = false;
      window.addEventListener('scroll', function () { if (!sq) { sq = true; requestAnimationFrame(function () { sq = false; still(); }); } }, { passive: true });
      return;
    }
    // other scripts can drop a ripple too
    window.__asciiDrop = function (x, y, p) { if (cur) drop(x, y, p); };
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
