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
    var C = { x: 0, y: 0 }, T = { x: 0, y: 0 }, side = 0, tri = [];
    var src = { x: 0, y: 0 }, target = null, mouse = null;
    var K = 44;                       // number of wavelengths
    var N_RED = 1.43, N_VIOLET = 1.60; // exaggerated dispersion for a wide fan
    var running = false, t0 = performance.now();
    var rot = 0;                       // gentle tilt of the prism, radians
    var heroTop = 0;                   // hero's top edge in the viewport, for the ASCII light
    var motes = [], sparks = [];       // dust in the white beam, glitter in the rainbow

    var hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = window.matchMedia('(hover: none)').matches ? 'tap to move the light' : 'move your cursor · bend the light';
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
      shape();
      hint.style.left = C.x + 'px';
      hint.style.top = (C.y + h / 3 + 30) + 'px';
      if (!motes.length) {
        for (var i = 0; i < 34; i++) motes.push({ u: Math.random(), off: (Math.random() - 0.5) * 16, sp: 0.0012 + Math.random() * 0.0025, ph: Math.random() * 6.28, r: 0.5 + Math.random() * 1.2 });
        for (var j = 0; j < 26; j++) sparks.push({ k: Math.random(), u: Math.random(), sp: 0.002 + Math.random() * 0.004, ph: Math.random() * 6.28, r: 0.6 + Math.random() * 1.1 });
      }
      if (!src.x && !src.y) { var s = idleSource(0); src.x = s.x; src.y = s.y; }
    }

    // equilateral triangle, apex up, turned by `rot` around its centroid
    function shape() {
      var R = side / Math.sqrt(3);
      tri = [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6].map(function (a) {
        return { x: C.x + Math.cos(a + rot) * R, y: C.y + Math.sin(a + rot) * R };
      });
      // the beam aims at a point on the left face, a little below its middle
      T = { x: tri[2].x + (tri[0].x - tri[2].x) * 0.42, y: tri[2].y + (tri[0].y - tri[2].y) * 0.42 };
    }

    function idleSource(t) {
      var a = Math.PI - (W < 900 ? 0.32 : 0.22) + Math.sin(t / 2600) * 0.14;
      var R = Math.max(W, H);
      return { x: T.x + Math.cos(a) * R, y: T.y + Math.sin(a) * R };
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
      var d = norm(sub(T, s));
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
          if (o) out = { p: h.p, d: o, e: h.i };
          else { dir = norm(reflect(dir, { x: -ne.x, y: -ne.y })); p = h.p; skip = h.i; }
        }
        if (!out) continue;
        rays.push({ f: f, inside: inside, out: out });
      }
      return { entry: h0.p, rays: rays };
    }

    function hue(f) { return Math.round(f * 275); } // red -> violet

    function roundTri(c, pts, r) { // triangle path with softly rounded corners
      var n = pts.length, m0 = { x: (pts[n - 1].x + pts[0].x) / 2, y: (pts[n - 1].y + pts[0].y) / 2 };
      c.beginPath(); c.moveTo(m0.x, m0.y);
      for (var i = 0; i < n; i++) c.arcTo(pts[i].x, pts[i].y, pts[(i + 1) % n].x, pts[(i + 1) % n].y, r);
      c.closePath();
    }
    function inset(f) { return tri.map(function (p) { return { x: C.x + (p.x - C.x) * f, y: C.y + (p.y - C.y) * f }; }); }
    function rgba(a) { return 'rgba(255,255,255,' + Math.max(0, a).toFixed(3) + ')'; }

    function draw(now) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      gtx.setTransform(DPR * 0.5, 0, 0, DPR * 0.5, 0, 0);
      ctx.clearRect(0, 0, W, H); gtx.clearRect(0, 0, W, H);

      var tr = trace(src);
      var L = Math.hypot(W, H) * 1.5;
      var light = []; // shared with the ASCII background (ascii.js)
      var flick = 0.93 + Math.sin(now / 180) * 0.03 + Math.sin(now / 47) * 0.015;
      var corner = side * 0.035;
      var top = tri[0], baseY = Math.max(tri[1].y, tri[2].y);

      // soft halo around the glass and a faint glow on the "floor" under it
      var amb = ctx.createRadialGradient(C.x, C.y, 0, C.x, C.y, side * 1.5);
      amb.addColorStop(0, rgba(0.07)); amb.addColorStop(1, rgba(0));
      ctx.fillStyle = amb; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(C.x, baseY + side * 0.06); ctx.scale(1, 0.16);
      var fl0 = ctx.createRadialGradient(0, 0, 0, 0, 0, side * 0.75);
      fl0.addColorStop(0, rgba(0.13)); fl0.addColorStop(1, rgba(0));
      ctx.fillStyle = fl0; ctx.beginPath(); ctx.arc(0, 0, side * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      if (tr) {
        var ex = tr.entry, bx = ex.x - src.x, by = ex.y - src.y, blen = Math.hypot(bx, by) || 1;
        var px = -by / blen, py = bx / blen;
        light.push({ h: 12, pts: [{ x: src.x + px * 8, y: src.y + py * 8 }, { x: ex.x + px * 8, y: ex.y + py * 8 }, { x: ex.x - px * 8, y: ex.y - py * 8 }, { x: src.x - px * 8, y: src.y - py * 8 }], g0: ex, g1: src });

        // incoming white beam: wide haze on the glow layer, soft body, bright core
        [[gtx, 22, 0.05, 0.75], [ctx, 6, 0.0, 0.12], [ctx, 1.8, 0.12, 0.95]].forEach(function (o) {
          var g = o[0].createLinearGradient(src.x, src.y, ex.x, ex.y);
          g.addColorStop(0, rgba(o[2])); g.addColorStop(1, rgba(o[3] * flick));
          o[0].strokeStyle = g; o[0].lineWidth = o[1]; o[0].lineCap = 'round';
          o[0].beginPath(); o[0].moveTo(src.x, src.y); o[0].lineTo(ex.x, ex.y); o[0].stroke();
        });

        // dust drifting through the beam, brighter close to the prism
        ctx.globalCompositeOperation = 'lighter';
        motes.forEach(function (m) {
          if (running) { m.u += m.sp; if (m.u > 1) { m.u -= 1; m.off = (Math.random() - 0.5) * 16; } }
          var tw = 0.5 + 0.5 * Math.sin(now / 260 + m.ph);
          var a = m.u * m.u * tw * 0.75;
          if (a < 0.02) return;
          var x = src.x + bx * m.u + px * m.off * (0.3 + m.u), y = src.y + by * m.u + py * m.off * (0.3 + m.u);
          ctx.fillStyle = rgba(a); ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
        });

        // inside the glass: the white light fans out into colours
        var straight = tr.rays.filter(function (r) { return r.inside.length === 2; });
        for (var i = 0; i < straight.length - 1; i++) {
          var r0 = straight[i], r1 = straight[i + 1];
          var gi = ctx.createLinearGradient(ex.x, ex.y, r0.out.p.x, r0.out.p.y);
          gi.addColorStop(0, 'rgba(255,255,255,0.22)');
          gi.addColorStop(1, 'hsla(' + hue(r0.f) + ',100%,65%,0.32)');
          ctx.fillStyle = gi; ctx.beginPath(); ctx.moveTo(ex.x, ex.y); ctx.lineTo(r0.out.p.x, r0.out.p.y); ctx.lineTo(r1.out.p.x, r1.out.p.y); ctx.closePath(); ctx.fill();
        }

        // outgoing rainbow fan: a quad between neighbouring wavelengths
        gtx.globalCompositeOperation = 'lighter';
        var exitSum = { x: 0, y: 0, n: 0 }, bands = [], band = null;
        for (var q = 0; q < tr.rays.length - 1; q++) {
          var a = tr.rays[q].out, b = tr.rays[q + 1].out;
          // neighbours leaving through different faces (or after internal
          // reflection) are not one band: joining them paints a huge wedge
          if (a.e !== b.e || dot(a.d, b.d) < 0.996) continue;
          exitSum.x += a.p.x; exitSum.y += a.p.y; exitSum.n++;
          var col = hue((tr.rays[q].f + tr.rays[q + 1].f) / 2);
          // for the ASCII light, neighbouring slivers of one hue are merged into
          // a band: single slivers are thinner than a character cell and vanish
          var hb = Math.round(((tr.rays[q].f + tr.rays[q + 1].f) / 2) * 11);
          if (band && band.h === hb && band.last === q - 1) { band.b = b; band.last = q; }
          else { band = { h: hb, a: a, b: b, last: q }; bands.push(band); }
          var quad = [a.p, { x: a.p.x + a.d.x * L, y: a.p.y + a.d.y * L }, { x: b.p.x + b.d.x * L, y: b.p.y + b.d.y * L }, b.p];
          [[gtx, 0.4, 64], [ctx, 0.13, 62]].forEach(function (pair) {
            var c = pair[0], g = c.createLinearGradient(a.p.x, a.p.y, a.p.x + a.d.x * L * 0.6, a.p.y + a.d.y * L * 0.6);
            g.addColorStop(0, 'hsla(' + col + ',100%,' + pair[2] + '%,' + (pair[1] * flick).toFixed(3) + ')');
            g.addColorStop(0.35, 'hsla(' + col + ',100%,58%,' + (pair[1] * 0.7 * flick).toFixed(3) + ')');
            g.addColorStop(1, 'hsla(' + col + ',100%,55%,0)');
            c.fillStyle = g; c.beginPath(); c.moveTo(quad[0].x, quad[0].y);
            for (var z = 1; z < 4; z++) c.lineTo(quad[z].x, quad[z].y);
            c.closePath(); c.fill();
          });
        }

        bands.forEach(function (o) {
          light.push({ h: o.h, pts: [o.a.p, { x: o.a.p.x + o.a.d.x * L, y: o.a.p.y + o.a.d.y * L }, { x: o.b.p.x + o.b.d.x * L, y: o.b.p.y + o.b.d.y * L }, o.b.p], g0: o.a.p, g1: { x: o.a.p.x + o.a.d.x * L * 0.55, y: o.a.p.y + o.a.d.y * L * 0.55 } });
        });

        // glitter carried along the rainbow
        if (tr.rays.length > 1) sparks.forEach(function (s) {
          if (running) { s.u += s.sp; if (s.u > 1) { s.u -= 1; s.k = Math.random(); } }
          var r = tr.rays[Math.min(tr.rays.length - 1, Math.floor(s.k * tr.rays.length))];
          var d = s.u * side * 3.2, tw = 0.5 + 0.5 * Math.sin(now / 200 + s.ph);
          var a = (1 - s.u) * tw * 0.8;
          if (a < 0.03) return;
          ctx.fillStyle = 'hsla(' + hue(r.f) + ',100%,78%,' + a.toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(r.out.p.x + r.out.d.x * d, r.out.p.y + r.out.d.y * d, s.r, 0, Math.PI * 2); ctx.fill();
        });

        // where the light leaves: a glow on the glass edge
        if (exitSum.n) {
          var eX = exitSum.x / exitSum.n, eY = exitSum.y / exitSum.n;
          var eg = gtx.createRadialGradient(eX, eY, 0, eX, eY, side * 0.16);
          eg.addColorStop(0, 'rgba(255,240,255,' + (0.45 * flick).toFixed(3) + ')'); eg.addColorStop(1, 'rgba(255,255,255,0)');
          gtx.fillStyle = eg; gtx.beginPath(); gtx.arc(eX, eY, side * 0.16, 0, Math.PI * 2); gtx.fill();
        }
        gtx.globalCompositeOperation = 'source-over';
        ctx.globalCompositeOperation = 'source-over';
      }

      window.__prismLight = { top: heroTop, polys: light };

      // ---- the glass ----
      // body: cool top-to-bottom tint
      var body = ctx.createLinearGradient(top.x, top.y, C.x, baseY);
      body.addColorStop(0, 'rgba(255,255,255,0.13)'); body.addColorStop(0.55, 'rgba(255,255,255,0.035)'); body.addColorStop(1, 'rgba(200,210,255,0.07)');
      roundTri(ctx, tri, corner); ctx.fillStyle = body; ctx.fill();
      // outer edge
      ctx.strokeStyle = 'rgba(255,255,255,0.62)'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
      // inner bevel: a second, fainter outline gives the glass some thickness
      roundTri(ctx, inset(0.9), corner * 0.8); ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1; ctx.stroke();
      // bright rim along the two upper faces, strongest at the apex
      var hl = ctx.createRadialGradient(top.x, top.y, 0, top.x, top.y, side * 0.62);
      hl.addColorStop(0, 'rgba(255,255,255,0.75)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = hl; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tri[2].x, tri[2].y); ctx.lineTo(top.x, top.y); ctx.lineTo(tri[1].x, tri[1].y); ctx.stroke();
      // a reflection streak just inside the left face
      var i1 = inset(0.78);
      var sA = { x: i1[2].x + (i1[0].x - i1[2].x) * 0.55, y: i1[2].y + (i1[0].y - i1[2].y) * 0.55 };
      var sB = { x: i1[2].x + (i1[0].x - i1[2].x) * 0.9, y: i1[2].y + (i1[0].y - i1[2].y) * 0.9 };
      var sg = ctx.createLinearGradient(sA.x, sA.y, sB.x, sB.y);
      sg.addColorStop(0, rgba(0)); sg.addColorStop(0.5, rgba(0.35)); sg.addColorStop(1, rgba(0));
      ctx.strokeStyle = sg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
      // apex glint
      var gy = top.y + corner * 1.5;
      var gl = ctx.createRadialGradient(top.x, gy, 0, top.x, gy, side * 0.09);
      gl.addColorStop(0, rgba(0.55 * flick)); gl.addColorStop(1, rgba(0));
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(top.x, gy, side * 0.09, 0, Math.PI * 2); ctx.fill();

      // where the light enters: a bright flare with a thin streak along the face
      if (tr) {
        var e = tr.entry;
        var fl = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 40);
        fl.addColorStop(0, rgba(0.95 * flick)); fl.addColorStop(0.25, rgba(0.35 * flick)); fl.addColorStop(1, rgba(0));
        ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(e.x, e.y, 40, 0, Math.PI * 2); ctx.fill();
        var fdx = tri[0].x - tri[2].x, fdy = tri[0].y - tri[2].y, fl2 = Math.hypot(fdx, fdy) || 1;
        fdx /= fl2; fdy /= fl2;
        var st = ctx.createLinearGradient(e.x - fdx * 34, e.y - fdy * 34, e.x + fdx * 34, e.y + fdy * 34);
        st.addColorStop(0, rgba(0)); st.addColorStop(0.5, rgba(0.7 * flick)); st.addColorStop(1, rgba(0));
        ctx.strokeStyle = st; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(e.x - fdx * 34, e.y - fdy * 34); ctx.lineTo(e.x + fdx * 34, e.y + fdy * 34); ctx.stroke();
      }
    }

    // keep the light coming from the left: from the right or from below, the
    // rainbow would be thrown back across the headline and the text
    function fromLeft(p) {
      var v = sub(p, T), r = Math.max(Math.hypot(v.x, v.y), side * 0.6);
      var a = Math.atan2(v.y, v.x); if (a < 0) a += Math.PI * 2;
      // from below-left up to just under level: the beam then meets the
      // left face near the angle of least deviation and leaves as a full rainbow
      var lo = Math.PI - 0.5, hi = Math.PI - 0.1;
      if (a < lo || a > hi) { // snap to the nearer edge of the allowed range (around the circle)
        var dLo = Math.min(Math.abs(a - lo), Math.PI * 2 - Math.abs(a - lo));
        var dHi = Math.min(Math.abs(a - hi), Math.PI * 2 - Math.abs(a - hi));
        a = dLo < dHi ? lo : hi;
      }
      return { x: T.x + Math.cos(a) * r, y: T.y + Math.sin(a) * r };
    }

    function nearPrism(p) {
      for (var i = 0; i < 3; i++) if (dot(sub(p, tri[i]), edgeNormal(i)) > side * 0.12) return false;
      return true;
    }

    var lastDraw = 0;
    function step(now) {
      if (running) requestAnimationFrame(step);
      if (now - lastDraw < 15) return; // ~60 fps is plenty, also on 120/240 Hz screens
      lastDraw = now;
      heroTop = hero.getBoundingClientRect().top;
      var goal = mouse && !nearPrism(mouse) ? fromLeft(mouse) : idleSource(now - t0);
      var k = mouse ? 0.16 : 0.05;
      src.x += (goal.x - src.x) * k; src.y += (goal.y - src.y) * k;
      // the prism breathes a little and leans slightly towards the cursor
      var tilt = Math.sin((now - t0) / 4200) * 0.03 + (mouse ? Math.max(-1, Math.min(1, (mouse.y - C.y) / (H * 0.5))) * 0.04 : 0);
      rot += (tilt - rot) * 0.05;
      shape();
      draw(now);
    }
    function start() { if (!running && !reduced) { running = true; requestAnimationFrame(step); } }
    function stop() { running = false; window.__prismLight = null; }

    function aim(e) {
      var r = hero.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (reduced && !nearPrism(mouse)) { var g = fromLeft(mouse); src.x = g.x; src.y = g.y; draw(performance.now()); }
    }
    // mouse: the beam follows the cursor. touch: a tap moves the light source
    // (dragging would scroll the page, so it is not used)
    hero.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') aim(e); });
    hero.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') aim(e); });
    hero.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') mouse = null; });

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { layout(); draw(performance.now()); }, 120); });
    layout(); draw(performance.now());
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }).observe(hero);
    } else start();
  }

  /* ================= MOBILE MENU ================= */
  var menuBtn = document.querySelector('.menu'), siteNav = document.getElementById('site-nav');
  if (menuBtn && siteNav) {
    var setMenu = function (open) { siteNav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); };
    menuBtn.addEventListener('click', function () { setMenu(!siteNav.classList.contains('open')); });
    siteNav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

  /* ================= FLOATING CURSORS ================= */
  var box = document.querySelector('.cursors');
  if (box && !reduced) {
    var svg = '<svg viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 8z" fill="#e5202e" stroke="#ff6b75" stroke-width="1"/></svg>';
    for (var i = 0; i < 9; i++) {
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
