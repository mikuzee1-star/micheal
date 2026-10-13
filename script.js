(() => {
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme toggle (single icon = current theme) ---------- */
  const metaTheme = $('meta[name="theme-color"]');
  const toggle = $('#themeToggle');
  const themeIcon = $('#themeIcon');
  const systemDark = matchMedia('(prefers-color-scheme: dark)');

  const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';

  const isDark = () =>
    root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches;

  function applyThemeUI() {
    const dark = isDark();
    if (themeIcon) themeIcon.innerHTML = dark ? MOON : SUN; // shows the CURRENT theme
    toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    if (metaTheme) metaTheme.content = dark ? '#07080a' : '#eef0f4';
  }

  const stored = localStorage.getItem('theme');
  if (stored) root.dataset.theme = stored;
  applyThemeUI();

  toggle.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('theme', next);
    applyThemeUI();
  });

  systemDark.addEventListener('change', () => {
    if (!root.dataset.theme) applyThemeUI();
  });

  /* ---------- Transparent header until scrolled ---------- */
  const header = $('header');
  const onScroll = () => header.classList.toggle('scrolled', scrollY > 24);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  const menuBtn = $('#menuBtn');
  const menu = $('#mobileMenu');

  function closeMenu() {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Open menu');
  }

  menuBtn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  $$('a', menu).forEach(a => a.addEventListener('click', closeMenu));
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  addEventListener('resize', () => { if (innerWidth > 760) closeMenu(); });

  /* ---------- Scroll reveal ---------- */
  const revealEls = $$('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(el => io.observe(el));
  }

  /* ---------- Stat counters ---------- */
  const counters = $$('[data-count]');
  function runCounters() {
    counters.forEach(el => {
      const target = parseFloat(el.dataset.count);
      if (reduced || !target) { el.textContent = target.toLocaleString(); return; }
      const t0 = performance.now(), dur = 1300;
      (function step(t) {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
  }
  const stats = $('.stats');
  if (stats && 'IntersectionObserver' in window && !reduced) {
    const io2 = new IntersectionObserver(es => {
      if (es[0].isIntersecting) { runCounters(); io2.disconnect(); }
    }, { threshold: .4 });
    io2.observe(stats);
  } else {
    runCounters();
  }

  /* ---------- Active nav link ---------- */
  const navLinks = $$('nav a[href^="#"]');
  const sections = navLinks.map(a => $(a.getAttribute('href'))).filter(Boolean);
  if (sections.length && 'IntersectionObserver' in window) {
    const io3 = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) {
        navLinks.forEach(a =>
          a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
      }
    }), { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(s => io3.observe(s));
  }

  /* ---------- Live timecode readout ---------- */
  const tc = $('[data-tc]');
  if (tc) {
    if (reduced) {
      tc.textContent = '00:00:04:16';
    } else {
      const DUR = 12000; // matches the CSS playhead loop
      const pad = n => String(n).padStart(2, '0');
      (function tick() {
        const p = (performance.now() % DUR) / DUR;
        const total = p * 12; // "footage" seconds
        const s = Math.floor(total);
        const f = Math.floor((total - s) * 24);
        tc.textContent = `00:00:${pad(s)}:${pad(f)}`;
        requestAnimationFrame(tick);
      })();
    }
  }

  /* ---------- Video sources: local files, YouTube, Vimeo, TikTok ----------
     parseSource(url) works out what a card's href points at:
       { kind, embed, watch, thumb, vertical }
     kind: 'youtube' | 'vimeo' | 'tiktok' | 'file' | 'external' | 'none'          */
  const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*|#.*)?$/i;
  const YT_HOSTS = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'];
  const YT_ID = /^[\w-]{11}$/;

  // "90", "1m30s", "1h2m3s" -> seconds
  function toSeconds(v) {
    if (!v) return 0;
    if (/^\d+$/.test(v)) return +v;
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(v);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  }

  function parseSource(raw) {
    const href = (raw || '').trim();
    if (!href || href === '#') return { kind: 'none' };
    if (VIDEO_EXT.test(href)) return { kind: 'file', src: href };

    let u;
    try { u = new URL(href, location.href); } catch { return { kind: 'none' }; }
    if (!/^https?:$/.test(u.protocol)) return { kind: 'none' };
    const host = u.hostname.replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);

    /* YouTube: watch?v= · youtu.be/ · /shorts/ · /live/ · /embed/ · playlists */
    if (YT_HOSTS.includes(host)) {
      let id = '', vertical = false;
      if (host === 'youtu.be') id = parts[0];
      else if (['shorts', 'live', 'embed', 'v'].includes(parts[0])) { id = parts[1]; vertical = parts[0] === 'shorts'; }
      else id = u.searchParams.get('v');

      const start = toSeconds(u.searchParams.get('t') || u.searchParams.get('start'));
      const list = u.searchParams.get('list');

      if (id && YT_ID.test(id)) {
        const q = new URLSearchParams({ autoplay: 1, rel: 0, playsinline: 1, enablejsapi: 1 });
        if (/^https?:$/.test(location.protocol)) q.set('origin', location.origin);
        if (start) q.set('start', start);
        return {
          kind: 'youtube', vertical, id,
          embed: `https://www.youtube.com/embed/${id}?${q}`,
          watch: vertical ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}${start ? '&t=' + start + 's' : ''}`,
          thumbs: [`https://i.ytimg.com/vi/${id}/mqdefault.jpg`, `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`]
        };
      }
      if (list && parts[0] === 'playlist') {
        return {
          kind: 'youtube',
          embed: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&autoplay=1&rel=0`,
          watch: `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`
        };
      }
    }

    /* Vimeo: vimeo.com/123456789 · vimeo.com/123456789/abcdef (unlisted) · player.vimeo.com/video/123 */
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const i = parts[0] === 'video' ? 1 : 0;
      const id = parts[i];
      if (/^\d+$/.test(id)) {
        const hash = u.searchParams.get('h') || (/^[a-f0-9]+$/i.test(parts[i + 1] || '') ? parts[i + 1] : '');
        return {
          kind: 'vimeo', oembed: `https://vimeo.com/${id}${hash ? '/' + hash : ''}`,
          embed: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1${hash ? '&h=' + hash : ''}`,
          watch: `https://vimeo.com/${id}${hash ? '/' + hash : ''}`
        };
      }
    }

    /* TikTok: tiktok.com/@user/video/123 (short vm.tiktok.com links can't be embedded) */
    if (host.endsWith('tiktok.com')) {
      const i = parts.indexOf('video');
      if (i > -1 && /^\d+$/.test(parts[i + 1] || '')) {
        return { kind: 'tiktok', vertical: true, embed: `https://www.tiktok.com/embed/v2/${parts[i + 1]}`, watch: u.href };
      }
    }

    return { kind: 'external', watch: u.href };
  }

  const isVertical = (card, src) =>
    card.dataset.orient ? card.dataset.orient === 'vertical'
      : !!(src && src.vertical) || !!card.closest('.shorts');

  const mmss = s => {
    s = Math.round(s);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  };

  /* ---------- Auto-thumbnails (optional, fails silently) ----------
     • YouTube cards  -> the video's own thumbnail (best quality available)
     • Vimeo cards    -> thumbnail from Vimeo's oEmbed
     • Local videos   -> a frame grabbed from the file, plus its real duration
     A card with its own thumbnail (data-thumb="x.jpg" or an inline
     background-image) is left alone. If anything fails — e.g. opening the page
     from file://, where canvas capture is blocked — the gradient stays. */
  const setThumb = (thumb, url) => { thumb.style.backgroundImage = `url("${url}")`; };

  function probeImage(url, ok) {
    const img = new Image();
    img.onload = () => { if (img.naturalWidth > 200) ok(url); }; // YouTube returns a 120px stub when maxres is missing
    img.src = url;
  }

  $$('a.card').forEach(card => {
    const thumb = card.querySelector('.thumb');
    if (!thumb || card.classList.contains('hero-reel')) return;

    if (card.dataset.thumb) { setThumb(thumb, card.dataset.thumb); return; }
    if (thumb.style.backgroundImage) return;

    const src = parseSource(card.getAttribute('href'));
    card.dataset.kind = src.kind;

    if (src.kind === 'youtube' && src.thumbs) {
      probeImage(src.thumbs[0], u => { setThumb(thumb, u); probeImage(src.thumbs[1], hi => setThumb(thumb, hi)); });
      return;
    }

    if (src.kind === 'vimeo') {
      fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(src.oembed)}&width=640`)
        .then(r => r.json())
        .then(d => d.thumbnail_url && setThumb(thumb, d.thumbnail_url))
        .catch(() => {});
      return;
    }

    if (src.kind !== 'file') return;

    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.src = src.src;

    const release = () => { video.removeAttribute('src'); video.load(); };

    video.addEventListener('loadedmetadata', () => {
      if (!card.dataset.orient) card.dataset.orient = video.videoHeight > video.videoWidth ? 'vertical' : 'wide';
      const tag = card.querySelector('.tag');
      if (tag && isFinite(video.duration)) tag.textContent = mmss(video.duration);
    });
    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 3);
    });
    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        setThumb(thumb, canvas.toDataURL('image/jpeg', .82));
      } catch { /* keep the gradient placeholder */ }
      release();
    }, { once: true });
    video.addEventListener('error', release, { once: true });
  });

  /* ---------- Lightbox player ---------- */
  const dlg = $('#player');
  if (dlg) {
    const media = $('#playerMedia');
    const title = $('#playerTitle');
    const meta = $('#playerMeta');
    const link = $('#playerLink');

    const showLink = (href, label, external) => {
      link.hidden = false;
      link.href = href;
      link.textContent = label;
      if (external) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      else { link.removeAttribute('target'); link.removeAttribute('rel'); }
    };

    const placeholder = msg => {
      media.textContent = '';
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.innerHTML = '<div class="ph-play" aria-hidden="true"></div>';
      const p = document.createElement('p');
      p.className = 'mono';
      p.textContent = msg;
      ph.appendChild(p);
      media.appendChild(ph);
    };

    let ytFrame = null;
    addEventListener('message', e => {
      if (!ytFrame || e.source !== ytFrame.contentWindow || !/youtube/.test(e.origin)) return;
      let d = e.data;
      try { if (typeof d === 'string') d = JSON.parse(d); } catch { return; }
      if (d && d.event === 'onError') {
        placeholder('This video can’t be played here — use the “Watch on YouTube” button instead.');
        ytFrame = null;
      }
    });

    document.addEventListener('click', e => {
      const card = e.target.closest('a.card');
      if (!card || card.dataset.noLightbox) return;
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let "open in new tab" work

      const href = card.getAttribute('href') || '#';
      const src = parseSource(href);

      // a normal web page we can't play or embed -> just navigate
      if (src.kind === 'external') return;

      e.preventDefault();

      media.className = 'player-media';
      dlg.dataset.orient = isVertical(card, src) ? 'vertical' : 'wide';
      link.hidden = true;           // reset the action button every time so nothing stale carries over
      link.removeAttribute('href');
      link.textContent = '';

      const t = card.querySelector('h3');
      const m = card.querySelector('p');
      title.textContent = t ? t.textContent : 'Untitled';
      meta.textContent = m ? m.textContent : '';
      media.textContent = '';

      if (src.kind === 'youtube' || src.kind === 'vimeo' || src.kind === 'tiktok') {
        const frame = document.createElement('iframe');
        frame.src = src.embed;
        frame.title = title.textContent;
        frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        media.appendChild(frame);

        // YouTube: ask the player to report errors (embedding disabled, private video…) and show a clear fallback
        if (src.kind === 'youtube') {
          frame.addEventListener('load', () => {
            try { frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*'); } catch {}
          });
          ytFrame = frame;
        }
        // some videos have embedding disabled (or the page runs from file://) — always offer the original
        showLink(src.watch, { youtube: 'Watch on YouTube', vimeo: 'Watch on Vimeo', tiktok: 'Watch on TikTok' }[src.kind], true);

      } else if (src.kind === 'file') {
        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('controlslist', 'nodownload');
        video.src = src.src;
        video.addEventListener('loadedmetadata', () => {
          // match the dialog to the real shape of the file
          if (!card.dataset.orient) dlg.dataset.orient = video.videoHeight > video.videoWidth ? 'vertical' : 'wide';
        });
        video.addEventListener('error', () => {
          if (!dlg.open) return;
          placeholder('Couldn’t load this file — check the path. A leading “/” means “from the server root”, so use assets/… (no leading slash) if you open index.html directly from disk.');
        });
        media.appendChild(video);

      } else {
        placeholder('Link this card to a video — a local file (assets/…) or a YouTube / Vimeo / TikTok URL — and it will play here.');
        showLink('mailto:michael@email.com', 'Request the full video', false);
      }

      try { dlg.showModal(); } catch { location.href = href; }
    });

    $('#playerClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => {
      ytFrame = null;
      const video = media.querySelector('video');
      if (video) video.pause();
      media.textContent = ''; // removing the iframe also stops YouTube/Vimeo playback
    });
  }

  /* ---------- Hero: tilt the 3D frame toward the pointer ---------- */
  const heroMedia = $('.hero-media');
  const tilt = $('.hero-tilt');
  if (heroMedia && tilt && !reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    heroMedia.addEventListener('pointermove', e => {
      const r = heroMedia.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;   // -.5 … .5
      const y = (e.clientY - r.top) / r.height - .5;
      tilt.classList.add('is-moving');
      tilt.style.setProperty('--ry', (-18 + x * 14).toFixed(2) + 'deg');
      tilt.style.setProperty('--rx', (9 - y * 12).toFixed(2) + 'deg');
    });
    heroMedia.addEventListener('pointerleave', () => {
      tilt.classList.remove('is-moving');
      tilt.style.removeProperty('--ry');
      tilt.style.removeProperty('--rx');
    });
  }

  /* ---------- Footer year ---------- */
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();