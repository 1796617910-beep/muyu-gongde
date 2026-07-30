(() => {
  "use strict";

  const BOARD_SIZE = 22;
  const START_SNAKE = [
    { x: 11, y: 11 },
    { x: 10, y: 11 },
    { x: 9, y: 11 },
    { x: 8, y: 11 },
  ];
  const vectors = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const opposite = { up: "down", down: "up", left: "right", right: "left" };

  const canvas = document.getElementById("gameCanvas");
  const board = document.getElementById("boardWrap");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const levelEl = document.getElementById("level");
  const levelLabel = document.getElementById("levelLabel");
  const liveText = document.getElementById("liveText");
  const overlay = document.getElementById("overlay");
  const overlayEyebrow = document.getElementById("overlayEyebrow");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayHint = document.getElementById("overlayHint");
  const overlayButton = document.getElementById("overlayButton");
  const soundButton = document.getElementById("soundButton");
  const pauseButton = document.getElementById("pauseButton");

  let snake = START_SNAKE.map((part) => ({ ...part }));
  let food = { x: 16, y: 11 };
  let direction = "right";
  let queuedDirection = "right";
  let score = 0;
  let best = Number(localStorage.getItem("snake-best")) || 0;
  let status = "ready";
  let timer = 0;
  let animation = 0;
  let muted = false;
  let audioContext = null;
  let particles = [];
  let pointerStart = null;

  function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
  }

  function updateUi() {
    const level = 1 + Math.floor(score / 5);
    scoreEl.textContent = String(score).padStart(2, "0");
    bestEl.textContent = String(best).padStart(2, "0");
    levelEl.textContent = String(level).padStart(2, "0");
    levelLabel.textContent = `LEVEL ${String(level).padStart(2, "0")}`;
    canvas.setAttribute("aria-label", `贪吃蛇棋盘，当前分数 ${score}`);
    liveText.textContent =
      status === "running" ? "正在长大" : status === "paused" ? "已暂停" : "等待开始";
    pauseButton.textContent = status === "paused" ? "▶" : "Ⅱ";
    pauseButton.setAttribute("aria-label", status === "paused" ? "继续游戏" : "暂停游戏");

    if (status === "running") {
      overlay.hidden = true;
      return;
    }

    overlay.hidden = false;
    const copy = {
      ready: ["READY?", "准备好了吗？", "按方向键或滑动开始"],
      paused: ["PAUSED", "歇一会儿", "按空格或下方按钮继续"],
      over: ["GAME OVER", `吃到了 ${score} 颗`, "按回车或重新开始"],
    }[status];
    overlayEyebrow.textContent = copy[0];
    overlayTitle.textContent = copy[1];
    overlayHint.textContent = copy[2];
    overlayButton.hidden = status !== "over";
  }

  function makeFood() {
    const blocked = new Set(snake.map((part) => `${part.x},${part.y}`));
    const open = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (!blocked.has(`${x},${y}`)) open.push({ x, y });
      }
    }
    return open[Math.floor(Math.random() * open.length)] || { x: 4, y: 4 };
  }

  function draw() {
    const size = Math.floor(Math.min(board.clientWidth, board.clientHeight));
    if (!size) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);
    const cell = size / BOARD_SIZE;
    const inset = Math.max(1.4, cell * 0.1);

    context.fillStyle = "#20162a";
    roundRect(context, 0, 0, size, size, Math.max(20, size * 0.045));
    context.fill();

    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        context.fillStyle =
          (x + y) % 2 === 0 ? "rgba(255,255,255,.018)" : "rgba(117,230,180,.018)";
        roundRect(
          context,
          x * cell + inset,
          y * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
          Math.max(3, cell * 0.2),
        );
        context.fill();
      }
    }

    const fruitX = (food.x + 0.5) * cell;
    const fruitY = (food.y + 0.53) * cell;
    const fruitRadius = cell * 0.32;
    context.save();
    context.shadowColor = "rgba(255,107,95,.58)";
    context.shadowBlur = cell * 0.72;
    context.fillStyle = "#ff6b5f";
    context.beginPath();
    context.arc(fruitX, fruitY, fruitRadius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.globalAlpha = 0.65;
    context.fillStyle = "#fff4d8";
    context.beginPath();
    context.arc(fruitX - fruitRadius * 0.34, fruitY - fruitRadius * 0.32, fruitRadius * 0.16, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = "#75e6b4";
    context.beginPath();
    context.ellipse(
      fruitX + fruitRadius * 0.18,
      fruitY - fruitRadius,
      fruitRadius * 0.21,
      fruitRadius * 0.48,
      Math.PI / 4,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();

    snake
      .slice()
      .reverse()
      .forEach((part, reverseIndex) => {
        const index = snake.length - 1 - reverseIndex;
        const isHead = index === 0;
        const pad = isHead ? inset * 0.45 : inset;
        const hue = Math.min(index * 1.5, 23);
        context.save();
        context.shadowColor = isHead ? "rgba(201,245,106,.5)" : "rgba(117,230,180,.18)";
        context.shadowBlur = isHead ? cell * 0.65 : cell * 0.18;
        context.fillStyle = isHead
          ? "#d8ff72"
          : `hsl(${91 + hue} 78% ${61 - Math.min(index, 16) * 0.75}%)`;
        roundRect(
          context,
          part.x * cell + pad,
          part.y * cell + pad,
          cell - pad * 2,
          cell - pad * 2,
          cell * (isHead ? 0.36 : 0.3),
        );
        context.fill();
        context.restore();

        if (isHead) {
          const vector = vectors[direction];
          const perpendicular = { x: -vector.y, y: vector.x };
          [-1, 1].forEach((side) => {
            const eyeX =
              (part.x + 0.5 + vector.x * 0.2 + perpendicular.x * 0.19 * side) * cell;
            const eyeY =
              (part.y + 0.5 + vector.y * 0.2 + perpendicular.y * 0.19 * side) * cell;
            context.fillStyle = "#17111f";
            context.beginPath();
            context.arc(eyeX, eyeY, cell * 0.075, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = "#fff4d8";
            context.beginPath();
            context.arc(eyeX - cell * 0.018, eyeY - cell * 0.02, cell * 0.022, 0, Math.PI * 2);
            context.fill();
          });
        }
      });

    particles.forEach((particle) => {
      context.save();
      context.globalAlpha = Math.max(0, particle.life);
      context.fillStyle = particle.color;
      context.shadowColor = particle.color;
      context.shadowBlur = particle.size * 2;
      context.beginPath();
      context.arc(
        (particle.x + 0.5) * cell,
        (particle.y + 0.5) * cell,
        particle.size,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();
    });
  }

  function animateParticles() {
    cancelAnimationFrame(animation);
    const animate = () => {
      particles = particles
        .map((particle) => ({
          ...particle,
          x: particle.x + particle.dx,
          y: particle.y + particle.dy,
          dy: particle.dy + 0.006,
          life: particle.life - 0.035,
        }))
        .filter((particle) => particle.life > 0);
      draw();
      if (particles.length) animation = requestAnimationFrame(animate);
    };
    animation = requestAnimationFrame(animate);
  }

  function playTone(kind) {
    if (muted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === "suspended") audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = kind === "eat" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(kind === "eat" ? 420 : 190, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "eat" ? 760 : 92, now + 0.16);
    gain.gain.setValueAtTime(kind === "eat" ? 0.12 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === "eat" ? 0.14 : 0.28));
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, Math.max(70, 152 - Math.floor(score / 5) * 9));
  }

  function tick() {
    if (status !== "running") return;
    direction = queuedDirection;
    const vector = vectors[direction];
    const head = snake[0];
    const nextHead = { x: head.x + vector.x, y: head.y + vector.y };
    const hitWall =
      nextHead.x < 0 ||
      nextHead.y < 0 ||
      nextHead.x >= BOARD_SIZE ||
      nextHead.y >= BOARD_SIZE;
    const hitSelf = snake.some(
      (part, index) =>
        index < snake.length - 1 && part.x === nextHead.x && part.y === nextHead.y,
    );

    if (hitWall || hitSelf) {
      status = "over";
      best = Math.max(best, score);
      localStorage.setItem("snake-best", String(best));
      playTone("over");
      if (navigator.vibrate) navigator.vibrate([35, 40, 55]);
      updateUi();
      draw();
      return;
    }

    const nextSnake = [nextHead, ...snake];
    const ate = nextHead.x === food.x && nextHead.y === food.y;
    if (ate) {
      score += 1;
      best = Math.max(best, score);
      localStorage.setItem("snake-best", String(best));
      snake = nextSnake;
      food = makeFood();
      particles = Array.from({ length: 12 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 12;
        return {
          x: nextHead.x,
          y: nextHead.y,
          dx: Math.cos(angle) * (0.045 + (index % 3) * 0.009),
          dy: Math.sin(angle) * (0.045 + (index % 3) * 0.009),
          life: 1,
          size: 2.5 + (index % 3),
          color: index % 2 ? "#ff6b5f" : "#fff4d8",
        };
      });
      playTone("eat");
      animateParticles();
    } else {
      nextSnake.pop();
      snake = nextSnake;
      draw();
    }
    updateUi();
    schedule();
  }

  function start() {
    if (status !== "ready") return;
    status = "running";
    updateUi();
    schedule();
  }

  function setDirection(next) {
    if (status === "over" || status === "paused" || opposite[queuedDirection] === next) return;
    queuedDirection = next;
    start();
  }

  function restart() {
    clearTimeout(timer);
    snake = START_SNAKE.map((part) => ({ ...part }));
    food = { x: 16, y: 11 };
    direction = "right";
    queuedDirection = "right";
    score = 0;
    particles = [];
    status = "ready";
    updateUi();
    draw();
  }

  function togglePause() {
    if (status === "running") {
      clearTimeout(timer);
      status = "paused";
    } else if (status === "paused") {
      status = "running";
      schedule();
    }
    updateUi();
  }

  const keyMap = {
    ArrowUp: "up",
    w: "up",
    W: "up",
    ArrowDown: "down",
    s: "down",
    S: "down",
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right",
  };

  addEventListener("keydown", (event) => {
    const next = keyMap[event.key];
    if (next) {
      event.preventDefault();
      setDirection(next);
    } else if (event.key === " ") {
      event.preventDefault();
      togglePause();
    } else if (event.key === "Enter" && status === "over") {
      restart();
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return start();
    setDirection(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "down"
          : "up",
    );
  });

  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => setDirection(button.dataset.direction));
  });
  document.getElementById("restartButton").addEventListener("click", restart);
  overlayButton.addEventListener("click", restart);
  pauseButton.addEventListener("click", togglePause);
  soundButton.addEventListener("click", () => {
    muted = !muted;
    soundButton.textContent = muted ? "静" : "声";
    soundButton.setAttribute("aria-label", muted ? "开启音效" : "关闭音效");
    soundButton.setAttribute("aria-pressed", String(muted));
  });

  new ResizeObserver(draw).observe(board);
  bestEl.textContent = String(best).padStart(2, "0");
  updateUi();
  draw();
})();
