// Sam W. Smith Inc. — concept build by Thrustra
(function () {
  var FORM_ENDPOINT = 'https://formspree.io/f/mdayqzrd'; // demo: routes to Thrustra intake; swap for client endpoint at handoff
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  // ---------- nav ----------
  var nav = document.getElementById('nav');
  var callbar = document.getElementById('callbar');
  var lastY = 0;
  function onScroll() {
    var y = window.scrollY;
    nav.classList.toggle('scrolled', y > 24);
    nav.classList.toggle('hide', y > 500 && y > lastY + 4);
    if (y < lastY - 4) nav.classList.remove('hide');
    if (callbar) callbar.classList.toggle('show', y > window.innerHeight * 0.7);
    lastY = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- open-now (Eden is Eastern time) ----------
  var openEl = document.getElementById('openNow');
  if (openEl) {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    var get = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value; };
    var day = get('weekday'), mins = (+get('hour') % 24) * 60 + (+get('minute'));
    var close = { Mon: 900, Tue: 900, Wed: 900, Thu: 900, Fri: 780 }[day];
    var isOpen = close && mins >= 480 && mins < close;
    openEl.classList.toggle('closed', !isOpen);
    openEl.lastElementChild.textContent = isOpen ? 'Open now · call the yard' : 'Closed now · leave a request below';
  }

  // ---------- reveals ----------
  var h1 = document.querySelector('.hero h1');
  requestAnimationFrame(function () { requestAnimationFrame(function () { h1.classList.add('in'); }); });
  var revealEls = document.querySelectorAll('.rv, .rv-lines');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // ---------- count-up ----------
  function countUp(el) {
    var target = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
    if (reduce) { el.textContent = target.toFixed(dec); return; }
    var t0 = null;
    function tick(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / 1600, 1), e = 1 - Math.pow(1 - p, 4);
      el.textContent = (target * e).toFixed(dec);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  setTimeout(function () { document.querySelectorAll('[data-count]').forEach(countUp); }, 700);

  // ---------- magnetic buttons ----------
  if (finePointer && !reduce) {
    document.querySelectorAll('.mag').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + (e.clientX - r.left - r.width / 2) * 0.18 + 'px,' + (e.clientY - r.top - r.height / 2) * 0.3 + 'px)';
      });
      b.addEventListener('pointerleave', function () {
        b.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
        b.style.transform = '';
        setTimeout(function () { b.style.transition = ''; }, 600);
      });
    });
  }

  // ---------- value noise ----------
  var perm = new Uint8Array(512);
  (function () { var p = []; for (var i = 0; i < 256; i++) p[i] = i; var s = 7; for (i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; var j = s % (i + 1); var t = p[i]; p[i] = p[j]; p[j] = t; } for (i = 0; i < 512; i++) perm[i] = p[i & 255]; })();
  function hash(x, y) { return perm[(perm[x & 255] + y) & 511] / 255; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    var u = smooth(xf), v = smooth(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function field(x, y, t) {
    return vnoise(x * 0.0042 + t, y * 0.0042) * 0.6 + vnoise(x * 0.009 - t * 0.6, y * 0.009 + 9) * 0.3 + vnoise(x * 0.02, y * 0.02 + t) * 0.1;
  }

  // ---------- hero topo contours (marching squares) ----------
  var canvas = document.getElementById('topo');
  var hero = canvas && canvas.parentElement;
  var xhair = document.getElementById('xhair'), xread = document.getElementById('xread'), coords = document.getElementById('coords');
  var T = 0;
  if (canvas) {
    var ctx = canvas.getContext('2d'), W, H, dpr, CELL = 14, running = true, frameN = 0;
    var LEVELS = 14;
    // edges: 0 top, 1 right, 2 bottom, 3 left — indexed by marching-squares case 1..14
    var EDGES = [[3, 2], [2, 1], [3, 1], [0, 1], [3, 0, 2, 1], [0, 2], [3, 0], [3, 0], [0, 2], [3, 2, 0, 1], [0, 1], [3, 1], [2, 1], [3, 2]];
    var P = [0, 0];
    function pt(edge, x, y, a, b, c, d, iso) {
      if (edge === 0) { P[0] = x + CELL * (iso - a) / (b - a); P[1] = y; }
      else if (edge === 1) { P[0] = x + CELL; P[1] = y + CELL * (iso - b) / (c - b); }
      else if (edge === 2) { P[0] = x + CELL * (iso - d) / (c - d); P[1] = y + CELL; }
      else { P[0] = x; P[1] = y + CELL * (iso - a) / (d - a); }
    }
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = hero.getBoundingClientRect(); W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function draw() {
      var cols = Math.ceil(W / CELL) + 1, rows = Math.ceil(H / CELL) + 1, g = new Float32Array(cols * rows);
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) g[j * cols + i] = field(i * CELL, j * CELL, T);
      ctx.clearRect(0, 0, W, H);
      for (var l = 1; l < LEVELS; l++) {
        var iso = l / LEVELS, major = l % 4 === 0;
        ctx.strokeStyle = major ? 'rgba(233,182,42,.42)' : 'rgba(212,108,67,.22)';
        ctx.lineWidth = major ? 1.4 : 1;
        ctx.beginPath();
        for (j = 0; j < rows - 1; j++) for (i = 0; i < cols - 1; i++) {
          var a = g[j * cols + i], b = g[j * cols + i + 1], c = g[(j + 1) * cols + i + 1], d = g[(j + 1) * cols + i];
          var idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          var x = i * CELL, y = j * CELL;
          var e = EDGES[idx - 1];
          for (var s = 0; s < e.length; s += 2) {
            pt(e[s], x, y, a, b, c, d, iso); ctx.moveTo(P[0], P[1]);
            pt(e[s + 1], x, y, a, b, c, d, iso); ctx.lineTo(P[0], P[1]);
          }
        }
        ctx.stroke();
      }
    }
    function loop() {
      if (!running) return;
      frameN++;
      if (frameN % 3 === 0) { T += 0.006; draw(); }
      requestAnimationFrame(loop);
    }
    size();
    window.addEventListener('resize', function () { clearTimeout(size.t); size.t = setTimeout(size, 150); });
    if (!reduce) {
      new IntersectionObserver(function (en) {
        var vis = en[0].isIntersecting;
        if (vis && !running) { running = true; requestAnimationFrame(loop); }
        running = vis;
      }).observe(hero);
      requestAnimationFrame(loop);
    } else { running = false; }

    // crosshair elevation readout
    if (finePointer && xhair) {
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        xhair.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        var elev = Math.round(540 + field(x, y, T) * 220);
        xread.textContent = 'ELEV ' + elev + ' FT';
        var lat = (36.4957 - (y / r.height) * 0.02).toFixed(4), lon = (79.7589 - (x / r.width) * 0.02).toFixed(4);
        coords.textContent = lat + '° N · ' + lon + '° W';
      });
    }
  }

  // ---------- cut & fill scroll section ----------
  var grade = document.getElementById('grade');
  if (grade) {
    var N = 61, XS = [], RAW = [], PAD = [];
    for (var k = 0; k < N; k++) {
      var x = k * 20; XS.push(x);
      var r = 200 - 78 * Math.sin(x / 170 + 0.4) - 34 * Math.sin(x / 68 + 1.3) - 26 * Math.cos(x / 260 + 2);
      RAW.push(r);
      var edgeL = 360, edgeR = 840, run = 170, g;
      if (x >= edgeL && x <= edgeR) g = 200;
      else if (x < edgeL) { var tL = Math.max(0, 1 - (edgeL - x) / run); g = r + (200 - r) * smoothE(tL); }
      else { var tR = Math.max(0, 1 - (x - edgeR) / run); g = r + (200 - r) * smoothE(tR); }
      PAD.push(g);
    }
    function smoothE(t) { return t * t * (3 - 2 * t); }
    function line(ys) { var d = 'M' + XS[0] + ' ' + ys[0].toFixed(1); for (var i = 1; i < N; i++) d += 'L' + XS[i] + ' ' + ys[i].toFixed(1); return d; }
    var ground = document.getElementById('ground'), surface = document.getElementById('surface'), ghost = document.getElementById('ghost'), cutArea = document.getElementById('cutArea');
    var found = document.getElementById('found'), pipe = document.getElementById('pipe'), padLabel = document.getElementById('padLabel'), cuyd = document.getElementById('cuyd');
    var steps = grade.querySelectorAll('.gs');
    ghost.setAttribute('d', line(RAW));
    var lastKey = '';
    function render() {
      var rect = grade.getBoundingClientRect(), total = rect.height - window.innerHeight;
      var p = reduce ? 1 : (total > 0 ? Math.min(Math.max(-rect.top / total, 0), 1) : 1);
      var m = Math.min(Math.max((p - 0.36) / 0.36, 0), 1); m = m * m * (3 - 2 * m);
      var cur = RAW.map(function (rv, i) { return rv + (PAD[i] - rv) * m; });
      var top = line(cur);
      surface.setAttribute('d', top);
      ground.setAttribute('d', top + 'L1200 360L0 360Z');
      var back = ''; for (var i = N - 1; i >= 0; i--) back += 'L' + XS[i] + ' ' + RAW[i].toFixed(1);
      cutArea.setAttribute('d', top + back + 'Z');
      cutArea.style.opacity = m > 0 ? 1 : 0;
      surface.setAttribute('stroke', p > 0.18 ? '#e9b62a' : '#6f8f45');
      cuyd.textContent = Math.round(2480 * m).toLocaleString('en-US');
      var stepN = p < 0.02 ? 0 : p < 0.18 ? 1 : p < 0.36 ? 2 : p < 0.72 ? 3 : p < 0.86 ? 4 : 5;
      var key = stepN + '';
      steps.forEach(function (s, i) {
        var local = Math.min(Math.max((p - [0, 0.18, 0.36, 0.72, 0.86][i]) / ([0.18, 0.18, 0.36, 0.14, 0.14][i]), 0), 1);
        s.querySelector('.gs-bar i').style.transform = 'scaleX(' + local + ')';
      });
      if (key === lastKey) return;
      lastKey = key;
      steps.forEach(function (s, i) { s.classList.toggle('on', i < stepN); s.classList.toggle('cur', i === Math.max(stepN - 1, 0)); });
      padLabel.setAttribute('opacity', stepN >= 4 ? 1 : 0);
      found.classList.toggle('on', stepN >= 5);
      pipe.classList.toggle('on', stepN >= 5);
    }
    window.addEventListener('scroll', function () { requestAnimationFrame(render); }, { passive: true });
    window.addEventListener('resize', render);
    render();
  }

  // ---------- two-step form ----------
  var form = document.getElementById('estForm');
  if (!form) return;
  var fs1 = document.getElementById('fs1'), fs2 = document.getElementById('fs2'), ok = document.getElementById('ok');
  var bars = form.querySelectorAll('.form-steps i');
  var err1 = document.getElementById('err1'), err2 = document.getElementById('err2');
  var send = document.getElementById('send'), sendLabel = send.querySelector('span');

  function step(n) {
    fs1.hidden = n !== 1; fs2.hidden = n !== 2;
    bars[1].classList.toggle('on', n === 2);
    var first = (n === 1 ? fs1 : fs2).querySelector('input:not([type=hidden])');
    if (first) first.focus({ preventScroll: true });
  }
  document.getElementById('next').addEventListener('click', function () {
    if (!form.querySelector('input[name=service]:checked')) { err1.textContent = 'Pick the kind of work.'; return; }
    if (form.location.value.trim().length < 3) { err1.textContent = 'Add the town or ZIP for the site.'; form.location.focus(); return; }
    err1.textContent = '';
    step(2);
  });
  document.getElementById('back').addEventListener('click', function () { step(1); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (fs2.hidden) { document.getElementById('next').click(); return; }
    if (!form.name.value.trim()) { err2.textContent = 'Add your name.'; form.name.focus(); return; }
    if (form.phone.value.replace(/\D/g, '').length < 10) { err2.textContent = 'Add a phone number we can call.'; form.phone.focus(); return; }
    err2.textContent = '';
    send.disabled = true; sendLabel.textContent = 'Sending…';
    fetch(FORM_ENDPOINT, { method: 'POST', headers: { 'Accept': 'application/json' }, body: new FormData(form) })
      .then(function (r) {
        if (!r.ok) throw new Error('bad status');
        fs2.hidden = true; form.querySelector('.form-steps').hidden = true; ok.hidden = false; ok.focus();
      })
      .catch(function () {
        err2.innerHTML = 'That didn’t go through. Call the yard at <a href="tel:+13366239151">(336) 623-9151</a>.';
        send.disabled = false; sendLabel.textContent = 'Send request';
      });
  });
})();
