(() => {
  const C = window.BDAY;
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const params = new URLSearchParams(location.search);
  const isLocal = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const preview = params.has('preview') || localStorage.getItem('charity_preview') === '1' || isLocal;

  const birthday = new Date(`${C.birthdayISO}T00:00:00`);
  const capsuleAt = new Date(`${C.capsuleISO}T00:00:00`);
  const now = () => new Date();
  const unlocked = preview || now() >= birthday;
  const capsuleOpen = params.has('capsule') || now() >= capsuleAt;

  const stats = {
    noClicks: 0, pinAttempts: 0, captchaFails: 0, helpRequests: 0,
    declineAttempts: 0, cakeTaps: 0, flirtyPassAttempts: 0, rooms: new Set(),
    hearts: new Set(JSON.parse(localStorage.getItem('charity_hearts') || '[]')),
    started: Date.now(), yesFirst: false, nameTaps: 0, leftTab: 0,
    finished: false, sunCleared: false, capsuleCleared: false,
  };

  let current = '', pin = '', helpStep = 0, roomId = 'funny', slide = 0;
  let noFree = false, giftPhase = 0, isFlipping = false;
  let idleStage = 0, lastCandleLit = false, directorsPlayed = false, flirtyUnlocked = false;
  let funnyAutoTimer = null;
  let romanticAutoTimer = null;
  let romanticBusy = false;
  let danceStickerTimer = null;
  let planetWarping = false;
  let usFound = new Set();
  let usTarget = 0;
  let usReturnTimer = null;
  let captchaAttempt = 0;
  let captchaFailCount = 0;
  let captchaRage = false;
  let captchaCaseHits = { correct: 0, wrong: 0, all: 0, mixed: 0, missed: 0, none: 0 };
  let captchaCards = [];
  let receiptFromHub = false;
  let movieCreditsAfter = 'hub';
  let berserkerPlayed = false;
  let berserkerTimer = null;
  let lastReceiptText = '';
  const PH = 'Assets/images/_placeholder.svg';
  const ROOM_KEYS = ['funny', 'flirty', 'romantic', 'us'];
  const ROOM_MEDIA = buildRoomMedia();

  function buildRoomMedia() {
    const out = {};
    ROOM_KEYS.forEach((room) => {
      const files = Array.isArray(C.media?.[room]) ? C.media[room] : [];
      const fallback = C.copy.rooms?.[room]?.lines || [];
      const parsed = files
        .map((name, idx) => {
          const file = String(name || '').trim();
          if (!file) return null;
          const parsed = parseMediaName(file, idx + 1);
          return {
            file,
            order: parsed.order,
            caption: parsed.caption || fallback[idx] || `${room} memory ${idx + 1}`,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.order - b.order);
      out[room] = parsed;
    });
    return out;
  }

  function parseMediaName(file, fallbackOrder) {
    const base = file.replace(/\.[^/.]+$/, '');
    const match = base.match(/^(\d+)\.{2,}(.*)$/);
    const order = match ? Number(match[1]) : fallbackOrder;
    const rawCaption = match ? match[2] : base;
    const caption = rawCaption
      .replace(/\.{2,}/g, ' ')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { order, caption };
  }

  function mediaUrl(folder, file) {
    return encodeURI(`Assets/images/${folder}/${file}`);
  }

  function roomCount(room) {
    const known = ROOM_MEDIA[room];
    if (known && known.length) return known.length;
    return Number(C.slots?.[room] || 0);
  }

  function roomImage(room, idx) {
    const known = ROOM_MEDIA[room];
    if (known && known[idx]) return mediaUrl(room, known[idx].file);
    return PH;
  }

  function preloadUrl(url) {
    if (!url || url === PH) return;
    const img = new Image();
    img.src = url;
  }

  async function waitForImg(img) {
    if (!img || img.classList.contains('hidden')) return;
    if (!img.getAttribute('src')) return;
    try {
      if (img.decode) await img.decode();
      else if (!img.complete) {
        await new Promise((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        });
      }
    } catch (_) {}
  }

  async function setSlideImg(img, ph, src, phText) {
    if (src && src !== PH) {
      if (ph) ph.classList.add('hidden');
      img.classList.remove('hidden');
      if (img.getAttribute('src') !== src) img.src = src;
      await waitForImg(img);
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
      if (ph) {
        ph.classList.remove('hidden');
        if (phText) ph.textContent = phText;
      }
    }
  }

  function roomCaption(room, idx) {
    const known = ROOM_MEDIA[room];
    if (known && known[idx]?.caption) return known[idx].caption;
    const lines = C.copy.rooms?.[room]?.lines || [];
    return lines.length ? lines[idx % lines.length] : `${room} memory ${idx + 1}`;
  }

  function videoSource(kind, fallback) {
    const src = C.videos && typeof C.videos[kind] === 'string' ? C.videos[kind].trim() : '';
    return encodeURI(src || fallback);
  }

  const PHASES = {
    'scene-prestart': 'emotional', 'scene-countdown': 'emotional', 'scene-dossier': 'chaos', 'scene-legal': 'chaos',
    'scene-hey': 'playful', 'scene-boom': 'celebration', 'scene-build': 'playful',
    'scene-call': 'playful', 'scene-dance': 'playful', 'scene-love': 'flirty',
    'scene-captcha': 'chaos', 'scene-perm': 'chaos', 'scene-pin': 'chaos',
    'scene-hub': 'emotional', 'scene-room': 'playful', 'scene-us': 'emotional',
    'scene-capsule': 'emotional', 'scene-gift': 'emotional', 'scene-scan': 'romantic',
    'scene-flirty-gate': 'flirty',
    'scene-finale': 'celebration', 'scene-letter': 'emotional', 'scene-candles': 'celebration',
    'scene-receipt': 'playful', 'scene-credits': 'celebration',
    'scene-movie-credits': 'emotional', 'scene-berserker': 'celebration',
  };

  function setPhase(id) {
    const p = PHASES[id] || 'playful';
    $('device').className = $('device').className.replace(/phase-\w+/g, '').trim();
    $('device').classList.add('phase-' + p);
    const colors = {
      chaos: '#7c2a38', playful: '#b5394b', flirty: '#8f2437',
      romantic: '#de5d6f', emotional: '#5c1f2b', celebration: '#b5394b',
    };
    window.setParticleColor && window.setParticleColor(colors[p] || '#b5394b');
  }

  function mascotSay(text, face) {
    const m = $('mascot'), say = $('mascotSay'), f = $('mascotFace');
    if (!text) { m.classList.remove('show'); return; }
    say.textContent = text;
    if (face) f.textContent = face;
    m.classList.add('show');
    clearTimeout(mascotSay._t);
    mascotSay._t = setTimeout(() => m.classList.remove('show'), 3200);
  }

  function chapterTransition(key, next) {
    const ch = C.copy.chapters[key];
    if (!ch || !window.gsap) { next(); return; }
    const reel = $('filmReel');
    $('reelNum').textContent = 'CHAPTER ' + ch.num;
    $('reelTitle').textContent = ch.title;
    $('reelSub').textContent = ch.sub;
    reel.classList.remove('hidden');
    gsap.fromTo(reel, { opacity: 0 }, { opacity: 1, duration: 0.35 });
    gsap.fromTo('.reel-strip', { scaleX: 0.3 }, { scaleX: 1, duration: 0.5, ease: 'power2.out' });
    setTimeout(() => {
      gsap.to(reel, { opacity: 0, duration: 0.4, onComplete: () => {
        reel.classList.add('hidden');
        next();
      }});
    }, 1800);
  }

  function cameraFlash() {
    const f = $('flashOverlay');
    f.classList.add('on');
    vibe(15);
    setTimeout(() => f.classList.remove('on'), 120);
  }

  function showCameraUI(show) {
    const ui = $('cameraUI');
    if (show) {
      $('camDate').textContent = C.birthdayISO.split('-').reverse().join('/');
      $('camSubject').textContent = (C.her.call || C.her.name).toUpperCase();
      ui.classList.remove('hidden');
    } else ui.classList.add('hidden');
  }

  async function photoPersonality(el, idx) {
    if (!el || !window.gsap) return;
    showCameraUI(true);
    await wait(400);
    cameraFlash();
    await wait(150);
    showCameraUI(false);

    const styles = ['flash', 'polaroid', 'rotate', 'film', 'zoom', 'develop', 'tear', 'fall'];
    const style = styles[idx % styles.length];
    gsap.set(el, { clearProps: 'all' });

    if (style === 'flash') {
      el.classList.add('pic-enter-flash');
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    } else if (style === 'polaroid') {
      gsap.fromTo(el, { y: 80, opacity: 0, rotation: -8 }, { y: 0, opacity: 1, rotation: 0, duration: 0.7, ease: 'power3.out' });
    } else if (style === 'rotate') {
      gsap.fromTo(el, { rotation: -180, scale: 0.2, opacity: 0 }, { rotation: 0, scale: 1, opacity: 1, duration: 0.75, ease: 'back.out(1.4)' });
    } else if (style === 'film') {
      gsap.fromTo(el, { x: -200, opacity: 0, skewX: 12 }, { x: 0, opacity: 1, skewX: 0, duration: 0.55, ease: 'power2.out' });
    } else if (style === 'zoom') {
      gsap.fromTo(el, { scale: 0.05, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.65, ease: 'power3.out' });
    } else if (style === 'develop') {
      gsap.fromTo(el, { filter: 'brightness(0.05) sepia(0.6)' }, { filter: 'none', duration: 2.8, ease: 'power1.inOut' });
    } else if (style === 'tear') {
      gsap.fromTo(el, { clipPath: 'inset(0 100% 0 0)', opacity: 0 }, { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 0.6, ease: 'power2.out' });
    } else if (style === 'fall') {
      gsap.fromTo(el, { y: -120, opacity: 0, rotation: 6 }, { y: 0, opacity: 1, rotation: 0, duration: 0.7, ease: 'bounce.out' });
    }
  }

  function roomCompleteFx(id) {
    const fx = { funny: '★', romantic: '♥', us: '✦', flirty: '◆' };
    toast(C.copy.rooms[id].stamp, 2800);
    mascotSay(C.copy.mascot.end, '♥');
    burst({ particleCount: 72, colors: id === 'flirty' ? ['#8f2437', '#de5d6f'] : ['#6b1b2a', '#b5394b', '#de5d6f'] });
    if (id === 'funny') loveRain(8);
    if (id === 'romantic') popHearts(10);
    if (id === 'flirty') {
      $('device').classList.add('heart-race');
      setTimeout(() => $('device').classList.remove('heart-race'), 2000);
    }
    const emoji = fx[id] || '✦';
    for (let i = 0; i < 8; i++) {
      const n = document.createElement('div');
      n.className = 'tap-fx';
      n.textContent = emoji;
      n.style.left = (20 + Math.random() * 60) + '%';
      n.style.top = (30 + Math.random() * 40) + '%';
      $('fx').appendChild(n);
      setTimeout(() => n.remove(), 800);
    }
  }

  /* ── PARTICLES ─────────────────────────────────── */
  function initParticles() {
    const canvas = $('bgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, pts, color = '#f0cc7a';

    window.setParticleColor = (c) => { color = c; };

    function resize() {
      W = canvas.width = $('device').offsetWidth;
      H = canvas.height = $('device').offsetHeight;
    }
    function spawn() {
  pts = Array.from({ length: 70 }, () => {
        const isHeart = Math.random() > 0.45;
        return {
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 2.2 + 0.5,
          vx: (Math.random() - 0.5) * 0.32, vy: (Math.random() - 0.5) * 0.32 - (isHeart ? 0.18 : 0),
          o: Math.random() * 0.55 + 0.18,
          heart: isHeart,
          size: 10 + Math.random() * 10,
          hue: Math.random() * 50 + 320,
        };
      });
    }
    function loop() {
      requestAnimationFrame(loop);
      ctx.clearRect(0, 0, W, H);
      pts.forEach(p => {
        p.x = (p.x + p.vx + W) % W;
        p.y = (p.y + p.vy + H) % H;
        ctx.globalAlpha = p.o;
        if (p.heart) {
          ctx.font = `${p.size}px serif`;
          ctx.fillStyle = `hsl(${p.hue},95%,68%)`;
          ctx.fillText('♥', p.x, p.y);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, 6.28);
          ctx.fillStyle = color;
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }
    resize(); spawn(); loop();
    window.addEventListener('resize', () => { resize(); spawn(); });
  }

  /* ── HEART FORMATION CANVAS ────────────────────── */
  function animateHeart() {
    const canvas = $('heartCanvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 280, H = 200;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pts = [];
    for (let t = 0; t < Math.PI * 2; t += 0.22) {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push({ tx: W / 2 + x * 6.8, ty: H / 2 + y * 6.8 });
    }

    const particles = pts.map((p, i) => ({
      x: Math.random() * W, y: Math.random() * H,
      tx: p.tx, ty: p.ty,
      color: `hsl(${340 + (i % 5) * 8},85%,${65 + (i % 3) * 8}%)`,
      size: 8 + Math.random() * 5,
      delay: Math.random() * 0.4,
    }));

    let startTs = null;
    const dur = 2800;

    function frame(ts) {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const progress = Math.min(1, elapsed / dur);
      ctx.clearRect(0, 0, W, H);

      particles.forEach(p => {
        const t = Math.max(0, Math.min(1, (progress - p.delay) / (1 - p.delay + 0.01)));
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const cx = p.x + (p.tx - p.x) * ease;
        const cy = p.y + (p.ty - p.y) * ease;
        ctx.font = `${p.size}px serif`;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.25 + ease * 0.75;
        ctx.fillText('♥', cx - p.size / 2.5, cy + p.size / 2.5);
      });

      if (progress > 0.82) {
        const a = (progress - 0.82) / 0.18;
        ctx.globalAlpha = a;
        ctx.font = `bold ${Math.round(14 + a * 5)}px Outfit, sans-serif`;
        ctx.fillStyle = '#f0cc7a';
        ctx.textAlign = 'center';
        ctx.fillText((C.her.call || C.her.name).toUpperCase(), W / 2, H / 2 + 7);
      }
      ctx.globalAlpha = 1;
      if (progress < 1) requestAnimationFrame(frame);
    }

    if (window.gsap) gsap.to(canvas, { opacity: 1, duration: 0.4 });
    else canvas.style.opacity = 1;
    requestAnimationFrame(frame);
  }

  /* ── HELPERS ───────────────────────────────────── */
  function show(id, anim = 'fade') {
    document.querySelectorAll('.scene').forEach(s => s.classList.remove('on'));
    const el = $(id);
    el.classList.add('on');
    current = id;
    setPhase(id);
    if (roomId && id === 'scene-room') {
      $('device').classList.remove('phase-playful');
      $('device').classList.add('phase-' + (roomId === 'flirty' ? 'flirty' : roomId === 'romantic' ? 'romantic' : 'playful'));
    }
    if (window.gsap) {
      if (anim === 'up')    gsap.fromTo(el, { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
      else if (anim === 'pop')  gsap.fromTo(el, { opacity: 0, scale: 0.93 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.6)' });
      else if (anim === 'slam') gsap.fromTo(el, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' });
      else if (anim === 'left') gsap.fromTo(el, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out' });
      else gsap.fromTo(el, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.42, ease: 'power2.out' });
    }
  }

  function toast(msg, ms = 2400) {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.style.display = 'none'), ms);
  }

  function vibe(ms = 30) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }

  function burst(opts = {}) {
    if (!window.confetti) return;
    const nowMs = Date.now();
    if (nowMs - (burst._last || 0) < 180) return;
    burst._last = nowMs;
    const rect = $('device').getBoundingClientRect();
    const requested = typeof opts.particleCount === 'number' ? opts.particleCount : 70;
    const softenedCount = Math.max(10, Math.min(48, Math.round(requested * 0.34)));
    const requestedSpread = typeof opts.spread === 'number' ? opts.spread : 62;
    const softenedSpread = Math.max(24, Math.min(70, Math.round(requestedSpread * 0.8)));
    const origin = opts.origin || { x: (rect.left + rect.width / 2) / innerWidth, y: (rect.top + rect.height * 0.35) / innerHeight };
    const palette = Array.isArray(opts.colors) && opts.colors.length ? opts.colors : ['#6b1b2a', '#b5394b', '#de5d6f', '#fff6f2'];
    confetti({
      ...opts,
      particleCount: softenedCount,
      spread: softenedSpread,
      origin,
      colors: palette,
    });
    vibe(40);
  }

  function spawnHeart(x, y) {
    const n = document.createElement('div');
    n.className = 'tap-heart';
    n.textContent = ['♥', '♡', '✦', '✧'][Math.floor(Math.random() * 4)];
    n.style.left = x + 'px';
    n.style.top = y + 'px';
    n.style.fontSize = (16 + Math.random() * 14) + 'px';
    $('fx').appendChild(n);
    setTimeout(() => n.remove(), 950);
  }

  function loveRain(count = 18) {
    const layer = $('loveLayer');
    if (!layer) return;
    const glyphs = ['♥', '♡', '✦', '✧'];
    const total = Math.max(4, Math.round(count * 0.45));
    for (let i = 0; i < total; i++) {
      const h = document.createElement('span');
      h.className = 'float-heart';
      h.textContent = glyphs[i % glyphs.length];
      h.style.left = Math.random() * 92 + '%';
      h.style.bottom = '-10px';
      h.style.fontSize = (14 + Math.random() * 22) + 'px';
      h.style.animationDuration = (2.6 + Math.random() * 1.8) + 's';
      h.style.animationDelay = (Math.random() * 0.6) + 's';
      layer.appendChild(h);
      setTimeout(() => h.remove(), 5000);
    }
  }

  function popHearts(n = 10) {
    const layer = $('loveLayer');
    if (!layer) return;
    const total = Math.max(3, Math.round(n * 0.5));
    for (let i = 0; i < total; i++) {
      const h = document.createElement('span');
      h.className = 'pop-heart';
      h.textContent = ['♥', '♡', '✦'][i % 3];
      h.style.left = (20 + Math.random() * 60) + '%';
      h.style.top = (25 + Math.random() * 50) + '%';
      h.style.fontSize = (18 + Math.random() * 18) + 'px';
      h.style.animationDelay = (i * 0.05) + 's';
      layer.appendChild(h);
      setTimeout(() => h.remove(), 900);
    }
  }

  function magicTap(x, y, e) {
    if (e && e.target.closest('button,input,a,.heart-egg,.key,.map-node,.door')) return;
    const r = $('device').getBoundingClientRect();
    const lx = x - r.left, ly = y - r.top;
    const n = document.createElement('div');
    n.className = 'tap-fx';
    n.style.left = lx + 'px';
    n.style.top = ly + 'px';

    const phase = ($('device').className.match(/phase-(\w+)/) || [])[1] || 'playful';
    if (phase === 'playful' || current === 'scene-room' && roomId === 'funny') {
      n.textContent = ['★', '✦', '•'][Math.floor(Math.random() * 3)];
    } else if (phase === 'flirty' || (current === 'scene-room' && roomId === 'flirty')) {
      for (let i = 0; i < 5; i++) {
        const s = document.createElement('span');
        s.className = 'tap-spark';
        s.style.left = lx + 'px';
        s.style.top = ly + 'px';
        s.style.setProperty('--dx', (Math.random() - 0.5) * 60 + 'px');
        s.style.setProperty('--dy', (Math.random() - 0.5) * 60 + 'px');
        $('fx').appendChild(s);
        setTimeout(() => s.remove(), 650);
      }
      n.textContent = '◆';
    } else if (phase === 'celebration' || current === 'scene-finale' || current === 'scene-credits') {
      n.textContent = '✦';
      burst({ particleCount: 10, spread: 36, origin: { x: lx / r.width, y: ly / r.height }, colors: ['#b5394b', '#de5d6f', '#fff6f2'] });
    } else if (phase === 'romantic' || phase === 'emotional') {
      n.textContent = '♥';
      n.style.fontSize = '28px';
      if (window.gsap) gsap.fromTo(n, { scale: 0.5 }, { scale: 1.8, duration: 0.7, ease: 'power2.out' });
    } else {
      n.textContent = ['♥', '♡', '✦'][Math.floor(Math.random() * 3)];
    }
    $('fx').appendChild(n);
    setTimeout(() => n.remove(), 900);
  }

  $('device').addEventListener('pointerdown', (e) => {
    if (current === 'scene-countdown' || current === 'scene-prestart') return;
    magicTap(e.clientX, e.clientY, e);
  });

  if (matchMedia('(min-width:760px)').matches) {
    let trail;
    document.addEventListener('pointermove', (e) => {
      if (!trail) {
        trail = document.createElement('div');
        trail.id = 'cursorTrail';
        document.body.appendChild(trail);
      }
      trail.style.left = e.clientX + 'px';
      trail.style.top = e.clientY + 'px';
      if (Math.random() > 0.7) {
        const h = document.createElement('span');
        h.className = 'tap-spark';
        h.style.left = e.clientX + 'px';
        h.style.top = e.clientY + 'px';
        h.style.setProperty('--dx', '0px');
        h.style.setProperty('--dy', '-20px');
        h.style.background = '#b5394b';
        document.body.appendChild(h);
        setTimeout(() => h.remove(), 600);
      }
    });
  }

  async function exists(url) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = url;
    });
  }

  async function resolveImage(folder, n) {
    const raw = String(n);
    const num = Number(raw);
    const bases = [];
    if (Number.isFinite(num) && raw.trim() !== '') {
      bases.push(String(num).padStart(2, '0'));
      bases.push(String(num));
    } else {
      bases.push(raw);
    }

    for (const base of [...new Set(bases)]) {
          for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'jfif', 'JPG', 'JPEG', 'PNG', 'JFIF']) {
        const url = `Assets/images/${folder}/${base}.${ext}`;
        if (await exists(url)) return url;
      }
    }
    return PH;
  }

  function saveHearts() { localStorage.setItem('charity_hearts', JSON.stringify([...stats.hearts])); }

  function heartEggTotal() {
    return document.querySelectorAll('.heart-egg').length;
  }

  function bindHeartEggs() {
    document.querySelectorAll('.heart-egg').forEach(btn => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      const id = btn.dataset.heart;
      if (stats.hearts.has(id)) btn.classList.add('found');
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (stats.hearts.has(id)) return;
        stats.hearts.add(id); btn.classList.add('found'); saveHearts();
        const i = stats.hearts.size - 1;
        toast(C.copy.secretHearts[Math.min(i, C.copy.secretHearts.length - 1)]);
        if (stats.hearts.size >= heartEggTotal()) setTimeout(() => toast(C.copy.secretAll, 3400), 600);
      });
    });
  }

  bindHeartEggs();

  /* ── COUNTDOWN ─────────────────────────────────── */
  function tickCount() {
    const t = birthday - now();
    const today = now().toDateString() === birthday.toDateString();
    const after = now() > birthday && !today;
    const phaseEl = $('countPhase');
    if (phaseEl) {
      if (today) phaseEl.textContent = C.copy.datePhases.today;
      else if (after && !preview) phaseEl.textContent = C.copy.datePhases.after;
      else phaseEl.textContent = C.copy.datePhases.before;
    }
    if (t <= 0) return startExperience();
    const d = Math.floor(t / 86400000);
    const h = Math.floor((t % 86400000) / 3600000);
    const m = Math.floor((t % 3600000) / 60000);
    const s = Math.floor((t % 60000) / 1000);
    $('countDown').textContent = `${d}d ${h}h ${m}m ${s}s`;
  }

  let fromTaps = 0;
  $('fromTap').addEventListener('click', () => {
    fromTaps++;
    if (fromTaps >= 7) { localStorage.setItem('charity_preview', '1'); startExperience(); }
  });

  /* ── DOSSIER ───────────────────────────────────── */
  async function sceneDossier() {
    show('scene-dossier', 'fade');
    window.setParticleColor && window.setParticleColor('#7aff7a');
    const log = $('dossierLog');
    log.textContent = '';
    for (const line of C.copy.dossier.lines) {
      for (const ch of line) { log.textContent += ch; await wait(85); }
      log.textContent += '\n';
      if (line.includes('ATTITUDE')) {
        popHearts(14);
        loveRain(12);
        burst({ particleCount: 70, spread: 80, colors: ['#6b1b2a', '#b5394b', '#de5d6f'] });
        vibe([20, 40, 20]);
      }
      await wait(280);
    }
    for (let i = 0; i <= 100; i += 2) {
      $('loadBar').style.width = i + '%';
      $('loadPct').textContent = i < 14 ? C.copy.dossier.loading[0] : i < 70 ? i + '%' : i < 100 ? '69%…' : '100%';
      await wait(48);
    }
    await wait(900);
    sceneLegal();
  }

  /* ── LEGAL ─────────────────────────────────────── */
  function sceneLegal() {
    show('scene-legal', 'up');
    window.setParticleColor && window.setParticleColor('#de5d6f');
    $('cookieText').textContent = C.copy.cookie.text;
    $('cookieA').textContent = C.copy.cookie.accept;
    $('cookieB').textContent = C.copy.cookie.also;
    document.querySelector('label[for="termA"]').textContent = C.copy.terms.a;
    document.querySelector('label[for="termB"]').textContent = C.copy.terms.b;
    $('legalGo').textContent = C.copy.terms.continue;
  }

  $('cookieA').onclick = $('cookieB').onclick = () => {
    $('cookieBanner').classList.add('hidden');
    $('legalGo').classList.remove('hidden');
    if (window.gsap) gsap.fromTo($('legalGo'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.5)' });
  };

  $('termB').addEventListener('click', () => setTimeout(() => { $('termB').checked = true; }, 80));

  $('legalGo').onclick = () => {
    if (!$('termA').checked) { toast('check the box, Star'); return; }
    $('termB').checked = true;
    sceneHey();
  };

  /* ── HEY ───────────────────────────────────────── */
  let skipHeyFlag = false;
  $('skipHey').onclick = () => { skipHeyFlag = true; sceneBoom(); };

  async function sceneHey() {
    skipHeyFlag = false;
    show('scene-hey', 'fade');
    window.setParticleColor && window.setParticleColor('#b5394b');
    $('littleCake').classList.add('hidden');

    for (const line of C.copy.hey) {
      if (skipHeyFlag) return;
      $('heyLine').textContent = '';
      if (window.gsap) gsap.fromTo($('heyLine'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 });
      for (const ch of line) {
        if (skipHeyFlag) return;
        $('heyLine').textContent += ch;
        await wait(80);
      }
      popHearts(6);
      await wait(1400);
    }
    if (skipHeyFlag) return;
    $('littleCake').classList.remove('hidden');
    loveRain(16);
    if (window.gsap) gsap.fromTo($('littleCake'), { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'elastic.out(1,.5)' });
    $('littleCake').onclick = (e) => {
      e.stopPropagation();
      stats.cakeTaps++;
      const i = Math.min(stats.cakeTaps - 1, C.copy.cakeEgg.length - 1);
      toast(C.copy.cakeEgg[i]);
      if (stats.cakeTaps >= 3) { burst({ particleCount: 60 }); loveRain(10); }
    };
    await wait(1600);
    sceneBoom();
  }

  /* ── BOOM ──────────────────────────────────────── */
  async function sceneBoom() {
    show('scene-boom', 'pop');
    window.setParticleColor && window.setParticleColor('#c43a52');
    $('boomTitle').textContent = C.copy.boomTitle;
    $('boomSub').textContent = C.copy.boomSub;
    $('freezeLine').textContent = '';
    $('boomGo').classList.add('hidden');

    if (window.gsap) {
      const tl = gsap.timeline();
      tl.fromTo($('boomTapName'), { opacity: 0, letterSpacing: '1em' }, { opacity: 1, letterSpacing: '.35em', duration: 0.9, ease: 'power3.out' });
      tl.fromTo($('boomTitle'), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.85, ease: 'elastic.out(1,.55)' }, '-=0.2');
      tl.fromTo($('boomSub'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.3');
    }

    await wait(700);
    burst({ particleCount: 180, colors: ['#6b1b2a', '#b5394b', '#de5d6f', '#fff6f2'] });
    burst({ particleCount: 90, angle: 60, origin: { x: 0.1, y: 0.6 } });
    burst({ particleCount: 90, angle: 120, origin: { x: 0.9, y: 0.6 } });
    loveRain(22);
    popHearts(16);
    vibe([30, 50, 30]);

    await wait(1100);
    animateHeart();

    await wait(3200);
    $('device').classList.add('frozen');
    $('freezeLine').textContent = C.copy.freeze[0];
    if (window.gsap) gsap.fromTo($('freezeLine'), { opacity: 0 }, { opacity: 1, duration: 0.4 });

    await wait(1600);
    $('freezeLine').textContent = C.copy.freeze[1];
    loveRain(14);
    $('device').classList.remove('frozen');

    $('boomGo').classList.remove('hidden');
    if (window.gsap) gsap.fromTo($('boomGo'), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
  }

  $('boomTapName').onclick = () => {
    stats.nameTaps++;
    if (stats.nameTaps >= 5) toast(C.copy.blooper, 3200);
    burst({ particleCount: 30, spread: 40 });
  };
  $('boomGo').onclick = () => sceneBuild();

  /* ── BUILD ─────────────────────────────────────── */
  let skipBuildFlag = false;
  $('skipBuild').onclick = () => { skipBuildFlag = true; showCall(); };

  async function sceneBuild() {
    skipBuildFlag = false;
    show('scene-build', 'fade');
    window.setParticleColor && window.setParticleColor('#b5394b');
    for (const line of C.copy.danceBuild) {
      if (skipBuildFlag) return;
      $('buildLine').textContent = '';
      if (window.gsap) gsap.fromTo($('buildLine'), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
      for (const ch of line) {
        if (skipBuildFlag) return;
        $('buildLine').textContent += ch;
        await wait(85);
      }
      popHearts(5);
      await wait(1400);
    }
    showCall();
  }

  async function showCall() {
    show('scene-call', 'slam');
    $('callName').textContent = C.copy.callName || C.him.from || (C.her.call || C.her.name);
    $('callSub').textContent = 'Incoming Call...';
    $('callRoast').classList.add('hidden');
    const callBg = $('callBg');
    const callAvatarImg = $('callAvatarImg');
    const callAvatarFallback = $('callAvatarFallback');

    let photo = PH;
    if (Array.isArray(C.media?.videocall) && C.media.videocall[0]) {
      photo = mediaUrl('videocall', C.media.videocall[0]);
    }
    const curatedSources = [
      () => roomImage('us', 0),
      () => roomImage('romantic', 0),
      () => roomImage('funny', 0),
    ];
    const callSources = [
      ['videocall', 1],
      ['videocall', 'call'],
      ['videocall', 'avatar'],
      ['videocall', 'profile'],
      ['catcha/her', 1],
      ['randoms', 1],
    ];
    if (photo === PH) {
      for (const pick of curatedSources) {
        const src = await pick();
        if (src !== PH) { photo = src; break; }
      }
    }
    if (photo === PH) {
      for (const [folder, key] of callSources) {
        const src = await resolveImage(folder, key);
        if (src !== PH) { photo = src; break; }
      }
    }
    if (photo !== PH) {
      callBg.style.backgroundImage = `url("${photo}")`;
      callAvatarImg.src = photo;
      callAvatarImg.classList.remove('hidden');
      callAvatarFallback.classList.add('hidden');
      $('scene-call').classList.add('has-photo');
    } else {
      callBg.style.backgroundImage = '';
      callAvatarImg.classList.add('hidden');
      callAvatarFallback.classList.remove('hidden');
      $('scene-call').classList.remove('has-photo');
    }

    if (window.gsap) {
      gsap.fromTo(['#callAvatarImg', '#callAvatarFallback'], { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(1.6)', delay: 0.2 });
      gsap.fromTo('.call-actions-ios', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, delay: 0.5, ease: 'back.out(1.4)' });
    }
  }

  /* ── CALL / DANCE ──────────────────────────────── */
  $('declineBtn').onclick = (e) => {
    stats.declineAttempts++;
    const msg = C.copy.callDeclineLines[Math.min(stats.declineAttempts - 1, C.copy.callDeclineLines.length - 1)];
    $('callRoast').textContent = msg;
    $('callRoast').classList.remove('hidden');
    const btn = e.currentTarget;
    if (window.gsap) {
      const nx = (Math.random() > 0.5 ? 1 : -1) * (44 + Math.random() * 48);
      const ny = -6 - Math.random() * 20;
      gsap.to(btn, { x: nx, y: ny, rotation: (Math.random() - 0.5) * 24, duration: 0.24, ease: 'power2.out' });
      gsap.to(btn, { x: 0, y: 0, rotation: 0, duration: 0.5, delay: 0.18, ease: 'elastic.out(1,.45)' });
    }
    vibe(25);
  };

  $('callCamBtn').onclick = (e) => {
    toast('video preview only. answer the call 😌');
    if (window.gsap) gsap.fromTo(e.currentTarget, { scale: 0.88 }, { scale: 1, duration: 0.45, ease: 'elastic.out(1,.5)' });
    vibe(12);
  };

  function stopDanceStickerLoop() {
    if (!danceStickerTimer) return;
    clearInterval(danceStickerTimer);
    danceStickerTimer = null;
  }

  function showDanceSticker(text) {
    const el = $('danceSticker');
    el.textContent = text;
    if (!window.gsap) return;
    gsap.killTweensOf(el);
    gsap.fromTo(el,
      { opacity: 0, y: 18, scale: 0.92, filter: 'blur(5px)' },
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.55, ease: 'power3.out' });
    gsap.to(el, { opacity: 0.22, duration: 1.2, delay: 1.45, ease: 'power2.out' });
  }

  $('acceptBtn').onclick = async () => {
    if (window.gsap) {
      await new Promise(res => {
        gsap.to('#scene-call', { scale: 1.15, opacity: 0, duration: 0.55, ease: 'power2.in', onComplete: res });
      });
      gsap.set('#scene-call', { clearProps: 'all' });
    }
    show('scene-dance', 'slam');
    const vid = $('danceVid');
    vid.src = videoSource('intro', 'Assets/videos/intro/dance.mp4');
    vid.loop = true;
    vid.playsInline = true;
    vid.onerror = () => { $('dancePh').classList.remove('hidden'); vid.classList.add('hidden'); };
    const ok = await vid.play().then(() => true).catch(() => false);
    if (!ok) { $('dancePh').classList.remove('hidden'); vid.classList.add('hidden'); }

    if (window.gsap) gsap.fromTo('#danceFrame', { scale: 0.8, opacity: 0, rotation: -5 }, { scale: 1, opacity: 1, rotation: -1.8, duration: 0.7, ease: 'elastic.out(1,.6)' });

    stopDanceStickerLoop();
    let i = 0;
    showDanceSticker(C.copy.danceStickers[0]);
    danceStickerTimer = setInterval(() => {
      i++;
      showDanceSticker(C.copy.danceStickers[i % C.copy.danceStickers.length]);
    }, 2400);

    $('danceAfter').textContent = '';
    await wait(2800);
    $('danceAfter').textContent = C.copy.danceAfter[0];
    popHearts(8);
    await wait(1800);
    $('danceAfter').textContent = C.copy.danceAfter[1];
  };

  $('danceGo').onclick = () => {
    stopDanceStickerLoop();
    try { $('danceVid').pause(); } catch (_) {}
    sceneLove();
  };

  /* ── LOVE TRAP ─────────────────────────────────── */
  function sceneLove() {
    show('scene-love', 'up');
    window.setParticleColor && window.setParticleColor('#8f2437');
    $('loveQ').textContent = C.copy.loveQ;
    $('trapMsg').textContent = 'I have one very important question.';
    noFree = false;
    loveRain(10);
    popHearts(12);

    const creature = $('noCreature');
    creature.classList.remove('running');

    if (window.gsap) {
      gsap.set(creature, { left: 'auto', top: 'auto', bottom: '28px', x: 0, scale: 1, opacity: 1 });
      gsap.set($('yesBtn'), { scale: 1, x: 0 });
      gsap.fromTo($('loveQ'), { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'elastic.out(1,.55)', delay: 0.2 });
      gsap.fromTo(creature, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.5, ease: 'back.out(1.4)' });
    }
  }

  $('noBtn').onclick = (e) => {
    e.stopPropagation();
    stats.noClicks++;
    mascotSay(C.copy.mascot.no, '◆');
    const msg = C.copy.noLines[Math.min(stats.noClicks - 1, C.copy.noLines.length - 1)];
    $('trapMsg').textContent = msg;

    const creature = $('noCreature');
    const trap = $('trap');
    const cW = creature.offsetWidth + 16;
    const cH = creature.offsetHeight + 8;
    const maxX = Math.max(10, trap.offsetWidth - cW);
    const maxY = Math.max(10, trap.offsetHeight - cH);

    const newX = 8 + Math.random() * maxX;
    const newY = 8 + Math.random() * maxY;
    const scale = Math.max(0.12, 1 - stats.noClicks * 0.1);

    creature.classList.add('running');
    creature.style.bottom = 'auto';

    if (window.gsap) {
      gsap.to(creature, {
        left: newX, top: newY, scale,
        duration: 0.55, ease: 'power3.out',
        onComplete: () => creature.classList.remove('running'),
      });
      gsap.to($('yesBtn'), { scale: 1 + stats.noClicks * 0.2, duration: 0.4, ease: 'elastic.out(1,.6)' });
    }

    vibe(20);

    if (stats.noClicks >= 9) {
      creature.classList.add('hidden');
      noFree = true;
      $('trapMsg').textContent = C.copy.universe;
      toast('the no button has left the chat 👏', 3000);
    }
  };

  $('yesBtn').onclick = () => {
    if (stats.noClicks === 0) { stats.yesFirst = true; toast(C.copy.yesInstant, 2800); }
    else toast(C.copy.muchBetter);
    mascotSay(C.copy.mascot.yes, '♥');
    $('device').classList.add('heart-race');
    setTimeout(() => $('device').classList.remove('heart-race'), 2500);
    setTimeout(() => toast('OFFICIALLY HIS PROBLEM', 2600), 400);
    loveRain(20);
    popHearts(18);
    burst({ particleCount: 90, colors: ['#b5394b', '#de5d6f', '#fff6f2'] });
    if (window.gsap) gsap.to($('yesBtn'), { scale: 1.3, opacity: 0, duration: 0.4, ease: 'power2.in', onComplete: sceneCaptcha });
    else sceneCaptcha();
  };

  /* ── CAPTCHA ───────────────────────────────────── */
  async function sceneCaptcha() {
    show('scene-captcha', 'up');
    window.setParticleColor && window.setParticleColor('#c43a52');
    $('captchaTitle').textContent = C.copy.captchaTitle || 'the most beautiful girl in the world';
    $('captchaTask').textContent = C.copy.captchaTask || 'Select the images with';
    $('captchaMsg').textContent = '';
    captchaAttempt = 0;
    captchaFailCount = 0;
    captchaRage = false;
    captchaCaseHits = { correct: 0, wrong: 0, all: 0, mixed: 0, missed: 0, none: 0 };
    $('scene-captcha').classList.remove('rage-mode');
    captchaCards = await loadCaptchaCards();
    renderCaptchaGrid(true);
  }

  async function loadCaptchaCards() {
    const herFiles = (Array.isArray(C.media?.captchaHer) ? C.media.captchaHer : []).filter(Boolean);
    const decoyFiles = (Array.isArray(C.media?.captchaDecoys) ? C.media.captchaDecoys : []).filter(Boolean);
    const who = (C.her.call || C.her.name).toLowerCase();

    const buildCard = async (folder, file, fallbackKey) => {
      if (file) return encodeURI(`Assets/images/${folder}/${file}`);
      return resolveImage(folder, fallbackKey);
    };

    const takeThree = async (folder, files, correct) => {
      const out = [];
      for (let i = 0; i < files.length && out.length < 3; i++) {
        const src = await buildCard(folder, files[i], i + 1);
        if (src === PH) continue;
        out.push({
          correct,
          src,
          ph: correct ? `${C.her.call || C.her.name} ${out.length + 1}` : `not ${who} ${out.length + 1}`,
        });
      }
      for (let i = out.length; i < 3; i++) {
        out.push({
          correct,
          src: await buildCard(folder, null, i + 1),
          ph: correct ? `${C.her.call || C.her.name} ${i + 1}` : `not ${who} ${i + 1}`,
        });
      }
      return out;
    };

    const cards = [
      ...await takeThree('catcha/her', herFiles, true),
      ...await takeThree('catcha/marsai', decoyFiles, false),
    ];
    return cards.slice(0, 6);
  }

  function shuffleCaptchaCards() {
    for (let i = captchaCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [captchaCards[i], captchaCards[j]] = [captchaCards[j], captchaCards[i]];
    }
  }

  function renderCaptchaGrid(animate) {
    const grid = $('captchaGrid');
    grid.innerHTML = '';
    shuffleCaptchaCards();
    captchaCards.slice(0, 6).forEach((card, idx) => {
      const b = document.createElement('button');
      b.className = 'tile';
      b.type = 'button';
      b.dataset.correct = card.correct ? '1' : '0';

      if (card.src === PH) {
        const ph = document.createElement('div');
        ph.className = 'ph';
        ph.textContent = card.ph;
        b.appendChild(ph);
      } else {
        const img = document.createElement('img');
        img.src = card.src;
        img.alt = card.correct ? (C.her.call || C.her.name) : 'decoy';
        b.appendChild(img);
      }

      b.onclick = () => { b.classList.toggle('on'); vibe(15); };
      grid.appendChild(b);
      if (animate && window.gsap) gsap.fromTo(b, { opacity: 0 }, { opacity: 1, duration: 0.18, delay: idx * 0.03 });
    });
  }

  $('captchaGo').onclick = () => {
    captchaAttempt++;
    const tiles = [...$('captchaGrid').children];
    const selected = tiles.filter(t => t.classList.contains('on'));
    const shouldSelect = tiles.filter(t => t.dataset.correct === '1');
    const selectedCorrect = selected.filter(t => t.dataset.correct === '1');
    const selectedWrong = selected.filter(t => t.dataset.correct !== '1');
    const exactCorrect = selectedWrong.length === 0 && selectedCorrect.length === shouldSelect.length;
    const allPicked = selected.length === tiles.length;
    const mixedPick = selectedCorrect.length > 0 && selectedWrong.length > 0;
    const missedHer = selectedWrong.length === 0 && selectedCorrect.length < shouldSelect.length;
    const nonePicked = selected.length === 0;
    const pickByAttempt = (value, attempt, fallback) => {
      if (Array.isArray(value) && value.length) return value[Math.min(Math.max(0, attempt - 1), value.length - 1)];
      if (typeof value === 'string' && value) return value;
      return fallback;
    };
    const pickCaseLine = (key, caseKey, fallback) => {
      captchaCaseHits[caseKey] = (captchaCaseHits[caseKey] || 0) + 1;
      return pickByAttempt(C.copy[key], captchaCaseHits[caseKey], fallback);
    };
    const shakeWrongTiles = () => {
      if (!window.gsap) return;
      selectedWrong.forEach((tile) => {
        gsap.fromTo(tile, { x: -6 }, { x: 0, duration: 0.3, ease: 'elastic.out(1,.4)' });
      });
    };
    const applyRageMode = () => {
      if (captchaRage) return;
      captchaRage = true;
      $('scene-captcha').classList.add('rage-mode');
      $('captchaTitle').textContent = C.copy.captchaRageTitle || C.copy.captchaTitle || $('captchaTitle').textContent;
      $('captchaTask').textContent = C.copy.captchaRageTask || C.copy.captchaTask || $('captchaTask').textContent;
      const rageIntro = pickByAttempt(C.copy.captchaRageIntro, 1, 'RAGE MODE ACTIVATED');
      $('captchaMsg').textContent = rageIntro;
      mascotSay(rageIntro, '😤');
      burst({ particleCount: 90, spread: 80, colors: ['#ff3131', '#ff8a8a', '#ffd56a'] });
      if (window.gsap) {
        gsap.fromTo('#scene-captcha', { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1,.35)' });
        gsap.fromTo('#captchaGrid .tile', { scale: 1 }, { scale: 1.05, duration: 0.08, yoyo: true, repeat: 3, stagger: 0.03 });
      }
    };
    const failCaptcha = (msg, options = {}) => {
      const { shakeWrong = false, clearWrong = false, clearAll = false, vibePattern = [20, 20] } = options;
      stats.captchaFails++;
      captchaFailCount++;
      // Rage mode rule: if she fails on trial #3 (or later), go rage.
      if (captchaAttempt >= 3) {
        if (!captchaRage) {
          applyRageMode();
        } else {
          const rageLine = pickByAttempt(C.copy.captchaRageFail, captchaFailCount - 2, msg);
          $('captchaMsg').textContent = rageLine;
          mascotSay(rageLine, '😤');
        }
      } else {
        $('captchaMsg').textContent = msg;
      }
      if (shakeWrong) shakeWrongTiles();
      if (clearWrong) setTimeout(() => selectedWrong.forEach((tile) => tile.classList.remove('on')), 240);
      if (clearAll) setTimeout(() => selected.forEach((tile) => tile.classList.remove('on')), 240);
      vibe(vibePattern);
    };

    if (exactCorrect) {
      // First perfect attempt is intentionally trolled once.
      if (captchaAttempt === 1) {
        $('captchaMsg').textContent = pickCaseLine('captchaCorrectTroll', 'correct', 'go again girl');
        selected.forEach((tile) => tile.classList.remove('on'));
        vibe([15, 30, 15]);
        return;
      }
      if (captchaRage) {
        $('captchaMsg').textContent = pickByAttempt(C.copy.captchaRageCorrect, captchaFailCount - 1, C.copy.captchaOk);
      } else {
        $('captchaMsg').textContent = pickByAttempt(C.copy.captchaCorrectPass, Math.max(1, captchaAttempt - 1), C.copy.captchaOk);
      }
      setTimeout(scenePerm, 1000);
      return;
    }

    if (nonePicked) {
      failCaptcha(pickCaseLine('captchaNone', 'none', 'pick something first'), { vibePattern: [20, 20] });
      return;
    }

    if (allPicked) {
      failCaptcha(pickCaseLine('captchaAllPics', 'all', C.copy.captchaWrong || 'too many picks'), { clearAll: true, vibePattern: [20, 20, 20] });
      return;
    }

    if (mixedPick) {
      failCaptcha(pickCaseLine('captchaMixed', 'mixed', C.copy.captchaWrong || 'wrong mix'), { shakeWrong: true, clearWrong: true, vibePattern: [20, 20, 20] });
      return;
    }

    if (missedHer) {
      failCaptcha(pickCaseLine('captchaMissedHer', 'missed', C.copy.captchaIncomplete), { vibePattern: [20, 20] });
      return;
    }

    if (selectedWrong.length > 0 || selectedCorrect.length !== shouldSelect.length) {
      failCaptcha(pickCaseLine('captchaWrongOnly', 'wrong', C.copy.captchaWrong || 'Wrong picks.'), { shakeWrong: true, clearWrong: true, vibePattern: [20, 20, 20] });
      return;
    }

    $('captchaMsg').textContent = C.copy.captchaOk;
    setTimeout(scenePerm, 800);
  };

  $('captchaRefresh').onclick = () => {
    if (current !== 'scene-captcha' || !captchaCards.length) return;
    $('captchaMsg').textContent = '';
    renderCaptchaGrid(true);
    vibe(12);
  };

  /* ── PERMISSION ────────────────────────────────── */
  function scenePerm() {
    show('scene-perm', 'up');
    $('permAsk').textContent = C.copy.locationAsk;
    $('permReason').textContent = C.copy.locationReason;
    $('permFound').textContent = '';
    if (window.gsap) gsap.fromTo('.perm', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.4)', delay: 0.2 });
  }

  function foundLocation() {
    $('permFound').textContent = C.copy.locationFound;
    if (window.gsap) gsap.fromTo($('permFound'), { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'elastic.out(1,.5)' });
    burst({ particleCount: 50, spread: 50 });
    setTimeout(scenePin, 1500);
  }
  $('permYes').onclick = foundLocation;
  $('permNo').onclick = foundLocation;

  /* ── PIN ───────────────────────────────────────── */
  async function scenePin() {
    show('scene-pin', 'pop');
    pin = ''; helpStep = 0;
    mascotSay(C.copy.mascot.pin, '🕵️');

    if (window.gsap) {
      gsap.fromTo($('pinIntro'), { opacity: 0 }, { opacity: 1, duration: 0.4 });
    }
    $('pinIntro').textContent = C.copy.pinIntro[0];
    await wait(800);
    $('pinIntro').textContent = C.copy.pinIntro[2];
    $('pinHint').textContent = C.copy.pinFakeHint;
    $('pinHelp').textContent = C.copy.pinHelp[0];

    renderDots();
    const keys = $('keys');
    keys.innerHTML = '';
    [1, 2, 3, 4, 5, 6, 7, 8, 9, '←', 0, 'ok'].forEach((k, i) => {
      const b = document.createElement('button');
      b.className = 'key';
      b.textContent = k;
      b.onclick = () => keyPress(k);
      keys.appendChild(b);
      if (window.gsap) gsap.fromTo(b, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, delay: i * 0.035, ease: 'power2.out' });
    });

    if (noFree || stats.noClicks >= 3) {
      const g = $('noGhost');
      g.style.display = 'block';
      g.style.left = '12px'; g.style.bottom = '88px';
      g.onclick = () => toast(C.copy.noGhost[0]);
    }
  }

  function renderDots() {
    [...$('pinDots').children].forEach((d, i) => {
      const wasOn = d.classList.contains('on');
      const nowOn = i < pin.length;
      d.classList.toggle('on', nowOn);
      if (!wasOn && nowOn && window.gsap) gsap.fromTo(d, { scale: 0 }, { scale: 1.22, duration: 0.25, ease: 'back.out(2)' });
    });
  }

  function keyPress(k) {
    if (k === '←') pin = pin.slice(0, -1);
    else if (k === 'ok') return checkPin();
    else if (pin.length < 4) {
      pin += String(k);
      const keys = [...$('keys').children];
      const btn = keys.find(b => b.textContent === String(k));
      if (btn) {
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 180);
      }
    }
    renderDots();
    if (pin.length === 4) setTimeout(checkPin, 120);
  }

  async function showPinGranted() {
    $('pinGrantedTxt').textContent = C.copy.pinGranted;
    $('pinOverrideTxt').textContent = '';
    $('pinOverrideTxt').style.opacity = 0;
    $('pinGranted').classList.remove('hidden');
    if (window.gsap) {
      gsap.fromTo($('pinGrantedTxt'), { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.5)' });
      await wait(900);
      $('pinOverrideTxt').textContent = C.copy.pinOverride;
      gsap.to($('pinOverrideTxt'), { opacity: 1, duration: 0.5 });
      await wait(1100);
      gsap.to($('pinGranted'), { opacity: 0, duration: 0.4 });
      await wait(450);
    } else await wait(2000);
    $('pinGranted').classList.add('hidden');
    $('pinGranted').style.opacity = '';
  }

  async function checkPin() {
    stats.pinAttempts++;
    if (pin === C.pin) {
      $('vault').classList.remove('dent');
      burst({ particleCount: 140, colors: ['#8f2437', '#b5394b', '#de5d6f'] });
      loveRain(16);
      vibe([40, 60, 40]);
      $('pinHint').textContent = C.copy.pinOk.join(' ');
      if (window.gsap) gsap.to($('vault'), { rotation: 720, scale: 0, duration: 0.8, ease: 'power2.in' });
      else await wait(800);
      await showPinGranted();
      setupHub();
      return;
    }
    pin = ''; renderDots();
    $('vault').classList.add('dent');
    vibe([30, 30, 30]);
    setTimeout(() => $('vault').classList.remove('dent'), 600);
    const i = Math.min(stats.pinAttempts - 1, C.copy.pinWrong.length - 1);
    $('pinHint').textContent = C.copy.pinWrong[i];
    if (stats.pinAttempts >= 2) {
      setTimeout(() => {
        $('pinHint').innerHTML = `${C.copy.pinReal[0]}<br><span class="gold">${C.copy.pinReal[1]}</span><br>${C.copy.pinReal[2]}`;
      }, 950);
    }
  }

  $('pinHelp').onclick = async () => {
    helpStep++;
    stats.helpRequests++;
    mascotSay(C.copy.mascot.pin, '🕵️');
    if (helpStep === 1) {
      $('pinHelp').textContent = C.copy.pinHelp[1];
      await wait(700);
      $('pinHelp').textContent = C.copy.pinHelp[2];
    } else {
      $('pinHelp').textContent = C.copy.pinHelp[3];
      $('pinHint').innerHTML = `<span class="gold">${C.copy.pinReal[1]}</span> — ${C.copy.pinReal[2]}`;
    }
  };

  /* ── HUB ───────────────────────────────────────── */
  function setupHub() {
    show('scene-hub', 'up');
    loveRain(10);
    $('hubTitle').textContent = C.copy.hubTitle;
    $('hubSub').textContent = C.copy.hubSub;
    refreshHub();
    if (window.gsap) {
      document.querySelectorAll('.map-node').forEach((node, i) => {
        gsap.fromTo(node,
          { opacity: 0, scale: 0.72, filter: 'blur(4px)' },
          {
            opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.55, delay: 0.12 + i * 0.08, ease: 'back.out(1.5)',
            onComplete: () => gsap.set(node, { clearProps: 'transform,filter,opacity' }),
          });
      });
    }
  }

  function refreshHub() {
    const n = stats.rooms.size;
    $('meter').innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const s = document.createElement('span');
      s.textContent = '✦';
      if (i < n) s.className = 'lit';
      $('meter').appendChild(s);
    }

    document.querySelector('.map-node.funny .map-tag').textContent = stats.rooms.has('funny') ? 'cleared' : 'chaos';
    document.querySelector('.map-node.romantic .map-tag').textContent = stats.rooms.has('romantic') ? 'cleared' : 'soft mode';
    document.querySelector('.map-node.us .map-tag').textContent = stats.rooms.has('us') ? 'cleared' : 'journey';

    ['funny', 'romantic', 'us', 'flirty'].forEach(r => {
      const node = document.querySelector('.map-node.' + r);
      if (node) node.classList.toggle('done', stats.rooms.has(r));
    });

    const three = ['funny', 'romantic', 'us'].every(r => stats.rooms.has(r));
    const flirtyNode = document.querySelector('.map-node.flirty');
    flirtyNode.classList.toggle('locked', !three);
    document.querySelector('.map-node.flirty .map-tag').textContent = three
      ? (flirtyUnlocked ? 'cleared' : 'together...')
      : 'locked';

    const capNode = document.querySelector('.map-node.capsule');
    capNode.classList.toggle('locked', !capsuleOpen);
    capNode.classList.toggle('done', stats.capsuleCleared && capsuleOpen);
    if (capsuleOpen) {
      document.querySelector('.map-node.capsule .map-tag').textContent = C.copy.datePhases.capsule;
    } else {
      const days = Math.max(0, Math.ceil((capsuleAt - now()) / 86400000));
      document.querySelector('.map-node.capsule .map-tag').textContent = days > 0 ? C.copy.capsuleDays(days) : C.copy.capsuleLock;
    }

    $('mapGlow').classList.toggle('lit', stats.rooms.size >= 4);
    const allFour = stats.rooms.has('flirty') && ['funny', 'romantic', 'us'].every(r => stats.rooms.has(r));
    const extrasReady = stats.sunCleared;
    $('hubComplete').classList.toggle('hidden', !allFour);
    if (allFour && extrasReady) {
      $('hubComplete').textContent = C.copy.hubComplete;
      if (!refreshHub._celebrated) {
        refreshHub._celebrated = true;
        burst({ particleCount: 40, spread: 60 });
      }
    } else if (allFour && !stats.sunCleared) {
      $('hubComplete').textContent = C.copy.hubNeedSun || C.copy.hubNeedBoth;
    }

    const sunReady = stats.rooms.has('flirty');
    const sun = $('sunPlanet');
    if (sun) {
      sun.classList.toggle('hidden', !sunReady);
      sun.classList.toggle('locked', !sunReady);
      sun.classList.toggle('done', stats.sunCleared);
    }
    if ($('mapYou')) $('mapYou').classList.toggle('hidden', sunReady);

    $('receiptDoor').textContent = C.copy.receiptDoor || 'print the receipts';
    $('giftDoor').textContent = C.copy.giftDoor || 'one last thing';
    $('receiptDoor').classList.toggle('hidden', !(allFour && extrasReady));
    $('giftDoor').classList.add('hidden');
  }

  document.querySelectorAll('.map-node').forEach(d => { d.onclick = () => openRoom(d.dataset.room); });
  $('giftDoor').onclick = () => sceneGift();
  $('receiptDoor').onclick = () => {
    receiptFromHub = true;
    sceneReceipt();
  };

  /* ── FLIRTY GATE — together / forever ──────────── */
  function sceneFlirtyGate() {
    const G = C.copy.flirtyGate;
    show('scene-flirty-gate', 'pop');
    $('togetherWord').textContent = G.prompt;
    $('flirtyGateHint').textContent = G.hint;
    $('flirtyGateGo').textContent = G.go;
    $('flirtyGateMsg').textContent = '';
    const input = $('flirtyPassInput');
    input.value = '';
    input.placeholder = G.placeholder;
    setTimeout(() => input.focus(), 400);
    if (window.gsap) gsap.fromTo($('togetherWord'), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'elastic.out(1,.55)' });
  }

  function tryFlirtyPass() {
    const G = C.copy.flirtyGate;
    const guess = ($('flirtyPassInput').value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!guess) return;
    stats.flirtyPassAttempts++;
    const ok = guess === C.flirtyPass || guess === 'together forever' || guess.replace(/ /g, '') === 'togetherforever';
    if (ok) {
      flirtyUnlocked = true;
      $('flirtyGateMsg').textContent = G.ok;
      mascotSay(G.ok, '♥');
      burst({ particleCount: 90, colors: ['#ff2255', '#ffd56a', '#fff'] });
      loveRain(14);
      if (window.gsap) {
        gsap.to($('togetherWord'), { scale: 1.08, duration: 0.3, yoyo: true, repeat: 1 });
      }
      setTimeout(() => chapterTransition('flirty', () => enterRoom('flirty')), 1100);
      return;
    }
    const i = Math.min(stats.flirtyPassAttempts - 1, G.wrong.length - 1);
    $('flirtyGateMsg').textContent = stats.flirtyPassAttempts >= 2
      ? (G.afterTwo || G.help)
      : G.wrong[i];
    vibe([20, 20]);
    if (window.gsap) gsap.fromTo($('flirtyPassInput'), { x: -8 }, { x: 0, duration: 0.4, ease: 'elastic.out(1,.4)' });
  }

  $('flirtyGateGo').onclick = tryFlirtyPass;
  $('flirtyPassInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryFlirtyPass(); });
  $('flirtyGateBack').onclick = () => { show('scene-hub', 'fade'); refreshHub(); };

  async function travelToPlanet(id) {
    if (!window.gsap || current !== 'scene-hub' || planetWarping) return;
    const map = $('worldMap');
    const node = document.querySelector(`.map-node[data-room="${id}"]`);
    const warp = $('planetWarp');
    if (!map || !node || !warp) return;

    planetWarping = true;
    warp.classList.remove('hidden');

    const mapRect = map.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const dx = (mapRect.left + mapRect.width / 2 - (nodeRect.left + nodeRect.width / 2)) * 0.9;
    const dy = (mapRect.top + mapRect.height / 2 - (nodeRect.top + nodeRect.height / 2)) * 0.9;

    await new Promise((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          warp.classList.add('hidden');
          gsap.set(map, { clearProps: 'transform,filter' });
          gsap.set(node, { clearProps: 'transform,boxShadow' });
          planetWarping = false;
          resolve();
        },
      });
      tl.set(warp, { opacity: 0 });
      tl.to(warp, { opacity: 1, duration: 0.16 }, 0);
      tl.to(map, { x: dx, y: dy, scale: 2.35, filter: 'blur(1.5px)', duration: 0.62, ease: 'power3.in' }, 0.02);
      tl.to(node, { scale: 1.18, boxShadow: '0 0 58px rgba(214,98,122,.72)', duration: 0.2, yoyo: true, repeat: 1 }, 0.04);
      tl.to(warp, { opacity: 0, duration: 0.22, ease: 'power2.in' }, 0.58);
    });
  }

  /* ── ROOMS ─────────────────────────────────────── */
  async function openRoom(id) {
    if (id === 'gift') {
      if (!stats.rooms.has('flirty')) {
        toast('the sun wakes after flirty.');
        return;
      }
      stats.sunCleared = true;
      await travelToPlanet(id);
      return sceneGift();
    }
    if (id === 'capsule') {
      await travelToPlanet(id);
      show('scene-capsule', 'up');
      const codeEl = $('capsuleCode');
      if (capsuleOpen) {
        stats.capsuleCleared = true;
        $('capsuleCopy').textContent = C.copy.capsuleUnlocked;
        if (codeEl) {
          codeEl.textContent = C.copy.capsuleCode || '190325';
          codeEl.classList.remove('hidden');
        }
      } else {
        const days = Math.max(0, Math.ceil((capsuleAt - now()) / 86400000));
        $('capsuleCopy').textContent = C.copy.capsuleMystery + ' 🔒 ' + (days > 0 ? C.copy.capsuleDays(days) + '.' : C.copy.capsuleLock);
        if (codeEl) {
          codeEl.textContent = '';
          codeEl.classList.add('hidden');
        }
      }
      return;
    }
    if (id === 'flirty' && !['funny', 'romantic', 'us'].every(r => stats.rooms.has(r))) {
      toast('three keys first. it\'s locked for a reason. 🔒');
      if (window.gsap) gsap.fromTo(document.querySelector('.map-node.flirty'), { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1,.3)' });
      return;
    }
    if (id === 'flirty' && !flirtyUnlocked) {
      await travelToPlanet(id);
      return sceneFlirtyGate();
    }

    await travelToPlanet(id);
    if (id === 'us') return chapterTransition('us', () => openUs());

    const chKey = id === 'romantic' ? 'romantic' : id === 'flirty' ? 'flirty' : 'funny';
    chapterTransition(chKey, () => enterRoom(id));
  }

  async function enterRoom(id) {
    stopFunnyAuto();
    stopRomanticAuto();
    romanticBusy = false;
    roomId = id;
    slide = 0;
    const scene = $('scene-room');
    scene.classList.remove('funny-mode', 'flirty-mode', 'romantic-mode');
    scene.classList.add(id + '-mode');

    $('bookView').classList.add('hidden');
    $('popoutView').classList.add('hidden');
    $('polaroidView').classList.add('hidden');
    $('romanticChatIntro').classList.add('hidden');
    if ($('chatStream')) $('chatStream').innerHTML = '';
    if ($('chatThreadLabel')) $('chatThreadLabel').textContent = '';

    $('roomTag').textContent = C.copy.rooms[id].tag;
    $('roomTitle').textContent = C.copy.rooms[id].title;
    $('roomMsg').textContent = '';

    loveRain(8);
    show('scene-room', 'left');

    if (id === 'funny') {
      window.setParticleColor && window.setParticleColor('#b5394b');
      $('bookView').classList.remove('hidden');
      await setupFunny();
    } else if (id === 'flirty') {
      window.setParticleColor && window.setParticleColor('#8f2437');
      $('popoutView').classList.remove('hidden');
      await setupFlirty();
    } else {
      window.setParticleColor && window.setParticleColor('#de5d6f');
      $('polaroidView').classList.remove('hidden');
      await setupRomantic();
    }
  }

  $('capsuleBack').onclick = () => { show('scene-hub', 'fade'); refreshHub(); };

  /* FUNNY — auto chaos reel */
  function setFunnyMessage(idx = slide) {
    $('roomMsg').textContent = roomCaption('funny', idx);
  }

  function stopFunnyAuto() {
    if (!funnyAutoTimer) return;
    clearInterval(funnyAutoTimer);
    funnyAutoTimer = null;
  }

  function startFunnyAuto() {
    stopFunnyAuto();
    if (roomId !== 'funny' || roomCount('funny') <= 1) return;
    funnyAutoTimer = setInterval(() => {
      if (current !== 'scene-room' || roomId !== 'funny') return;
      advanceFunny(true);
    }, 5200);
  }

  function funnyTransitionStyle(idx) {
    const styles = ['pop', 'shred', 'puzzle', 'flip'];
    return styles[idx % styles.length];
  }

  async function funnyOut(style) {
    if (!window.gsap) return;
    const page = $('bookPage');
    const media = ['#bookFront', '#bookBack', '#bookFrontPh', '#bookBackPh'];
    if (style === 'shred') {
      await new Promise((res) => gsap.to(page, {
        opacity: 0,
        clipPath: 'inset(0 49% 0 49%)',
        duration: 0.4,
        ease: 'power3.in',
        onComplete: res,
      }));
      gsap.set(page, { clipPath: 'none' });
      return;
    }
    if (style === 'puzzle') {
      await new Promise((res) => gsap.to(media, {
        opacity: 0,
        x: () => (Math.random() - 0.5) * 180,
        y: () => (Math.random() - 0.5) * 130,
        rotation: () => (Math.random() - 0.5) * 40,
        duration: 0.45,
        ease: 'power2.in',
        onComplete: res,
      }));
      gsap.set(media, { clearProps: 'x,y,rotation' });
      return;
    }
    if (style === 'flip') {
      await new Promise((res) => gsap.to(page, { rotateY: -170, opacity: 0, duration: 0.6, ease: 'power2.inOut', onComplete: res }));
      gsap.set(page, { rotateY: 0 });
      return;
    }
    await new Promise((res) => gsap.to(page, { scale: 0.74, opacity: 0, duration: 0.36, ease: 'back.in(1.2)', onComplete: res }));
  }

  async function funnyIn(style) {
    if (!window.gsap) return;
    const page = $('bookPage');
    const media = ['#bookFront', '#bookBack', '#bookFrontPh', '#bookBackPh'];
    if (style === 'shred') {
      await new Promise((res) => gsap.fromTo(page, {
        opacity: 0,
        clipPath: 'inset(0 49% 0 49%)',
      }, {
        opacity: 1,
        clipPath: 'inset(0 0 0 0)',
        duration: 0.45,
        ease: 'power3.out',
        onComplete: res,
      }));
      gsap.set(page, { clipPath: 'none' });
      return;
    }
    if (style === 'puzzle') {
      await new Promise((res) => gsap.fromTo(media, {
        opacity: 0,
        x: () => (Math.random() - 0.5) * 190,
        y: () => (Math.random() - 0.5) * 130,
        rotation: () => (Math.random() - 0.5) * 45,
      }, {
        opacity: 1,
        x: 0,
        y: 0,
        rotation: 0,
        duration: 0.5,
        stagger: 0.04,
        ease: 'back.out(1.5)',
        onComplete: res,
      }));
      return;
    }
    if (style === 'flip') {
      await new Promise((res) => gsap.fromTo(page, { rotateY: 170, opacity: 0 }, {
        rotateY: 0,
        opacity: 1,
        duration: 0.55,
        ease: 'power2.out',
        onComplete: res,
      }));
      return;
    }
    await new Promise((res) => gsap.fromTo(page, { scale: 1.24, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.46, ease: 'back.out(1.5)', onComplete: res }));
  }

  async function setupFunny() {
    await loadBookFront(0);
    await loadBookBack(1);
    $('roomNext').textContent = roomCount('funny') <= 1 ? 'clear room' : 'skip';
    setFunnyMessage(0);
    if (window.gsap) {
      gsap.fromTo($('bookPage'), { opacity: 0, y: 32, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' });
      gsap.fromTo($('stickman'), { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.5, delay: 0.3, ease: 'elastic.out(1,.5)' });
    }
    startFunnyAuto();
  }

  async function loadBookFront(idx) {
    const src = roomImage('funny', idx);
    const img = $('bookFront');
    const ph = $('bookFrontPh');
    await setSlideImg(img, ph, src, `funny · ${String(idx + 1).padStart(2, '0')}`);
    $('bookFrontCap').textContent = roomCaption('funny', idx);
    preloadUrl(roomImage('funny', idx + 1));
  }

  async function loadBookBack(idx) {
    const max = roomCount('funny');
    if (idx >= max) {
      $('bookBack').classList.add('hidden');
      $('bookBackPh').classList.add('hidden');
      return;
    }
    const src = roomImage('funny', idx);
    const img = $('bookBack');
    const ph = $('bookBackPh');
    await setSlideImg(img, ph, src, `funny · ${String(idx + 1).padStart(2, '0')}`);
    $('bookBackCap').textContent = roomCaption('funny', idx);
  }

  async function advanceFunny(fromAuto = false) {
    if (isFlipping) return;
    stopFunnyAuto();
    const max = roomCount('funny');
    const nextSlide = slide + 1;
    if (nextSlide >= max) {
      stats.rooms.add('funny');
      roomCompleteFx('funny');
      if (window.gsap) gsap.to($('stickman'), { rotation: 720, scale: 0, duration: 0.6 });
      await wait(860);
      show('scene-hub', 'fade');
      refreshHub();
      return;
    }

    isFlipping = true;
    const style = funnyTransitionStyle(nextSlide);
    if (window.gsap) $('stickman').style.animation = 'none';
    try {
      await funnyOut(style);
      slide = nextSlide;
      await loadBookFront(slide);
      await loadBookBack(slide + 1);
      setFunnyMessage(slide);
      $('roomNext').textContent = slide >= max - 1 ? 'clear room' : (fromAuto ? 'skip' : 'next');
      await funnyIn(style);
      if (window.gsap) gsap.fromTo($('stickman'), { x: -10 }, { x: 0, duration: 0.35, ease: 'back.out(1.6)' });
      vibe(18);
    } finally {
      if (window.gsap) $('stickman').style.animation = '';
      isFlipping = false;
      if (current === 'scene-room' && roomId === 'funny') startFunnyAuto();
    }
  }

  /* FLIRTY — pop-out */
  async function setupFlirty() {
    await loadFlirty(0);
    $('roomNext').textContent = roomCount('flirty') <= 1 ? 'clear room' : 'next';
    $('roomMsg').textContent = roomCaption('flirty', 0);
  }

  async function loadFlirty(idx) {
    const src = roomImage('flirty', idx);
    const img = $('popoutImg'), ph = $('popoutPh'), bg = $('flirtyBg');
    const line = roomCaption('flirty', idx);
    if (src !== PH) {
      bg.style.backgroundImage = `url("${src}")`;
    } else {
      bg.style.backgroundImage = 'none';
    }
    await setSlideImg(img, ph, src, line);
    $('popoutLabel').textContent = line;
    if (idx === 0) mascotSay(C.copy.mascot.flirty, '◆');
    preloadUrl(roomImage('flirty', idx + 1));

    if (window.gsap) {
      gsap.fromTo($('popoutCard'),
        { scale: 0.85, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.8, ease: 'power3.out' }
      );
    }
  }

  async function advanceFlirty() {
    const max = roomCount('flirty');
    const nextSlide = slide + 1;

    if (nextSlide >= max) {
      stats.rooms.add('flirty');
      roomCompleteFx('flirty');
      if (window.gsap) gsap.to($('popoutCard'), { scale: 0, opacity: 0, duration: 0.4, ease: 'power2.in' });
      await wait(700);
      startMovieCredits('hub');
      return;
    }

    if (window.gsap) {
      await new Promise(res => {
        gsap.to($('popoutCard'), { y: -600, opacity: 0, rotation: (Math.random() - 0.5) * 20, duration: 0.4, ease: 'power2.in', onComplete: res });
      });
    }

    slide = nextSlide;
    await loadFlirty(slide);
    $('roomMsg').textContent = roomCaption('flirty', slide);
    $('roomNext').textContent = slide >= max - 1 ? 'clear room' : 'next';
  }

  /* ROMANTIC — polaroid */
  async function setupRomantic() {
    stopRomanticAuto();
    await showRomanticChatIntro();
    await showRomanticHeartIntro();
    await loadRomantic(0);
    $('roomNext').textContent = roomCount('romantic') <= 1 ? 'clear room' : 'next';
    $('roomMsg').textContent = roomCaption('romantic', 0);
    if (window.gsap) gsap.fromTo($('polaroidView'), { opacity: 0, y: 40, rotation: -5 }, { opacity: 1, y: 0, rotation: -1.5, duration: 0.8, ease: 'power3.out' });
    startRomanticAuto();
  }

  function stopRomanticAuto() {
    if (!romanticAutoTimer) return;
    clearInterval(romanticAutoTimer);
    romanticAutoTimer = null;
  }

  function startRomanticAuto() {
    stopRomanticAuto();
    if (roomId !== 'romantic' || roomCount('romantic') <= 1) return;
    romanticAutoTimer = setInterval(() => {
      if (current !== 'scene-room' || roomId !== 'romantic') return;
      advanceRomantic(true);
    }, 5000);
  }

  async function showRomanticChatIntro() {
    const host = $('romanticChatIntro');
    const stream = $('chatStream');
    const label = $('chatThreadLabel');
    const threads = Array.isArray(C.copy.rooms.romantic.chatThreads) ? C.copy.rooms.romantic.chatThreads : [];
    if (!host || !stream || !threads.length) return;

    let skipped = false;
    const skipBtn = $('chatSkip');
    const onSkip = () => { skipped = true; };
    if (skipBtn) skipBtn.onclick = onSkip;

    stream.innerHTML = '';
    host.classList.remove('hidden');
    host.setAttribute('aria-hidden', 'false');

    const shapes = ['round', 'cloud', 'oval', 'burst', 'tail'];
    const pops = [
      { from: { opacity: 0, scale: 0.2, rotation: -8 }, ease: 'back.out(2.4)' },
      { from: { opacity: 0, y: 40, scale: 0.8 }, ease: 'back.out(1.8)' },
      { from: { opacity: 0, x: -50, scale: 0.7 }, ease: 'power3.out' },
      { from: { opacity: 0, x: 50, scale: 0.7 }, ease: 'power3.out' },
      { from: { opacity: 0, y: -30, scale: 1.3 }, ease: 'elastic.out(1,.55)' },
      { from: { opacity: 0, scale: 1.4, rotation: 10 }, ease: 'back.out(1.6)' },
    ];

    for (const thread of threads) {
      if (skipped) break;
      stream.innerHTML = '';
      if (label) label.textContent = thread.title || '';
      const bubbles = Array.isArray(thread.bubbles) ? thread.bubbles : [];
      for (let i = 0; i < bubbles.length; i++) {
        if (skipped) break;
        const item = bubbles[i];
        const who = item?.who === 'her' ? 'her' : 'him';
        const text = item?.text;
        if (!text) continue;
        const b = document.createElement('p');
        b.className = `comic-bubble ${who} shape-${shapes[i % shapes.length]}`;
        b.textContent = text;
        stream.appendChild(b);
        stream.scrollTop = stream.scrollHeight;
        const pop = pops[i % pops.length];
        if (window.gsap) {
          gsap.fromTo(b, pop.from, { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, duration: 0.48, ease: pop.ease });
        } else {
          b.style.opacity = '1';
        }
        await wait(skipped ? 0 : (text.length > 80 ? 3000 : 2500));
      }
      if (!skipped) await wait(1600);
    }

    if (window.gsap && stream.children.length) {
      gsap.to(stream.children, { opacity: 0, y: -10, duration: 0.35, stagger: 0.04, ease: 'power1.in' });
      await wait(420);
    }
    host.classList.add('hidden');
    host.setAttribute('aria-hidden', 'true');
    stream.innerHTML = '';
    if (label) label.textContent = '';
    if (skipBtn) skipBtn.onclick = null;
  }

  async function showRomanticHeartIntro() {
    const layer = $('romanticHeartIntro');
    if (!layer) return;
    layer.innerHTML = '';
    layer.classList.remove('hidden');
    const bits = [];
    const points = 18;
    for (let i = 0; i < points; i++) {
      const t = (Math.PI * 2 * i) / points;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const bit = document.createElement('span');
      bit.className = 'heart-bit';
      bit.textContent = i % 5 === 0 ? '✦' : '♥';
      layer.appendChild(bit);
      bits.push({ el: bit, x: x * 6.2, y: y * 4.7 });
    }

    if (window.gsap) {
      bits.forEach(({ el, x, y }, idx) => {
        gsap.fromTo(el,
          { x: (Math.random() - 0.5) * 180, y: (Math.random() - 0.5) * 140, opacity: 0, scale: 0.35 },
          { x, y, opacity: 0.95, scale: 1, duration: 0.55, delay: idx * 0.028, ease: 'power3.out' });
      });
      await wait(860);
      gsap.to(bits.map(n => n.el), { opacity: 0, y: '-=14', duration: 0.42, stagger: 0.016, ease: 'power1.in' });
      await wait(460);
    } else {
      await wait(1250);
    }

    layer.classList.add('hidden');
    layer.innerHTML = '';
  }

  async function loadRomantic(idx) {
    const src = roomImage('romantic', idx);
    const img = $('roomPic'), ph = $('roomPh'), pol = $('polaroidView');
    pol.classList.remove('upside', 'blurred', 'develop');
    $('scratch').classList.add('hidden');
    $('scratch').style.pointerEvents = 'none';
    const line = roomCaption('romantic', idx);

    await setSlideImg(img, ph, src, `romantic · 0${idx + 1}`);
    $('roomCap').textContent = line;
    preloadUrl(roomImage('romantic', idx + 1));

    const target = src !== PH ? img : ph;
    await photoPersonality(target, idx);

    if (idx === 3) setupScratch();
  }

  function setupScratch() {
    const c = $('scratch');
    const pic = $('roomPic').classList.contains('hidden') ? $('roomPh') : $('roomPic');
    const box = pic.getBoundingClientRect();
    const w = Math.max(120, Math.round(box.width) || 260);
    const h = Math.max(150, Math.round(box.height) || 325);
    c.width = w;
    c.height = h;
    c.classList.remove('hidden');
    c.style.pointerEvents = 'auto';

    const ctx = c.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#c9b48a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a4a32';
    ctx.font = 'bold 15px Outfit, sans-serif';
    ctx.fillText('scratch to reveal', 16, 40);

    let down = false;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      c.style.pointerEvents = 'none';
      c.classList.add('hidden');
      clearTimeout(setupScratch._auto);
      toast('revealed. next slide incoming.', 2000);
    };

    const scratchedEnough = () => {
      try {
        const data = ctx.getImageData(0, 0, w, h).data;
        let clear = 0;
        const step = 16;
        for (let i = 3; i < data.length; i += 4 * step) {
          if (data[i] < 40) clear++;
        }
        const total = Math.ceil(data.length / (4 * step));
        return clear / total > 0.28;
      } catch (_) {
        return false;
      }
    };

    const scratchAt = (e) => {
      const r = c.getBoundingClientRect();
      const pt = e.touches ? e.touches[0] : e;
      const px = ((pt.clientX - r.left) / r.width) * w;
      const py = ((pt.clientY - r.top) / r.height) * h;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(px, py, 28, 0, Math.PI * 2);
      ctx.fill();
      if (scratchedEnough()) finish();
    };

    c.onpointerdown = (e) => { down = true; c.setPointerCapture(e.pointerId); scratchAt(e); };
    c.onpointerup = () => { down = false; };
    c.onpointercancel = () => { down = false; };
    c.onpointermove = (e) => { if (down) scratchAt(e); };
    c.ontouchmove = (e) => { e.preventDefault(); scratchAt(e); };

    $('roomMsg').textContent = 'scratch her out… or let it reveal itself';
    clearTimeout(setupScratch._auto);
    setupScratch._auto = setTimeout(() => {
      if (current === 'scene-room' && roomId === 'romantic') finish();
    }, 2100);
  }

  async function advanceRomantic(fromAuto = false) {
    if (roomId !== 'romantic' || romanticBusy) return;
    romanticBusy = true;
    stopRomanticAuto();
    const max = roomCount('romantic');
    const nextSlide = slide + 1;
    try {
      if (nextSlide >= max) {
        stats.rooms.add('romantic');
        roomCompleteFx('romantic');
        if (window.gsap) gsap.to($('polaroidView'), { opacity: 0, scale: 0.8, y: 40, duration: 0.5, ease: 'power2.in' });
        await wait(700);
        show('scene-hub', 'fade');
        refreshHub();
        return;
      }
      if (window.gsap) {
        await new Promise(res => gsap.to($('polaroidView'), { opacity: 0, x: -300, duration: fromAuto ? 0.55 : 0.4, ease: 'power2.in', onComplete: res }));
        gsap.set($('polaroidView'), { x: 0 });
      }
      slide = nextSlide;
      await loadRomantic(slide);
      $('roomMsg').textContent = roomCaption('romantic', slide);
      $('roomNext').textContent = slide >= max - 1 ? 'clear room' : 'next';
      if (window.gsap) gsap.fromTo($('polaroidView'), { opacity: 0, x: 300 }, { opacity: 1, x: 0, duration: fromAuto ? 0.62 : 0.5, ease: 'power3.out' });
    } finally {
      romanticBusy = false;
      if (current === 'scene-room' && roomId === 'romantic') startRomanticAuto();
    }
  }

  /* room nav */
  function leaveRoom() {
    stopFunnyAuto();
    stopRomanticAuto();
    clearTimeout(usReturnTimer);
    usReturnTimer = null;
    if ($('scene-us')) $('scene-us').classList.remove('journey-done');
    show('scene-hub', 'fade');
    refreshHub();
    window.setParticleColor && window.setParticleColor('#b5394b');
  }

  $('roomBack').onclick = leaveRoom;
  $('roomNext').onclick = () => {
    if (roomId === 'funny') advanceFunny();
    else if (roomId === 'flirty') advanceFlirty();
    else advanceRomantic();
  };

  /* ── US CONSTELLATION ──────────────────────────── */
  async function openUs() {
    show('scene-us', 'left');
    window.setParticleColor && window.setParticleColor('#7c2a38');
    $('scene-us').classList.remove('journey-done');
    clearTimeout(usReturnTimer);
    usReturnTimer = null;
    $('rotateCopy').textContent = 'Follow the route. Tap each checkpoint in order.';
    $('rotateSkip').textContent = 'start';
    $('rotateGate').classList.add('hidden');

    const labels = ['ORIGIN', 'SPARK', 'DRIFT', 'GLOW', 'PULSE', 'NOVA', 'AURORA', 'ECHO', 'VOW', 'FOREVER'];
    const allPoints = [
      { x: 10, y: 72 }, { x: 22, y: 52 }, { x: 32, y: 70 }, { x: 43, y: 43 }, { x: 54, y: 62 },
      { x: 64, y: 37 }, { x: 74, y: 56 }, { x: 83, y: 32 }, { x: 90, y: 58 }, { x: 55, y: 82 },
    ];
    const total = Math.min(roomCount('us'), allPoints.length);
    const points = allPoints.slice(0, total);
    usTarget = total;

    usFound = new Set();
    const linesSvg = $('constellationLines');
    const map = $('constellationMap');
    const card = $('constCard');
    const media = $('constMedia');
    const text = $('constText');
    const tag = $('constTag');
    const chats = $('constChats');
    const journey = $('journeyStatus');
    card.classList.add('hidden');
    linesSvg.innerHTML = '';
    map.innerHTML = '';

    const memories = [];
    for (let i = 1; i <= total; i++) {
      memories.push({
        src: roomImage('us', i - 1),
        line: roomCaption('us', i - 1),
        label: labels[i - 1] || 'US',
      });
    }

    const updateDoneBtn = () => {
      const done = usFound.size >= total;
      $('usDone').disabled = !done;
      $('usDone').textContent = done ? 'sit with this…' : `checkpoint ${usFound.size}/${total}`;
    };

    const updateJourney = () => {
      if (!journey) return;
      const stop = usFound.size >= total
        ? 'FOREVER'
        : (labels[Math.min(usFound.size, labels.length - 1)] || 'NEXT');
      journey.textContent = `ROUTE ${usFound.size}/${total} • ${stop}`;
    };

    const drawLines = () => {
      linesSvg.innerHTML = '';
      for (let i = 0; i < points.length - 1; i++) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', points[i].x);
        line.setAttribute('y1', points[i].y);
        line.setAttribute('x2', points[i + 1].x);
        line.setAttribute('y2', points[i + 1].y);
        line.classList.add('const-line');
        if (usFound.has(i) && usFound.has(i + 1)) line.classList.add('active');
        linesSvg.appendChild(line);
      }
    };

    const renderMemory = (idx) => {
      const mem = memories[idx];
      tag.textContent = `${mem.label} • CHECKPOINT ${String(idx + 1).padStart(2, '0')}`;
      if (mem.src === PH) {
        media.innerHTML = `<div class="ph">us · ${String(idx + 1).padStart(2, '0')}</div>`;
      } else {
        media.innerHTML = `<div class="ph">loading…</div>`;
        const img = document.createElement('img');
        img.alt = C.her.call || C.her.name;
        img.onload = () => { media.innerHTML = ''; media.appendChild(img); };
        img.onerror = () => { media.innerHTML = `<div class="ph">us · ${String(idx + 1).padStart(2, '0')}</div>`; };
        img.src = mem.src;
      }
      text.textContent = mem.line;
      chats.innerHTML = '';
      chats.classList.add('hidden');
      card.classList.remove('hidden');
      if (window.gsap) gsap.fromTo(card, { opacity: 0, y: 18, x: 18 }, { opacity: 1, y: 0, x: 0, duration: 0.35, ease: 'power2.out' });
    };

    for (let i = 0; i < total; i++) {
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'star-node';
      if (i > 0) star.classList.add('locked');
      star.dataset.idx = String(i);
      star.style.left = points[i].x + '%';
      star.style.top = points[i].y + '%';
      star.innerHTML = `<span class="star-dot">✦</span><span class="star-label">${labels[i] || 'US'}</span>`;
      star.onclick = () => {
        if (usFound.has(i)) {
          renderMemory(i);
          return;
        }
        if (i > 0 && !usFound.has(i - 1)) {
          toast('Follow the route in order.');
          vibe(14);
          if (window.gsap) gsap.fromTo(star, { x: -6 }, { x: 0, duration: 0.35, ease: 'elastic.out(1,.4)' });
          return;
        }
        usFound.add(i);
        star.classList.add('found');
        star.classList.remove('locked');
        const next = map.querySelector(`.star-node[data-idx="${i + 1}"]`);
        if (next) next.classList.remove('locked');
        drawLines();
        updateDoneBtn();
        updateJourney();
        renderMemory(i);
        popHearts(6);
        if (window.gsap) gsap.fromTo($('constellationShell'), { scale: 0.985 }, { scale: 1, duration: 0.3, ease: 'power1.out' });
        if (usFound.size >= total) {
          toast('Journey complete', 2800);
          burst({ particleCount: 80, spread: 70, colors: ['#6b1b2a', '#de5d6f', '#fff6f2'] });
          $('usDone').disabled = true;
          $('usDone').textContent = 'sit with this…';
          clearTimeout(usReturnTimer);
          usReturnTimer = setTimeout(() => {
            if (current !== 'scene-us') return;
            $('scene-us').classList.add('journey-done');
            $('usDone').disabled = false;
            $('usDone').textContent = 'back to the galaxy';
            toast('Whenever you\'re ready', 2200);
            if (window.gsap) gsap.fromTo($('usDone'), { y: 16, opacity: 0.35 }, { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.4)' });
          }, 5000);
        }
      };
      map.appendChild(star);
      if (window.gsap) gsap.fromTo(star, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.34, delay: i * 0.08, ease: 'back.out(1.8)' });
    }

    drawLines();
    updateDoneBtn();
    updateJourney();
  }

  $('rotateSkip').onclick = () => $('rotateGate').classList.add('hidden');
  addEventListener('orientationchange', () => {
    if (current === 'scene-us' && innerWidth > innerHeight) $('rotateGate').classList.add('hidden');
  });
  $('usBack').onclick = leaveRoom;
  $('usDone').onclick = () => {
    if (current !== 'scene-us') return;
    if (usFound.size < usTarget) {
      toast('Find all the stars first');
      return;
    }
    stats.rooms.add('us');
    roomCompleteFx('us');
    leaveRoom();
  };

  /* ── GIFT ──────────────────────────────────────── */
  async function sceneGift() {
    giftPhase = 0;
    show('scene-gift', 'pop');
    window.setParticleColor && window.setParticleColor('#de5d6f');
    $('giftBox').textContent = '🎁';
    $('holdRing').classList.add('hidden');
    $('giftOpen').classList.remove('hidden');
    $('giftOpen').textContent = 'open';
    $('giftLine').textContent = C.copy.giftWait[0];
    if (window.gsap) gsap.fromTo($('giftBox'), { scale: 0, rotation: -20 }, { scale: 1, rotation: 0, duration: 0.8, ease: 'elastic.out(1,.5)', delay: 0.3 });
    await wait(800);
    $('giftLine').textContent = C.copy.giftWait[1];
    await wait(900);
    $('giftLine').textContent = C.copy.giftWait[2];
  }

  $('giftOpen').onclick = async () => {
    if (giftPhase === 0) {
      giftPhase = 1;
      if (window.gsap) await new Promise(res => gsap.to($('giftBox'), { scale: 0, duration: 0.25, ease: 'power2.in', onComplete: res }));
      $('giftBox').textContent = '📦';
      if (window.gsap) gsap.to($('giftBox'), { scale: 1, duration: 0.4, ease: 'back.out(1.5)' });
      $('giftLine').textContent = C.copy.giftFake[0];
      await wait(600);
      $('giftLine').textContent = C.copy.giftFake[1];
      $('giftOpen').textContent = 'open for real';
      return;
    }
    $('giftOpen').classList.add('hidden');
    $('holdRing').classList.remove('hidden');
    $('giftLine').textContent = C.copy.giftHold;
    if (window.gsap) gsap.fromTo($('holdRing'), { scale: 0 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1,.5)' });
  };

  (function holdLogic() {
    let t0 = 0, raf;
    const ring = $('holdRing');
    const start = () => {
      if (current !== 'scene-gift' || giftPhase < 1) return;
      t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(100, ((now - t0) / 3000) * 100);
        ring.style.setProperty('--p', p + '%');
        vibe(5);
        if (p >= 100) { burst({ particleCount: 180 }); vibe([50, 50, 80]); sceneScan(); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      if (current === 'scene-gift' && giftPhase >= 1) {
        const p = parseFloat(getComputedStyle(ring).getPropertyValue('--p')) || 0;
        if (p < 100 && p > 3) toast(C.copy.giftAlmost);
        ring.style.setProperty('--p', '0%');
      }
    };
    ring.addEventListener('pointerdown', start);
    ring.addEventListener('pointerup', stop);
    ring.addEventListener('pointerleave', stop);
    ring.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
    ring.addEventListener('touchend', stop);
  })();

  /* ── SCAN ──────────────────────────────────────── */
  async function sceneScan() {
    show('scene-scan', 'slam');
    window.setParticleColor && window.setParticleColor('#c43a52');
    const nums = [0, 12, 47, 69, 101, 404, '∞'];
    for (const n of nums) {
      $('scanPct').textContent = typeof n === 'number' ? n + '%' : n;
      if (window.gsap) gsap.fromTo($('scanPct'), { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, ease: 'power2.out' });
      await wait(420);
    }
    $('scanMsg').textContent = C.copy.scan[1];
    if (window.gsap) gsap.fromTo($('scanMsg'), { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.5 });
    await wait(1400);
    chapterTransition('finale', () => sceneFinale());
  }

  /* ── FINALE ────────────────────────────────────── */
  async function loadFavoriteImage() {
    const files = (Array.isArray(C.media?.favorite) ? C.media.favorite : []).filter(Boolean);
    if (files[0]) return mediaUrl('favorite', files[0]);
    return PH;
  }

  async function sceneFinale() {
    show('scene-finale', 'pop');
    $('finaleCap').textContent = C.copy.finaleCaption;
    const frame = $('finaleFrame');
    frame.querySelectorAll('img.finale-pic').forEach((n) => n.remove());
    const fav = await loadFavoriteImage();
    if (fav !== PH) {
      $('finalePh').classList.add('hidden');
      const img = document.createElement('img');
      img.className = 'finale-pic';
      img.src = fav;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
      frame.appendChild(img);
    } else {
      $('finalePh').classList.remove('hidden');
    }
    if (window.gsap) gsap.fromTo($('finaleFrame'), { scale: 0.7, opacity: 0, rotation: 5 }, { scale: 1, opacity: 1, rotation: -1.8, duration: 0.85, ease: 'elastic.out(1,.55)', delay: 0.2 });
  }

  $('finaleGo').onclick = () => sceneLetter();

  /* ── LETTER ────────────────────────────────────── */
  async function sceneLetter() {
    show('scene-letter', 'up');
    window.setParticleColor && window.setParticleColor('#b5394b');
    if (window.gsap) gsap.fromTo($('wax'), { scale: 0, rotation: -180 }, { scale: 1, rotation: 0, duration: 0.7, ease: 'elastic.out(1,.5)', delay: 0.1 });
    const box = $('letterBody');
    box.innerHTML = '';
    await wait(400);
    for (const line of C.copy.letter) {
      const p = document.createElement('p');
      p.style.marginBottom = '10px';
      box.appendChild(p);
      for (const ch of line) { p.textContent += ch; await wait(36); }
    }
    C.copy.letterSign.forEach((s, i) => {
      const p = document.createElement('p');
      p.textContent = s;
      p.style.marginTop = i === 0 ? '16px' : '2px';
      if (i > 0) p.style.fontWeight = '700';
      box.appendChild(p);
    });
  }

  $('letterGo').onclick = () => sceneCandles();

  /* ── CANDLES ───────────────────────────────────── */
  async function sceneCandles() {
    show('scene-candles', 'up');
    lastCandleLit = false;
    $('blowHint').textContent = C.copy.candles;
    $('candleMsg').textContent = C.copy.candlesAsk || 'Allow the microphone, then blow into the mouthpiece.';
    $('lastCandleMsg').classList.add('hidden');
    $('lastCandleMsg').textContent = '';

    const total = C.ages.her;
    const row = $('flameRow');
    row.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const f = document.createElement('span');
      f.className = 'flame' + (i === total - 1 ? ' special' : '');
      f.textContent = '🔥';
      row.appendChild(f);
    }

    const flames = [...row.querySelectorAll('.flame')];
    let blown = 0, lastOut = 0, finished = false;

    const out = () => {
      if (finished || Date.now() - lastOut < 220) return;
      lastOut = Date.now();

      if (lastCandleLit) {
        flames[total - 1].classList.add('out');
        finished = true;
        $('lastCandleMsg').classList.add('hidden');
        $('blowHint').textContent = 'HAPPY BIRTHDAY';
        $('blowHint').classList.add('gold');
        burst({ particleCount: 160, colors: ['#6b1b2a', '#de5d6f', '#fff6f2'] });
        loveRain(20);
        mascotSay(C.copy.mascot.end, '♥');
        setTimeout(sceneReceipt, 1400);
        return;
      }

      if (blown >= total - 1) {
        $('lastCandleMsg').textContent = "There's one more.";
        $('lastCandleMsg').classList.remove('hidden');
        lastCandleLit = true;
        vibe(30);
        return;
      }

      flames[blown].classList.add('out');
      blown++;
      vibe(18);
    };

    const sceneEl = $('scene-candles');
    sceneEl.onpointermove = (e) => { if (e.buttons || e.pointerType === 'touch') out(); };
    sceneEl.onpointerdown = () => out();

    try {
      await wait(700);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 512; src.connect(an);
      const data = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(data);
        let max = 0;
        data.forEach(v => (max = Math.max(max, Math.abs(v - 128))));
        if (max > 16) out();
        if (!finished) requestAnimationFrame(loop);
        else stream.getTracks().forEach(t => t.stop());
      };
      loop();
      $('candleMsg').textContent = C.copy.candlesReady || 'Blow into the mouthpiece.';
    } catch (_) {
      $('candleMsg').textContent = C.copy.candlesDeny;
    }
  }

  /* ── RECEIPT ───────────────────────────────────── */
  async function sceneReceipt() {
    show('scene-receipt', 'up');
    $('receiptGo').textContent = receiptFromHub ? (C.copy.receiptBack || 'back to the galaxy') : 'the end…?';
    const elapsed = Date.now() - stats.started;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const R = C.copy.receiptReport;

    const lines = [
      ['Love', R.love],
      ['Cooperation', R.cooperation],
      ['"NO" attempts', stats.noClicks],
      ['PIN intelligence', stats.pinAttempts <= 1 ? 'Acceptable' : R.pinIntel],
      ['PIN attempts', stats.pinAttempts],
      ['together forever', stats.flirtyPassAttempts <= 1 ? 'first try' : stats.flirtyPassAttempts + ' tries'],
      ['CAPTCHA failures', stats.captchaFails],
      ['Fake help requests', stats.helpRequests],
      ['Decline attempts', stats.declineAttempts],
      ['Hidden hearts', `${stats.hearts.size}/${heartEggTotal()}`],
      ['Rooms cleared', `${stats.rooms.size}/4`],
      ['Tab leaves', stats.leftTab],
      ['Time spent', timeStr],
      ['Flirting', R.flirting],
    ];

    const box = $('receiptBox');
    box.innerHTML = `<h3 class="report-head">${R.title}</h3><div class="dash"></div>`;

    for (const [a, b] of lines) {
      const row = document.createElement('div');
      row.className = 'rowline';
      row.innerHTML = `<span>${a}</span><span>${b}</span>`;
      box.appendChild(row);
      if (window.gsap) gsap.fromTo(row, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.28, ease: 'power2.out' });
      await wait(160);
    }

    box.innerHTML += `<div class="dash"></div>
      <div class="rowline"><span style="font-weight:700">OVERALL</span><span style="font-weight:700">${R.overall}</span></div>
      <div class="dash"></div>
      <div class="rowline"><span style="font-weight:700">TOTAL DUE</span><span style="font-weight:700">one date with me</span></div>
      <div class="dash"></div>
      <p class="verdict">NO REFUNDS. NON-NEGOTIABLE.<br/>served by: ${C.him.from}</p>`;

    lastReceiptText = [
      R.title,
      ...lines.map(([a, b]) => `${a}: ${b}`),
      `OVERALL: ${R.overall}`,
      'TOTAL DUE: one date with me',
      `NO REFUNDS. NON-NEGOTIABLE. served by: ${C.him.from}`,
    ].join('\n');
  }

  $('receiptGo').onclick = () => {
    if (receiptFromHub) {
      receiptFromHub = false;
      show('scene-hub', 'fade');
      refreshHub();
      return;
    }
    sceneCredits();
  };

  /* ── CREDITS ───────────────────────────────────── */
  function sceneCredits() {
    show('scene-credits', 'up');
    stats.finished = true;
    $('creditName').textContent = C.her.call || C.her.name;
    $('endLine').textContent = C.copy.end[0];
    $('shareTitle').textContent = C.copy.shareTitle;
    $('shareSub').textContent = C.copy.shareSub;
    $('theEnd').textContent = C.copy.theEnd;

    $('dcWait').textContent = C.copy.directorsCut.wait;
    $('dcSurvived').textContent = C.copy.directorsCut.survived;
    $('dcBtn').textContent = C.copy.directorsCut.btn;
    $('directorsCut').classList.remove('hidden');
    $('endBerserker').textContent = C.copy.berserkerBtn || 'go berserker';
    $('endBerserker').classList.toggle('hidden', berserkerPlayed);

    const g = $('noGhost');
    g.style.display = 'block';
    g.style.left = '20px'; g.style.bottom = '120px';
    g.textContent = C.copy.noGhost[1];
    if (window.gsap) {
      gsap.fromTo($('creditName'), { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 1, ease: 'elastic.out(1,.45)', delay: 0.2 });
      gsap.fromTo($('endLine'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.8 });
      gsap.fromTo($('shareCard'), { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.6, delay: 1.2, ease: 'back.out(1.3)' });
      gsap.fromTo($('directorsCut'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, delay: 2.2 });
    }

    burst({ particleCount: 200, spread: 100, colors: ['#6b1b2a', '#b5394b', '#de5d6f', '#fff6f2'] });
    loveRain(24);
    mascotSay(C.copy.mascot.end, '♥');

    let i = 0;
    $('theEnd').onclick = () => {
      i++;
      $('endLine').textContent = i === 1 ? C.copy.orIsIt : C.copy.end[i % C.copy.end.length];
      if (i <= 2) burst({ particleCount: 60 });
    };
  }

  $('dcBtn').onclick = async () => {
    if (directorsPlayed) return;
    directorsPlayed = true;
    const box = $('dcMontage');
    box.innerHTML = '';
    $('dcBtn').textContent = 'playing…';
    for (const line of C.copy.directorsCut.lines) {
      const p = document.createElement('p');
      p.textContent = '▸ ' + line;
      box.appendChild(p);
      await wait(100);
      p.classList.add('show');
      await wait(650);
    }
    $('dcBtn').textContent = 'director\'s cut complete ✓';
    burst({ particleCount: 80, spread: 70 });
  };

  $('waBtn').onclick = () => {
    const text = lastReceiptText || 'about that receipt...';
    navigator.clipboard.writeText(text).then(() => {
      toast('receipt copied. paste it to Dzaddzzzy');
    }).catch(() => {
      toast('could not copy. screenshot the receipt instead');
    });
    if (C.whatsappNumber) {
      location.href = `https://wa.me/${C.whatsappNumber}?text=${encodeURIComponent(text)}`;
    }
  };

  $('creditsHub').onclick = () => {
    show('scene-hub', 'fade');
    refreshHub();
  };

  $('replayBtn').onclick = () => { localStorage.removeItem('charity_preview'); location.reload(); };

  /* ── MOVIE CREDITS + BERSERKER ─────────────────── */
  function startMovieCredits(after = 'hub') {
    movieCreditsAfter = after;
    const overlay = $('movieCredits');
    const track = $('creditsTrack');
    const end = $('creditsEnd');
    track.innerHTML = '';
    (C.copy.movieCredits || []).forEach((block) => {
      if (block.speech) {
        const speech = document.createElement('p');
        speech.className = 'cred-speech';
        speech.textContent = block.name || '';
        track.appendChild(speech);
        return;
      }
      if (block.role) {
        const role = document.createElement('p');
        role.className = 'cred-role';
        role.textContent = block.role;
        track.appendChild(role);
      }
      const name = document.createElement('p');
      name.className = block.big ? 'cred-big' : 'cred-name';
      name.textContent = block.name;
      track.appendChild(name);
    });
    end.classList.add('hidden');
    $('creditsEndTitle').textContent = C.copy.creditsEndTitle || 'Happy birthday.';
    $('berserkerGo').textContent = C.copy.berserkerBtn || 'go berserker';
    $('creditsBack').textContent = C.copy.receiptBack || 'back to the galaxy';
    $('berserkerGo').classList.toggle('hidden', berserkerPlayed);
    $('creditsSkip').classList.remove('hidden');
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    track.classList.remove('rolling');
    void track.offsetWidth;
    track.classList.add('rolling');
    track.onanimationend = finishMovieCredits;
  }

  function finishMovieCredits() {
    $('creditsEnd').classList.remove('hidden');
    $('creditsSkip').classList.add('hidden');
    $('creditsTrack').classList.remove('rolling');
  }

  function closeMovieCredits() {
    $('movieCredits').classList.add('hidden');
    $('movieCredits').setAttribute('aria-hidden', 'true');
    $('creditsTrack').classList.remove('rolling');
    if (movieCreditsAfter === 'credits') {
      show('scene-credits', 'fade');
      return;
    }
    show('scene-hub', 'fade');
    refreshHub();
  }

  $('creditsSkip').onclick = () => finishMovieCredits();
  $('creditsBack').onclick = () => closeMovieCredits();
  $('berserkerGo').onclick = () => startBerserker();
  $('endBerserker').onclick = () => startBerserker('credits');
  $('berserkerStop').onclick = () => stopBerserker();

  function startBerserker(after) {
    if (after) movieCreditsAfter = after;
    berserkerPlayed = true;
    $('movieCredits').classList.add('hidden');
    const layer = $('berserkerLayer');
    const stamps = $('berserkerStamps');
    stamps.innerHTML = '';
    $('berserkerTitle').textContent = C.copy.berserkerTitle || 'BERSERKER';
    $('berserkerStop').textContent = C.copy.berserkerStop || "ok that's enough";
    layer.classList.remove('hidden');
    layer.classList.add('on');
    layer.setAttribute('aria-hidden', 'false');
    $('device').classList.add('heart-race');
    loveRain(36);
    burst({ particleCount: 160, spread: 100, colors: ['#ff3158', '#ffd36a', '#fff6f2', '#c5475f'] });

    const lines = C.copy.berserkerStamps || ['HAPPY BIRTHDAY'];
    let n = 0;
    clearInterval(berserkerTimer);
    berserkerTimer = setInterval(() => {
      const s = document.createElement('div');
      s.className = 'berserk-stamp';
      s.textContent = lines[n % lines.length];
      s.style.left = (6 + Math.random() * 70) + '%';
      s.style.top = (8 + Math.random() * 70) + '%';
      s.style.fontSize = (18 + Math.random() * 22) + 'px';
      s.style.transform = `rotate(${(Math.random() * 24) - 12}deg)`;
      stamps.appendChild(s);
      setTimeout(() => s.remove(), 900);
      n++;
      if (n % 2 === 0) loveRain(8);
      if (n % 3 === 0) burst({ particleCount: 40, spread: 80, colors: ['#ff3158', '#fff6f2'] });
      vibe([18, 30, 18]);
    }, 420);
  }

  function stopBerserker() {
    clearInterval(berserkerTimer);
    berserkerTimer = null;
    const layer = $('berserkerLayer');
    layer.classList.add('hidden');
    layer.classList.remove('on');
    layer.setAttribute('aria-hidden', 'true');
    $('device').classList.remove('heart-race');
    $('berserkerGo').classList.add('hidden');
    if ($('endBerserker')) $('endBerserker').classList.add('hidden');
    closeMovieCredits();
  }

  /* ── EXTRA INTERACTIONS ────────────────────────── */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stats.leftTab++;
    else if (current && current !== 'scene-countdown') {
      toast(C.copy.tabLeave);
      burst({ particleCount: 30, spread: 40 });
    }
  });

  if (localStorage.getItem('charity_seen')) setTimeout(() => { if (unlocked) toast(C.copy.welcomeBack); }, 900);
  localStorage.setItem('charity_seen', '1');

  const h = now().getHours();
  if (h >= 0 && h < 6) setTimeout(() => toast(C.copy.late, 3200), 1600);

  let lastShake = 0;
  window.addEventListener('devicemotion', (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.abs(a.x) + Math.abs(a.y) + Math.abs(a.z);
    if (mag > 38 && Date.now() - lastShake > 1200) { lastShake = Date.now(); burst({ particleCount: 80 }); vibe(40); }
  });
  $('device').addEventListener('dblclick', () => {
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      DeviceMotionEvent.requestPermission().catch(() => {});
    }
  });

  let idleAt = Date.now();
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { idleAt = Date.now(); idleStage = 0; }, { passive: true }));
  setInterval(() => {
    if (!unlocked || !current || current === 'scene-countdown') return;
    const gap = Date.now() - idleAt;
    const thresholds = [10000, 15000, 20000, 25000];
    const msgs = C.copy.idleWatch || [C.copy.idle];
    for (let s = idleStage; s < thresholds.length; s++) {
      if (gap >= thresholds[s]) {
        toast(msgs[Math.min(s, msgs.length - 1)]);
        mascotSay(msgs[Math.min(s, msgs.length - 1)], '👀');
        idleStage = s + 1;
        idleAt = Date.now();
        break;
      }
    }
  }, 2000);

  /* ── INIT ──────────────────────────────────────── */
  initParticles();
  setPhase('scene-prestart');

  const prestartCopy = C.copy.prestart || {};
  $('prestartLine').textContent = prestartCopy.line || 'Take this seriously it took me 3 months to make this';
  $('prestartGo').textContent = prestartCopy.button || 'continue';
  let prestartDone = false;

  function startExperience() {
    clearInterval(startExperience._t);
    sceneDossier();
  }

  function beginFromPrestart() {
    if (!unlocked) {
      show('scene-countdown');
      tickCount();
      startExperience._t = setInterval(tickCount, 1000);
    } else {
      startExperience();
    }
  }

  function continueAfterPrestart() {
    if (prestartDone) return;
    prestartDone = true;
    if (window.gsap) {
      gsap.to('.prestart-card', {
        opacity: 0,
        y: -24,
        duration: 0.35,
        ease: 'power2.inOut',
        onComplete: beginFromPrestart,
      });
      return;
    }
    beginFromPrestart();
  }

  $('prestartGo').onclick = continueAfterPrestart;
  addEventListener('keydown', (e) => {
    if (current === 'scene-prestart' && (e.key === 'Enter' || e.key === ' ')) continueAfterPrestart();
  });

  show('scene-prestart', 'fade');
  if (window.gsap) {
    gsap.fromTo('.prestart-card', { opacity: 0, y: 24, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'power3.out' });
    gsap.fromTo('#prestartLine', { opacity: 0 }, { opacity: 1, duration: 0.7, delay: 0.2 });
  }

})();
