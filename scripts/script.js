'use strict';

(function () {
  const STORAGE_KEYS = {
    theme: 'rl_theme',
    sound: 'rl_sound',
    haptic: 'rl_haptic',
  };

  const THEME_COLORS = {
    light: { themeColor: '#EFECE2', appleStatusBar: 'default' },
    dark: { themeColor: '#222222', appleStatusBar: 'black-translucent' },
  };

  const DICE_FACES = [1, 2, 3, 4, 5, 6];

  // DOM references
  const rootEl = document.documentElement;
  const themeColorMeta = document.getElementById('themeColorMeta');
  const appleStatusBarMeta = document.getElementById('appleStatusBarMeta');
  const dice1El = document.getElementById('dice1');
  const dice2El = document.getElementById('dice2');
  const diceImg1 = document.getElementById('diceImg1');
  const diceImg2 = document.getElementById('diceImg2');
  const diceContainer = document.getElementById('diceContainer');
  const rollBtn = document.getElementById('rollBtn');
  const themeToggleBtn = document.getElementById('themeToggle');
  const soundToggleBtn = document.getElementById('soundToggle');
  const hapticToggleBtn = document.getElementById('hapticToggle');
  const installBtn = document.getElementById('installBtn');
  const iosInstallModal = document.getElementById('iosInstallModal');
  const closeIosModalBtn = document.getElementById('closeIosModalBtn');
  const preloaderEl = document.getElementById('preloader_malc');

  // State
  let isRolling = false;
  let activeTimeouts = [];
  let soundEnabled = readBoolSetting(STORAGE_KEYS.sound, true);
  let hapticEnabled = readBoolSetting(STORAGE_KEYS.haptic, true);
  let wakeLockSentinel = null;
  let deferredInstallPrompt = null;

  // Storage helpers
  function readBoolSetting(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      if (value === 'true') return true;
      if (value === 'false') return false;
    } catch (_e) {}
    return fallback;
  }

  function writeSetting(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (_e) {}
  }

  // Uniform random integer in [min, max]
  function randomInt(min, max) {
    const range = max - min + 1;
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const limit = Math.floor(0xffffffff / range) * range;
      const buf = new Uint32Array(1);
      let num;
      do {
        window.crypto.getRandomValues(buf);
        num = buf[0];
      } while (num >= limit);
      return min + (num % range);
    }
    return Math.floor(Math.random() * range) + min;
  }

  function randomFaceExcept(prevFace) {
    let next = randomInt(1, 6);
    if (next === prevFace) {
      next = (next % 6) + 1;
    }
    return next;
  }

  // Preload SVG dice faces to avoid flicker during roll
  function preloadDiceImages() {
    DICE_FACES.forEach((face) => {
      const img = new Image();
      img.src = `./pictures/${face}.svg`;
    });
  }

  // =========================================================
  // Theme (Light / Dark)
  // =========================================================
  function applyTheme(theme) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    rootEl.setAttribute('data-theme', normalized);
    const metaConfig = THEME_COLORS[normalized];
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', metaConfig.themeColor);
    }
    if (appleStatusBarMeta) {
      appleStatusBarMeta.setAttribute('content', metaConfig.appleStatusBar);
    }
    if (themeToggleBtn) {
      themeToggleBtn.setAttribute(
        'title',
        normalized === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'
      );
    }
    writeSetting(STORAGE_KEYS.theme, normalized);
  }

  function initTheme() {
    const current = rootEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current);

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const next = rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        soundEngine.playUiClick();
        vibrate(12);
      });
    }
  }

  // =========================================================
  // Haptic Feedback (Vibration API)
  // =========================================================
  const supportsVibration = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  function vibrate(pattern) {
    if (!hapticEnabled || !supportsVibration) return;
    try {
      navigator.vibrate(pattern);
    } catch (_e) {}
  }

  function initHaptics() {
    if (!hapticToggleBtn) return;
    if (!supportsVibration) {
      hapticToggleBtn.hidden = true;
      return;
    }

    hapticToggleBtn.hidden = false;
    hapticToggleBtn.setAttribute('aria-pressed', String(hapticEnabled));

    hapticToggleBtn.addEventListener('click', () => {
      hapticEnabled = !hapticEnabled;
      hapticToggleBtn.setAttribute('aria-pressed', String(hapticEnabled));
      writeSetting(STORAGE_KEYS.haptic, hapticEnabled);
      soundEngine.playUiClick();
      if (hapticEnabled) {
        vibrate(18);
      }
    });
  }

  // =========================================================
  // Sound Engine (Web Audio API + MP3 samples + synth ticks)
  // =========================================================
  const soundEngine = (function createSoundEngine() {
    let audioCtx = null;
    const buffers = { start: null, end: null };
    let loadingStarted = false;

    const fallbackStart = new Audio('./audio/ui-click-start.mp3');
    const fallbackEnd = new Audio('./audio/ui-click-end.mp3');
    fallbackStart.preload = 'auto';
    fallbackEnd.preload = 'auto';

    function getContext() {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    }

    async function loadSample(key, url) {
      const ctx = getContext();
      if (!ctx) return;
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const arrayBuffer = await response.arrayBuffer();
        buffers[key] = await ctx.decodeAudioData(arrayBuffer);
      } catch (_e) {
        // Fallback HTMLAudio will be used if Web Audio decode fails
      }
    }

    function unlockAndPreload() {
      const ctx = getContext();
      if (!ctx || loadingStarted) return;
      loadingStarted = true;
      loadSample('start', './audio/ui-click-start.mp3');
      loadSample('end', './audio/ui-click-end.mp3');
    }

    function playBuffer(key, playbackRate, volume, fallbackAudio) {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (ctx && buffers[key]) {
        try {
          const source = ctx.createBufferSource();
          const gainNode = ctx.createGain();
          source.buffer = buffers[key];
          source.playbackRate.value = playbackRate;
          gainNode.gain.value = volume;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
          source.start(0);
          return;
        } catch (_e) {}
      }

      if (fallbackAudio) {
        try {
          const clone = fallbackAudio.cloneNode();
          clone.volume = volume;
          clone.play().catch(() => {});
        } catch (_e) {}
      }
    }

    // Soft organic wooden dice tumble click synthesized via Web Audio
    function playTick(pitchFactor) {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx || ctx.state !== 'running') return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const baseFreq = (420 + Math.random() * 140) * (pitchFactor || 1);
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, now + 0.028);

        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.03);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.032);
      } catch (_e) {}
    }

    function playUiClick() {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(340, now + 0.035);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } catch (_e) {}
    }

    return {
      unlockAndPreload,
      playStart() {
        unlockAndPreload();
        playBuffer('start', 1.0, 0.85, fallbackStart);
      },
      playEnd(isSecondDie) {
        playBuffer('end', isSecondDie ? 0.94 : 1.03, 0.95, fallbackEnd);
      },
      playTick,
      playUiClick,
    };
  })();

  function initSoundControls() {
    if (!soundToggleBtn) return;
    soundToggleBtn.setAttribute('aria-pressed', String(soundEnabled));

    soundToggleBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggleBtn.setAttribute('aria-pressed', String(soundEnabled));
      writeSetting(STORAGE_KEYS.sound, soundEnabled);
      if (soundEnabled) {
        soundEngine.unlockAndPreload();
        soundEngine.playUiClick();
      }
      vibrate(12);
    });
  }

  // =========================================================
  // Screen Wake Lock (Always keep screen awake)
  // =========================================================
  async function requestWakeLock() {
    if (
      document.visibilityState !== 'visible' ||
      !('wakeLock' in navigator) ||
      wakeLockSentinel
    ) {
      return;
    }

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (wakeLockSentinel === sentinel) {
          wakeLockSentinel = null;
        }
      });
    } catch (_e) {
      // Browser may require a user gesture or battery saver may block wake lock;
      // we will automatically retry on the next user interaction or visibility change.
    }
  }

  function initWakeLock() {
    requestWakeLock();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    });

    const retryOnInteraction = () => {
      requestWakeLock();
      soundEngine.unlockAndPreload();
    };

    window.addEventListener('pointerdown', retryOnInteraction, { passive: true });
    window.addEventListener('keydown', retryOnInteraction, { passive: true });
  }

  // =========================================================
  // Dice Rolling Logic
  // =========================================================
  function clearActiveTimers() {
    activeTimeouts.forEach((id) => clearTimeout(id));
    activeTimeouts = [];
  }

  function setDieFace(imgEl, face) {
    imgEl.src = `./pictures/${face}.svg`;
    imgEl.alt = String(face);
  }

  function rollSingleDie(diceEl, imgEl, totalSteps, isSecondDie, onComplete) {
    let step = 0;
    let currentFace = Number(imgEl.alt) || 1;

    diceEl.classList.remove('is-landed');
    diceEl.classList.add('is-rolling');

    function tick() {
      step += 1;
      const isFinal = step >= totalSteps;
      const nextFace = isFinal ? randomInt(1, 6) : randomFaceExcept(currentFace);
      currentFace = nextFace;
      setDieFace(imgEl, nextFace);

      if (isFinal) {
        diceEl.classList.remove('is-rolling');
        // Force reflow so land animation replays cleanly
        void diceEl.offsetWidth;
        diceEl.classList.add('is-landed');

        soundEngine.playEnd(isSecondDie);
        vibrate(isSecondDie ? [45, 35, 25] : 32);
        onComplete();
        return;
      }

      // Play subtle tumble tick & micro vibration on staggered steps
      if (!isSecondDie || step % 2 === 0) {
        soundEngine.playTick(isSecondDie ? 0.92 : 1.06);
      }
      if (step % 3 === 0) {
        vibrate(8);
      }

      // Smooth deceleration curve (starts snappy ~60ms, slows to ~175ms before landing)
      const progress = step / totalSteps;
      const delay = Math.round(58 + progress * progress * 125);
      const timerId = setTimeout(tick, delay);
      activeTimeouts.push(timerId);
    }

    const initialDelay = isSecondDie ? 35 : 0;
    const startTimer = setTimeout(tick, initialDelay);
    activeTimeouts.push(startTimer);
  }

  function rollDice() {
    if (isRolling) return;

    isRolling = true;
    if (rollBtn) {
      rollBtn.disabled = true;
    }

    requestWakeLock();
    soundEngine.playStart();
    vibrate(25);
    clearActiveTimers();

    // Distinct durations so the two dice land one after the other naturally
    const steps1 = randomInt(9, 12);
    const steps2 = steps1 + randomInt(4, 7);
    let completedCount = 0;

    function handleDieDone() {
      completedCount += 1;
      if (completedCount === 2) {
        isRolling = false;
        if (rollBtn) {
          rollBtn.disabled = false;
        }
      }
    }

    rollSingleDie(dice1El, diceImg1, steps1, false, handleDieDone);
    rollSingleDie(dice2El, diceImg2, steps2, true, handleDieDone);
  }

  function initDiceInteractions() {
    if (rollBtn) {
      rollBtn.addEventListener('click', rollDice);
    }

    if (diceContainer) {
      diceContainer.addEventListener('click', rollDice);
    }

    document.addEventListener('keydown', (event) => {
      if (iosInstallModal && !iosInstallModal.hidden) {
        if (event.key === 'Escape') {
          iosInstallModal.hidden = true;
        }
        return;
      }

      if (event.code === 'Space' || event.key === 'Enter') {
        const tag = event.target && event.target.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') {
          return;
        }
        event.preventDefault();
        rollDice();
      }
    });
  }

  // =========================================================
  // PWA Installation & Service Worker
  // =========================================================
  function isStandaloneMode() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIosDevice() {
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && 'ontouchend' in document);
  }

  function initPWA() {
    // Register Service Worker with relative path & scope (works on GitHub Pages subpaths)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('./service-worker.js', { scope: './' })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }

    if (!installBtn || isStandaloneMode()) {
      return;
    }

    // iOS Safari fallback guide
    if (isIosDevice()) {
      installBtn.hidden = false;
      installBtn.addEventListener('click', () => {
        soundEngine.playUiClick();
        vibrate(12);
        if (iosInstallModal) {
          iosInstallModal.hidden = false;
        }
      });
    }

    // Chromium / Android / Desktop native install prompt
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      installBtn.hidden = false;
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      soundEngine.playUiClick();
      vibrate(15);
      deferredInstallPrompt.prompt();
      try {
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          installBtn.hidden = true;
        }
      } catch (_e) {}
      deferredInstallPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      installBtn.hidden = true;
    });

    if (closeIosModalBtn && iosInstallModal) {
      closeIosModalBtn.addEventListener('click', () => {
        iosInstallModal.hidden = true;
      });
      iosInstallModal.addEventListener('click', (event) => {
        if (event.target === iosInstallModal) {
          iosInstallModal.hidden = true;
        }
      });
    }
  }

  // =========================================================
  // Preloader
  // =========================================================
  function hidePreloader() {
    if (!preloaderEl) return;
    preloaderEl.classList.add('is-hidden');
    setTimeout(() => {
      preloaderEl.style.display = 'none';
    }, 260);
  }

  // Bootstrap
  preloadDiceImages();
  initTheme();
  initSoundControls();
  initHaptics();
  initDiceInteractions();
  initWakeLock();
  initPWA();

  if (document.readyState === 'complete') {
    setTimeout(hidePreloader, 150);
  } else {
    window.addEventListener('load', () => setTimeout(hidePreloader, 180), { once: true });
    // Safety fallback so preloader never hangs
    setTimeout(hidePreloader, 1500);
  }
})();
