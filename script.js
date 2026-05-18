(function () {
  'use strict';

  // shorthand selectors. classic pattern.
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
  const rand  = (mn, mx) => mn + Math.random() * (mx - mn);

  const isCoarse = window.matchMedia('(hover: none)').matches;
  const reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // ─── Color utils ─────────────────────────────────────────────────────
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = h.length === 3
      ? h.split('').map(c => parseInt(c + c, 16))
      : [parseInt(h.slice(0,2), 16), parseInt(h.slice(2,4), 16), parseInt(h.slice(4,6), 16)];
    return { r: v[0], g: v[1], b: v[2] };
  }
  function mixRgb(a, b, t) {
    return {
      r: Math.round(lerp(a.r, b.r, t)),
      g: Math.round(lerp(a.g, b.g, t)),
      b: Math.round(lerp(a.b, b.b, t)),
    };
  }
  const rgbStr = (c) => `rgb(${c.r}, ${c.g}, ${c.b})`;

  // ─── Split text — wraps WORDS (inline-block nowrap) then chars
  // (so the browser can't break mid-word; chars still animate individually)
  function splitText(root) {
    let ii = 0;
    function walk(parent) {
      for (const child of [...parent.childNodes]) {
        if (child.nodeType === 3 /* TEXT_NODE */) {
          const text = child.textContent;
          if (!text) continue;
          const tokens = text.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          for (const token of tokens) {
            if (!token) continue;
            if (/^\s+$/.test(token)) {
              frag.appendChild(document.createTextNode(token));
            } else {
              const word = document.createElement('span');
              word.className = 'word';
              for (const ch of token) {
                const s = document.createElement('span');
                s.className = 'ch';
                s.style.setProperty('--i', ii++);
                s.textContent = ch;
                word.appendChild(s);
              }
              frag.appendChild(word);
            }
          }
          parent.insertBefore(frag, child);
          parent.removeChild(child);
        } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
          if (child.tagName === 'BR') continue;
          walk(child);
        }
      }
    }
    walk(root);
  }

  // ─── Boot loader ─────────────────────────────────────────────────────
  const Boot = (() => {
    const boot   = $('#boot');
    const fill   = $('#bootFill');
    const pctEl  = $('#bootPct');
    const status = $('#bootStatus');

    const steps = [
      { weight: 12, label: 'načítavam typografiu',     run: combine(loadFonts, wait(260)) },
      { weight: 10, label: 'pripravujem farby sekcií', run: wait(240) },
      { weight: 14, label: 'kompilujem SVG filtre',    run: warmupFilters },
      { weight: 12, label: 'rozpoznávacia schopnosť',  run: wait(420) },
      { weight: 16, label: 'osvetľujem reflektor',     run: wait(500) },
      { weight: 14, label: 'preosievam lievikom',      run: wait(400) },
      { weight: 12, label: 'magnetizujem prvky',       run: wait(340) },
      { weight: 10, label: 'finalizujem',              run: wait(260) },
    ];
    const MIN_DURATION = 2800;

    function combine(...fns) { return async () => { for (const f of fns) await f(); }; }
    function wait(ms) { return () => new Promise(r => setTimeout(r, ms + rand(-30, 80))); }
    function setPct(p) {
      const v = clamp(p, 0, 100);
      fill.style.width = v.toFixed(1) + '%';
      pctEl.textContent = Math.round(v);
    }
    function setStatus(t) { status.textContent = t; }

    async function loadFonts() {
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    }
    async function warmupFilters() {
      const p = document.createElement('div');
      p.style.cssText = 'position:fixed;top:-9999px;width:200px;height:200px;background:#fff;filter:url(#glassRefract);';
      document.body.appendChild(p);
      await new Promise(r => setTimeout(r, 120));
      p.remove();
    }
    function ticker(from, to, dur) {
      const start = performance.now();
      const id = { raf: 0, stop: false };
      const range = to - from;
      const loop = (now) => {
        if (id.stop) return;
        const t = 1 - Math.pow(2, -(now - start) / dur);
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
      await new Promise(r => setTimeout(r, 420));
      boot.classList.add('is-done');
      document.dispatchEvent(new CustomEvent('boot:done'));
    }
    return { run };
  })();

  // ─── Smooth section bg + glow interpolation ──────────────────────────
  const SectionFade = (() => {
    let sections = [];
    let pageCounterEm, pageCounterLabel, counterEl;
    const labelMap = {
      hero: 'Úvod', princip: 'Princíp', filtre: 'Filtre',
      gramotnost: 'Gramotnosť', hranice: 'Hranice', reflektor: 'Reflektor',
      lievik: 'Lievik', aspekty: 'Aspekty', zaver: 'Záver',
      biblio: 'Literatúra', foot: 'Záver',
    };
    let lastDomId = null;
    let ticking = false;
    let themeMeta = null;
    let lastBgString = '';

    function init() {
      const els = $$('.section');
      sections = els.map(el => ({
        el, id: el.id,
        bg: hexToRgb(el.dataset.bg || '#0b1d4a'),
        glow: hexToRgb(el.dataset.glow || '#4a8fd9'),
      }));
      pageCounterEm    = $('#pageNum');
      pageCounterLabel = $('#pageLabel');
      counterEl        = $('.counter');
      themeMeta = document.querySelector('meta[name="theme-color"]');

      measure();
      // remeasure when fonts/images change layout
      window.addEventListener('load', measure);
      window.addEventListener('resize', () => { measure(); update(); });
      window.addEventListener('scroll', onScroll, { passive: true });
      update();
    }

    function measure() {
      // cache offsetTop + height once. cheaper than getBoundingClientRect on every frame.
      for (const s of sections) {
        s.top    = s.el.offsetTop;
        s.height = s.el.offsetHeight;
        s.center = s.top + s.height / 2;
      }
      sections.sort((a, b) => a.top - b.top);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }

    function update() {
      const vp = window.scrollY + window.innerHeight / 2;

      let prev = sections[0];
      let next = sections[sections.length - 1];
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].center <= vp) prev = sections[i];
        else { next = sections[i]; break; }
      }
      if (prev === next) next = prev;

      let t = 0;
      if (next.center !== prev.center) {
        t = clamp((vp - prev.center) / (next.center - prev.center), 0, 1);
      }
      const eased = easeInOutCubic(t);

      const bg   = mixRgb(prev.bg,   next.bg,   eased);
      const glow = mixRgb(prev.glow, next.glow, eased);

      document.body.style.setProperty('--bg',   rgbStr(bg));
      document.body.style.setProperty('--glow', rgbStr(glow));

      const bgStr = rgbStr(bg);
      if (themeMeta && bgStr !== lastBgString) {
        lastBgString = bgStr;
        themeMeta.setAttribute('content', bgStr);
      }

      const dom = (t < 0.5) ? prev : next;
      if (dom.id !== lastDomId) {
        lastDomId = dom.id;
        document.body.dataset.section = dom.id;

        const idx = sections.findIndex(s => s.id === dom.id);
        const num = String(Math.min(idx + 1, 9)).padStart(2, '0');
        const label = labelMap[dom.id] || '';
        if (pageCounterEm && pageCounterEm.textContent !== num) {
          counterEl.classList.add('is-switching');
          setTimeout(() => {
            pageCounterEm.textContent = num;
            if (pageCounterLabel) pageCounterLabel.textContent = label;
            counterEl.classList.remove('is-switching');
          }, 180);
        } else if (pageCounterLabel) {
          pageCounterLabel.textContent = label;
        }
      }
    }

    return { init, measure };
  })();

  // ─── Glow blob ───────────────────────────────────────────────────────
  const Glow = (() => {
    function init() {
      const a = $('.glow__a');
      const b = $('.glow__b');
      if (!a || !b) return;
      let mx = innerWidth / 2, my = innerHeight / 2;
      let ax = mx, ay = my;
      let bx = mx + 200, by = my - 100;
      let t = 0;
      let dirty = true;

      window.addEventListener('mousemove', (e) => {
        mx = e.clientX; my = e.clientY;
        dirty = true;
      }, { passive: true });

      function loop() {
        t += 0.005;
        const targetAX = mx + Math.cos(t) * 40;
        const targetAY = my + Math.sin(t * 1.3) * 40;
        ax = lerp(ax, targetAX, 0.04);
        ay = lerp(ay, targetAY, 0.04);
        a.style.transform = `translate(${ax - innerWidth / 2}px, ${ay - innerHeight / 2}px)`;
        bx = lerp(bx, mx + Math.cos(t * 0.7) * 160, 0.025);
        by = lerp(by, my + Math.sin(t * 0.9) * 140, 0.025);
        b.style.transform = `translate(${bx - innerWidth * 0.7}px, ${by - innerHeight * 0.3}px)`;
        requestAnimationFrame(loop);
      }
      loop();
    }
    return { init };
  })();

  // ─── Magnetic cursor ─────────────────────────────────────────────────
  const Cursor = (() => {
    if (isCoarse) return { init: () => {} };
    const ring = $('#cursorRing');
    const dot  = $('#cursorDot');
    let mx = innerWidth / 2, my = innerHeight / 2;
    let rx = mx, ry = my;
    let snapTarget = null;
    const DEFAULT = { w: 32, h: 32, br: 999 };
    let cur = { ...DEFAULT };
    let target = { ...DEFAULT };

    function init() {
      window.addEventListener('mousemove', (e) => {
        mx = e.clientX; my = e.clientY;
        if (!document.body.classList.contains('has-magnetic-cursor')) {
          document.body.classList.add('has-magnetic-cursor');
        }
        // dot moves with mouse, no lerp — instant feel
        dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      }, { passive: true });

      window.addEventListener('mouseleave', () => document.body.classList.remove('has-magnetic-cursor'));
      window.addEventListener('mouseenter', () => document.body.classList.add('has-magnetic-cursor'));

      $$('[data-magnetic]').forEach(setup);
      loop();
    }

    function setup(el) {
      // cache border radius once per element (was computing every hover before)
      let cachedBr = null;
      el.addEventListener('mouseenter', () => {
        snapTarget = el;
        const r = el.getBoundingClientRect();
        if (cachedBr === null) {
          const cs = getComputedStyle(el);
          cachedBr = parseFloat(cs.borderTopLeftRadius) || 12;
        }
        target = { w: r.width + 12, h: r.height + 12, br: cachedBr + 6 };
        ring.classList.add('is-snapped');
      });
      el.addEventListener('mouseleave', () => {
        snapTarget = null;
        target = { ...DEFAULT };
        ring.classList.remove('is-snapped');
      });
    }
    function loop() {
      let tx, ty;
      if (snapTarget) {
        const r = snapTarget.getBoundingClientRect();
        tx = lerp(r.left + r.width / 2, mx, 0.18);
        ty = lerp(r.top + r.height / 2, my, 0.18);
      } else { tx = mx; ty = my; }
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

  // ─── Magnetic buttons ────────────────────────────────────────────────
  const MagButtons = (() => {
    function init() {
      if (isCoarse || reduced) return;
      const els = $$('.btn-line[data-magnetic], .btn-pill[data-magnetic], .ftile[data-magnetic], .secret[data-magnetic]');
      els.forEach(el => {
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) * 0.12;
          const dy = (e.clientY - (r.top + r.height / 2)) * 0.12;
          el.style.transform = `translate(${dx}px, ${dy}px)`;
        });
        el.addEventListener('mouseleave', () => { el.style.transform = ''; });
      });
    }
    return { init };
  })();

  // ─── Word + generic reveal on scroll ─────────────────────────────────
  const Reveal = (() => {
    function init() {
      // word-level reveal (for paragraphs)
      $$('.js-reveal-words').forEach(el => {
        const html = el.innerHTML;
        // wraps non-tag, non-whitespace tokens. preserves inline tags.
        const wrapped = html.replace(/(<[^>]+>|[^\s<]+)/g, (m) => {
          if (m.startsWith('<')) return m;
          return `<span class="w">${m}</span>`;
        });
        el.innerHTML = wrapped;
      });

      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            if (e.target.classList.contains('js-reveal-words')) {
              const ws = $$('.w', e.target);
              ws.forEach((w, i) => setTimeout(() => w.style.opacity = '1', i * 30));
              e.target.classList.add('is-in');
            } else {
              e.target.classList.add('is-in');
            }
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.2 });

      $$('.js-reveal-words, .js-reveal').forEach(el => io.observe(el));

      // section in-view marker — used by fallback animations
      const ioSec = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) e.target.classList.add('is-in-view');
        });
      }, { threshold: 0.15 });
      $$('.section').forEach(s => ioSec.observe(s));
    }
    return { init };
  })();

  // ─── Split titles ────────────────────────────────────────────────────
  const Split = (() => {
    function init() {
      $$('[data-split]').forEach(el => splitText(el));
    }
    return { init };
  })();

  // ─── Menu (View Transitions API when available) ──────────────────────
  const Menu = (() => {
    function init() {
      const menu = $('#menu');
      const btn = $('#menuBtn');
      const close = $('#menuClose');
      const links = $$('#menu a');

      const toggle = (open) => {
        if (document.startViewTransition && !reduced) {
          document.startViewTransition(() => {
            menu.classList.toggle('is-open', open);
          });
        } else {
          menu.classList.toggle('is-open', open);
        }
      };

      btn.addEventListener('click', () => toggle(true));
      close.addEventListener('click', () => toggle(false));
      links.forEach(a => a.addEventListener('click', () => {
        setTimeout(() => toggle(false), 220);
      }));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggle(false);
      });
    }
    return { init };
  })();

  // ─── Filter flip ─────────────────────────────────────────────────────
  const Flip = (() => {
    function init() {
      $$('[data-flip]').forEach(el => {
        el.addEventListener('click', () => el.classList.toggle('is-flipped'));
      });
    }
    return { init };
  })();

  // ─── Cipher — throttled shuffle, pauses off-screen, stops when revealed
  // (was running rAF every frame on ~300 chars, that was wasteful)
  const Cipher = (() => {
    const CHARS = 'ΞΨΦΠΣΘΩΛΔΓ◇○●◆▪▫⌖⌘∾∞◊◌◍◎';
    let nodes = [];
    let scrambled = new Set();
    let reveals = 0;
    const MAX = 3;
    let visible = false;
    let lastTick = 0;
    let stopped = false;

    function init() {
      const stage = $('#cipherStage');
      if (!stage) return;
      const paras = $$('[data-cipher]', stage);
      paras.forEach(p => {
        const text = p.dataset.cipher;
        p.innerHTML = '';
        const arr = [];
        // tokenize so each word is a non-breaking unit
        const tokens = text.split(/(\s+)/);
        for (const token of tokens) {
          if (!token) continue;
          if (/^\s+$/.test(token)) {
            p.appendChild(document.createTextNode(token));
          } else {
            const word = document.createElement('span');
            word.className = 'word';
            for (const ch of token) {
              const s = document.createElement('span');
              s.className = 'c is-scrambled';
              s.dataset.real = ch;
              s.textContent = randChar();
              word.appendChild(s);
              arr.push(s);
              scrambled.add(s);
            }
            p.appendChild(word);
          }
        }
        nodes.push(arr);
      });

      // pause/resume based on viewport visibility
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
      io.observe(stage);

      function animate(now) {
        if (stopped) return;
        if (visible && scrambled.size > 0 && now - lastTick > 90) {
          lastTick = now;
          // iterate Set — random sample to keep it from feeling too aggressive
          for (const s of scrambled) {
            if (Math.random() < 0.18) s.textContent = randChar();
          }
        }
        requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);

      $('#cipherLearn').addEventListener('click', step);
      $('#cipherReset').addEventListener('click', reset);
      updateProg();
    }

    function randChar() { return CHARS[Math.floor(Math.random() * CHARS.length)]; }

    function step() {
      reveals = Math.min(reveals + 1, MAX);
      const ratio = reveals / MAX;
      nodes.forEach(arr => {
        const target = Math.floor(arr.length * ratio);
        let revealed = 0;
        for (const s of arr) {
          if (revealed < target && s.classList.contains('is-scrambled')) {
            setTimeout(() => {
              s.textContent = s.dataset.real;
              s.classList.remove('is-scrambled');
              scrambled.delete(s);
            }, revealed * 18);
            revealed++;
          }
        }
      });
      updateProg();
    }

    function reset() {
      reveals = 0;
      nodes.forEach(arr => arr.forEach(s => {
        if (!s.classList.contains('is-scrambled')) {
          s.classList.add('is-scrambled');
          scrambled.add(s);
        }
        s.textContent = randChar();
      }));
      updateProg();
    }

    function updateProg() {
      const el = $('#cipherProgress');
      if (el) el.textContent = Math.round((reveals / MAX) * 100);
    }

    return { init };
  })();

  // ─── Secret cards ────────────────────────────────────────────────────
  const Secrets = (() => {
    function init() {
      const secrets = $$('[data-secret]');
      const after = $('#hraniceAfter');
      let gone = 0;
      secrets.forEach(s => {
        s.addEventListener('click', () => {
          if (s.classList.contains('is-open')) {
            s.classList.add('is-gone');
            gone++;
            if (gone === secrets.length && after) {
              setTimeout(() => {
                after.textContent = '„sú to deti, ktorým boli dané odpovede na otázky, na ktoré sa nikdy nepýtali."';
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

  // ─── Reflektor — pauses when off-screen ──────────────────────────────
  const Reflektor = (() => {
    function init() {
      const stage = $('#reflektorStage');
      const beam  = $('#reflektorBeam');
      const content = stage && stage.querySelector('.reflektor__content');
      if (!stage || !beam || !content) return;

      let bx = -300, by = -300;
      let tx = -300, ty = -300;
      let visible = false;

      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
      io.observe(stage);

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
        if (visible) {
          bx = lerp(bx, tx, 0.22);
          by = lerp(by, ty, 0.22);
          beam.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -50%)`;
          content.style.setProperty('--bx', bx + 'px');
          content.style.setProperty('--by', by + 'px');
        }
        requestAnimationFrame(loop);
      }
      loop();

      if (isCoarse) {
        let t = 0;
        setInterval(() => {
          if (!visible) return;
          t += 0.02;
          const r = stage.getBoundingClientRect();
          tx = r.width / 2 + Math.cos(t) * (r.width / 3);
          ty = r.height / 2 + Math.sin(t * 1.3) * (r.height / 3);
        }, 50);
      }
    }
    return { init };
  })();

  // ─── Bourdieu funnel ─────────────────────────────────────────────────
  // distributes passes across the output bar; spreads rejected items
  // across their side-zones so they don't overlap on top of each other.
  const Funnel = (() => {
    const TOPICS = [
      { txt: 'imigrácia',           type: 'controversy' },
      { txt: 'vakcíny',             type: 'controversy' },
      { txt: 'LGBT práva',          type: 'controversy' },
      { txt: 'rasizmus',            type: 'controversy' },
      { txt: 'náboženské konflikty',type: 'controversy' },
      { txt: 'feminizmus',          type: 'controversy' },
      { txt: 'eutanázia',           type: 'controversy' },
      { txt: 'potraty',             type: 'controversy' },
      { txt: 'korupcia',            type: 'interest' },
      { txt: 'majetkové priznania', type: 'interest' },
      { txt: 'oligarchovia',        type: 'interest' },
      { txt: 'daňové úniky',        type: 'interest' },
      { txt: 'lobing v parlamente', type: 'interest' },
      { txt: 'monopol médií',       type: 'interest' },
      { txt: 'počasie',             type: 'pass' },
      { txt: 'futbal',              type: 'pass' },
      { txt: 'olympiáda',           type: 'pass' },
      { txt: 'celebrity',           type: 'pass' },
      { txt: 'filmové premiéry',    type: 'pass' },
      { txt: 'kuchárske trendy',    type: 'pass' },
      { txt: 'turistika',           type: 'pass' },
      { txt: 'cestovanie',          type: 'pass' },
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
      $('#lievikStart') && $('#lievikStart').addEventListener('click', start);
      $('#lievikReset') && $('#lievikReset').addEventListener('click', reset);
      renderPool();
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !running && placed[0] && placed[0].state === 'pool') {
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
      TOPICS.forEach((t, i) => {
        const el = document.createElement('div');
        el.className = 'topic';
        el.textContent = t.txt;
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cellX = (100 / cols) * col + (100 / cols) / 2;
        const cellY = row * 28 + 18;
        el.style.left = cellX + '%';
        el.style.top = cellY + 'px';
        el.style.transform = 'translate(-50%, 0)';
        pool.appendChild(el);
        placed.push({ el, type: t.type, txt: t.txt, state: 'pool' });
      });
    }

    function start() {
      if (running) return;
      running = true;
      const vR = viz.getBoundingClientRect();
      const cx = vR.width / 2;
      const neck1Y = vR.height * 0.36;
      const neck2Y = vR.height * 0.74;
      const outY   = vR.height * 0.88;

      // pre-assign slot indices so items don't overlap on landing.
      // pass topics → spread along the output bar
      const passList = placed.filter(p => p.type === 'pass');
      passList.forEach((p, i) => { p.passSlot = i; p.passCount = passList.length; });

      // controversies → split left/right by index, vertical slots within each side
      const cList = placed.filter(p => p.type === 'controversy');
      const cLeft  = cList.filter((_, i) => i % 2 === 0);
      const cRight = cList.filter((_, i) => i % 2 === 1);
      cLeft .forEach((p, i) => { p.side = -1; p.sideSlot = i; p.sideCount = cLeft.length; });
      cRight.forEach((p, i) => { p.side =  1; p.sideSlot = i; p.sideCount = cRight.length; });

      // interests at neck 2 → similar split
      const iList = placed.filter(p => p.type === 'interest');
      const iLeft  = iList.filter((_, i) => i % 2 === 0);
      const iRight = iList.filter((_, i) => i % 2 === 1);
      iLeft .forEach((p, i) => { p.side = -1; p.sideSlot = i; p.sideCount = iLeft.length; });
      iRight.forEach((p, i) => { p.side =  1; p.sideSlot = i; p.sideCount = iRight.length; });

      placed.forEach((p, i) => setTimeout(() => animate(p, cx, neck1Y, neck2Y, outY, vR), i * 90));
      setTimeout(() => { running = false; }, placed.length * 90 + 3500);
    }

    function animate(p, cx, neck1Y, neck2Y, outY, vR) {
      const el = p.el;
      el.style.transition = 'transform 1.1s cubic-bezier(.22,1,.36,1), opacity .8s, color .4s, background .4s';
      const startRectLeft = el.getBoundingClientRect().left - vR.left;
      const elCenterX = startRectLeft + el.offsetWidth / 2; // current center
      const topNum = parseFloat(el.style.top || 0);

      // step 1 — converge to center, drop to neck 1 line
      const deltaToCenter = cx - elCenterX;
      el.style.transform = 'translate(calc(-50% + ' + deltaToCenter + 'px), ' + (neck1Y - topNum - 10) + 'px)';
      p.state = 'descending';

      // step 2 — decision at neck 1
      setTimeout(() => {
        if (p.type === 'controversy') {
          el.classList.add('is-out');
          // place in left/right reject zone, with vertical slot to avoid overlap
          const zoneX = p.side === -1 ? vR.width * 0.16 : vR.width * 0.84;
          const slotY = neck1Y + 14 + (p.sideSlot - (p.sideCount - 1) / 2) * 24;
          el.style.transform = 'translate(calc(-50% + ' + (zoneX - elCenterX) + 'px), ' + (slotY - topNum) + 'px)';
          p.state = 'out1';
          return;
        }
        // continue to neck 2 line, still centered
        el.style.transform = 'translate(calc(-50% + ' + deltaToCenter + 'px), ' + (neck2Y - topNum - 10) + 'px)';
        p.state = 'between';
      }, 1100);

      // step 3 — decision at neck 2
      setTimeout(() => {
        if (p.state === 'out1') return;
        if (p.type === 'interest') {
          el.classList.add('is-out');
          const zoneX = p.side === -1 ? vR.width * 0.14 : vR.width * 0.86;
          const slotY = neck2Y + 12 + (p.sideSlot - (p.sideCount - 1) / 2) * 24;
          el.style.transform = 'translate(calc(-50% + ' + (zoneX - elCenterX) + 'px), ' + (slotY - topNum) + 'px)';
          p.state = 'out2';
          return;
        }
        // pass — distribute along output bar (so they don't stack on top of each other)
        el.classList.add('is-pass');
        const spread = (vR.width * 0.7) / Math.max(p.passCount - 1, 1);
        const passX = cx + (p.passSlot - (p.passCount - 1) / 2) * spread;
        el.style.transform = 'translate(calc(-50% + ' + (passX - elCenterX) + 'px), ' + (outY - topNum - 6) + 'px)';
        p.state = 'pass';
      }, 2300);
    }

    function reset() {
      running = false;
      renderPool();
    }

    return { init };
  })();

  // ─── Time slider ─────────────────────────────────────────────────────
  const TimeSlider = (() => {
    function init() {
      const s = $('#timeSlider');
      const val = $('#timeValue');
      const note = $('#timeNote');
      const paras = $$('#topicContent p');
      if (!s) return;
      const apply = (v) => {
        val.textContent = v;
        const keep = Math.max(1, Math.round(((v - 3) / (60 - 3)) * paras.length));
        paras.forEach((p, i) => p.classList.toggle('is-cut', i >= keep));
        if (v >= 50)      note.textContent = 'plný kontext, plná hĺbka';
        else if (v >= 35) note.textContent = 'pohodlne, ale jedna z viacerých dimenzií';
        else if (v >= 20) note.textContent = 'kompromis. dôsledky musíme skrátiť';
        else if (v >= 10) note.textContent = 'z fenoménu zostávajú len fakty. dekontextualizácia';
        else              note.textContent = 'len nadpis. encyklopedická vedomosť bez sveta';
      };
      s.addEventListener('input', () => apply(s.value));
      apply(s.value);
    }
    return { init };
  })();

  // ─── Countdown ───────────────────────────────────────────────────────
  const Countdown = (() => {
    const target = new Date('2026-05-23T23:59:59');
    function tick() {
      const diff = target - new Date();
      if (diff < 0) {
        setText('topCount', 'hodnotenie prebehlo');
        setText('footCd',   'hodnotenie prebehlo');
        return;
      }
      const sec = Math.floor(diff / 1000);
      const d = Math.floor(sec / 86400);
      const h = Math.floor((sec % 86400) / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const pad = (n) => String(n).padStart(2, '0');
      setText('topCount', d + 'd ' + pad(h) + 'h ' + pad(m) + 'm');
      setText('footCd',   d + 'd ' + pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's');
    }
    function setText(id, t) {
      const el = document.getElementById(id);
      if (el) el.textContent = t;
    }
    function init() { tick(); setInterval(tick, 1000); }
    return { init };
  })();

  // ─── Anchor smooth scroll ────────────────────────────────────────────
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

  // ─── Init ────────────────────────────────────────────────────────────
  function start() {
    Split.init();
    Cursor.init();
    MagButtons.init();
    Reveal.init();
    SectionFade.init();
    Glow.init();
    Menu.init();
    Flip.init();
    Cipher.init();
    Secrets.init();
    Reflektor.init();
    Funnel.init();
    TimeSlider.init();
    Countdown.init();
    Anchors.init();
    Boot.run();

    // re-measure after boot finishes (in case fonts shifted layout)
    document.addEventListener('boot:done', () => {
      setTimeout(() => SectionFade.measure(), 300);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
