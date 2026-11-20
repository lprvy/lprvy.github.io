/* Cursor war: little terminal "agents" quarrel over files in the background.
   touch creates files, mv carries them elsewhere, rm deletes them, convert
   changes their format, and chmod races the others to lock a file first —
   whoever arrives at a locked file gets "permission denied".
   Everything moves at a calm pace; each click also drops a ripple into the
   ASCII background (window.__asciiDrop from ascii.js). No dependencies. */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var stage = document.querySelector('.cursors');
  if (!stage) return;
  stage.innerHTML = '';

  var W = window.innerWidth, H = window.innerHeight;
  var small = W < 700;
  var MAXF = small ? 5 : 9, MINF = small ? 2 : 3;
  var SPEED = small ? 120 : 170; // px per second
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
  function ripple(x, y, p) { if (window.__asciiDrop) window.__asciiDrop(x, y, p); }

  /* ---------------- files ---------------- */
  var files = [];
  var DOC = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M2 1h11l5 5v17H2z" fill="rgba(20,20,22,.9)" stroke="currentColor" stroke-width="1.4"/><path d="M13 1v5h5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

  function freeSpot() {
    for (var tries = 0; tries < 30; tries++) {
      var x = rnd(EDGE, W - EDGE - 90), y = rnd(TOP, H - EDGE - 30), ok = true;
      for (var i = 0; i < files.length; i++) if (!files[i].dead && Math.hypot(files[i].x - x, files[i].y - y) < 110) { ok = false; break; }
      if (ok) return { x: x, y: y };
    }
    return { x: rnd(EDGE, W - EDGE - 90), y: rnd(TOP, H - EDGE - 30) };
  }
  function label(f) { f.nameEl.innerHTML = f.name + '<b>.' + f.ext + '</b>'; f.e.style.color = EXT_COLOR[f.ext] || '#ccc'; }
  function makeFile(x, y) {
    var f = { x: x, y: y, name: pick(NAMES), ext: pick(EXTS), busy: null, carried: null, lockedUntil: 0, dead: false };
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
  function available() { var t = now(); return alive().filter(function (f) { return !f.busy && f.lockedUntil < t; }); }
  function killFile(f) {
    f.dead = true; f.e.classList.add('dying');
    setTimeout(function () { f.e.remove(); files.splice(files.indexOf(f), 1); }, 900);
  }

  /* ---------------- agents ---------------- */
  var PTR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l15 8.5-6.6 1.9L9.6 19z" fill="currentColor" stroke="rgba(0,0,0,.6)" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  var agents = ROLES.map(function (r, i) {
    var a = { role: r.id, x: rnd(EDGE, W - EDGE), y: rnd(TOP, H - EDGE), steps: [], target: null, wait: now() + 600 + i * 900 };
    a.e = el('div', 'cw-agent', PTR);
    a.e.style.color = r.color;
    a.e.style.setProperty('--ac', r.color);
    a.e.appendChild(el('span', 'cw-tag', r.id));
    a.bubble = el('span', 'cw-bubble');
    a.e.appendChild(a.bubble);
    stage.appendChild(a.e);
    return a;
  });

  function say(a, text, bad) {
    a.bubble.textContent = text;
    a.bubble.classList.toggle('bad', !!bad);
    a.bubble.classList.add('show');
    clearTimeout(a.sayT);
    a.sayT = setTimeout(function () { a.bubble.classList.remove('show'); }, 1700);
  }
  function click(a, strong) {
    var r = el('span', 'cw-ring');
    r.style.transform = 'translate3d(' + a.x + 'px,' + a.y + 'px,0)';
    r.style.color = a.e.style.color;
    stage.appendChild(r);
    setTimeout(function () { r.remove(); }, 700);
    a.e.classList.remove('press'); void a.e.offsetWidth; a.e.classList.add('press');
    ripple(a.x, a.y, strong ? 260 : 150);
  }
  function denied(a, f) {
    say(a, 'permission denied: ' + f.name + '.' + f.ext, true);
    a.e.classList.remove('shake'); void a.e.offsetWidth; a.e.classList.add('shake');
    if (f.busy === a) f.busy = null;
  }
  function locked(f) { return f.lockedUntil > now(); }

  // each task is a list of steps: go somewhere, do something, pause
  function plan(a) {
    var t = now(), f, spot;
    a.target = null;
    switch (a.role) {
      case 'touch':
        if (alive().length >= MAXF) return [{ go: freeSpot() }, { pause: rnd(900, 1600) }];
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
          if (f.dead) { f.busy = null; return 'stop'; }
          if (locked(f)) { denied(a, f); return 'stop'; }
          f.carried = a; f.e.classList.add('held'); click(a);
          say(a, 'mv ' + f.name + '.' + f.ext + ' ' + dir + '/');
        } }, { go: spot, carry: f }, { act: function () {
          f.carried = null; f.busy = null; f.e.classList.remove('held'); click(a);
        } }, { pause: rnd(1000, 2000) }];
      case 'rm':
        if (alive().length <= MINF) return idle(a);
        f = pick(available()); if (!f) return idle(a);
        f.busy = a; a.target = f;
        return [{ go: f }, { act: function () {
          if (f.dead) return 'stop';
          if (locked(f)) { denied(a, f); return 'stop'; }
          click(a, true); say(a, 'rm -f ' + f.name + '.' + f.ext); killFile(f);
        } }, { pause: rnd(1400, 2600) }];
      case 'convert':
        f = pick(available()); if (!f) return idle(a);
        f.busy = a; a.target = f;
        return [{ go: f }, { act: function () {
          if (f.dead) return 'stop';
          if (locked(f)) { denied(a, f); return 'stop'; }
          var from = f.ext, to = CONVERT[from] || 'txt';
          click(a); say(a, 'convert ' + f.name + '.' + from + ' → .' + to);
          scrambleExt(f, to);
          f.busy = null;
        } }, { pause: rnd(1200, 2200) }];
      case 'chmod':
        // race another agent to the file it is heading for
        var rivals = agents.filter(function (o) { return o !== a && o.target && !o.target.dead && !locked(o.target) && o.steps.length && o.steps[0].go === o.target; });
        if (!rivals.length) return idle(a);
        var victim = pick(rivals); f = victim.target; a.target = f;
        return [{ go: f, fast: true }, { act: function () {
          if (f.dead) return 'stop';
          click(a); say(a, 'chmod 444 ' + f.name + '.' + f.ext);
          f.lockedUntil = now() + 5200; f.e.classList.add('locked');
          setTimeout(function () { if (!locked(f)) f.e.classList.remove('locked'); }, 5300);
        } }, { go: { x: Math.max(EDGE, Math.min(W - EDGE, f.x + rnd(-90, 90))), y: Math.max(TOP, Math.min(H - EDGE, f.y + (f.y > H / 2 ? -70 : 70))) } }, // step aside and watch
        { pause: rnd(1500, 2600) }];
    }
    return idle(a);
  }
  function idle(a) { return [{ go: { x: Math.max(EDGE, Math.min(W - EDGE, a.x + rnd(-220, 220))), y: Math.max(TOP, Math.min(H - EDGE, a.y + rnd(-160, 160))) } }, { pause: rnd(800, 1600) }]; }

  var GLYPHS = '#%&@*+=?/<>';
  function scrambleExt(f, to) {
    var n = 0, timer = setInterval(function () {
      n++;
      if (n < 7) { f.nameEl.innerHTML = f.name + '<b>.' + Array.from({ length: to.length }, function () { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }).join('') + '</b>'; }
      else { clearInterval(timer); f.ext = to; label(f); f.e.classList.remove('flash'); void f.e.offsetWidth; f.e.classList.add('flash'); }
    }, 70);
  }

  /* ---------------- loop ---------------- */
  var last = now();
  function tick(t) {
    requestAnimationFrame(tick);
    var dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (document.hidden) return;
    agents.forEach(function (a) {
      if (t < a.wait) { draw(a); return; }
      if (!a.steps.length) a.steps = plan(a);
      var s = a.steps[0];
      if (s.go) {
        var gx = s.go.x + (s.go === a.target || s.go.e ? 10 : 0), gy = s.go.y + (s.go.e ? 8 : 0);
        var dx = gx - a.x, dy = gy - a.y, d = Math.hypot(dx, dy);
        var v = SPEED * (s.fast ? 1.35 : 1) * Math.min(1, 0.35 + d / 120); // ease in near the target
        if (d <= v * dt + 0.5) { a.x = gx; a.y = gy; a.steps.shift(); }
        else { a.x += dx / d * v * dt; a.y += dy / d * v * dt; }
        if (s.carry && !s.carry.dead) { s.carry.x = a.x - 8; s.carry.y = a.y - 6; place(s.carry); }
      } else if (s.act) {
        var r = s.act(); a.steps.shift();
        if (r === 'stop') a.steps = [{ pause: rnd(900, 1500) }];
      } else if (s.pause) {
        a.wait = t + s.pause; a.steps.shift();
      }
      draw(a);
    });
  }
  function draw(a) { a.e.style.transform = 'translate3d(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px,0)'; }

  // a few files to start with
  for (var i = 0; i < (small ? 3 : 5); i++) { var p = freeSpot(); makeFile(p.x, p.y); }
  agents.forEach(draw);
  requestAnimationFrame(tick);

  window.addEventListener('resize', function () {
    W = window.innerWidth; H = window.innerHeight;
    files.forEach(function (f) { f.x = Math.min(f.x, W - EDGE - 90); f.y = Math.min(f.y, H - EDGE - 30); place(f); });
    agents.forEach(function (a) { a.x = Math.min(a.x, W - EDGE); a.y = Math.min(a.y, H - EDGE); });
  });
})();
