(function () {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
  const rand  = (mn, mx) => mn + Math.random() * (mx - mn);

  const isCoarse = window.matchMedia('(hover: none)').matches;
  const reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Boot loader ────────────────────────────────────────────────────────
  const Boot = (() => {
    const boot   = $('#boot');
    const fill   = $('#bootFill');
    const pctEl  = $('#bootPct');
    const status = $('#bootStatus');

    const steps = [
      { weight: 12, label: 'načítavam typografiu',       run: combine(loadFonts, wait(280)) },
      { weight: 10, label: 'pripravujem sklo a refrakciu', run: combine(warmupGlass, wait(220)) },
      { weight: 14, label: 'kompilujem SVG filtre',      run: warmupFilters },
      { weight: 12, label: 'kalibrujem rozpoznávaciu schopnosť', run: wait(440) },
      { weight: 16, label: 'osvetľujem d’Alembertov reflektor', run: wait(520) },
      { weight: 14, label: 'preosievam témy lievikom', run: wait(420) },
      { weight: 12, label: 'magnetizujem prvky', run: wait(360) },
      { weight: 10, label: 'finalizujem', run: wait(280) },
    ];

    const MIN_DURATION = 2800;

    function combine(...fns) {
      return async () => { for (const f of fns) await f(); };
    }
    function wait(ms) {
      return () => new Promise(r => setTimeout(r, ms + rand(-40, 80)));
    }
    function setPct(p) {
      const v = clamp(p, 0, 100);
      fill.style.width = v.toFixed(1) + '%';
      pctEl.textContent = Math.round(v);
    }
    function setStatus(t) { status.textContent = t; }

    async function loadFonts() {
      try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      } catch (e) {}
    }
    async function warmupGlass() {
      const w = document.createElement('div');
      w.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:200px;height:80px;backdrop-filter:blur(20px) saturate(160%);background:rgba(255,255,255,0.05);';
      document.body.appendChild(w);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      w.remove();
    }
    async function warmupFilters() {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:-9999px;width:200px;height:200px;background:linear-gradient(45deg,#fff,#888);filter:url(#glassRefract);';
      document.body.appendChild(probe);
      await new Promise(r => setTimeout(r, 120));
      probe.remove();
    }

    function ticker(from, to, dur) {
      const start = performance.now();
      const id = { raf: 0, stop: false };
      const range = to - from;
      const loop = (now) => {
        if (id.stop) return;
        const elapsed = now - start;
        const t = 1 - Math.pow(2, -elapsed / dur);
        setPct(from + range * t * 0.97);
        id.raf = requestAnimationFrame(loop);
      };
      id.raf = requestAnimationFrame(loop);
      return id;
    }

    async function run() {
      const t0 = performance.now();
      setPct(0);
      setStatus(steps[0].label);

      let acc = 0;
      for (const step of steps) {
        setStatus(step.label);
        const tk = ticker(acc, acc + step.weight, 700);
        try { await step.run(); } catch (e) {}
        tk.stop = true;
        acc += step.weight;
        setPct(acc);
      }

      const elapsed = performance.now() - t0;
      if (elapsed < MIN_DURATION) await new Promise(r => setTimeout(r, MIN_DURATION - elapsed));

      setStatus('hotovo');
      setPct(100);
      await new Promise(r => setTimeout(r, 480));

      boot.classList.add('is-done');
      document.dispatchEvent(new CustomEvent('boot:done'));
    }

    return { run };
  })();

  // ─── Magnetic cursor (iPadOS-like snap) ────────────────────────────────
  const Cursor = (() => {
    if (isCoarse) return { init: () => {} };

    const ring = $('#cursorRing');
    const dot  = $('#cursorDot');

    let mx = innerWidth / 2, my = innerHeight / 2;
    let rx = mx, ry = my;

    let snapTarget = null;
    let snapRect = null;
    const DEFAULT = { w: 32, h: 32, br: 999 };
    let cur = { ...DEFAULT };
    let target = { ...DEFAULT };

    function init() {
      window.addEventListener('mousemove', (e) => {
        mx = e.clientX; my = e.clientY;
        document.body.classList.add('has-magnetic-cursor');
        dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      }, { passive: true });

      window.addEventListener('mouseleave', () => document.body.classList.remove('has-magnetic-cursor'));
      window.addEventListener('mouseenter', () => document.body.classList.add('has-magnetic-cursor'));

      $$('[data-magnetic]').forEach(setupTarget);
      loop();
    }

    function setupTarget(el) {
      el.addEventListener('mouseenter', () => {
        snapTarget = el;
        snapRect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const br = parseFloat(cs.borderTopLeftRadius) || 12;
        target = {
          w: snapRect.width + 12,
          h: snapRect.height + 12,
          br: br + 6
        };
        ring.classList.add('is-snapped');
      });
      el.addEventListener('mouseleave', () => {
        snapTarget = null;
        snapRect = null;
        target = { ...DEFAULT };
        ring.classList.remove('is-snapped');
      });
    }

    function loop() {
      let tx, ty;
      if (snapTarget) {
        snapRect = snapTarget.getBoundingClientRect();
        const cx = snapRect.left + snapRect.width / 2;
        const cy = snapRect.top  + snapRect.height / 2;
        tx = lerp(cx, mx, 0.18);
        ty = lerp(cy, my, 0.18);
      } else {
        tx = mx; ty = my;
      }
      rx = lerp(rx, tx, 0.22);
      ry = lerp(ry, ty, 0.22);
      cur.w  = lerp(cur.w,  target.w,  0.2);
      cur.h  = lerp(cur.h,  target.h,  0.2);
      cur.br = lerp(cur.br, target.br, 0.2);
      ring.style.width  = cur.w  + 'px';
      ring.style.height = cur.h  + 'px';
      ring.style.borderRadius = cur.br + 'px';
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    }

    return { init };
  })();

  // ─── Magnetic buttons (cards + buttons drift toward cursor) ────────────
  const MagButtons = (() => {
    function init() {
      if (isCoarse || reduced) return;
      const els = $$('.btn[data-magnetic], .card[data-magnetic], .secret[data-magnetic], .sidenav__dot[data-magnetic]');
      els.forEach(el => {
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) * 0.2;
          const dy = (e.clientY - (r.top + r.height / 2)) * 0.2;
          el.style.transform = `translate(${dx}px, ${dy}px)`;
        });
        el.addEventListener('mouseleave', () => { el.style.transform = ''; });
      });
    }
    return { init };
  })();

  // ─── Word reveal on scroll ─────────────────────────────────────────────
  const Reveal = (() => {
    function init() {
      $$('.js-reveal-words').forEach(el => {
        const text = el.innerHTML;
        const wrapped = text.replace(/(\S+)/g, '<span class="w">$1</span>');
        el.innerHTML = wrapped;
      });

      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const words = $$('.w', e.target);
            words.forEach((w, i) => {
              setTimeout(() => w.style.opacity = '1', i * 35);
            });
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.3 });

      $$('.js-reveal-words').forEach(el => io.observe(el));
    }
    return { init };
  })();

  // ─── Side nav active section ───────────────────────────────────────────
  const SideNav = (() => {
    function init() {
      const dots = $$('.sidenav__dot');
      const map = new Map();
      dots.forEach(d => {
        const id = d.getAttribute('href').replace('#', '');
        map.set(id, d);
      });

      const io = new IntersectionObserver((entries) => {
        let best = null, bestRatio = 0;
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            best = e.target;
            bestRatio = e.intersectionRatio;
          }
        }
        if (best) {
          dots.forEach(d => d.classList.remove('is-active'));
          const dot = map.get(best.id);
          if (dot) dot.classList.add('is-active');
        }
      }, { threshold: [0.3, 0.6] });

      map.forEach((_, id) => {
        const sec = document.getElementById(id);
        if (sec) io.observe(sec);
      });
    }
    return { init };
  })();

  // ─── 3 · Card flip ─────────────────────────────────────────────────────
  const Flip = (() => {
    function init() {
      $$('[data-flip]').forEach(card => {
        card.addEventListener('click', () => {
          card.classList.toggle('is-flipped');
        });
      });
    }
    return { init };
  })();

  // ─── 4 · Gramotnosť — scrambled text ───────────────────────────────────
  const Cipher = (() => {
    const SCRAMBLE_CHARS = 'ΞΨΦΠΣΘΩΛΔΓ◇○●◆▪▫⌖⌘∾∞◊◌◍◎';
    let stage = null;
    let nodes = [];
    let reveals = 0;
    let MAX_REVEALS = 3;

    function init() {
      stage = $('#cipherStage');
      if (!stage) return;

      const paras = $$('[data-cipher]', stage);
      paras.forEach(p => {
        const text = p.dataset.cipher;
        p.innerHTML = '';
        const charSpans = [];
        for (const ch of text) {
          const span = document.createElement('span');
          span.className = 'c';
          if (ch === ' ') {
            span.textContent = ' ';
            span.classList.remove('c');
          } else {
            span.dataset.real = ch;
            span.textContent = randChar();
            span.classList.add('is-scrambled');
            charSpans.push(span);
          }
          p.appendChild(span);
        }
        nodes.push(charSpans);
      });

      // animate scramble on idle
      let raf = 0;
      function animate() {
        nodes.forEach(arr => {
          for (const s of arr) {
            if (s.classList.contains('is-scrambled') && Math.random() < 0.06) {
              s.textContent = randChar();
            }
          }
        });
        raf = requestAnimationFrame(animate);
      }
      animate();

      $('#cipherLearn').addEventListener('click', revealStep);
      $('#cipherReset').addEventListener('click', resetCipher);
      updateProgress();
    }

    function randChar() {
      return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }

    function revealStep() {
      reveals = Math.min(reveals + 1, MAX_REVEALS);
      const ratio = reveals / MAX_REVEALS;
      nodes.forEach(arr => {
        const target = Math.floor(arr.length * ratio);
        let revealed = 0;
        for (const s of arr) {
          if (revealed < target && s.classList.contains('is-scrambled')) {
            setTimeout(() => {
              s.textContent = s.dataset.real;
              s.classList.remove('is-scrambled');
            }, revealed * 20);
            revealed++;
          }
        }
      });
      updateProgress();
    }

    function resetCipher() {
      reveals = 0;
      nodes.forEach(arr => {
        arr.forEach(s => {
          s.classList.add('is-scrambled');
          s.textContent = randChar();
        });
      });
      updateProgress();
    }

    function updateProgress() {
      const pct = Math.round((reveals / MAX_REVEALS) * 100);
      const el = $('#cipherProgress');
      if (el) el.textContent = pct;
    }

    return { init };
  })();

  // ─── 5 · Hranice — secret cards ────────────────────────────────────────
  const Secrets = (() => {
    function init() {
      const secrets = $$('[data-secret]');
      const after = $('#hraniceAfter');
      let openedCount = 0;
      const total = secrets.length;

      secrets.forEach(s => {
        s.addEventListener('click', () => {
          if (s.classList.contains('is-open')) {
            // second click → evaporate
            s.classList.add('is-gone');
            openedCount++;
            if (openedCount === total && after) {
              setTimeout(() => {
                after.innerHTML = '„Sú to deti, ktorým boli dané odpovede na otázky, na ktoré sa nikdy nepýtali.“';
              }, 500);
            }
            return;
          }
          s.classList.add('is-open');
        });
      });
    }
    return { init };
  })();

  // ─── 6 · Reflektor — flashlight cursor ─────────────────────────────────
  const Reflektor = (() => {
    function init() {
      const stage = $('#reflektorStage');
      const beam  = $('#reflektorBeam');
      const content = stage?.querySelector('.reflektor__content');
      if (!stage || !beam || !content) return;

      // default position off-canvas
      let bx = -200, by = -200;
      let tx = -200, ty = -200;

      stage.addEventListener('mousemove', (e) => {
        const r = stage.getBoundingClientRect();
        tx = e.clientX - r.left;
        ty = e.clientY - r.top;
      });
      stage.addEventListener('mouseleave', () => { tx = -400; ty = -400; });
      stage.addEventListener('mouseenter', () => {
        if (tx < 0) { tx = 100; ty = 100; }
      });

      function loop() {
        bx = lerp(bx, tx, 0.22);
        by = lerp(by, ty, 0.22);
        beam.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -50%)`;
        content.style.setProperty('--bx', bx + 'px');
        content.style.setProperty('--by', by + 'px');
        requestAnimationFrame(loop);
      }
      loop();

      // on touch, just slowly drift the beam
      if (isCoarse) {
        let t = 0;
        setInterval(() => {
          t += 0.02;
          const r = stage.getBoundingClientRect();
          tx = r.width  / 2 + Math.cos(t) * (r.width  / 3);
          ty = r.height / 2 + Math.sin(t * 1.3) * (r.height / 3);
        }, 50);
      }
    }
    return { init };
  })();

  // ─── 7 · Bourdieu funnel with text labels ──────────────────────────────
  const Funnel = (() => {
    // 30 real topics divided by type
    const TOPICS = [
      // controversy (filtered at neck 1)
      { txt: 'imigrácia',           type: 'controversy' },
      { txt: 'vakcíny',             type: 'controversy' },
      { txt: 'LGBT práva',          type: 'controversy' },
      { txt: 'rasizmus',            type: 'controversy' },
      { txt: 'náboženské konflikty',type: 'controversy' },
      { txt: 'feminizmus',          type: 'controversy' },
      { txt: 'eutanázia',           type: 'controversy' },
      { txt: 'potraty',             type: 'controversy' },
      // anti-establishment (filtered at neck 2)
      { txt: 'korupcia',            type: 'interest' },
      { txt: 'majetkové priznania', type: 'interest' },
      { txt: 'oligarchovia',        type: 'interest' },
      { txt: 'daňové úniky',        type: 'interest' },
      { txt: 'lobing v parlamente', type: 'interest' },
      { txt: 'monopol médií',       type: 'interest' },
      // omnibus (pass through)
      { txt: 'počasie',             type: 'pass' },
      { txt: 'futbal',              type: 'pass' },
      { txt: 'olympiáda',           type: 'pass' },
      { txt: 'celebrity',           type: 'pass' },
      { txt: 'filmové premiéry',    type: 'pass' },
      { txt: 'kuchárske trendy',    type: 'pass' },
      { txt: 'turistika',           type: 'pass' },
      { txt: 'cestovanie',          type: 'pass' },
      // mixed
      { txt: 'klimatická zmena',    type: 'controversy' },
      { txt: 'rómska otázka',       type: 'controversy' },
      { txt: 'vojenský rozpočet',   type: 'interest' },
      { txt: 'AI a budúcnosť práce',type: 'pass' },
      { txt: 'kryptomeny',          type: 'pass' },
      { txt: 'olympijské medaily',  type: 'pass' },
      { txt: 'životné prostredie',  type: 'controversy' },
      { txt: 'kvalita školstva',    type: 'interest' },
    ];

    let viz, pool, output;
    let placed = [];
    let running = false;

    function init() {
      viz = $('#lievikViz');
      pool = $('#lievikPool');
      output = $('#lievikOutput');
      if (!viz) return;

      $('#lievikStart')?.addEventListener('click', start);
      $('#lievikReset')?.addEventListener('click', reset);

      // initial render — distribute topics in pool
      renderPool();

      // observer to auto-start when visible
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !running && placed.length > 0 && placed[0].state === 'pool') {
            setTimeout(start, 600);
          }
        }
      }, { threshold: 0.3 });
      io.observe(viz);
    }

    function renderPool() {
      pool.innerHTML = '';
      output.innerHTML = '';
      placed = [];

      const cols = 6;
      const items = TOPICS;
      items.forEach((t, i) => {
        const el = document.createElement('div');
        el.className = 'topic t-' + t.type;
        el.textContent = t.txt;
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cellX = (100 / cols) * col + (100 / cols) / 2;
        const cellY = row * 28 + 18;
        el.style.left = `calc(${cellX}% - 0px)`;
        el.style.top = cellY + 'px';
        el.style.transform = 'translate(-50%, 0)';
        pool.appendChild(el);
        placed.push({ el, type: t.type, txt: t.txt, state: 'pool' });
      });
    }

    function start() {
      if (running) return;
      running = true;

      const vizRect = viz.getBoundingClientRect();
      const cx = vizRect.width / 2;
      const neck1Y = vizRect.height * 0.36;
      const neck2Y = vizRect.height * 0.74;
      const outY   = vizRect.height * 0.88;

      placed.forEach((p, i) => {
        const delay = i * 90;
        setTimeout(() => animate(p, cx, neck1Y, neck2Y, outY, vizRect), delay);
      });

      setTimeout(() => { running = false; }, placed.length * 90 + 3500);
    }

    function animate(p, cx, neck1Y, neck2Y, outY, vizRect) {
      const el = p.el;
      // step 1 — gather toward neck 1 (drift to center horizontally)
      el.style.transition = 'transform 1.1s cubic-bezier(.22,1,.36,1), opacity .8s, color .4s';
      const startLeft = el.offsetLeft;
      const dx1 = cx - startLeft - (el.offsetWidth / 2 + parseInt(el.style.left)) * 0;
      // simpler: move to center using transform; reposition via transform delta
      const startRectLeft = el.getBoundingClientRect().left - vizRect.left;
      const deltaX = cx - startRectLeft - el.offsetWidth / 2;
      const deltaY = neck1Y - parseFloat(el.style.top || 0) - 10;
      el.style.transform = `translate(calc(-50% + ${deltaX}px), ${deltaY}px)`;
      p.state = 'descending';

      // decide at neck 1
      setTimeout(() => {
        if (p.type === 'controversy') {
          // OUT at neck 1
          el.classList.add('is-out');
          const side = Math.random() < 0.5 ? -1 : 1;
          const offsetX = side * (vizRect.width * 0.35 + Math.random() * 40);
          const offsetY = neck1Y + Math.random() * 30;
          el.style.transform = `translate(calc(-50% + ${deltaX + offsetX}px), ${offsetY}px)`;
          p.state = 'out1';
          return;
        }
        // continue to neck 2
        const deltaY2 = neck2Y - parseFloat(el.style.top || 0) - 10;
        el.style.transform = `translate(calc(-50% + ${deltaX}px), ${deltaY2}px)`;
        p.state = 'between';
      }, 1100);

      // decide at neck 2
      setTimeout(() => {
        if (p.state === 'out1') return;
        if (p.type === 'interest') {
          el.classList.add('is-out');
          const side = Math.random() < 0.5 ? -1 : 1;
          const offsetX = side * (vizRect.width * 0.32 + Math.random() * 40);
          const offsetY = neck2Y + Math.random() * 28;
          el.style.transform = `translate(calc(-50% + ${deltaX + offsetX}px), ${offsetY}px)`;
          p.state = 'out2';
          return;
        }
        // pass — descend to output
        const deltaY3 = outY - parseFloat(el.style.top || 0) - 6;
        el.classList.add('is-pass');
        el.style.transform = `translate(calc(-50% + ${deltaX}px), ${deltaY3}px)`;
        p.state = 'pass';
      }, 2300);
    }

    function reset() {
      running = false;
      renderPool();
    }

    return { init };
  })();

  // ─── 8 · Time slider for aspekty ───────────────────────────────────────
  const TimeSlider = (() => {
    function init() {
      const slider = $('#timeSlider');
      const val = $('#timeValue');
      const note = $('#timeNote');
      const paras = $$('#topicContent p');
      if (!slider) return;

      const apply = (v) => {
        val.textContent = v;
        // 60 min → all 5 visible, 3 min → only 1 (title only)
        const keep = Math.max(1, Math.round(((v - 3) / (60 - 3)) * paras.length));
        paras.forEach((p, i) => {
          p.classList.toggle('is-cut', i >= keep);
        });
        // note text
        if (v >= 50)      note.textContent = 'Plný kontext, plná hĺbka.';
        else if (v >= 35) note.textContent = 'Pohodlne, ale ide o jednu z viacerých dimenzií.';
        else if (v >= 20) note.textContent = 'Kompromis. Dôsledky musíme skrátiť.';
        else if (v >= 10) note.textContent = 'Z fenoménu zostávajú len fakty. Dekontextualizácia.';
        else              note.textContent = 'Len nadpis. „Encyklopedická vedomosť“ bez sveta.';
      };

      slider.addEventListener('input', () => apply(slider.value));
      apply(slider.value);
    }
    return { init };
  })();

  // ─── Footer countdown (easter egg) ─────────────────────────────────────
  const FootCountdown = (() => {
    const target = new Date('2026-05-23T23:59:59');

    function tick() {
      const el = $('#footEgg');
      if (!el) return;
      const now = new Date();
      let diff = target - now;
      if (diff < 0) {
        el.textContent = 'hodnotenie prebehlo';
        return;
      }
      const sec  = Math.floor(diff / 1000);
      const days = Math.floor(sec / 86400);
      const hrs  = Math.floor((sec % 86400) / 3600);
      const mins = Math.floor((sec % 3600) / 60);
      el.textContent = `${days}d ${String(hrs).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m`;
    }
    function init() {
      tick();
      setInterval(tick, 30 * 1000);
    }
    return { init };
  })();

  // ─── Anchor smooth scroll with offset ──────────────────────────────────
  const Anchors = (() => {
    function init() {
      $$('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
          const id = a.getAttribute('href').slice(1);
          const t = document.getElementById(id);
          if (!t) return;
          e.preventDefault();
          const rect = t.getBoundingClientRect();
          const offset = window.scrollY + rect.top - 60;
          window.scrollTo({ top: offset, behavior: reduced ? 'auto' : 'smooth' });
        });
      });
    }
    return { init };
  })();

  // ─── Init ──────────────────────────────────────────────────────────────
  function start() {
    Cursor.init();
    MagButtons.init();
    Reveal.init();
    SideNav.init();
    Flip.init();
    Cipher.init();
    Secrets.init();
    Reflektor.init();
    Funnel.init();
    TimeSlider.init();
    FootCountdown.init();
    Anchors.init();
    Boot.run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
