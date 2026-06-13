/**
 * NapForge — main app controller.
 * Screens: setup -> nap (countdown) -> alarm (challenge) -> awake (summary)
 */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const RING_CIRCUMFERENCE = 2 * Math.PI * 118;

  /* ================= STATE ================= */
  const state = {
    napMinutes: 0,        // duration of the current nap segment (incl. extensions)
    napTotalSeconds: 0,
    remainingSeconds: 0,
    tickTimer: null,
    challengeChoice: "random",
    difficulty: "medium",
    ambient: "none",
    snoozesUsed: 0,
    alarmShownAt: 0,
    vibrateTimer: null,
    wakeLock: null,
  };

  const settings = loadSettings();

  function loadSettings() {
    const defaults = {
      snoozeLength: 5,
      maxSnoozes: 2,
      escalate: true,
      vibrate: true,
      wakeLock: true,
      snoozePenalty: true,
      theme: "dark",
    };
    try {
      return { ...defaults, ...(JSON.parse(localStorage.getItem("napforge.settings.v1")) || {}) };
    } catch (_) {
      return defaults;
    }
  }

  function saveSettings() {
    localStorage.setItem("napforge.settings.v1", JSON.stringify(settings));
  }

  /* ================= SCREENS ================= */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("#" + id).classList.add("active");
  }

  /* ================= WAKE LOCK ================= */
  async function acquireWakeLock() {
    if (!settings.wakeLock || !("wakeLock" in navigator)) return;
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
    } catch (_) { /* not critical */ }
  }

  function releaseWakeLock() {
    if (state.wakeLock) {
      state.wakeLock.release().catch(() => {});
      state.wakeLock = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    // wake locks are released when the tab is hidden; re-acquire on return
    if (document.visibilityState === "visible" && state.tickTimer) acquireWakeLock();
  });

  /* ================= NAP TIMER ================= */
  function startNap(minutes) {
    NapAudio.unlock();
    state.napMinutes = minutes;
    state.napTotalSeconds = minutes * 60;
    state.remainingSeconds = state.napTotalSeconds;
    state.snoozesUsed = 0;
    state.challengeChoice = $("#challenge-select").value;
    state.difficulty = $("#difficulty-select").value;
    state.ambient = $("#ambient-select").value;

    NapAudio.startAmbient(state.ambient);
    $("#ambient-hint").textContent =
      state.ambient !== "none"
        ? "Ambient sound is playing — keep this tab open and volume comfortable."
        : "Keep this tab open so the alarm can ring.";

    acquireWakeLock();
    renderCountdown();
    showScreen("screen-nap");
    state.tickTimer = setInterval(tick, 1000);
  }

  function tick() {
    state.remainingSeconds--;
    renderCountdown();
    if (state.remainingSeconds <= 0) {
      stopTicking();
      fireAlarm();
    }
  }

  function stopTicking() {
    clearInterval(state.tickTimer);
    state.tickTimer = null;
  }

  function renderCountdown() {
    const m = Math.floor(state.remainingSeconds / 60);
    const s = state.remainingSeconds % 60;
    $("#nap-time").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    const wakeAt = new Date(Date.now() + state.remainingSeconds * 1000);
    $("#nap-wake-at").textContent =
      "wakes at " + wakeAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const fraction = state.napTotalSeconds > 0 ? state.remainingSeconds / state.napTotalSeconds : 0;
    $(".ring-fg").style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
  }

  function cancelNap() {
    stopTicking();
    NapAudio.stopAmbient();
    releaseWakeLock();
    NapStats.record({
      minutes: Math.round((state.napTotalSeconds - state.remainingSeconds) / 60),
      challenge: "—",
      snoozes: 0,
      dismissSeconds: null,
      completed: false,
    });
    showScreen("screen-setup");
  }

  /* ================= ALARM + CHALLENGE ================= */
  function difficultyLevel() {
    const base = { easy: 1, medium: 2, hard: 3 }[state.difficulty] || 2;
    const penalty = settings.snoozePenalty ? state.snoozesUsed : 0;
    return base + penalty;
  }

  function startVibration() {
    if (!settings.vibrate || !navigator.vibrate) return;
    navigator.vibrate([400, 200, 400]);
    state.vibrateTimer = setInterval(() => navigator.vibrate([400, 200, 400]), 1200);
  }

  function stopVibration() {
    if (state.vibrateTimer) clearInterval(state.vibrateTimer);
    state.vibrateTimer = null;
    if (navigator.vibrate) navigator.vibrate(0);
  }

  function fireAlarm() {
    NapAudio.stopAmbient();
    NapAudio.startAlarm({ escalate: settings.escalate });
    startVibration();
    state.alarmShownAt = Date.now();

    const level = difficultyLevel();
    const label = Challenges.start(
      state.challengeChoice,
      $("#challenge-area"),
      level,
      onChallengeWon
    );
    $("#alarm-subtitle").textContent =
      `Beat “${label}” to stop the alarm` +
      (state.snoozesUsed > 0 ? ` — snooze penalty active (level ${level})` : "");

    updateSnoozeButton();
    showScreen("screen-alarm");
  }

  function updateSnoozeButton() {
    const left = settings.maxSnoozes - state.snoozesUsed;
    const btn = $("#snooze-btn");
    btn.disabled = left <= 0;
    $("#snooze-info").textContent = left > 0 ? `(${settings.snoozeLength} min, ${left} left)` : "(none left)";
    $("#snooze-warning").textContent =
      left > 0 && settings.snoozePenalty
        ? "Warning: each snooze makes the next challenge harder."
        : left <= 0
          ? "No snoozes left — you have to beat the challenge!"
          : "";
  }

  function snooze() {
    if (state.snoozesUsed >= settings.maxSnoozes) return;
    state.snoozesUsed++;
    Challenges.stop();
    NapAudio.stopAlarm();
    stopVibration();

    state.napTotalSeconds = settings.snoozeLength * 60;
    state.remainingSeconds = state.napTotalSeconds;
    NapAudio.startAmbient(state.ambient);
    renderCountdown();
    showScreen("screen-nap");
    state.tickTimer = setInterval(tick, 1000);
  }

  function onChallengeWon(challengeLabel) {
    NapAudio.stopAlarm();
    stopVibration();
    releaseWakeLock();
    NapAudio.blip("good");

    const dismissSeconds = Math.round((Date.now() - state.alarmShownAt) / 1000);
    NapStats.record({
      minutes: state.napMinutes + state.snoozesUsed * settings.snoozeLength,
      challenge: challengeLabel,
      snoozes: state.snoozesUsed,
      dismissSeconds,
      completed: true,
    });

    $("#awake-summary").textContent =
      `You napped for ${state.napMinutes + state.snoozesUsed * settings.snoozeLength} minutes ` +
      `and beat “${challengeLabel}” to wake up.`;

    const s = NapStats.summary();
    $("#awake-stats").innerHTML = `
      <div class="awake-stat"><b>${dismissSeconds}s</b><span>to dismiss</span></div>
      <div class="awake-stat"><b>${state.snoozesUsed}</b><span>snoozes</span></div>
      <div class="awake-stat"><b>${s.streak}🔥</b><span>day streak</span></div>
    `;
    showScreen("screen-awake");
  }

  /* ================= STATS MODAL ================= */
  function openStats() {
    const s = NapStats.summary();
    $("#stats-content").innerHTML = `
      <div class="stat-tile"><b>${s.naps}</b><span>naps completed</span></div>
      <div class="stat-tile"><b>${s.totalMinutes}</b><span>minutes napped</span></div>
      <div class="stat-tile"><b>${s.avgDismiss !== null ? s.avgDismiss + "s" : "—"}</b><span>avg dismiss time</span></div>
      <div class="stat-tile"><b>${s.streak}🔥</b><span>day streak</span></div>
    `;
    const list = $("#stats-history");
    list.innerHTML = "";
    if (!s.history.length) {
      const li = document.createElement("li");
      li.textContent = "No naps yet — go take one!";
      list.appendChild(li);
    }
    s.history.slice(0, 12).forEach((h) => {
      const li = document.createElement("li");
      const date = new Date(h.at).toLocaleString([], {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      li.innerHTML = h.completed
        ? `<span>${date}</span><b>${h.minutes} min · ${h.challenge}${h.snoozes ? ` · ${h.snoozes}😪` : ""}</b>`
        : `<span>${date}</span><b>cancelled</b>`;
      list.appendChild(li);
    });
    $("#stats-modal").showModal();
  }

  /* ================= SETTINGS MODAL ================= */
  function openSettings() {
    $("#set-snooze-length").value = settings.snoozeLength;
    $("#set-max-snoozes").value = settings.maxSnoozes;
    $("#set-escalate").checked = settings.escalate;
    $("#set-vibrate").checked = settings.vibrate;
    $("#set-wakelock").checked = settings.wakeLock;
    $("#set-snooze-penalty").checked = settings.snoozePenalty;
    $("#settings-modal").showModal();
  }

  function applySettings() {
    settings.snoozeLength = Math.max(1, Math.min(15, Number($("#set-snooze-length").value) || 5));
    settings.maxSnoozes = Math.max(0, Math.min(5, Number($("#set-max-snoozes").value) || 0));
    settings.escalate = $("#set-escalate").checked;
    settings.vibrate = $("#set-vibrate").checked;
    settings.wakeLock = $("#set-wakelock").checked;
    settings.snoozePenalty = $("#set-snooze-penalty").checked;
    saveSettings();
  }

  /* ================= THEME ================= */
  function applyTheme() {
    document.body.dataset.theme = settings.theme;
    $("#theme-btn").textContent = settings.theme === "dark" ? "🌙" : "☀️";
  }

  /* ================= EVENT WIRING ================= */
  document.querySelectorAll(".preset-card").forEach((card) => {
    card.addEventListener("click", () => startNap(Number(card.dataset.minutes)));
  });

  $("#custom-start").addEventListener("click", () => {
    const minutes = Number($("#custom-minutes").value);
    if (minutes >= 1 && minutes <= 180) startNap(minutes);
  });

  $("#nap-extend").addEventListener("click", () => {
    state.remainingSeconds += 5 * 60;
    state.napTotalSeconds += 5 * 60;
    state.napMinutes += 5;
    renderCountdown();
  });

  $("#nap-cancel").addEventListener("click", cancelNap);

  $("#nap-test-alarm").addEventListener("click", () => {
    stopTicking();
    fireAlarm();
  });

  $("#snooze-btn").addEventListener("click", snooze);

  $("#awake-done").addEventListener("click", () => showScreen("screen-setup"));

  $("#stats-btn").addEventListener("click", openStats);
  $("#stats-close").addEventListener("click", () => $("#stats-modal").close());
  $("#stats-reset").addEventListener("click", () => {
    NapStats.reset();
    openStats();
  });

  $("#settings-btn").addEventListener("click", openSettings);
  $("#settings-close").addEventListener("click", () => {
    applySettings();
    $("#settings-modal").close();
  });

  $("#theme-btn").addEventListener("click", () => {
    settings.theme = settings.theme === "dark" ? "light" : "dark";
    saveSettings();
    applyTheme();
  });

  // Warn before leaving mid-nap — closing the tab kills the alarm.
  window.addEventListener("beforeunload", (e) => {
    if (state.tickTimer) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  applyTheme();
  showScreen("screen-setup");
})();
