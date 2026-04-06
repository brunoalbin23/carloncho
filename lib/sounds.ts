import { Audio } from 'expo-av';

export type SoundName = 'card_flip' | 'card_deal' | 'win' | 'lose' | 'chip' | 'pass' | 'shuffle';

const loadedSounds = new Map<SoundName, Audio.Sound>();

// Placeholder map: add local files when available under assets/sounds.
const localSources: Partial<Record<SoundName, number>> = {};

export async function preloadSounds() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    const names = Object.keys(localSources) as SoundName[];
    for (const name of names) {
      const source = localSources[name];
      if (!source) continue;
      const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: false, volume: 0.9 });
      loadedSounds.set(name, sound);
    }
  } catch {
    // Sound is optional; app must keep working if assets are missing.
  }
}

export async function playSound(name: SoundName) {
  try {
    const sound = loadedSounds.get(name);
    if (!sound) return;
    await sound.replayAsync();
  } catch {
    // Ignore sound errors in runtime.
  }
}

export async function unloadSounds() {
  const sounds = [...loadedSounds.values()];
  loadedSounds.clear();
  for (const s of sounds) {
    try {
      await s.unloadAsync();
    } catch {
      // ignore
    }
  }
}
