/* Cursor war: little terminal "agents" quarrel over files in the background.
   touch creates files, mv carries them elsewhere, rm deletes them, convert
   changes their format, and chmod races the others to lock a file first —
   whoever arrives at a locked file gets "permission denied".

   They move like living things: steering with inertia, curving paths, a
   personal pace, hesitations, overshoot and idle fidgeting.

   Visitors can play too (mouse): drag a file to move it, double-click it to
   delete it. Hold a file for a moment and mv comes to fight you for it: a
   tug of war that you win by yanking hard, or lose after a few seconds.
   Each click also drops a ripple into the ASCII background
   (window.__asciiDrop from ascii.js). No dependencies. */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var stage = document.querySelector('.cursors');
  if (!stage) return;
  stage.innerHTML = '';

  var W = window.innerWidth, H = window.innerHeight;
  var small = W < 700;
  var MAXF = small ? 5 : 9, MINF = small ? 2 : 3;
  var TOP = 80, EDGE = small ? 24 : 40;

  var NAMES = ['bug-report', 'notes', 'logo', 'data', 'todo', 'build', 'report', 'tests', 'readme', 'export', 'cache', 'draft', 'schema', 'config', 'invoice', 'avatar'];
  var EXTS = ['md', 'txt', 'png', 'json', 'csv', 'js', 'pdf', 'jpg'];
  var CONVERT = { png: 'webp', webp: 'avif', avif: 'png', jpg: 'png', md: 'pdf', pdf: 'txt', txt: 'md', csv: 'json', json: 'yaml', yaml: 'json', js: 'ts', ts: 'js' };
  var EXT_COLOR = { md: '#9aa0ad', txt: '#c7c7cc', pdf: '#ff5a5f', png: '#ff7ab6', jpg: '#ff9f6e', webp: '#7ee0c3', avif: '#8fd3ff', json: '#ffc21a', yaml: '#ffd76a', csv: '#3ddc84', js: '#f7df1e', ts: '#4aa3ff' };
  var ROLES = [
    { id: 'touch', color: '#3ddc84' },
    { id: 'mv', color: '#4aa3ff' },
    { id: 'rm', color: '#ff4452' },
    { id: 'convert', color: '#ffc21a' },
    { id: 'chmod', color: '#b48cff' }
  ];
  var DIRS = ['~/archive', '~/tmp', '/var/log', '~/src', './dist', '~/desktop'];

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function el(tag, cls, html) { var e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; }
  function now() { return performance.now(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ripple(x, y, p) { if (window.__asciiDrop) window.__asciiDrop(x, y, p); }

  /* ---------------- files ---------------- */
  var files = [];
  var DOC = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M2 1h11l5 5v17H2z" fill="rgba(20,20,22,.9)" stroke="currentColor" stroke-width="1.4"/><path d="M13 1v5h5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

  function freeSpot(awayFrom) {
    for (var tries = 0; tries < 40; tries++) {
      var x = rnd(EDGE, W - EDGE - 90), y = rnd(TOP, H - EDGE - 30), ok = true;
      if (awayFrom && Math.hypot(awayFrom.x - x, awayFrom.y - y) < Math.min(W, H) * 0.35) continue;
      for (var i = 0; i < files.length; i++) if (!files[i].dead && Math.hypot(files[i].x - x, files[i].y - y) < 110) { ok = false; break; }
      if (ok) return { x: x, y: y };
    }
    return { x: rnd(EDGE, W - EDGE - 90), y: rnd(TOP, H - EDGE - 30) };
  }
  function label(f) { f.nameEl.innerHTML = f.name + '<b>.' + f.ext + '</b>'; f.e.style.color = EXT_COLOR[f.ext] || '#ccc'; }
  function makeFile(x, y) {
    var f = { x: x, y: y, name: pick(NAMES), ext: pick(EXTS), busy: null, carrier: null, lockedUntil: 0, dead: false, held: false };
    f.e = el('div', 'cw-file', DOC);
    f.nameEl = el('span', 'cw-name');
    f.lockEl = el('i', 'cw-lock', 'r--r--r--');
    f.e.appendChild(f.nameEl); f.e.appendChild(f.lockEl);
    label(f);
    stage.appendChild(f.e);
    place(f);
    files.push(f);
    requestAnimationFrame(function () { f.e.classList.add('in'); });
    return f;
  }
  function place(f) { f.e.style.transform = 'translate3d(' + f.x.toFixed(1) + 'px,' + f.y.toFixed(1) + 'px,0)'; }
  function alive() { return files.filter(function (f) { return !f.dead; }); }
  function available() { var t = now(); return alive().filter(function (f) { return !f.busy && !f.held && !f.carrier && f.lockedUntil < t; }); }
  function killFile(f, byUser) {
    f.dead = true; f.held = false; f.carrier = null;
    f.e.classList.add('dying'); if (byUser) f.e.classList.add('by-user');
    setTimeout(function () { f.e.remove(); var i = files.indexOf(f); if (i >= 0) files.splice(i, 1); }, 900);
  }

  /* ---------------- agents ---------------- */
  var PTR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l15 8.5-6.6 1.9L9.6 19z" fill="currentColor" stroke="rgba(0,0,0,.6)" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  var agents = ROLES.map(function (r, i) {
    var a = {
      role: r.id, x: rnd(EDGE, W - EDGE), y: rnd(TOP, H - EDGE), vx: 0, vy: 0,
      steps: [], target: null, wait: now() + 600 + i * 900,
      // personality: everyone has their own pace and wobble
      speed: (small ? 110 : 165) * rnd(0.85, 1.2), seed: rnd(0, 100), wobble: rnd(0.55, 0.85),
      hesitateUntil: 0, nextHesitate: 0, home: null, pauseEnd: 0
    };
    a.e = el('div', 'cw-agent');
    a.ptr = el('span', 'cw-ptr', PTR);
    a.e.appendChild(a.ptr);
    a.e.style.color = r.color;
    a.e.style.setProperty('--ac', r.color);
    a.e.appendChild(el('span', 'cw-tag', r.id));
    a.bubble = el('span', 'cw-bubble');
    a.e.appendChild(a.bubble);
    stage.appendChild(a.e);
    return a;
  });
  function agent(role) { for (var i = 0; i < agents.length; i++) if (agents[i].role === role) return agents[i]; return null; }

  function say(a, text, bad) {
    a.bubble.textContent = text;
    a.bubble.classList.toggle('bad', !!bad);
    a.bubble.classList.add('show');
    clearTimeout(a.sayT);
    a.sayT = setTimeout(function () { a.bubble.classList.remove('show'); }, 1800);
  }
  function ring(x, y, color) {
    var r = el('span', 'cw-ring');
    r.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    r.style.color = color;
    stage.appendChild(r);
    setTimeout(function () { r.remove(); }, 700);
  }
  function click(a, strong) {
    ring(a.x, a.y, a.e.style.color);
    a.ptr.classList.remove('press'); void a.ptr.offsetWidth; a.ptr.classList.add('press');
    ripple(a.x, a.y, strong ? 260 : 150);
  }
  function shake(a) { a.e.classList.remove('shake'); void a.e.offsetWidth; a.e.classList.add('shake'); }
  function denied(a, f, text) {
    say(a, text || 'permission denied: ' + f.name + '.' + f.ext, true);
    shake(a);
    if (f.busy === a) f.busy = null;
  }
  function locked(f) { return f.lockedUntil > now(); }
  // the file can't be used right now: dead, held by the visitor or locked
  function blocked(a, f) {
    if (f.dead) { if (f.busy === a) f.busy = null; return true; }
    if (f.held) { denied(a, f, 'EBUSY: ' + f.name + '.' + f.ext + ' is in use'); return true; }
    if (locked(f)) { denied(a, f); return true; }
    return false;
  }
  function dropCarried(a) {
    files.forEach(function (f) { if (f.carrier === a) { f.carrier = null; f.e.classList.remove('carried'); if (f.busy === a) f.busy = null; } });
  }
  function finishCarry(a, f) {
    return { act: function () {
      if (f.carrier === a) { f.carrier = null; f.e.classList.remove('carried'); click(a); }
      if (f.busy === a) f.busy = null;
    } };
  }

  // each task is a list of steps: go somewhere, do something, pause
  function plan(a) {
    var f, spot;
    a.target = null;
    switch (a.role) {
      case 'touch':
        if (alive().length >= MAXF) return idle(a);
        spot = freeSpot();
        return [{ go: spot }, { act: function () {
          var nf = makeFile(a.x + 6, a.y + 4);
          click(a); say(a, 'touch ' + nf.name + '.' + nf.ext);
        } }, { pause: rnd(1200, 2400) }];
      case 'mv':
        f = pick(available()); if (!f) return idle(a);
        f.busy = a; a.target = f; spot = freeSpot();
        var dir = pick(DIRS);
        return [{ go: f }, { act: function () {
          if (blocked(a, f)) return 'stop';
          f.carrier = a; f.e.classList.add('carried'); click(a);
          say(a, 'mv ' + f.name + '.' + f.ext + ' ' + dir + '/');
        } }, { go: spot }, finishCarry(a, f), { pause: rnd(1000, 2000) }];
      case 'rm':
        if (alive().length <= MINF) return idle(a);
        f = pick(available()); if (!f) return idle(a);
        f.busy = a; a.target = f;
        return [{ go: f }, { act: function () {
          if (blocked(a, f)) return 'stop';
          click(a, true); say(a, 'rm -f ' + f.name + '.' + f.ext); killFile(f);
        } }, { pause: rnd(1400, 2600) }];
      case 'convert':
        f = pick(available()); if (!f) return idle(a);
        f.busy = a; a.target = f;
        return [{ go: f }, { act: function () {
          if (blocked(a, f)) return 'stop';
          var from = f.ext, to = CONVERT[from] || 'txt';
          click(a); say(a, 'convert ' + f.name + '.' + from + ' → .' + to);
          scrambleExt(f, to);
          f.busy = null;
        } }, { pause: rnd(1200, 2200) }];
      case 'chmod':
        // race another agent to the file it is heading for
        var rivals = agents.filter(function (o) { return o !== a && o.target && !o.target.dead && !locked(o.target) && o.steps.length && o.steps[0].go === o.target; });
        if (!rivals.length) return idle(a);
        f = pick(rivals).target; a.target = f;
        return [{ go: f, fast: true }, { act: function () {
          if (f.dead) return 'stop';
          click(a); say(a, 'chmod 444 ' + f.name + '.' + f.ext);
          f.lockedUntil = now() + 5200; f.e.classList.add('locked');
          setTimeout(function () { if (!locked(f)) f.e.classList.remove('locked'); }, 5300);
        } }, { go: { x: clamp(f.x + rnd(-90, 90), EDGE, W - EDGE), y: clamp(f.y + (f.y > H / 2 ? -70 : 70), TOP, H - EDGE) } }, // step aside and watch
        { pause: rnd(1500, 2600) }];
    }
    return idle(a);
  }
  function idle(a) { return [{ go: { x: clamp(a.x + rnd(-220, 220), EDGE, W - EDGE), y: clamp(a.y + rnd(-160, 160), TOP, H - EDGE) } }, { pause: rnd(800, 1600) }]; }

  var GLYPHS = '#%&@*+=?/<>';
  function scrambleExt(f, to) {
    var n = 0, timer = setInterval(function () {
      n++;
      if (f.dead) { clearInterval(timer); return; }
      if (n < 7) { f.nameEl.innerHTML = f.name + '<b>.' + Array.from({ length: to.length }, function () { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }).join('') + '</b>'; }
      else { clearInterval(timer); f.ext = to; label(f); f.e.classList.remove('flash'); void f.e.offsetWidth; f.e.classList.add('flash'); }
    }, 70);
  }

  /* ---------------- living movement ---------------- */
  // steering with inertia: accelerate towards the target along a gently curving
  // path, brake on arrival (with a little overshoot), now and then hesitate
  function steer(a, gx, gy, t, dt, fast) {
    var dx = gx - a.x, dy = gy - a.y, d = Math.hypot(dx, dy);
    var sp = a.speed * (fast ? 1.4 : 1) * (0.82 + 0.22 * Math.sin(t / 900 + a.seed)); // breathing pace
    if (t < a.hesitateUntil) sp *= 0.08; // stop and "think"
    else if (t > a.nextHesitate && d > 160 && Math.random() < 0.004) { a.hesitateUntil = t + rnd(250, 650); a.nextHesitate = t + 2500; }
    var want = sp * Math.min(1, d / 110); // arrive: slow down near the goal
    // curvy path: two slow swings make S-bends; they fade out close to the goal so it still arrives
    var swing = Math.sin(t / 520 + a.seed * 3) * 0.75 + Math.sin(t / 1450 + a.seed) * 0.45;
    var ang = Math.atan2(dy, dx) + swing * a.wobble * Math.min(1, d / 180);
    var tx = Math.cos(ang) * want, ty = Math.sin(ang) * want;
    var k = Math.min(1, dt * (fast ? 7 : 4.5)); // inertia
    a.vx += (tx - a.vx) * k; a.vy += (ty - a.vy) * k;
    a.x += a.vx * dt; a.y += a.vy * dt;
    return d < 4 && Math.hypot(a.vx, a.vy) < 25;
  }
  function fidget(a, t, dt) { // alive while waiting: drift around a resting point
    if (!a.home) a.home = { x: a.x, y: a.y };
    steer(a, a.home.x + Math.sin(t / 650 + a.seed) * 4, a.home.y + Math.cos(t / 830 + a.seed) * 3, t, dt);
  }
  function draw(a) {
    a.e.style.transform = 'translate3d(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px,0)';
    var tilt = clamp(a.vx / a.speed * 14, -14, 14) + clamp(a.vy / a.speed * 4, -4, 4);
    a.ptr.style.transform = 'rotate(' + tilt.toFixed(1) + 'deg)';
  }
  function goal(s) { // a step's target, followed live when it is a file
    var g = s.go;
    return g.e ? { x: g.x + 10, y: g.y + 8 } : g;
  }

  /* ---------------- the visitor ---------------- */
  var user = null;          // { f, ox, oy, px, py, t0, speed, lx, ly, lt }
  var tug = null;           // { a, f, t, attached, anchor, dest }
  var lastPress = { f: null, t: 0 }, swallowClick = false, tugCooldown = 0;
  var CONTENT = 'a, button, input, select, textarea, label, .card, .prism-handle, .prism-knob, .prism-reset, h1, h2, h3, p, li, dl, .nav, .strip, .counter, .menu, .hint, .logo';

  function fileAt(x, y) {
    for (var i = files.length - 1; i >= 0; i--) {
      var f = files[i];
      if (f.dead) continue;
      var r = f.e.getBoundingClientRect();
      if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return f;
    }
    return null;
  }
  // only files that are actually visible (not covered by page content) can be grabbed
  function grabbable(e) {
    if (e.target.closest && e.target.closest(CONTENT)) return null;
    return fileAt(e.clientX, e.clientY);
  }
  function setHover(f) {
    files.forEach(function (o) { o.e.classList.toggle('hover', o === f); });
    document.documentElement.classList.toggle('cw-grab', !!f);
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var f = grabbable(e);
    if (!f) return;
    e.preventDefault(); e.stopPropagation(); // keep the hero (pin light) and text selection out of it
    swallowClick = true;
    var t = now();
    if (lastPress.f === f && t - lastPress.t < 380) { // double click: delete
      lastPress.f = null;
      endUser(true);
      userDelete(f);
      return;
    }
    lastPress = { f: f, t: t };
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return; // touch: no dragging (it scrolls the page)
    // steal it from an agent that is carrying it
    if (f.carrier) { var c = f.carrier; f.carrier = null; f.e.classList.remove('carried'); say(c, 'hey! give it back', true); shake(c); c.steps = [{ pause: rnd(700, 1200) }]; }
    if (f.busy) f.busy = null;
    user = { f: f, ox: e.clientX - f.x, oy: e.clientY - f.y, px: e.clientX, py: e.clientY, t0: t, speed: 0, lx: e.clientX, ly: e.clientY, lt: t };
    f.held = true; f.e.classList.add('held');
    setHover(null);
    document.documentElement.classList.add('cw-dragging');
    ring(e.clientX, e.clientY, '#ffffff');
    ripple(e.clientX, e.clientY, 160);
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (user) {
      var t = now(), dtm = Math.max(1, t - user.lt);
      var v = Math.hypot(e.clientX - user.lx, e.clientY - user.ly) / dtm * 1000;
      user.speed = user.speed * 0.6 + v * 0.4;
      user.lx = e.clientX; user.ly = e.clientY; user.lt = t;
      user.px = e.clientX; user.py = e.clientY;
      return;
    }
    if (e.pointerType === 'mouse') setHover(grabbable(e));
  }, true);

  function endUser(silent) {
    if (!user) return;
    var f = user.f;
    f.held = false; f.e.classList.remove('held');
    user = null;
    document.documentElement.classList.remove('cw-dragging');
    if (!silent) ripple(f.x + 8, f.y + 8, 120);
  }
  document.addEventListener('pointerup', function () { if (user) endUser(); }, true);
  document.addEventListener('pointercancel', function () { if (user) endUser(); }, true);
  document.addEventListener('click', function (e) { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);

  function userDelete(f) {
    if (f.dead) return;
    ring(f.x + 8, f.y + 8, '#ff4452');
    ripple(f.x + 8, f.y + 8, 300);
    if (tug && tug.f === f) loseGrip(true);
    if (f.carrier) { var c = f.carrier; c.steps = [{ pause: rnd(700, 1200) }]; }
    killFile(f, true);
    var rm = agent('rm');
    if (rm && Math.random() < 0.8) say(rm, pick(['rm: you beat me to it', 'rm: hey, that was my job', 'rm: nice one']));
  }

  /* ---------------- tug of war ---------------- */
  function startTug(f) {
    var a = agent('mv');
    if (!a || (tug && tug.f === f)) return;
    if (a.target && a.target !== f && a.target.busy === a) a.target.busy = null;
    dropCarried(a);
    a.target = f; a.pauseEnd = 0;
    tug = { a: a, f: f, t: 0, attached: false, anchor: null, dest: freeSpot({ x: user.px, y: user.py }) };
    a.steps = [{ chase: f }];
    say(a, pick(['mv: that one is mine', 'mv: put it down', 'mv: I need that file']));
  }
  function loseGrip(quiet) {
    if (!tug) return;
    var a = tug.a;
    tug.f.e.classList.remove('tugged');
    if (!quiet) { say(a, pick(['! grip lost', '! ugh, fine', '! EAGAIN']), true); shake(a); }
    a.steps = [{ pause: rnd(900, 1500) }];
    tug = null; tugCooldown = now() + 2600;
  }
  function carryAway(a, f, dest, fast) {
    f.carrier = a; f.busy = a; f.e.classList.add('carried');
    a.steps = [{ go: dest, fast: fast }, finishCarry(a, f), { pause: rnd(1200, 2000) }];
  }
  function agentWins() {
    var a = tug.a, f = tug.f, dest = tug.dest;
    f.e.classList.remove('tugged');
    tug = null; tugCooldown = now() + 4000;
    endUser(true);
    click(a, true); say(a, 'mv -f: mine now');
    carryAway(a, f, dest, true);
  }
  function userReleasedDuringTug() {
    var a = tug.a, f = tug.f, dest = tug.dest, attached = tug.attached;
    f.e.classList.remove('tugged');
    tug = null; tugCooldown = now() + 3000;
    if (f.dead || !attached) { a.steps = [{ pause: 800 }]; return; }
    say(a, 'mv: thanks');
    carryAway(a, f, dest, false);
  }

  /* ---------------- loop ---------------- */
  var last = now();
  function tick(t) {
    requestAnimationFrame(tick);
    var dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (document.hidden) return;

    // the visitor's file follows the hand (springy), unless mv is pulling it away
    if (user) {
      var f = user.f, ux = user.px - user.ox, uy = user.py - user.oy;
      if (f.dead) endUser(true);
      else {
        if (!tug && t - user.t0 > 700 && t > tugCooldown && Math.random() < 0.05) startTug(f);
        var tx = ux, ty = uy;
        if (tug && tug.f === f && tug.attached) {
          tug.t += dt;
          // mv drags its anchor towards where it wants the file
          var ax = tug.anchor.x, ay = tug.anchor.y, d = Math.hypot(tug.dest.x - ax, tug.dest.y - ay) || 1;
          tug.anchor.x += (tug.dest.x - ax) / d * 45 * dt; tug.anchor.y += (tug.dest.y - ay) / d * 45 * dt;
          var pull = clamp(0.22 + tug.t * 0.11 + Math.sin(tug.t * 7.5) * 0.13, 0.1, 0.85);
          tx = ux * (1 - pull) + tug.anchor.x * pull; ty = uy * (1 - pull) + tug.anchor.y * pull;
          tx += Math.sin(t / 37) * 2; ty += Math.cos(t / 41) * 2; // the struggle
          f.e.classList.add('tugged');
          if (user.speed > 1500 || Math.hypot(user.px - tug.a.x, user.py - tug.a.y) > 230) loseGrip();
          else if (tug.t > 4.6 || (tug.t > 3 && pull > 0.72)) agentWins();
        }
        if (user) { var k = Math.min(1, dt * 16); f.x += (tx - f.x) * k; f.y += (ty - f.y) * k; place(f); }
      }
    } else if (tug) {
      userReleasedDuringTug();
    }

    agents.forEach(function (a) {
      if (t < a.wait) { fidget(a, t, dt); draw(a); return; }
      if (!a.steps.length) a.steps = plan(a);
      var s = a.steps[0];
      if (s.go) {
        a.home = null;
        var g = goal(s);
        if (s.go.e && s.go.dead) a.steps.shift();
        else if (steer(a, g.x, g.y, t, dt, s.fast)) a.steps.shift();
      } else if (s.chase) { // run to the file the visitor is holding and grab it
        a.home = null;
        if (!tug || tug.a !== a || !user) a.steps.shift();
        else {
          var c = s.chase;
          if (steer(a, c.x + 10, c.y + 8, t, dt, true) || Math.hypot(c.x + 10 - a.x, c.y + 8 - a.y) < 14) {
            tug.attached = true; tug.anchor = { x: c.x, y: c.y };
            click(a); say(a, 'mv --force ' + c.name + '.' + c.ext);
            a.steps = [{ hold: c }];
          }
        }
      } else if (s.hold) { // hanging on to the file during the tug
        if (!tug || tug.a !== a) a.steps.shift();
        else { a.x += (s.hold.x + 10 - a.x) * Math.min(1, dt * 20); a.y += (s.hold.y + 8 - a.y) * Math.min(1, dt * 20); a.vx = a.vy = 0; }
      } else if (s.act) {
        var r = s.act(); a.steps.shift();
        if (r === 'stop') a.steps = [{ pause: rnd(900, 1500) }];
      } else if (s.pause) {
        if (!a.pauseEnd) { a.pauseEnd = t + s.pause; a.home = { x: a.x, y: a.y }; }
        fidget(a, t, dt);
        if (t >= a.pauseEnd) { a.pauseEnd = 0; a.steps.shift(); }
      }
      // carried files trail behind on a spring
      files.forEach(function (f) {
        if (f.carrier === a && !f.dead) { var k = Math.min(1, dt * 9); f.x += (a.x - 8 - f.x) * k; f.y += (a.y - 6 - f.y) * k; place(f); }
      });
      draw(a);
    });
  }

  // a few files to start with
  for (var i = 0; i < (small ? 3 : 5); i++) { var p = freeSpot(); makeFile(p.x, p.y); }
  agents.forEach(draw);
  requestAnimationFrame(tick);

  window.addEventListener('resize', function () {
    W = window.innerWidth; H = window.innerHeight;
    files.forEach(function (f) { f.x = Math.min(f.x, W - EDGE - 90); f.y = Math.min(f.y, H - EDGE - 30); place(f); });
    agents.forEach(function (a) { a.x = Math.min(a.x, W - EDGE); a.y = Math.min(a.y, H - EDGE); a.home = null; });
  });
})();
