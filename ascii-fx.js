/* ASCII effects for the page content:
   - scramble: headings, titles and numbers decode out of random ASCII glyphs
     the first time they scroll into view (nav links and card titles on hover)
   - ascii images: project screenshots first appear as ASCII art, then a scan
     line wipes them into the real picture; hovering a card replays it fast */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var hasIO = 'IntersectionObserver' in window;

  /* ---------------- scramble ---------------- */
  var GLYPHS = '!<>-_\\/[]{}=+*^?#%@$&~';
  function textNodes(el) {
    var out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (w.currentNode.nodeValue.trim()) out.push(w.currentNode);
    return out;
  }
  function scramble(el, dur) {
    if (el._scrambling) return;
    var nodes = textNodes(el);
    if (!nodes.length) return;
    var orig = nodes.map(function (n) { return n.nodeValue; });
    var total = orig.join('').length || 1;
    el._scrambling = true;
    el.style.minHeight = el.offsetHeight + 'px'; // random glyphs must not reflow the page
    var t0 = performance.now(), frame = 0;
    dur = dur || 900;
    (function tick(now) {
      var p = Math.min((now - t0) / dur, 1);
      if (frame++ % 2 === 0 || p === 1) {
        var idx = 0;
        nodes.forEach(function (n, k) {
          var s = orig[k], o = '';
          for (var i = 0; i < s.length; i++, idx++) {
            var ch = s[i];
            o += (ch === ' ' || ch === '\n' || p >= (idx / total) * 0.7 + 0.3) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          }
          n.nodeValue = o;
        });
      }
      if (p < 1) requestAnimationFrame(tick);
      else { nodes.forEach(function (n, k) { n.nodeValue = orig[k]; }); el._scrambling = false; el.style.minHeight = ''; }
    })(t0);
  }

  var onView = '.big, .card h3, .list em, .timeline time, .kicker, .hero-foot span, .counter-label';
  if (hasIO) {
    var so = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        so.unobserve(e.target);
        scramble(e.target, e.target.classList.contains('big') ? 1100 : 750);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll(onView).forEach(function (el) { so.observe(el); });
  }
  // the hero introduces itself once
  ['.hero h1', '.role'].forEach(function (s, i) {
    var el = document.querySelector(s);
    if (el) setTimeout(function () { scramble(el, 900 + i * 300); }, 150);
  });
  document.querySelectorAll('.nav nav a').forEach(function (a) {
    a.addEventListener('mouseenter', function () { scramble(a, 420); });
  });
  document.querySelectorAll('.card').forEach(function (card) {
    var h = card.querySelector('h3');
    if (h) card.addEventListener('mouseenter', function () { scramble(h, 500); });
  });

  /* ---------------- ascii images ---------------- */
  var RAMP = ' .,:;-=+*#%@';
  var FS = 9, CW = 5.4, CH = 9; // tiny monospace cells

  function asciiFrom(img, w, h, dpr) {
    var cols = Math.max(8, Math.floor(w / CW)), rows = Math.max(6, Math.floor(h / CH));
    var s = document.createElement('canvas'); s.width = cols; s.height = rows;
    var sx = s.getContext('2d', { willReadFrequently: true });
    // object-fit: cover, anchored at the top, like the CSS
    var ir = img.naturalWidth / img.naturalHeight, br = w / h, sw, sh;
    if (ir > br) { sh = img.naturalHeight; sw = sh * br; } else { sw = img.naturalWidth; sh = sw / br; }
    sx.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, sh, 0, 0, cols, rows);
    var d = sx.getImageData(0, 0, cols, rows).data, lum = new Float32Array(cols * rows), mean = 0, lo = 1, hi = 0;
    for (var i = 0; i < cols * rows; i++) {
      var l = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
      lum[i] = l; mean += l; if (l < lo) lo = l; if (l > hi) hi = l;
    }
    mean /= cols * rows;
    var invert = mean > 0.5; // light UIs: draw the dark details, not the white
    var out = document.createElement('canvas');
    out.width = Math.round(w * dpr); out.height = Math.round(h * dpr);
    var o = out.getContext('2d');
    o.scale(dpr, dpr);
    o.fillStyle = '#0d0d0e'; o.fillRect(0, 0, w, h);
    o.font = FS + 'px "JetBrains Mono", ui-monospace, monospace'; o.textBaseline = 'top';
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var v = (lum[y * cols + x] - lo) / ((hi - lo) || 1);
        if (invert) v = 1 - v;
        var ci = Math.round(v * (RAMP.length - 1));
        if (!ci) continue;
        var r = d[(y * cols + x) * 4], g = d[(y * cols + x) * 4 + 1], b = d[(y * cols + x) * 4 + 2];
        var colourful = Math.max(r, g, b) - Math.min(r, g, b) > 60; // keep real accents (badges, buttons)
        o.fillStyle = colourful ? 'rgb(' + r + ',' + g + ',' + b + ')' : (v > 0.75 ? '#ff4452' : 'rgba(200,200,206,' + (0.35 + v * 0.5).toFixed(2) + ')');
        o.fillText(RAMP[ci], x * CW, y * CH);
      }
    }
    return out;
  }

  function wipe(item, dur) {
    var cv = item.cv, ctx = cv.getContext('2d'), art = item.art;
    if (!art) return;
    item.anim = (item.anim || 0) + 1;
    var id = item.anim, t0 = performance.now();
    cv.style.opacity = '1';
    (function tick(now) {
      if (id !== item.anim) return;
      var p = Math.min((now - t0) / dur, 1), e = p * p * (3 - 2 * p);
      var cut = Math.round(e * cv.height);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (cut < cv.height) ctx.drawImage(art, 0, cut, cv.width, cv.height - cut, 0, cut, cv.width, cv.height - cut);
      if (p < 1) {
        // the scan line
        var lw = Math.max(2, cv.height * 0.006);
        var g = ctx.createLinearGradient(0, cut - lw * 8, 0, cut + lw);
        g.addColorStop(0, 'rgba(229,32,46,0)'); g.addColorStop(0.85, 'rgba(229,32,46,0.35)'); g.addColorStop(1, 'rgba(255,120,128,0.95)');
        ctx.fillStyle = g; ctx.fillRect(0, cut - lw * 8, cv.width, lw * 9);
        requestAnimationFrame(tick);
      } else cv.style.opacity = '0';
    })(t0);
  }

  var items = [];
  document.querySelectorAll('.shot img').forEach(function (img) {
    var wrap = document.createElement('span');
    wrap.className = 'ascii-img pending';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    wrap.appendChild(cv);
    items.push({ img: img, wrap: wrap, cv: cv });
  });

  function prepare(item) {
    var r = item.img.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!r.width || !r.height) return false;
    item.cv.width = Math.round(r.width * dpr); item.cv.height = Math.round(r.height * dpr);
    try { item.art = asciiFrom(item.img, r.width, r.height, dpr); } catch (err) { item.art = null; }
    return !!item.art;
  }
  function start(item) {
    var go = function () {
      item.wrap.classList.remove('pending');
      if (prepare(item)) wipe(item, 1500);
    };
    if (item.img.complete && item.img.naturalWidth) go();
    else { item.img.addEventListener('load', go, { once: true }); item.img.addEventListener('error', function () { item.wrap.classList.remove('pending'); }, { once: true }); }
  }

  if (hasIO) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        items.forEach(function (it) { if (it.wrap === e.target) start(it); });
      });
    }, { threshold: 0.25 });
    items.forEach(function (it) { io.observe(it.wrap); });
  } else items.forEach(function (it) { it.wrap.classList.remove('pending'); });

  // hovering a card replays a quick ascii glitch over its pictures
  document.querySelectorAll('.card').forEach(function (card) {
    card.addEventListener('mouseenter', function () {
      items.forEach(function (it) { if (card.contains(it.wrap) && it.art) wipe(it, 650); });
    });
  });
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { items.forEach(function (it) { if (it.art) prepare(it); }); }, 200);
  });
})();
