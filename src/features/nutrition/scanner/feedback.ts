/** Feedback sonoro e tattile quando un codice viene riconosciuto. */
let ctx: AudioContext | null = null;

/** Va chiamata dentro un tocco o un clic (iPhone sblocca l'audio solo così). */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* audio non disponibile */ }
}

export function beep() {
  try {
    unlockAudio();
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 1760;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.13);
  } catch { /* nessun suono */ }
  try { navigator.vibrate?.(60); } catch { /* nessuna vibrazione */ }
}

/** Ultimo codice aggiunto: evita di rileggerlo subito quando si torna allo scanner. */
export const lastHandled = { code: '', at: 0 };
