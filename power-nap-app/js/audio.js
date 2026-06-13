/**
 * NapAudio — all sound is synthesized with the Web Audio API so the app
 * needs no audio assets and works fully offline.
 *
 * Provides:
 *   - ambient loops (white noise, brown noise, rain) for falling asleep
 *   - an alarm siren with optional escalating volume
 *   - small UI feedback blips for the challenges
 */
const NapAudio = (() => {
  let ctx = null;

  // ambient state
  let ambientNodes = null;

  // alarm state
  let alarmTimer = null;
  let alarmGain = null;
  let alarmStartedAt = 0;
  let escalate = true;

  function context() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /** Create a looping buffer of generated noise. */
  function makeNoiseBuffer(type) {
    const ac = context();
    const seconds = 3;
    const buffer = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === "brown") {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      // white noise; "rain" reuses this but gets heavy low-pass filtering below
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function startAmbient(type) {
    stopAmbient();
    if (!type || type === "none") return;

    const ac = context();
    const src = ac.createBufferSource();
    src.buffer = makeNoiseBuffer(type);
    src.loop = true;

    const gain = ac.createGain();
    gain.gain.value = type === "brown" ? 0.18 : 0.1;

    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = type === "rain" ? 900 : 6000;

    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();

    let lfo = null, lfoGain = null;
    if (type === "rain") {
      // slow swells in volume make filtered noise read as rainfall
      lfo = ac.createOscillator();
      lfo.frequency.value = 0.18;
      lfoGain = ac.createGain();
      lfoGain.gain.value = 0.035;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
    }

    ambientNodes = { src, gain, filter, lfo, lfoGain };
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    try {
      ambientNodes.src.stop();
      if (ambientNodes.lfo) ambientNodes.lfo.stop();
    } catch (_) { /* already stopped */ }
    ambientNodes = null;
  }

  function beepPair() {
    const ac = context();
    const now = ac.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      const t = now + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g).connect(alarmGain);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  function startAlarm(options = {}) {
    stopAlarm();
    escalate = options.escalate !== false;

    const ac = context();
    alarmGain = ac.createGain();
    alarmGain.gain.value = escalate ? 0.15 : 0.6;
    alarmGain.connect(ac.destination);
    alarmStartedAt = Date.now();

    beepPair();
    alarmTimer = setInterval(() => {
      if (escalate && alarmGain) {
        // ramp from 0.15 to 1.0 over ~30 seconds
        const elapsed = (Date.now() - alarmStartedAt) / 1000;
        alarmGain.gain.value = Math.min(1, 0.15 + elapsed * 0.028);
      }
      beepPair();
    }, 900);
  }

  function stopAlarm() {
    if (alarmTimer) clearInterval(alarmTimer);
    alarmTimer = null;
    if (alarmGain) {
      try { alarmGain.disconnect(); } catch (_) { /* noop */ }
      alarmGain = null;
    }
  }

  /** Short UI feedback tone. kind: "good" | "bad" | "tap" */
  function blip(kind) {
    const ac = context();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    const now = ac.currentTime;
    const freq = kind === "good" ? 1320 : kind === "bad" ? 196 : 660;
    osc.type = kind === "bad" ? "sawtooth" : "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.25, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.connect(g).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Tone for a memory pad: each pad index gets its own pitch. */
  function padTone(index) {
    const ac = context();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    const now = ac.currentTime;
    osc.type = "triangle";
    osc.frequency.value = 330 * Math.pow(2, index / 6);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(g).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /** Resume/seed the AudioContext from a user gesture (autoplay policy). */
  function unlock() { context(); }

  return { startAmbient, stopAmbient, startAlarm, stopAlarm, blip, padTone, unlock };
})();
