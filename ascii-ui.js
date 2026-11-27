/* The ASCII interface on top of the background (ascii.js):
   1. headings      — h1/h2 are redrawn as ASCII art sampled from big letters
   2. scramble      — small labels decode out of random glyphs
   3. stack strip   — a marquee made of single characters that scatter away
                      from the cursor (or a finger) and drift back home
   4. work          — phone-sized project cards in a row; scrolling moves the
                      row sideways and every card's ASCII picture evolves
                      from 1-bit noise to full colour as it reaches the focus
   No dependencies. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';
  var DISPLAY = 'Anton, Impact, "Arial Narrow Bold", sans-serif';
  var GLYPHS = '!<>-_\\/[]{}=+*^?#%@$&~';
  function rnd(s) { return s[(Math.random() * s.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(c) { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c; }

  /* =============== 1. ASCII headings =============== */
  var HEAD_RAMP = ' .:+#@';
  var SW = 6, SH = 10; // sampling pixels per character cell (monospace cell is 0.6 x 1)
  var heads = [];

  function parseLines(el) {
    var lines = [[]];
    (function walk(node, red) {
      node.childNodes.forEach(function (n) {
        if (n.nodeType === 3) { if (n.nodeValue.trim() || lines[lines.length - 1].length) lines[lines.length - 1].push({ t: n.nodeValue.replace(/\s+/g, ' '), red: red }); }
        else if (n.nodeName === 'BR') lines.push([]);
        else if (n.nodeType === 1) walk(n, red || n.nodeName === 'SPAN');
      });
    })(el, false);
    return lines.map(function (l) {
      if (l.length) { l[0].t = l[0].t.replace(/^\s+/, ''); l[l.length - 1].t = l[l.length - 1].t.replace(/\s+$/, ''); }
      return l.filter(function (s) { return s.t; });
    }).filter(function (l) { return l.length; });
  }

  function artLines(lines, rows) {
    var c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
    var out = [], maxCols = 0;
    lines.forEach(function (segs, li) {
      var text = segs.map(function (s) { return s.t; }).join('');
      x.font = '100px ' + DISPLAY;
      var m = x.measureText(text), GAP = 14; // extra space between letters (at 100px), so they stay apart in ASCII
      var asc = m.actualBoundingBoxAscent || 72, desc = m.actualBoundingBoxDescent || 0;
      var k = rows * SH * 0.92 / (asc + desc);
      var cols = Math.ceil((m.width + GAP * text.length) * k / SW) + 1;
      c.width = cols * SW; c.height = rows * SH;
      x.font = (100 * k).toFixed(2) + 'px ' + DISPLAY;
      x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
      var px = 0, red = [], y = rows * SH * 0.04 + asc * k;
      segs.forEach(function (s) {
        var x0 = px;
        for (var ci = 0; ci < s.t.length; ci++) {
          x.fillText(s.t[ci], px, y);
          px += x.measureText(s.t[ci]).width + (s.t[ci] === ' ' ? 0 : GAP * k);
        }
        if (s.red) red.push([x0, px]);
      });
      var d = x.getImageData(0, 0, c.width, c.height).data, grid = [];
      for (var r = 0; r < rows; r++) {
        var row = [];
        for (var q = 0; q < cols; q++) {
          var sum = 0;
          for (var yy = 0; yy < SH; yy++) for (var xx = 0; xx < SW; xx++) sum += d[(((r * SH + yy) * c.width) + q * SW + xx) * 4 + 3];
          var v = sum / (SW * SH * 255), cx = (q + 0.5) * SW;
          var isRed = red.some(function (rg) { return cx >= rg[0] - SW && cx <= rg[1]; });
          row.push({ ch: HEAD_RAMP[Math.round(Math.pow(v, 0.9) * (HEAD_RAMP.length - 1))], red: isRed });
        }
        grid.push(row);
      }
      if (li) out.push([]); // one quiet row between lines
      out.push.apply(out, grid);
      maxCols = Math.max(maxCols, cols);
    });
    return { grid: out, cols: maxCols };
  }

  function toHTML(grid) {
    return grid.map(function (row) {
      var s = '', cur = null;
      row.forEach(function (c) {
        var red = c.red && c.ch !== ' ';
        if (red !== cur) { if (cur) s += '</span>'; if (red) s += '<span class="r">'; cur = red; }
        s += esc(c.ch);
      });
      if (cur) s += '</span>';
      return s.replace(/\s+$/, '');
    }).join('\n');
  }

  function renderHead(h) {
    var avail = h.el.clientWidth;
    if (!avail) return;
    var a = artLines(h.lines, h.rows);
    var maxFs = parseFloat(getComputedStyle(h.el).getPropertyValue('--afs')) || 10;
    var fs = Math.min(maxFs, avail / (a.cols * 0.6));
    h.pre.style.setProperty('--afs', fs.toFixed(2) + 'px');
    h.pre.innerHTML = toHTML(a.grid);
  }

  function setupHeads() {
    document.querySelectorAll('[data-ascii]').forEach(function (el) {
      var lines = parseLines(el);
      if (!lines.length) return;
      var label = lines.map(function (l) { return l.map(function (s) { return s.t; }).join(''); }).join(' ');
      var sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = label;
      var pre = document.createElement('pre'); pre.className = 'ascii-art'; pre.setAttribute('aria-hidden', 'true');
      el.textContent = ''; el.appendChild(sr); el.appendChild(pre);
      var h = { el: el, pre: pre, lines: lines, rows: +el.dataset.ascii || 6 };
      heads.push(h); renderHead(h);
      if (el.dataset.count) countUp(h, +el.dataset.count);
    });
  }

  function countUp(h, to) {
    var tail = h.lines[0].slice(1), started = false;
    function show(n) { h.lines = [[{ t: String(n), red: false }].concat(tail)]; renderHead(h); }
    if (reduced || !('IntersectionObserver' in window)) return;
    show(0);
    new IntersectionObserver(function (es, ob) {
      if (!es[0].isIntersecting || started) return;
      started = true; ob.disconnect();
      var t0 = performance.now(), last = -1;
      (function tick(now) {
        var p = Math.min((now - t0) / 1400, 1), n = Math.round(to * (1 - Math.pow(1 - p, 3)));
        if (n !== last) { last = n; show(n); }
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }, { threshold: 0.4 }).observe(h.el);
  }

  /* =============== 2. scramble =============== */
  function scramble(el, dur) {
    if (reduced || el._scr) return;
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
    while (w.nextNode()) if (w.currentNode.nodeValue.trim()) nodes.push(w.currentNode);
    if (!nodes.length) return;
    var orig = nodes.map(function (n) { return n.nodeValue; }), total = orig.join('').length || 1, t0 = performance.now();
    el._scr = true;
    (function tick(now) {
      var p = Math.min((now - t0) / dur, 1), idx = 0;
      nodes.forEach(function (n, k) {
        var s = orig[k], o = '';
        for (var i = 0; i < s.length; i++, idx++) o += (s[i] === ' ' || p >= (idx / total) * 0.7 + 0.3) ? s[i] : rnd(GLYPHS);
        n.nodeValue = o;
      });
      if (p < 1) requestAnimationFrame(tick);
      else { nodes.forEach(function (n, k) { n.nodeValue = orig[k]; }); el._scr = false; }
    })(t0);
  }
  function setupScramble() {
    if (reduced) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); scramble(e.target, 750); } });
      }, { threshold: 0.6 });
      document.querySelectorAll('.kicker, .timeline time, .list em, .hero-foot span, .hello').forEach(function (el) { io.observe(el); });
    }
    document.querySelectorAll('.nav nav a, .btn, .go').forEach(function (a) {
      a.addEventListener('mouseenter', function () { scramble(a, 380); });
    });
  }

  /* =============== 3. stack strip =============== */
  function setupStrip() {
    var strip = document.querySelector('.strip'), cv = strip && strip.querySelector('.strip-cv');
    if (!cv || !cv.getContext) return;
    strip.classList.add('js-strip');
    var ctx = cv.getContext('2d');
    var names = [].map.call(strip.querySelectorAll('li'), function (li) { return li.textContent.toUpperCase(); });
    var mid = names.join('  [*]  ') + '  [*]  ';
    var W, H, FS, CW, rowsY, P, parts, pointer = null, lastP = null, running = false, visible = true;
    var off = [0, 0, 0], SPEED = [-14, 42, -14]; // px per second for each row (deco rows drift the other way)

    function build() {
      var r = strip.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      FS = W < 700 ? 15 : 19; CW = FS * 0.6;
      rowsY = [H * 0.2, H * 0.5, H * 0.8];
      P = mid.length * CW; // one period of the text
      var copies = Math.ceil(W / P) + 1;
      parts = [];
      for (var row = 0; row < 3; row++) {
        for (var c = 0; c < copies; c++) {
          for (var i = 0; i < mid.length; i++) {
            var ch = row === 1 ? mid[i] : ((i + row) % 2 ? '-' : '=');
            if (ch === ' ') continue;
            parts.push({ row: row, hx: (c * mid.length + i) * CW, hy: rowsY[row], ch: ch, g: ch, dx: 0, dy: 0, vx: 0, vy: 0, rot: 0 });
          }
        }
      }
      draw(0);
    }

    function draw(dt) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      for (var r = 0; r < 3; r++) off[r] = (((off[r] + SPEED[r] * dt) % P) + P) % P;
      var R = W < 700 ? 80 : 120, sp = 0;
      if (pointer && lastP) sp = Math.min(60, Math.hypot(pointer.x - lastP.x, pointer.y - lastP.y));
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        var sx = p.hx - off[p.row];
        if (sx < -CW * 2) sx += P * Math.ceil((-sx) / P); // wrap: copies are identical
        var disp = Math.abs(p.dx) + Math.abs(p.dy);
        if (sx > W + CW * 2 && disp < 0.5) continue;
        if (pointer && !reduced) {
          var ddx = sx + p.dx - pointer.x, ddy = p.hy + p.dy - pointer.y, d = Math.hypot(ddx, ddy) || 1;
          if (d < R) {
            var f = Math.pow(1 - d / R, 2) * (2.2 + sp * 0.35);
            p.vx += ddx / d * f; p.vy += ddy / d * f * 1.3;
          }
        }
        // spring home, with friction
        p.vx += -p.dx * 0.045; p.vy += -p.dy * 0.045;
        p.vx *= 0.86; p.vy *= 0.86;
        p.dx += p.vx; p.dy += p.vy;
        p.rot += (p.vx * 0.06 - p.rot) * 0.2;
        disp = Math.abs(p.dx) + Math.abs(p.dy);
        if (disp > 5) { if (Math.random() < 0.18) p.g = rnd(GLYPHS + p.ch); }
        else p.g = p.ch;
        var t = Math.min(1, disp / 50);
        if (p.row === 1) {
          ctx.font = 'bold ' + FS + 'px ' + MONO;
          ctx.fillStyle = t > 0.05 ? 'rgb(' + Math.round(110 + 145 * t) + ',' + Math.round(110 - 70 * t) + ',' + Math.round(116 - 70 * t) + ')' : (p.ch === '*' || p.ch === '[' || p.ch === ']' ? '#e5202e' : '#6e6e75');
        } else {
          ctx.font = FS + 'px ' + MONO;
          ctx.fillStyle = t > 0.05 ? 'rgba(255,68,82,' + (0.35 + t * 0.6).toFixed(2) + ')' : '#2c2c30';
        }
        var x = sx + p.dx + CW / 2, y = p.hy + p.dy;
        if (Math.abs(p.rot) > 0.02) { ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.fillText(p.g, 0, 0); ctx.restore(); }
        else ctx.fillText(p.g, x, y);
      }
      lastP = pointer ? { x: pointer.x, y: pointer.y } : null;
    }

    var tPrev = 0;
    function loop(now) {
      if (!running) return;
      var dt = tPrev ? Math.min(0.05, (now - tPrev) / 1000) : 0;
      tPrev = now;
      draw(dt);
      requestAnimationFrame(loop);
    }
    function start() { if (!running && !reduced && visible) { running = true; tPrev = 0; requestAnimationFrame(loop); } }
    function stop() { running = false; }

    function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    strip.addEventListener('pointermove', function (e) { pointer = local(e); });
    strip.addEventListener('pointerleave', function () { pointer = null; });
    strip.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') pointer = null; });
    strip.addEventListener('pointercancel', function () { pointer = null; });
    strip.addEventListener('pointerdown', function (e) { // a tap or click blows the letters apart
      var q = local(e);
      parts.forEach(function (p) {
        var sx = p.hx - off[p.row]; if (sx < -CW * 2) sx += P * Math.ceil((-sx) / P);
        var dx = sx - q.x, dy = p.hy - q.y, d = Math.hypot(dx, dy) || 1;
        if (d < 170) { var f = (1 - d / 170) * 26; p.vx += dx / d * f; p.vy += dy / d * f; }
      });
      if (e.pointerType !== 'mouse') pointer = q;
    });
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(strip);
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 150); });
    build(); start();
  }

  /* =============== 4. work: evolving phones =============== */
  var STAGES = [
    { name: '1-bit', fs: 17, ramp: '01', mode: 'bit' },
    { name: 'dots', fs: 13, ramp: ' .:', mode: 'grey' },
    { name: 'ramp', fs: 10, ramp: ' .:-=+*#%@', mode: 'hot' },
    { name: 'dense', fs: 8, ramp: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$", mode: 'grey' },
    { name: 'colour', fs: 6.5, ramp: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$", mode: 'colour' }
  ];
  var LAST = STAGES.length - 1;

  function meanLum(img) {
    var c = document.createElement('canvas'); c.width = c.height = 16;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 16, 16);
    var d = x.getImageData(0, 0, 16, 16).data, m = 0;
    for (var i = 0; i < d.length; i += 4) m += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    return m / 256;
  }
  function invertRegion(x, rx, ry, rw, rh) { // light UIs become dark, hues kept (invert + rotate 180deg)
    rx = Math.max(0, Math.floor(rx)); ry = Math.max(0, Math.floor(ry));
    rw = Math.min(x.canvas.width - rx, Math.ceil(rw)); rh = Math.min(x.canvas.height - ry, Math.ceil(rh));
    if (rw <= 0 || rh <= 0) return;
    var im = x.getImageData(rx, ry, rw, rh), d = im.data;
    for (var i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = mx + mn;
      // flip the lightness only, so a red badge stays red
      var shift = 255 - l;
      d[i] = clamp(r + shift, 0, 255); d[i + 1] = clamp(g + shift, 0, 255); d[i + 2] = clamp(b + shift, 0, 255);
    }
    x.putImageData(im, rx, ry);
  }
  function titleBlock(x, words, w, y, maxH) { // big white letters, one word per line
    var lh = Math.min(maxH / words.length, w * 0.26);
    x.fillStyle = '#f4f4f4'; x.textBaseline = 'top';
    words.forEach(function (word, i) {
      x.font = '100px ' + DISPLAY;
      var k = Math.min(lh * 0.95 / 100 / 0.82, w * 0.86 / x.measureText(word).width);
      x.font = (100 * k).toFixed(1) + 'px ' + DISPLAY;
      x.fillText(word, w * 0.07, y + i * lh);
    });
    return y + words.length * lh;
  }
  function termLines(x, lines, w, y, h) {
    var longest = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
    var fs = Math.min(15, w * 0.86 / (longest * 0.6), h / (lines.length * 1.35));
    x.font = 'bold ' + fs.toFixed(1) + 'px ' + MONO; x.textBaseline = 'top';
    lines.forEach(function (l, i) {
      x.fillStyle = /FATAL|ERROR|CRIT|HIGH|failed \d*[1-9]| -\d/.test(l) ? '#ff4452' : /WARN|Severity|MED/.test(l) ? '#f5a524' : /^[$#v]\s|^F\d|LOW|passed/.test(l) ? '#3ddc84' : '#d6d6d6';
      x.fillText(l, w * 0.07, y + i * fs * 1.35);
    });
  }

  function compose(card, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#0d0d0e'; x.fillRect(0, 0, w, h);
    var kind = card.el.dataset.kind, img = card.img, words = (card.el.dataset.title || '').split(' ').filter(Boolean);
    if (kind === 'phone' && img) { // phone screenshot: cover, anchored at the top
      var s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      x.drawImage(img, (w - img.naturalWidth * s) / 2, 0, img.naturalWidth * s, img.naturalHeight * s);
      if (card.light) invertRegion(x, 0, 0, w, h);
    } else if (kind === 'desk' && img) { // desktop screenshot: title, the picture, the number
      var y = titleBlock(x, words, w, h * 0.05, h * 0.3) + h * 0.04;
      var ih = w * img.naturalHeight / img.naturalWidth;
      x.drawImage(img, 0, y, w, ih);
      if (card.light) invertRegion(x, 0, y, w, ih);
      var ny = y + ih + h * 0.03, nh = h - ny - h * 0.03;
      if (nh > 30) {
        x.font = '100px ' + DISPLAY;
        var k = nh * 0.95 / 82;
        x.font = (100 * k).toFixed(1) + 'px ' + DISPLAY; x.fillStyle = '#e5202e'; x.textBaseline = 'top';
        x.fillText(card.num, w * 0.07, ny);
      }
    } else { // terminal projects: title + the text itself
      var lines = card.term ? card.term.split('\n') : [];
      var y2 = titleBlock(x, words, w, h * 0.05, h * 0.26) + h * 0.03;
      card.titleBox = { words: words, y: h * 0.05, h: y2 - h * 0.05 - h * 0.03 };
      if (kind === 'potato') { // a small potato with a big grin
        var cx = w / 2, cy = y2 + h * 0.13, rx = w * 0.3, ry = h * 0.11;
        var g = x.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 4, cx, cy, rx * 1.1);
        g.addColorStop(0, '#f2d08a'); g.addColorStop(1, '#8a5a24');
        x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rx, ry, -0.15, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#111';
        x.beginPath(); x.arc(cx - rx * 0.32, cy - ry * 0.2, ry * 0.16, 0, Math.PI * 2); x.arc(cx + rx * 0.32, cy - ry * 0.2, ry * 0.16, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#111'; x.lineWidth = Math.max(2, ry * 0.1);
        x.beginPath(); x.arc(cx, cy + ry * 0.05, rx * 0.4, 0.2, Math.PI - 0.2); x.stroke();
        y2 = cy + ry + h * 0.05;
      }
      card.termBox = { lines: lines, y: y2, h: h - y2 - h * 0.03 };
      termLines(x, lines, w, y2, card.termBox.h);
    }
    return c;
  }

  function renderStage(card, s) {
    var st = STAGES[s], w = card.w, h = card.h;
    var cw = st.fs * 0.6, ch = st.fs, cols = Math.ceil(w / cw), rows = Math.ceil(h / ch);
    var sm = document.createElement('canvas'); sm.width = cols; sm.height = rows;
    var sx = sm.getContext('2d', { willReadFrequently: true });
    sx.imageSmoothingQuality = 'high';
    sx.drawImage(card.src, 0, 0, cols, rows);
    var d = sx.getImageData(0, 0, cols, rows).data, n = st.ramp.length, lo = 1, hi = 0, lum = new Float32Array(cols * rows);
    for (var i = 0; i < cols * rows; i++) {
      var l = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
      lum[i] = l; if (l < lo) lo = l; if (l > hi) hi = l;
    }
    var out = document.createElement('canvas');
    out.width = Math.round(w * DPR); out.height = Math.round(h * DPR);
    var o = out.getContext('2d');
    o.scale(DPR, DPR);
    o.fillStyle = '#0d0d0e'; o.fillRect(0, 0, w, h);
    o.font = (st.mode === 'bit' ? 'bold ' : '') + st.fs + 'px ' + MONO; o.textBaseline = 'top';
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var k = y * cols + x, v = (lum[k] - lo) / ((hi - lo) || 1);
        var r = d[k * 4], g = d[k * 4 + 1], b = d[k * 4 + 2];
        if (st.mode === 'bit') {
          o.fillStyle = v > 0.45 ? 'rgba(236,236,234,' + (0.45 + v * 0.5).toFixed(2) + ')' : 'rgba(90,90,98,.35)';
          o.fillText(v > 0.45 ? '1' : '0', x * cw, y * ch);
          continue;
        }
        var ci = Math.round(v * (n - 1));
        if (!ci) continue;
        if (st.mode === 'colour') {
          var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx - mn > 50) { var f = Math.max(1, 200 / (mx || 1)); o.fillStyle = 'rgb(' + Math.min(255, r * f | 0) + ',' + Math.min(255, g * f | 0) + ',' + Math.min(255, b * f | 0) + ')'; }
          else o.fillStyle = 'rgba(230,230,232,' + (0.3 + v * 0.7).toFixed(2) + ')';
        } else if (st.mode === 'hot') {
          o.fillStyle = v > 0.82 ? '#ff4452' : 'rgba(200,200,206,' + (0.3 + v * 0.6).toFixed(2) + ')';
        } else o.fillStyle = 'rgba(210,210,214,' + (0.28 + v * 0.68).toFixed(2) + ')';
        o.fillText(st.ramp[ci], x * cw, y * ch);
      }
    }
    // fully evolved terminal cards: the output becomes readable text again
    if (s === LAST && card.termBox) {
      var tb = card.termBox;
      o.fillStyle = '#0d0d0e'; o.fillRect(0, tb.y - 6, w, h - tb.y + 6);
      termLines(o, tb.lines, w, tb.y, tb.h);
    }
    // ...and the title becomes clean ASCII letters, like the page headings
    if (s === LAST && card.titleBox) {
      var ti = card.titleBox, lh = ti.h / ti.words.length;
      o.fillStyle = '#0d0d0e'; o.fillRect(0, 0, w, ti.y + ti.h + 2);
      o.textBaseline = 'top';
      ti.words.forEach(function (word, wi) {
        var R = 9, a = artLines([[{ t: word, red: false }]], R);
        var fz = Math.min(w * 0.86 / (a.cols * 0.6), lh / (R + 0.5));
        o.font = 'bold ' + fz.toFixed(2) + 'px ' + MONO; o.fillStyle = '#f2f2f0';
        a.grid.forEach(function (row, ry) {
          row.forEach(function (c, cx) { if (c.ch !== ' ') o.fillText(c.ch, w * 0.07 + cx * fz * 0.6, ti.y + wi * lh + ry * fz); });
        });
      });
    }
    return out;
  }

  function frameText(cols, rows) {
    var dash = function (n) { return new Array(Math.max(0, n) + 1).join('-'); };
    var mid = function (n, s) { var a = Math.floor((n - s.length) / 2); return dash(a) + s + dash(n - a - s.length); };
    var lines = ['.' + mid(cols - 2, '( o )') + '.'];
    var body = '|' + new Array(cols - 1).join(' ') + '|';
    for (var r = 1; r < rows - 1; r++) lines.push(body);
    lines.push("'" + mid(cols - 2, '[ ]') + "'");
    return lines.join('\n');
  }

  function setupWork() {
    var work = document.querySelector('.work'), pin = work && work.querySelector('.work-pin'), track = work && work.querySelector('.work-track');
    if (!track || !document.createElement('canvas').getContext) return;
    var progressEl = work.querySelector('.work-progress');
    var pinned = !reduced;
    work.classList.add('js-work');
    if (pinned) work.classList.add('js-pin');

    var cards = [].map.call(track.querySelectorAll('.phone'), function (el) {
      var screen = el.querySelector('.screen'), cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true'); screen.appendChild(cv);
      var fr = document.createElement('pre'); fr.className = 'phone-frame'; fr.setAttribute('aria-hidden', 'true');
      el.insertBefore(fr, el.firstChild);
      var img = screen.querySelector('img'), term = screen.querySelector('.term');
      var card = { name: el.querySelector('h3').textContent.replace(/^\s*\d+\s*/, '').toLowerCase(), el: el, screen: screen, cv: cv, ctx: cv.getContext('2d'), frame: fr, evo: el.querySelector('.evo'), h3: el.querySelector('h3'),
        num: (el.querySelector('.n') || {}).textContent || '', term: term ? term.textContent : '', img: null, light: false,
        stage: -1, shown: -1, cache: [], src: null, anim: 0 };
      if (img) {
        var im = new Image();
        im.onload = function () { card.img = im; try { card.light = meanLum(im) > 0.5; } catch (e) { } prep(card); };
        im.src = img.currentSrc || img.src;
      }
      return card;
    });

    function prep(card) { // size everything to the card, then draw the current stage
      var r = card.screen.getBoundingClientRect();
      card.w = Math.max(1, Math.round(r.width)); card.h = Math.max(1, Math.round(r.height));
      card.cv.width = Math.round(card.w * DPR); card.cv.height = Math.round(card.h * DPR);
      card.cache = [];
      var kind = card.el.dataset.kind;
      card.src = (kind === 'phone' || kind === 'desk') && !card.img ? null : compose(card, card.w, card.h);
      // the ASCII phone frame, fitted to the card exactly
      var pw = card.el.offsetWidth, ph = card.el.offsetHeight, cols = Math.max(10, Math.floor(pw / 7.8)), rows = Math.max(10, Math.floor(ph / 13));
      card.frame.style.fontSize = (pw / cols / 0.6).toFixed(3) + 'px';
      card.frame.style.lineHeight = (ph / rows).toFixed(3) + 'px';
      card.frame.textContent = frameText(cols, rows);
      card.shown = -1;
      if (card.stage >= 0) show(card, card.stage, true);
    }
    function stageArt(card, s) { return card.cache[s] || (card.cache[s] = renderStage(card, s)); }

    function show(card, s, instant) {
      if (!card.src) return;
      var prev = card.shown;
      card.shown = s;
      var next = stageArt(card, s), c = card.ctx, W = card.cv.width, H = card.cv.height;
      if (instant || prev < 0 || reduced) { c.drawImage(next, 0, 0); return; }
      var old = stageArt(card, prev), up = s > prev, id = ++card.anim, t0 = performance.now(), fs = STAGES[s].fs * DPR;
      (function tick(now) {
        if (id !== card.anim) return;
        var p = Math.min((now - t0) / 420, 1), e = p * p * (3 - 2 * p), cut = Math.round((up ? e : 1 - e) * H);
        // evolving: the new form scans in from the top; devolving: from the bottom
        var top = up ? next : old, bottom = up ? old : next;
        if (cut > 0) c.drawImage(top, 0, 0, W, cut, 0, 0, W, cut);
        if (cut < H) c.drawImage(bottom, 0, cut, W, H - cut, 0, cut, W, H - cut);
        if (p < 1) {
          // a band of mutating glyphs where the two forms meet
          c.font = 'bold ' + fs + 'px ' + MONO; c.textBaseline = 'top';
          for (var b = 0; b < 3; b++) {
            var y = cut - fs * (b + 0.5);
            c.fillStyle = 'rgba(13,13,14,.85)'; c.fillRect(0, y, W, fs);
            c.fillStyle = b ? 'rgba(255,68,82,' + (0.8 - b * 0.25) + ')' : '#fff';
            for (var x = 0; x < W; x += fs * 0.6) if (Math.random() < 0.55) c.fillText(rnd(GLYPHS + '01'), x, y);
          }
          requestAnimationFrame(tick);
        }
      })(t0);
    }

    function evoLabel(card, s) {
      if (card.evo._s === s) return;
      card.evo._s = s;
      var bar = new Array(s + 2).join('#') + new Array(LAST - s + 1).join('-');
      card.evo.innerHTML = 'evo [<b>' + bar + '</b>] ' + (s + 1) + '/' + STAGES.length + ' ' + STAGES[s].name;
      card.el.classList.toggle('on', s === LAST);
    }

    // ---- layout & scrolling ----
    var vw, focus, span, maxShift = 0, start = 0, shift = 0, cardW = 0;
    function measure() {
      vw = document.documentElement.clientWidth;
      focus = vw * (vw < 700 ? 0.5 : 0.42);
      span = vw * (vw < 700 ? 0.95 : 0.62);
      cardW = cards[0].el.offsetWidth;
      // the last card must be able to reach the focus line
      track.style.paddingRight = Math.max(16, vw - focus - cardW / 2) + 'px';
      if (pinned) {
        track.style.transform = 'none';
        maxShift = Math.max(0, track.offsetWidth - vw);
        var pinH = pin.offsetHeight, padTop = parseFloat(getComputedStyle(work).paddingTop) || 0;
        work.style.height = (padTop + pinH + maxShift) + 'px';
        start = work.getBoundingClientRect().top + window.scrollY + padTop - 56;
      }
      cards.forEach(prep);
      update();
    }

    function update() {
      if (pinned) {
        shift = clamp(window.scrollY - start, 0, maxShift);
        track.style.transform = 'translate3d(' + (-shift).toFixed(1) + 'px,0,0)';
      }
      var best = 0, bestD = 1e9;
      cards.forEach(function (card, i) {
        var r = card.el.getBoundingClientRect(), cx = r.left + r.width / 2;
        var t = clamp(1 - (cx - focus) / span, 0, 1), s = Math.min(LAST, Math.floor(t * STAGES.length));
        if (Math.abs(cx - focus) < bestD) { bestD = Math.abs(cx - focus); best = i; }
        evoLabel(card, s);
        if (s !== card.stage) {
          var up = s > card.stage && card.stage >= 0;
          card.stage = s;
          if (card.src) show(card, s, false);
          if (up && s === LAST) scramble(card.h3, 420);
        }
      });
      if (progressEl) {
        var n = vw < 520 ? 18 : 34, p = pinned ? (maxShift ? shift / maxShift : 0) : (track.scrollLeft / Math.max(1, track.scrollWidth - track.clientWidth));
        var at = Math.round(p * (n - 1));
        progressEl.innerHTML = '[<b>' + new Array(at + 1).join('=') + '&gt;</b>' + new Array(n - at).join('.') + '] ' +
          String(best + 1).padStart(2, '0') + '/' + String(cards.length).padStart(2, '0') + (vw < 520 ? '' : '  ' + cards[best].name);
      }
    }

    var ticking = false;
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('scroll', onScroll, { passive: true });
    // keyboard: a focused link inside a card that is off to the side brings it to the focus line
    track.addEventListener('focusin', function (e) {
      if (!pinned) return;
      var card = e.target.closest('.phone'); if (!card) return;
      pin.scrollLeft = 0;
      var want = clamp(card.offsetLeft + card.offsetWidth / 2 - focus, 0, maxShift);
      window.scrollTo({ top: start + want, behavior: reduced ? 'auto' : 'smooth' });
    });
    var rt, lastW = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (document.documentElement.clientWidth === lastW && pinned && Math.abs(window.innerHeight - (measure._h || 0)) < 120) { update(); return; } // mobile URL bar
        lastW = document.documentElement.clientWidth; measure._h = window.innerHeight; measure();
      }, 150);
    });
    lastW = document.documentElement.clientWidth; measure._h = window.innerHeight;
    measure();
    // other content above can change height once headings are drawn; settle the numbers again
    window.addEventListener('load', measure);
  }

  /* =============== start =============== */
  function boot() {
    setupHeads();
    // the ASCII headings changed the page height: let the prism and the background re-measure
    window.dispatchEvent(new Event('resize'));
    setupScramble();
    setupStrip();
    setupWork();
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { heads.forEach(renderHead); }, 150); });
  }
  var booted = false;
  function go() { if (!booted) { booted = true; boot(); } }
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('100px Anton'), document.fonts.load('16px "JetBrains Mono"'), document.fonts.load('bold 16px "JetBrains Mono"')]).then(go, go);
    setTimeout(go, 2500);
  } else go();
})();
