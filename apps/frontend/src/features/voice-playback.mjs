export function configurePreviewPlayback(audio, settings, { createAudioContext } = {}) {
  audio.playbackRate = Number(settings.speedScale ?? 1);
  audio.preservesPitch = true;
  const volumeScale = Number(settings.volumeScale ?? 1);

  if (volumeScale <= 1) {
    audio.volume = Math.max(0, volumeScale);
    return null;
  }

  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  const context = createAudioContext?.() || (AudioContextClass ? new AudioContextClass() : null);
  if (!context) {
    audio.volume = 1;
    return null;
  }

  const source = context.createMediaElementSource(audio);
  const gain = context.createGain();
  gain.gain.value = volumeScale;
  source.connect(gain).connect(context.destination);
  return context;
}
