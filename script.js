(() => {
  "use strict";

  // Configuracoes principais do jogo.
  const GAME_TIME = 30;
  const MIN_TARGET_SIZE = 64;
  const MAX_TARGET_SIZE = 94;

  const startScreen = document.getElementById("start-screen");
  const gameScreen = document.getElementById("game-screen");
  const endScreen = document.getElementById("end-screen");

  const startBtn = document.getElementById("start-btn");
  const restartBtn = document.getElementById("restart-btn");

  const arena = document.getElementById("arena");
  const target = document.getElementById("target");
  const feedback = document.getElementById("feedback");
  const crosshair = document.getElementById("crosshair");

  const scoreEl = document.getElementById("score");
  const timeEl = document.getElementById("time");
  const highScoreEl = document.getElementById("high-score");
  const accuracyEl = document.getElementById("accuracy");
  const finalScoreEl = document.getElementById("final-score");
  const finalAccuracyEl = document.getElementById("final-accuracy");
  const recordMessageEl = document.getElementById("record-message");

  let score = 0;
  let remainingTime = GAME_TIME;
  let highScore = Number(localStorage.getItem("neon-target-high-score")) || 0;
  let totalShots = 0;
  let totalHits = 0;

  let gameActive = false;
  let gameStart = 0;
  let countdownTimer = null;
  let visibleTimer = null;
  let spawnTimer = null;
  let feedbackTimer = null;
  let targetHitTimer = null;
  let crosshairPulseTimer = null;

  // Contexto de audio criado sob demanda para evitar bloqueios de autoplay.
  let audioContext;

  function setPanel(panel) {
    [startScreen, gameScreen, endScreen].forEach((item) => item.classList.remove("active"));
    panel.classList.add("active");
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    timeEl.textContent = String(remainingTime);
    highScoreEl.textContent = String(highScore);
    accuracyEl.textContent = formatAccuracy();
  }

  function getAccuracy() {
    if (totalShots === 0) return 0;
    return (totalHits / totalShots) * 100;
  }

  function formatAccuracy() {
    return `${getAccuracy().toFixed(1)}%`;
  }

  function getProgress() {
    const elapsed = Math.max(0, (Date.now() - gameStart) / 1000);
    return Math.min(1, elapsed / GAME_TIME);
  }

  function getTargetSize() {
    const progress = getProgress();
    const size = MAX_TARGET_SIZE - (MAX_TARGET_SIZE - MIN_TARGET_SIZE) * progress * 0.85;
    return Math.round(size);
  }

  function getCurrentVisibleDuration() {
    const progress = getProgress();
    return 900 - progress * 540;
  }

  function getCurrentSpawnDelay() {
    const progress = getProgress();
    return 700 - progress * 430;
  }

  function hideTarget() {
    target.classList.remove("visible");
  }

  function placeTargetRandomly() {
    const arenaRect = arena.getBoundingClientRect();
    const size = getTargetSize();
    target.style.setProperty("--target-size", `${size}px`);

    const padding = 12;
    const minX = padding + size / 2;
    const maxX = arenaRect.width - padding - size / 2;
    const minY = padding + size / 2;
    const maxY = arenaRect.height - padding - size / 2;

    const x = minX + Math.random() * Math.max(1, maxX - minX);
    const y = minY + Math.random() * Math.max(1, maxY - minY);

    target.style.left = `${x}px`;
    target.style.top = `${y}px`;
  }

  function showTarget() {
    if (!gameActive) return;

    clearTimeout(visibleTimer);
    placeTargetRandomly();
    target.classList.add("visible");

    visibleTimer = setTimeout(() => {
      hideTarget();
      scheduleNextTarget();
    }, getCurrentVisibleDuration());
  }

  function scheduleNextTarget() {
    if (!gameActive) return;

    clearTimeout(spawnTimer);
    const delay = getCurrentSpawnDelay();
    spawnTimer = setTimeout(showTarget, delay);
  }

  function clearGameTimers() {
    clearInterval(countdownTimer);
    clearTimeout(visibleTimer);
    clearTimeout(spawnTimer);
    clearTimeout(feedbackTimer);
    clearTimeout(targetHitTimer);
    clearTimeout(crosshairPulseTimer);
  }

  function ensureAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  }

  function playTone(frequency, duration, type, volume) {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  function playStartSound() {
    playTone(430, 0.08, "triangle", 0.15);
    setTimeout(() => playTone(620, 0.1, "triangle", 0.16), 90);
  }

  function playHitSound() {
    playTone(840, 0.05, "sine", 0.11);
  }

  function playEndSound() {
    playTone(320, 0.1, "sawtooth", 0.12);
    setTimeout(() => playTone(180, 0.16, "triangle", 0.1), 100);
  }

  function showFeedback() {
    feedback.classList.add("show");
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => feedback.classList.remove("show"), 150);
  }

  function setCrosshairPosition(clientX, clientY) {
    crosshair.style.left = `${clientX}px`;
    crosshair.style.top = `${clientY}px`;
  }

  function handleArenaPointerEnter(event) {
    document.body.classList.add("is-aiming");
    setCrosshairPosition(event.clientX, event.clientY);
  }

  function handleArenaPointerMove(event) {
    setCrosshairPosition(event.clientX, event.clientY);
  }

  function handleArenaPointerLeave() {
    document.body.classList.remove("is-aiming");
  }

  function pulseCrosshair() {
    crosshair.classList.remove("pulse");
    void crosshair.offsetWidth;
    crosshair.classList.add("pulse");

    clearTimeout(crosshairPulseTimer);
    crosshairPulseTimer = setTimeout(() => crosshair.classList.remove("pulse"), 190);
  }

  function flashTargetHit() {
    target.classList.add("hit");
    clearTimeout(targetHitTimer);
    targetHitTimer = setTimeout(() => target.classList.remove("hit"), 130);
  }

  function createParticles(clientX, clientY) {
    const arenaRect = arena.getBoundingClientRect();
    const x = clientX - arenaRect.left;
    const y = clientY - arenaRect.top;

    const colors = ["#30c98b", "#7ed4ff", "#8b96ff", "#ffffff"];
    const count = 12;

    for (let i = 0; i < count; i += 1) {
      const p = document.createElement("span");
      const angle = (Math.PI * 2 * i) / count;
      const distance = 22 + Math.random() * 30;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;

      p.className = "particle";
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.background = colors[i % colors.length];
      p.style.boxShadow = `0 0 14px ${colors[i % colors.length]}`;
      p.style.setProperty("--dx", `${dx}px`);
      p.style.setProperty("--dy", `${dy}px`);

      arena.appendChild(p);
      setTimeout(() => p.remove(), 440);
    }
  }

  function registerHit(event) {
    if (!gameActive) return;

    score += 1;
    totalHits += 1;
    playHitSound();
    showFeedback();
    flashTargetHit();
    pulseCrosshair();
    createParticles(event.clientX, event.clientY);

    hideTarget();
    clearTimeout(visibleTimer);
    scheduleNextTarget();
  }

  function registerShot() {
    if (!gameActive) return;
    totalShots += 1;
    updateHUD();
  }

  function finishGame() {
    gameActive = false;
    clearGameTimers();
    hideTarget();
    playEndSound();

    finalScoreEl.textContent = String(score);
    finalAccuracyEl.textContent = formatAccuracy();

    if (score > highScore) {
      highScore = score;
      localStorage.setItem("neon-target-high-score", String(highScore));
      recordMessageEl.textContent = "Novo recorde! Reflexos de elite.";
      recordMessageEl.style.color = "#67ffb3";
    } else {
      recordMessageEl.textContent = "Continue treinando para bater seu recorde.";
      recordMessageEl.style.color = "#a3afd1";
    }

    updateHUD();
    setPanel(endScreen);
  }

  function startGame() {
    ensureAudioContext();

    score = 0;
    remainingTime = GAME_TIME;
    totalShots = 0;
    totalHits = 0;
    gameStart = Date.now();
    gameActive = true;

    clearGameTimers();
    updateHUD();
    setPanel(gameScreen);
    playStartSound();

    showTarget();

    countdownTimer = setInterval(() => {
      remainingTime -= 1;
      timeEl.textContent = String(Math.max(remainingTime, 0));

      if (remainingTime <= 0) {
        finishGame();
      }
    }, 1000);
  }

  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", startGame);
  target.addEventListener("click", registerHit);

  arena.addEventListener("pointerenter", handleArenaPointerEnter);
  arena.addEventListener("pointermove", handleArenaPointerMove);
  arena.addEventListener("pointerleave", handleArenaPointerLeave);
  arena.addEventListener("click", registerShot);

  updateHUD();
  setPanel(startScreen);
})();