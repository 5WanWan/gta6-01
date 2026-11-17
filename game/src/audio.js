// Synthesised sound only: no audio files, no network. Engine hum, police siren, gunshots,
// punch thuds, pickup blips and a small procedural music loop, all built from oscillators
// and filtered noise through one WebAudio context. Everything is guarded: if audio is
// unavailable (headless screenshots) every call is a silent no-op.
import { clamp } from './random.js';

const MUSIC_NOTES = [110, 0, 130.8, 0, 98, 0, 146.8, 0, 110, 0, 130.8, 164.8, 98, 0, 123.5, 0];
const MUSIC_STEP = 0.21;

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = 0;
  let musicStep = 0;
  let enabled = false;
  let musicOn = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      // Engine hum: a low sawtooth whose pitch follows speed.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Police siren: a sine that wails between two tones.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 780;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenLfo = context.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.9;
      const sirenLfoGain = context.createGain();
      sirenLfoGain.gain.value = 220;
      sirenLfo.connect(sirenLfoGain);
      sirenLfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!context) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function blip(freq, duration, volume, type) {
    if (!context) return;
    const osc = context.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration);
  }

  return {
    /** Unlock audio from a user gesture; safe to call any time. */
    unlock() {
      if (ensure()) {
        enabled = true;
        resume();
      }
    },
    /** True once the context exists. */
    get ready() {
      return enabled && context !== null;
    },
    /** Engine hum follows the car's speed (0 = silent idle, 1 = flat out). */
    engine(speedRatio, driving) {
      if (!context || !enabled) return;
      const target = driving ? 0.05 + 0.11 * clamp(speedRatio, 0, 1) : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + 130 * clamp(speedRatio, 0, 1), context.currentTime, 0.1);
    },
    /** The two-tone siren fades in while any police chase is on. */
    siren(on) {
      if (!context || !enabled) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, context.currentTime, 0.3);
    },
    gunshot() {
      if (!context || !enabled) return;
      noiseBurst(0.14, 0.5, 1800);
      blip(160, 0.08, 0.25, 'square');
    },
    punch() {
      if (!context || !enabled) return;
      noiseBurst(0.09, 0.35, 500);
    },
    pickup() {
      if (!context || !enabled) return;
      blip(660, 0.09, 0.22);
      setTimeout(() => blip(990, 0.12, 0.22), 70);
    },
    missionDone() {
      if (!context || !enabled) return;
      [523, 659, 784, 1046].forEach((freq, i) => setTimeout(() => blip(freq, 0.18, 0.22), i * 110));
    },
    busted() {
      if (!context || !enabled) return;
      [392, 311, 233].forEach((freq, i) => setTimeout(() => blip(freq, 0.3, 0.22, 'triangle'), i * 180));
    },
    /** The procedural music loop: a bassline plus a hat tick, stepped in update(). */
    music(dt) {
      if (!context || !enabled) return;
      musicTimer -= dt;
      if (musicTimer > 0) return;
      musicTimer += MUSIC_STEP;
      const note = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
      musicStep += 1;
      if (note > 0) {
        const osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = note;
        const gain = context.createGain();
        gain.gain.value = 0.14;
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + MUSIC_STEP * 0.95);
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        osc.stop(context.currentTime + MUSIC_STEP);
      }
      if (musicStep % 2 === 0) noiseBurst(0.03, 0.05, 6000);
    },
    setMusic(on) {
      musicOn = on;
    },
    get musicOn() {
      return musicOn;
    },
  };
}
