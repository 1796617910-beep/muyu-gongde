(() => {
  'use strict';
  const COMBO_WINDOW = 650;
  const shell = document.getElementById('gameShell');
  const woodfish = document.getElementById('woodfish');
  const visual = document.getElementById('woodfishVisual');
  const scoreEl = document.getElementById('score');
  const comboEl = document.getElementById('combo');
  const comboReadout = document.getElementById('comboReadout');
  const effects = document.getElementById('effects');
  const soundToggle = document.getElementById('soundToggle');
  const soundIcon = document.getElementById('soundIcon');
  const soundText = document.getElementById('soundText');
  const mallet = document.getElementById('mallet');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let score = 0, combo = 0, lastHit = 0, effectId = 0, comboTimer = 0;
  let muted = false, audioContext = null, lastInput = 'keyboard';

  const tierFor = n => n >= 40 ? 5 : n >= 20 ? 4 : n >= 10 ? 3 : n >= 5 ? 2 : 1;

  function playKnock(currentCombo) {
    if (muted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    const master = audioContext.createGain(), body = audioContext.createOscillator();
    const overtone = audioContext.createOscillator(), bodyGain = audioContext.createGain();
    const overtoneGain = audioContext.createGain(), filter = audioContext.createBiquadFilter();
    const lift = Math.min(currentCombo, 40) * 1.5;
    body.type = 'sine'; body.frequency.setValueAtTime(280 + lift, now); body.frequency.exponentialRampToValueAtTime(155 + lift * .4, now + .13);
    overtone.type = 'triangle'; overtone.frequency.setValueAtTime(730 + lift * 2.1, now); overtone.frequency.exponentialRampToValueAtTime(390, now + .075);
    bodyGain.gain.setValueAtTime(.62, now); bodyGain.gain.exponentialRampToValueAtTime(.001, now + .19);
    overtoneGain.gain.setValueAtTime(.2, now); overtoneGain.gain.exponentialRampToValueAtTime(.001, now + .08);
    master.gain.setValueAtTime(.75, now); filter.type = 'lowpass'; filter.frequency.setValueAtTime(1800, now);
    body.connect(bodyGain).connect(filter); overtone.connect(overtoneGain).connect(filter); filter.connect(master).connect(audioContext.destination);
    body.start(now); overtone.start(now); body.stop(now + .2); overtone.stop(now + .1);
  }

  function restartAnimation(el) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }

  function makeEffect(tier, id) {
    const root = document.createElement('div');
    root.className = `hit-effect tier-${tier}`;
    root.style.setProperty('--effect-x', `${(id * 29) % 55 - 27}px`);
    const merit = document.createElement('span'); merit.className = 'merit-float'; merit.textContent = '功德 +1'; root.append(merit);
    if (tier >= 3) { const ring = document.createElement('span'); ring.className = 'shockwave ring-one'; root.append(ring); }
    if (tier >= 4) { const ring = document.createElement('span'); ring.className = 'shockwave ring-two'; root.append(ring); }
    const counts = [0, 0, 7, 11, 15, 20], count = reduceMotion ? 0 : counts[tier];
    for (let i = 0; i < count; i++) {
      const seed = (id * 17 + i * 31) % 97, spark = document.createElement('span');
      spark.className = 'spark';
      spark.style.cssText = `--angle:${360 / count * i + seed % 18 - 9}deg;--delay:${seed % 5 * 18}ms;--distance:${62 + tier * 13 + seed % 38}px;--size:${4 + seed % 5}px;--spin:${120 + seed % 180}deg`;
      root.append(spark);
    }
    if (tier === 5 && !reduceMotion) for (let i = 0; i < 12; i++) {
      const rain = document.createElement('span'); rain.className = 'gold-rain';
      rain.style.cssText = `--rain-delay:${i % 5 * 40}ms;--rain-x:${-125 + (i * 47) % 250}px`; root.append(rain);
    }
    effects.append(root);
    while (effects.children.length > 9) effects.firstElementChild.remove();
    setTimeout(() => root.remove(), tier === 5 ? 1250 : 950);
  }

  function strike() {
    const now = performance.now(); combo = now - lastHit <= COMBO_WINDOW ? combo + 1 : 1; lastHit = now;
    score += 1; effectId += 1; const tier = tierFor(combo);
    scoreEl.textContent = String(score); comboEl.textContent = `× ${combo}`; comboReadout.classList.add('is-visible');
    woodfish.setAttribute('aria-label', `敲一下木鱼，当前功德 ${score}`);
    restartAnimation(scoreEl); restartAnimation(visual); makeEffect(tier, effectId); playKnock(combo);
    if (!reduceMotion && lastInput === 'touch' && navigator.vibrate) navigator.vibrate(combo >= 20 ? 16 : 10);
    if (tier >= 4 && !reduceMotion) { shell.classList.remove('pulse-4', 'pulse-5'); void shell.offsetWidth; shell.classList.add(tier === 5 ? 'pulse-5' : 'pulse-4'); }
    clearTimeout(comboTimer); comboTimer = setTimeout(() => { combo = 0; comboEl.textContent = '× 0'; comboReadout.classList.remove('is-visible'); }, COMBO_WINDOW);
  }

  woodfish.addEventListener('pointerdown', e => { lastInput = e.pointerType; mallet.classList.add('is-down'); });
  ['pointerup','pointercancel','pointerleave'].forEach(type => woodfish.addEventListener(type, () => mallet.classList.remove('is-down')));
  woodfish.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') lastInput = 'keyboard'; });
  woodfish.addEventListener('click', strike);
  shell.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; mallet.style.setProperty('--mallet-x', `${e.clientX}px`); mallet.style.setProperty('--mallet-y', `${e.clientY}px`); mallet.dataset.visible = 'true'; });
  shell.addEventListener('pointerleave', () => mallet.dataset.visible = 'false');
  soundToggle.addEventListener('click', () => { muted = !muted; soundToggle.setAttribute('aria-pressed', String(muted)); soundToggle.setAttribute('aria-label', muted ? '开启敲击声音' : '关闭敲击声音'); soundIcon.textContent = muted ? '静' : '声'; soundText.textContent = muted ? '已静音' : '有声音'; });
})();
