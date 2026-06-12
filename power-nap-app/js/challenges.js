/**
 * Challenges — mini-games the user must beat to silence the alarm.
 *
 * Each challenge is started via Challenges.start(name, container, level, onWin).
 *   - level: 1 (easy), 2 (medium), 3 (hard) — snooze penalties can push it higher.
 *   - onWin(): called exactly once when the challenge is fully completed.
 *
 * Challenges.stop() tears down any timers so a challenge can be abandoned
 * (e.g. when the user snoozes).
 */
const Challenges = (() => {
  const cleanups = [];

  function onCleanup(fn) { cleanups.push(fn); }

  function stop() {
    while (cleanups.length) {
      try { cleanups.pop()(); } catch (_) { /* noop */ }
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function header(container, title, progressText) {
    container.appendChild(el("h3", "challenge-title", title));
    const progress = el("div", "challenge-progress", progressText);
    container.appendChild(progress);
    return progress;
  }

  function feedbackEl(container) {
    const fb = el("div", "challenge-feedback");
    container.appendChild(fb);
    return fb;
  }

  function flash(fb, ok, msg) {
    fb.textContent = msg;
    fb.className = "challenge-feedback " + (ok ? "ok" : "err");
  }

  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  /* ================= MATH QUIZ ================= */
  function makeMathProblem(level) {
    if (level <= 1) {
      const a = rand(5, 30), b = rand(5, 30);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    if (level === 2) {
      const a = rand(6, 14), b = rand(6, 14), c = rand(10, 60);
      return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
    }
    const a = rand(11, 24), b = rand(11, 19), c = rand(20, 99), d = rand(2, 9);
    return { text: `${a} × ${b} − ${c} + ${d}`, answer: a * b - c + d };
  }

  function startMath(container, level, onWin) {
    const total = Math.min(2 + level, 5);
    let solved = 0;

    const progress = header(container, "🧮 Math Quiz", "");
    const question = el("div", "math-question");
    container.appendChild(question);

    const row = el("div", "math-input-row");
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.placeholder = "?";
    const submit = el("button", "btn btn-primary", "Answer");
    row.append(input, submit);
    container.appendChild(row);
    const fb = feedbackEl(container);

    let problem;
    function next() {
      problem = makeMathProblem(level);
      question.textContent = problem.text + " = ?";
      progress.textContent = `Problem ${solved + 1} of ${total}`;
      input.value = "";
      input.focus();
    }

    function check() {
      if (input.value.trim() === "") return;
      if (Number(input.value) === problem.answer) {
        solved++;
        NapAudio.blip("good");
        if (solved >= total) { onWin(); return; }
        flash(fb, true, "Correct! Keep going…");
        next();
      } else {
        NapAudio.blip("bad");
        flash(fb, false, "Wrong — try again. The alarm isn't going anywhere.");
        input.value = "";
        input.focus();
      }
    }

    submit.addEventListener("click", check);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
    next();
  }

  /* ================= MEMORY SEQUENCE (Simon) ================= */
  function startMemory(container, level, onWin) {
    const padEmojis = ["🌟", "🍀", "🔥", "💧", "🌸", "⚡", "🍉", "🎈", "🌈"];
    const padCount = level <= 1 ? 4 : level === 2 ? 6 : 9;
    const targetLength = Math.min(2 + level, 7);

    const progress = header(container, "🧠 Memory Sequence", "Watch the pattern, then repeat it");
    const grid = el("div", "memory-grid");
    grid.style.gridTemplateColumns = `repeat(3, ${padCount <= 4 ? "100px" : "84px"})`;
    if (padCount === 4) grid.style.gridTemplateColumns = "repeat(2, 100px)";
    container.appendChild(grid);
    const status = el("div", "memory-status", "");
    container.appendChild(status);

    const pads = [];
    for (let i = 0; i < padCount; i++) {
      const pad = el("button", "memory-pad", padEmojis[i]);
      pad.dataset.index = i;
      grid.appendChild(pad);
      pads.push(pad);
    }

    const sequence = [];
    let playerPos = 0;
    let accepting = false;
    const timers = [];
    onCleanup(() => timers.forEach(clearTimeout));

    function lightUp(index, delay, duration = 420) {
      timers.push(setTimeout(() => {
        pads[index].classList.add("lit");
        NapAudio.padTone(index);
        timers.push(setTimeout(() => pads[index].classList.remove("lit"), duration));
      }, delay));
    }

    function playSequence() {
      accepting = false;
      status.textContent = `Watch carefully… (round ${sequence.length} of ${targetLength})`;
      const gap = level >= 3 ? 480 : 620;
      sequence.forEach((idx, i) => lightUp(idx, 400 + i * gap));
      timers.push(setTimeout(() => {
        accepting = true;
        playerPos = 0;
        status.textContent = "Your turn — repeat the pattern!";
      }, 400 + sequence.length * gap));
    }

    function nextRound() {
      sequence.push(rand(0, padCount - 1));
      playSequence();
    }

    grid.addEventListener("click", (e) => {
      const pad = e.target.closest(".memory-pad");
      if (!pad || !accepting) return;
      const idx = Number(pad.dataset.index);
      NapAudio.padTone(idx);

      if (idx === sequence[playerPos]) {
        pad.classList.add("good");
        timers.push(setTimeout(() => pad.classList.remove("good"), 220));
        playerPos++;
        if (playerPos === sequence.length) {
          accepting = false;
          if (sequence.length >= targetLength) { onWin(); return; }
          status.textContent = "Nice! Sequence grows…";
          timers.push(setTimeout(nextRound, 800));
        }
      } else {
        accepting = false;
        NapAudio.blip("bad");
        pad.classList.add("bad");
        timers.push(setTimeout(() => pad.classList.remove("bad"), 400));
        status.textContent = "Wrong pad! The whole sequence replays…";
        timers.push(setTimeout(playSequence, 1100));
      }
    });

    timers.push(setTimeout(nextRound, 600));
  }

  /* ================= TYPING TEST ================= */
  const PHRASES = {
    1: [
      "rise and shine",
      "good morning world",
      "naps are wonderful",
      "wide awake now",
    ],
    2: [
      "The early bird catches the worm every time",
      "A short nap restores the mind and body",
      "Coffee after a power nap works wonders",
    ],
    3: [
      "Energy and persistence conquer all things, said Benjamin Franklin",
      "The quick brown fox jumps over the lazy dog at dawn",
      "Discipline is choosing what you want most over what you want now",
    ],
  };

  function startTyping(container, level, onWin) {
    const pool = PHRASES[Math.min(level, 3)] || PHRASES[3];
    const phrase = pool[rand(0, pool.length - 1)];

    header(container, "⌨️ Typing Test", "Type the phrase exactly — capitalization counts");
    const target = el("div", "typing-target");
    container.appendChild(target);

    const input = document.createElement("input");
    input.className = "typing-input";
    input.placeholder = "Type here…";
    input.autocomplete = "off";
    input.spellcheck = false;
    // pasting would defeat the purpose
    input.addEventListener("paste", (e) => e.preventDefault());
    container.appendChild(input);
    const fb = feedbackEl(container);

    function render() {
      target.innerHTML = "";
      const typed = input.value;
      for (let i = 0; i < phrase.length; i++) {
        const span = document.createElement("span");
        span.textContent = phrase[i];
        if (i < typed.length) span.className = typed[i] === phrase[i] ? "t-ok" : "t-bad";
        target.appendChild(span);
      }
    }

    input.addEventListener("input", () => {
      render();
      if (input.value === phrase) {
        NapAudio.blip("good");
        onWin();
      } else if (!phrase.startsWith(input.value)) {
        flash(fb, false, "Typo! Fix it to continue.");
      } else {
        fb.textContent = "";
      }
    });

    render();
    input.focus();
  }

  /* ================= BUBBLE POP ================= */
  function startBubbles(container, level, onWin) {
    const total = 6 + level * 3;
    const decoyChance = level >= 2 ? 0.3 : 0;
    const lifetime = level <= 1 ? 2600 : level === 2 ? 1900 : 1400;
    let popped = 0;

    const progress = header(container, "🎯 Bubble Pop", "");
    const field = el("div", "bubble-field");
    container.appendChild(field);
    const fb = feedbackEl(container);

    const timers = [];
    onCleanup(() => timers.forEach(clearTimeout));

    function updateProgress() {
      progress.textContent = `Pop the purple bubbles: ${popped} / ${total}` +
        (decoyChance ? " — avoid the gray decoys!" : "");
    }

    function spawn() {
      if (popped >= total) return;
      const isDecoy = Math.random() < decoyChance;
      const size = rand(46, 76);
      const bubble = el("button", "bubble" + (isDecoy ? " decoy" : ""), isDecoy ? "✖" : "●");
      bubble.style.width = bubble.style.height = size + "px";
      bubble.style.left = rand(0, Math.max(0, field.clientWidth - size)) + "px";
      bubble.style.top = rand(0, Math.max(0, field.clientHeight - size)) + "px";

      const ttl = setTimeout(() => bubble.remove(), lifetime);
      timers.push(ttl);

      bubble.addEventListener("pointerdown", () => {
        clearTimeout(ttl);
        bubble.remove();
        if (isDecoy) {
          NapAudio.blip("bad");
          popped = Math.max(0, popped - 2);
          flash(fb, false, "Decoy! −2 bubbles.");
        } else {
          NapAudio.blip("tap");
          popped++;
          fb.textContent = "";
        }
        updateProgress();
        if (popped >= total) { onWin(); }
      });

      field.appendChild(bubble);
    }

    const interval = setInterval(() => {
      if (popped >= total) { clearInterval(interval); return; }
      // keep 2-4 bubbles on screen depending on difficulty
      if (field.querySelectorAll(".bubble").length < (level >= 3 ? 4 : 3)) spawn();
    }, 450);
    onCleanup(() => clearInterval(interval));

    updateProgress();
    timers.push(setTimeout(spawn, 300));
  }

  /* ================= PUBLIC API ================= */
  const registry = {
    math: { label: "Math Quiz", run: startMath },
    memory: { label: "Memory Sequence", run: startMemory },
    typing: { label: "Typing Test", run: startTyping },
    bubbles: { label: "Bubble Pop", run: startBubbles },
  };

  function start(name, container, level, onWin) {
    stop();
    container.innerHTML = "";
    let key = name;
    if (!registry[key]) {
      const keys = Object.keys(registry);
      key = keys[Math.floor(Math.random() * keys.length)];
    }
    let won = false;
    registry[key].run(container, Math.max(1, Math.min(level, 4)), () => {
      if (won) return;
      won = true;
      stop();
      onWin(registry[key].label);
    });
    return registry[key].label;
  }

  return { start, stop, names: () => Object.keys(registry) };
})();
