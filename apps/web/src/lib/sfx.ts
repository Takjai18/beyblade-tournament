/** Lightweight Web Audio beeps for score feedback (no asset files) */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function beep(freq: number, duration = 0.12, type: OscillatorType = "sine", gain = 0.08) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(c.destination);
  const t = c.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration);
}

export const sfx = {
  spin: () => beep(440, 0.1, "triangle", 0.07),
  over: () => beep(523, 0.12, "square", 0.06),
  burst: () => {
    beep(330, 0.08, "sawtooth", 0.06);
    setTimeout(() => beep(220, 0.1, "sawtooth", 0.05), 60);
  },
  xtreme: () => {
    beep(660, 0.08, "square", 0.07);
    setTimeout(() => beep(880, 0.12, "square", 0.08), 70);
    setTimeout(() => beep(1100, 0.15, "triangle", 0.06), 140);
  },
  undo: () => beep(200, 0.15, "sine", 0.06),
  complete: () => {
    beep(523, 0.1);
    setTimeout(() => beep(659, 0.1), 100);
    setTimeout(() => beep(784, 0.2), 200);
  },
  playFinish(type: string) {
    switch (type) {
      case "SPIN":
        this.spin();
        break;
      case "OVER":
        this.over();
        break;
      case "BURST":
        this.burst();
        break;
      case "XTREME":
        this.xtreme();
        break;
      default:
        this.spin();
    }
  },
};
