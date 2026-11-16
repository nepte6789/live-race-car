// Original procedural dance score: Neon Sprint, 128 BPM. No recordings or samples.
window.HomeMusic = class {
  constructor(context) {
    this.context = context;
    this.bpm = 128;
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.output.connect(context.destination);
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 5;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.limiter.connect(this.output);
    this.musicBus = context.createGain();
    this.musicBus.connect(this.limiter);
    this.noise = context.createBuffer(
      1,
      context.sampleRate,
      context.sampleRate,
    );
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.volume = 0.1;
    this.enabled = true;
    this.ducked = false;
    this.step = 0;
    this.next = 0;
    this.timer = null;
  }
  level() {
    this.output.gain.setTargetAtTime(
      this.enabled ? this.volume * (this.ducked ? 0.16 : 1) : 0,
      this.context.currentTime,
      0.1,
    );
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(0.35, Number(value) || 0));
    this.level();
  }
  duck(value) {
    this.ducked = !!value;
    this.level();
  }
  toggle() {
    this.enabled = !this.enabled;
    this.level();
    return this.enabled;
  }
  connect(source, at, duration, volume, bus = this.musicBus, filter = null) {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume),
      at + 0.008,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    if (filter) {
      source.connect(filter);
      filter.connect(gain);
    } else source.connect(gain);
    gain.connect(bus);
    source.start(at);
    source.stop(at + duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter?.disconnect();
      gain.disconnect();
    };
  }
  tone(
    midi,
    at,
    duration,
    volume,
    type = "sawtooth",
    detune = 0,
    cutoff = 1800,
  ) {
    const source = this.context.createOscillator(),
      filter = this.context.createBiquadFilter();
    source.type = type;
    source.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    source.detune.value = detune;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.6;
    this.connect(source, at, duration, volume, this.musicBus, filter);
  }
  kick(at) {
    const source = this.context.createOscillator();
    source.frequency.setValueAtTime(150, at);
    source.frequency.exponentialRampToValueAtTime(46, at + 0.12);
    this.connect(source, at, 0.27, 0.72, this.limiter);
    // Pump only the music instruments; speech ducking remains on the master gain.
    this.musicBus.gain.setValueAtTime(0.24, at);
    this.musicBus.gain.exponentialRampToValueAtTime(1, at + 0.19);
  }
  percussion(at, duration, volume, cutoff, type = "highpass") {
    const source = this.context.createBufferSource(),
      filter = this.context.createBiquadFilter();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.value = cutoff;
    this.connect(source, at, duration, volume, this.limiter, filter);
  }
  start() {
    if (this.timer) return;
    this.next = this.context.currentTime + 0.08;
    this.level();
    const schedule = () => {
      const c = this.context;
      if (c.state !== "running" || !this.enabled) {
        this.next = c.currentTime + 0.08;
        return;
      }
      if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
      while (this.next < c.currentTime + 0.25) {
        this.beat(this.step++, this.next);
        this.next += 60 / this.bpm / 4;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 50);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.enabled = false;
    this.level();
  }
  beat(step, at) {
    const chords = [
      [60, 64, 67],
      [57, 60, 64],
      [65, 69, 72],
      [55, 59, 62],
    ];
    const lead = [
      [76, 79, 81, 79, 76, 74, 72, 74],
      [76, 72, 69, 72, 76, 79, 76, 74],
      [77, 81, 84, 81, 79, 77, 76, 72],
      [74, 79, 83, 79, 77, 74, 71, 74],
      [79, 81, 84, 79, 76, 79, 74, 76],
      [81, 79, 76, 72, 74, 76, 79, 76],
      [81, 84, 86, 84, 81, 79, 77, 76],
      [79, 83, 86, 83, 79, 77, 74, 72],
    ];
    const bar = Math.floor(step / 16) % 16,
      part = step % 16;
    const chord = chords[bar % 4],
      drop = bar >= 4 && bar < 12;
    if (part % 4 === 0 && (bar < 14 || part % 8 === 0)) this.kick(at);
    if (part === 4 || part === 12) {
      this.percussion(at, 0.12, 0.2, 1300, "bandpass");
      this.percussion(at + 0.014, 0.08, 0.11, 2400);
    }
    if (part % 2 === 0)
      this.percussion(at, part % 4 === 2 ? 0.11 : 0.035, 0.055, 6500);
    if (drop && part === 15) this.percussion(at, 0.03, 0.035, 8000);
    if ([2, 6, 10, 14].includes(part)) {
      this.tone(chord[0] - 24, at, 0.18, 0.19, "sawtooth", 0, 650);
      this.tone(chord[0] - 24, at, 0.18, 0.11, "sine");
      for (const note of chord)
        this.tone(note, at, 0.16, 0.045, "sawtooth", -7, 2200);
    }
    if (part % 2 === 0) {
      const note = lead[bar % 8][part / 2];
      this.tone(
        note,
        at,
        drop ? 0.2 : 0.16,
        drop ? 0.095 : 0.06,
        "triangle",
        0,
        3500,
      );
      if (drop) this.tone(note, at, 0.15, 0.035, "sawtooth", 8, 2400);
      if (drop && part % 4 === 0)
        this.tone(note, at + (60 / this.bpm) * 0.75, 0.16, 0.018, "triangle");
    }
    if (bar >= 14 && part % 4 === 3)
      this.percussion(at, 0.035, 0.07, 2500, "bandpass");
  }
};
