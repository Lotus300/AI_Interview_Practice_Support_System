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

const silentWav = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function prepareAutoplayPlayback({ createAudio = () => new Audio() } = {}) {
  const audio = createAudio();
  audio.muted = true;
  audio.src = silentWav;
  let playResult;
  try {
    playResult = audio.play();
  } catch {
    playResult = null;
  }
  const ready = Promise.resolve(playResult)
    .then(() => true, () => false)
    .then(unlocked => {
      audio.pause?.();
      audio.currentTime = 0;
      return unlocked;
    });
  return { audio, ready };
}

export async function createAudioForPlayback(url, preparedPlayback, { createAudio = () => new Audio() } = {}) {
  const audio = preparedPlayback?.audio || createAudio();
  await preparedPlayback?.ready;
  audio.pause?.();
  audio.src = url;
  audio.currentTime = 0;
  audio.muted = false;
  return audio;
}
