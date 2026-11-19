/* Portfolio interactions: prism light, floating cursors, reveal, counter. No dependencies. */
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= PRISM LIGHT =================
     A white beam travels from the cursor (or a slowly moving idle source)
     into a glass triangle. Each wavelength refracts with its own index
     (Snell's law, exaggerated dispersion), so the beam leaves as a rainbow. */
  var hero = document.querySelector('.hero');
  var cv = document.querySelector('canvas.prism');
  var gv = document.querySelector('canvas.prism-glow');
  if (hero && cv && gv && cv.getContext) {
    var ctx = cv.getContext('2d'), gtx = gv.getContext('2d');
    var W = 0, H = 0, DPR = 1;
    var C = { x: 0, y: 0 }, side = 0, tri = [];
    var src = { x: 0, y: 0 }, target = null, mouse = null;
    var K = 28;                       // number of wavelengths
    var N_RED = 1.43, N_VIOLET = 1.60; // exaggerated dispersion for a wide fan
    var running = false, t0 = performance.now();

    var hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = window.matchMedia('(hover: none)').matches ? 'drag to bend the light' : 'move your cursor · bend the light';
    hero.appendChild(hint);

    function layout() {
      var r = hero.getBoundingClientRect();
      W = r.width; H = r.height;
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      gv.width = Math.round(W * DPR * 0.5); gv.height = Math.round(H * DPR * 0.5);
      var mobile = W < 900;
      if (mobile) { C = { x: W * 0.42, y: H * 0.73 }; side = Math.min(W * 0.46, 240); }
      else { C = { x: W * 0.72, y: H * 0.5 }; side = Math.min(H * 0.4, W * 0.24, 360); }
      var h = side * Math.sqrt(3) / 2;
      // equilateral triangle, apex up, centred on its centroid
      tri = [
        { x: C.x, y: C.y - h * 2 / 3 },
        { x: C.x + side / 2, y: C.y + h / 3 },
        { x: C.x - side / 2, y: C.y + h / 3 }
      ];
      hint.style.left = C.x + 'px';
      hint.style.top = (C.y + h / 3 + 26) + 'px';
      if (!src.x && !src.y) { var s = idleSource(0); src.x = s.x; src.y = s.y; }
    }

    function idleSource(t) {
      var a = Math.PI - (W < 900 ? 0.32 : 0.22) + Math.sin(t / 2600) * 0.14;
      var R = Math.max(W, H);
      return { x: C.x + Math.cos(a) * R, y: C.y + Math.sin(a) * R };
    }

    // ---- 2D ray maths ----
    function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
    function dot(a, b) { return a.x * b.x + a.y * b.y; }
    function norm(a) { var l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; }
    function edgeNormal(i) { // outward unit normal of edge i (tri[i] -> tri[i+1])
      var a = tri[i], b = tri[(i + 1) % 3];
      var n = norm({ x: b.y - a.y, y: a.x - b.x });
      var m = { x: (a.x + b.x) / 2 - C.x, y: (a.y + b.y) / 2 - C.y };
      return dot(n, m) < 0 ? { x: -n.x, y: -n.y } : n;
    }
    function hit(p, d, skip) { // nearest edge hit of ray p + t·d
      var best = null;
      for (var i = 0; i < 3; i++) {
        if (i === skip) continue;
        var a = tri[i], b = tri[(i + 1) % 3], e = sub(b, a);
        var den = d.x * e.y - d.y * e.x;
        if (Math.abs(den) < 1e-9) continue;
        var w = sub(a, p);
        var t = (w.x * e.y - w.y * e.x) / den;
        var u = (w.x * d.y - w.y * d.x) / den;
        if (t > 1e-6 && u >= 0 && u <= 1 && (!best || t < best.t)) {
          best = { t: t, i: i, p: { x: p.x + d.x * t, y: p.y + d.y * t } };
        }
      }
      return best;
    }
    function refract(d, n, eta) { // n faces against d
      var ci = -dot(n, d), k = 1 - eta * eta * (1 - ci * ci);
      if (k < 0) return null; // total internal reflection
      var f = eta * ci - Math.sqrt(k);
      return norm({ x: eta * d.x + f * n.x, y: eta * d.y + f * n.y });
    }
    function reflect(d, n) { var k = 2 * dot(d, n); return { x: d.x - k * n.x, y: d.y - k * n.y }; }

    function trace(s) {
      var d = norm(sub(C, s));
      var h0 = hit(s, d, -1);
      if (!h0) return null;
      var n0 = edgeNormal(h0.i);
      var rays = [];
      for (var k = 0; k < K; k++) {
        var f = k / (K - 1), n = N_RED + (N_VIOLET - N_RED) * f;
        var dir = refract(d, n0, 1 / n);
        if (!dir) return null;
        var p = h0.p, skip = h0.i, inside = [p], out = null;
        for (var b = 0; b < 4 && !out; b++) {
          var h = hit(p, dir, skip);
          if (!h) break;
          inside.push(h.p);
          var ne = edgeNormal(h.i);
          var o = refract(dir, { x: -ne.x, y: -ne.y }, n);
          if (o) out = { p: h.p, d: o };
          else { dir = norm(reflect(dir, { x: -ne.x, y: -ne.y })); p = h.p; skip = h.i; }
        }
        if (!out) continue;
        rays.push({ f: f, inside: inside, out: out });
      }
      return { entry: h0.p, rays: rays };
    }

    function hue(f) { return Math.round(f * 275); } // red -> violet

    function draw(now) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      gtx.setTransform(DPR * 0.5, 0, 0, DPR * 0.5, 0, 0);
      ctx.clearRect(0, 0, W, H); gtx.clearRect(0, 0, W, H);

      var tr = trace(src);
      var L = Math.hypot(W, H) * 1.5;
      var flick = 0.92 + Math.sin(now / 180) * 0.03 + Math.sin(now / 47) * 0.02;

      // ambient glow around the prism
      var amb = ctx.createRadialGradient(C.x, C.y, 0, C.x, C.y, side * 1.4);
      amb.addColorStop(0, 'rgba(255,255,255,0.06)'); amb.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = amb; ctx.fillRect(0, 0, W, H);

      if (tr) {
        // incoming white beam
        [gtx, ctx].forEach(function (c, j) {
          var g = c.createLinearGradient(src.x, src.y, tr.entry.x, tr.entry.y);
          g.addColorStop(0, 'rgba(255,255,255,' + (j ? 0.15 : 0.1) + ')');
          g.addColorStop(1, 'rgba(255,255,255,' + (j ? 0.95 : 0.9) * flick + ')');
          c.strokeStyle = g; c.lineWidth = j ? 2.2 : 14; c.lineCap = 'round';
          c.beginPath(); c.moveTo(src.x, src.y); c.lineTo(tr.entry.x, tr.entry.y); c.stroke();
        });

        // light travelling inside the glass
        ctx.globalCompositeOperation = 'lighter';
        tr.rays.forEach(function (r) {
          ctx.strokeStyle = 'hsla(' + hue(r.f) + ',100%,70%,0.07)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(r.inside[0].x, r.inside[0].y);
          for (var i = 1; i < r.inside.length; i++) ctx.lineTo(r.inside[i].x, r.inside[i].y);
          ctx.stroke();
        });

        // outgoing rainbow fan: a quad between neighbouring wavelengths
        gtx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < tr.rays.length - 1; i++) {
          var a = tr.rays[i].out, b = tr.rays[i + 1].out;
          var col = hue((tr.rays[i].f + tr.rays[i + 1].f) / 2);
          var quad = [a.p, { x: a.p.x + a.d.x * L, y: a.p.y + a.d.y * L }, { x: b.p.x + b.d.x * L, y: b.p.y + b.d.y * L }, b.p];
          [[gtx, 0.55], [ctx, 0.2]].forEach(function (pair) {
            var c = pair[0], g = c.createLinearGradient(a.p.x, a.p.y, a.p.x + a.d.x * L * 0.6, a.p.y + a.d.y * L * 0.6);
            g.addColorStop(0, 'hsla(' + col + ',100%,62%,' + pair[1] * flick + ')');
            g.addColorStop(1, 'hsla(' + col + ',100%,55%,0)');
            c.fillStyle = g; c.beginPath(); c.moveTo(quad[0].x, quad[0].y);
            for (var q = 1; q < 4; q++) c.lineTo(quad[q].x, quad[q].y);
            c.closePath(); c.fill();
          });
        }
        gtx.globalCompositeOperation = 'source-over';
        ctx.globalCompositeOperation = 'source-over';

        // flare where the beam enters
        var fl = ctx.createRadialGradient(tr.entry.x, tr.entry.y, 0, tr.entry.x, tr.entry.y, 34);
        fl.addColorStop(0, 'rgba(255,255,255,' + 0.85 * flick + ')'); fl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(tr.entry.x, tr.entry.y, 34, 0, Math.PI * 2); ctx.fill();
      }

      // the glass prism
      var pg = ctx.createLinearGradient(tri[2].x, tri[0].y, tri[1].x, tri[1].y);
      pg.addColorStop(0, 'rgba(255,255,255,0.10)'); pg.addColorStop(0.5, 'rgba(255,255,255,0.03)'); pg.addColorStop(1, 'rgba(255,255,255,0.08)');
      ctx.fillStyle = pg; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(tri[0].x, tri[0].y); ctx.lineTo(tri[1].x, tri[1].y); ctx.lineTo(tri[2].x, tri[2].y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // edge highlight on the apex
      var hl = ctx.createRadialGradient(tri[0].x, tri[0].y, 0, tri[0].x, tri[0].y, side * 0.5);
      hl.addColorStop(0, 'rgba(255,255,255,0.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = hl; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(tri[2].x, tri[2].y); ctx.lineTo(tri[0].x, tri[0].y); ctx.lineTo(tri[1].x, tri[1].y); ctx.stroke();
    }

    function nearPrism(p) {
      for (var i = 0; i < 3; i++) if (dot(sub(p, tri[i]), edgeNormal(i)) > side * 0.12) return false;
      return true;
    }

    function step(now) {
      var goal = mouse && !nearPrism(mouse) ? mouse : idleSource(now - t0);
      var k = mouse ? 0.16 : 0.05;
      src.x += (goal.x - src.x) * k; src.y += (goal.y - src.y) * k;
      draw(now);
      if (running) requestAnimationFrame(step);
    }
    function start() { if (!running && !reduced) { running = true; requestAnimationFrame(step); } }
    function stop() { running = false; }

    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (reduced) { src.x = mouse.x; src.y = mouse.y; if (!nearPrism(mouse)) draw(performance.now()); }
    });
    hero.addEventListener('pointerleave', function () { mouse = null; });

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { layout(); draw(performance.now()); }, 120); });
    layout(); draw(performance.now());
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }).observe(hero);
    } else start();
  }

  /* ================= FLOATING CURSORS ================= */
  var box = document.querySelector('.cursors');
  if (box && !reduced) {
    var svg = '<svg viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 8z" fill="#e5202e" stroke="#ff6b75" stroke-width="1"/></svg>';
    for (var i = 0; i < 14; i++) {
      var w = document.createElement('div');
      w.innerHTML = svg;
      var s = w.firstChild;
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.top = (Math.random() * 100) + 'vh';
      s.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px');
      s.style.setProperty('--dy', (Math.random() * 240 - 120) + 'px');
      s.style.setProperty('--r', (Math.random() * 60 - 30) + 'deg');
      s.style.setProperty('--o', (0.12 + Math.random() * 0.3).toFixed(2));
      var sz = 12 + Math.random() * 12; s.style.width = s.style.height = sz + 'px';
      s.style.animationDuration = (14 + Math.random() * 18) + 's';
      s.style.animationDelay = (-Math.random() * 20) + 's';
      box.appendChild(s);
    }
  }

  /* ================= REVEAL + COUNTER ================= */
  var items = document.querySelectorAll('.reveal');
  function countUp(el) {
    var to = +el.dataset.to, t = performance.now();
    (function tick(now) {
      var p = Math.min((now - t) / 1400, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    })(t);
  }
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        var c = e.target.querySelector('.count');
        if (c) countUp(c);
        io.unobserve(e.target);
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }
})();
