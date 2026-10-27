import narrationIndex from "./narration-index.json" with { type: "json" };
import { isNarrationPath } from "./narration-locales.js";
import { isSpanishAuthoredClip } from "./narration-registry.js";
import musicIndex from "./music-index.json" with { type: "json" };
import lessonMusicIndex from "./lesson-music-index.json" with { type: "json" };
import lessonMusicCatalogue from "./lesson-music-catalogue.json" with { type: "json" };
import { NARRATION_PLAYBACK_RATE } from "./narration-policy.js";

// Exact authored assets only: a plausible same-origin filename is insufficient.
const AUTHORED_CLIPS = new Set(Object.values(narrationIndex).filter(isNarrationPath));
const isAuthoredClip = (source) => typeof source === "string" &&
  (AUTHORED_CLIPS.has(source) || isSpanishAuthoredClip(source));

// An original, sparse pentatonic motif synthesized on this device. Music is an
// optional preference, not a teaching intervention or a claim about wellbeing.
const MOTIF = [60, 64, 67, 64, 62, 69, 67, 64, 60, 62, 64, 67];
const NOTE_INTERVAL_MS = 3200;
const MAX_GAIN = 0.055;
const MUSIC_DUCK = 0.32;
const MUSIC_ATTACK_MS = 200;
const MUSIC_RELEASE_MS = 1200;
const VOICE_EDGE_MS = 80;
const VOLUME_TICK_MS = 20;
const MEDIA_VOLUME_CAPS = Object.freeze({
  standard: 0.12,
  "cat-pilot": 0.5,
});

export class StudioAudio {
  constructor() {
    this._enabled = false;
    this._volume = 0.35;
    this._musicProfile = "standard";
    this._blocked = false;
    this._teaching = false;
    this._disposed = false;
    this._context = null;
    this._master = null;
    this._notes = new Set();
    this._timer = null;
    this._step = 0;
    this._speech = null;
    this._speechVersion = 0;
    this._narration = null;
    this._preparedSource = null;
    this._clip = null;
    this._music = null;
    this._musicSource = null;
    this._musicPlay = null;
    this._musicVersion = 0;
    this._musicUnavailable = null;
    this._volumeRamps = new Map();
    this._musicAssets = new Map(
      ["basic", "intermediate", "expert"].flatMap((level) => {
        const source = musicIndex[level];
        return typeof source === "string" &&
          /^\/music\/clip-[a-f0-9]{64}\.mp3$/.test(source)
          ? [[level, source]]
          : [];
      }),
    );
    this._lessonMusicAssets = new Map(
      Object.entries(lessonMusicCatalogue).flatMap(([id, specification]) => {
        const source = lessonMusicIndex[id];
        return /^[a-z][a-z0-9-]*$/.test(id) &&
          ["basic", "intermediate", "expert"].includes(specification?.level) &&
          typeof source === "string" && /^\/music\/clip-[a-f0-9]{64}\.mp3$/.test(source)
          ? [[id, { level: specification.level, source }]] : [];
      }),
    );
    this._visibilityChanged = () => this._syncMusic();
    globalThis.document?.addEventListener(
      "visibilitychange",
      this._visibilityChanged,
    );
  }

  attachMusic(element, onUnavailable) {
    if (this._disposed) return;
    this._resetMusicMedia();
    this._music = element;
    this._musicUnavailable = onUnavailable;
    this._syncMusic();
  }

  // Call for every lesson selection, including another lesson in the same level.
  selectMusic(level, musicId = null) {
    if (this._disposed) return;
    this._resetMusicMedia();
    if (!["basic", "intermediate", "expert"].includes(level))
      this._enabled = false;
    const authored = this._lessonMusicAssets.get(musicId);
    this._musicSource = authored && authored.level === level
      ? authored.source : this._musicAssets.get(level) ?? null;
    this._step = 0;
    this._syncMusic();
    if (this._enabled && !this._musicSource && !this._context)
      void this.enableMusic();
  }

  _resetMusicMedia() {
    this._musicVersion++;
    this._musicPlay = null;
    const media = this._music;
    if (!media) return;
    this._setImmediateVolume(media, 0);
    media.onerror = null;
    media.pause();
    media.currentTime = 0;
    media.removeAttribute("src");
    media.load();
  }

  _musicFailed(attempt, allowPaused = false) {
    if (
      this._disposed ||
      (this._musicPlay !== attempt &&
        !(
          allowPaused &&
          this._musicPlay === null &&
          this._musicVersion === attempt.version
        ))
    )
      return;
    this._musicVersion++;
    this._musicPlay = null;
    this._enabled = false;
    this._syncMusic();
    this._musicUnavailable?.();
  }

  _playMusicMedia(unlock = false) {
    const media = this._music;
    if (!media || !this._musicSource || this._musicPlay) return;
    if (media.getAttribute("src") !== this._musicSource)
      media.src = this._musicSource;
    media.loop = true;
    // Start the existing element inside the initiating gesture. Fading volume
    // must never defer play() and lose mobile browser playback permission.
    this._setImmediateVolume(media, 0);
    const attempt = { media, version: ++this._musicVersion };
    this._musicPlay = attempt;
    media.onerror = () => this._musicFailed(attempt, true);
    try {
      const pending = media.play();
      // A gesture can unlock the element without sounding over an instruction.
      if (unlock && !this._musicAllowed()) {
        media.pause();
        this._musicPlay = null;
      }
      Promise.resolve(pending).then(
        () => {
          if (this._musicPlay === attempt && !this._musicAllowed()) {
            this._setImmediateVolume(media, 0);
            media.pause();
            this._musicPlay = null;
          }
        },
        (error) => {
          if (unlock && error?.name === "AbortError" && !this._musicAllowed())
            return;
          // An intentional pause can abort unlocking; real errors still disable
          // music, while version checks ignore errors from an old selection.
          this._musicFailed(attempt, unlock);
        },
      );
    } catch {
      this._musicFailed(attempt);
    }
  }

  attachNarration(element) {
    this.stopClip();
    this.cancelPreparedClip();
    this._narration = element;
  }

  prepareClip(source) {
    const media = this._narration;
    if (this._disposed || !media || this._clip || !isAuthoredClip(source)) return false;
    if (this._preparedSource === source && !media.error) return true;
    this.cancelPreparedClip();
    this._preparedSource = source;
    media.preload = "auto";
    media.src = source;
    return true;
  }

  cancelPreparedClip() {
    if (!this._preparedSource || this._clip) return;
    this._preparedSource = null;
    const media = this._narration;
    if (!media) return;
    media.pause();
    media.removeAttribute("src");
    media.preload = "none";
    media.load();
  }

  async playClip(source, onEnd, onUnavailable) {
    this.stopSpeech();
    const media = this._narration;
    const authored = isAuthoredClip(source);
    if (this._disposed || !media || !authored) {
      onEnd?.();
      onUnavailable?.("clip-unavailable");
      return false;
    }
    const prepared = this._preparedSource === source && !media.error;
    if (!prepared) this.cancelPreparedClip();
    this._preparedSource = null;
    const clip = {
      media, timer: null, edgeTimer: null, started: false, waiting: false,
      finish: null,
    };
    clip.finish = (reason = "cancelled") => {
      if (this._clip !== clip) return;
      clearTimeout(clip.timer);
      clearTimeout(clip.edgeTimer);
      media.onended = null;
      media.onerror = null;
      media.ontimeupdate = null;
      media.onplaying = null;
      media.onwaiting = null;
      this._setImmediateVolume(media, 0);
      media.pause();
      media.removeAttribute("src");
      media.preload = "none";
      media.load();
      this._clip = null;
      this._syncMusic();
      onEnd?.(reason);
    };
    const fail = () => {
      if (this._clip !== clip) return;
      clip.finish("failed");
      onUnavailable?.("clip-unavailable");
    };
    this._clip = clip;
    media.onended = () => clip.finish("ended");
    media.onerror = fail;
    // Follow the real media position instead of assuming uninterrupted wall
    // clock playback. A sparse timeupdate event can miss an entire short edge,
    // so poll more closely near the tail. Buffering never advances this fade.
    const monitorEdge = () => {
      clearTimeout(clip.edgeTimer);
      clip.edgeTimer = null;
      if (this._clip !== clip) return;
      if (clip.waiting || media.paused || media.ended) return;
      const remaining = (media.duration - media.currentTime) /
        media.playbackRate * 1000;
      if (Number.isFinite(remaining) && remaining > 0 && remaining <= VOICE_EDGE_MS) {
        this._cancelVolumeRamp(media);
        const progress = remaining / VOICE_EDGE_MS;
        media.volume = 0.85 * progress * progress * (3 - 2 * progress);
      }
      // Completion is deliberately left to the actual ended event.
      clip.edgeTimer = setTimeout(monitorEdge,
        Number.isFinite(remaining) && remaining <= 300 ? VOLUME_TICK_MS : 100);
    };
    const startEnvelope = () => {
      if (this._clip !== clip) return;
      clip.waiting = false;
      if (!clip.started) {
        clip.started = true;
        this._rampVolume(media, 0.85, VOICE_EDGE_MS);
      }
      monitorEdge();
    };
    media.ontimeupdate = monitorEdge;
    media.onplaying = startEnvelope;
    media.onwaiting = () => {
      if (this._clip !== clip) return;
      clip.waiting = true;
      clearTimeout(clip.edgeTimer);
      clip.edgeTimer = null;
    };
    if (!prepared) media.src = source;
    this._setImmediateVolume(media, 0);
    media.preservesPitch = true;
    media.playbackRate = NARRATION_PLAYBACK_RATE;
    // Leave a startup margin for reviewed clips, but bound stalled playback.
    clip.timer = setTimeout(fail, 45000);
    this._syncMusic();
    try {
      await media.play();
      startEnvelope();
      return this._clip === clip;
    } catch {
      fail();
      return false;
    }
  }

  stopClip() {
    this._clip?.finish();
  }

  get musicEnabled() {
    return this._enabled;
  }

  async enableMusic() {
    if (this._disposed) return false;
    if (this._musicSource && this._music) {
      this._enabled = true;
      this._playMusicMedia(true);
      this._syncMusic();
      return this._enabled;
    }
    const AudioContext =
      globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return false;
    this._enabled = true;
    try {
      if (!this._context) {
        this._context = new AudioContext();
        this._master = this._context.createGain();
        this._master.gain.value = 0;
        this._master.connect(this._context.destination);
      }
      await this._context.resume();
      if (this._disposed) return false;
      this._enabled = this._enabled && this._context.state === "running";
      this._syncMusic();
      return this._enabled;
    } catch {
      this._enabled = false;
      this._syncMusic();
      return false;
    }
  }

  setMusicEnabled(enabled) {
    if (this._disposed) return;
    if (enabled) return this.enableMusic();
    this._enabled = false;
    this._syncMusic();
  }

  setVolume(value) {
    if (!Number.isFinite(value) || this._disposed) return;
    this._volume = Math.max(0, Math.min(1, value));
    this._syncMusic();
  }

  setMusicProfile(profile) {
    if (
      this._disposed ||
      typeof profile !== "string" ||
      !Object.prototype.hasOwnProperty.call(MEDIA_VOLUME_CAPS, profile)
    )
      return false;
    this._musicProfile = profile;
    this._syncMusic();
    return true;
  }

  _mediaVolume() {
    return this._volume * MEDIA_VOLUME_CAPS[this._musicProfile];
  }

  setBlocked(blocked) {
    if (this._disposed) return;
    this._blocked = Boolean(blocked);
    this._syncMusic();
  }

  // Teaching changes the mix, not playback authority or position. Safety
  // interruptions still use setBlocked(), which silences music immediately.
  setTeaching(teaching) {
    if (this._disposed) return;
    this._teaching = Boolean(teaching);
    this._syncMusic();
  }

  _musicAllowed() {
    return (
      !this._disposed &&
      this._enabled &&
      !this._blocked &&
      this._volume > 0 &&
      !globalThis.document?.hidden
    );
  }

  _canPlay() {
    return (
      this._musicAllowed() &&
      !(this._musicSource && this._music) &&
      this._context?.state === "running"
    );
  }

  _ducking() {
    return this._teaching || Boolean(this._speech || this._clip);
  }

  _cancelVolumeRamp(media) {
    const ramp = this._volumeRamps.get(media);
    if (!ramp) return;
    clearTimeout(ramp.timer);
    this._volumeRamps.delete(media);
  }

  _setImmediateVolume(media, value) {
    this._cancelVolumeRamp(media);
    media.volume = value;
  }

  _rampVolume(media, target, duration) {
    const previous = this._volumeRamps.get(media);
    if (previous?.target === target) return;
    this._cancelVolumeRamp(media);
    const start = media.volume;
    if (start === target || duration <= 0) {
      media.volume = target;
      return;
    }
    // A bounded, cancellable envelope works with HTML media on mobile without
    // requiring another AudioContext or an additional autoplay permission.
    const steps = Math.max(1, Math.ceil(duration / VOLUME_TICK_MS));
    const ramp = { target, timer: null, step: 0 };
    this._volumeRamps.set(media, ramp);
    const tick = () => {
      if (this._disposed || this._volumeRamps.get(media) !== ramp) return;
      const progress = ++ramp.step / steps;
      const eased = progress * progress * (3 - 2 * progress);
      media.volume = start + (target - start) * eased;
      if (ramp.step === steps) {
        media.volume = target;
        this._volumeRamps.delete(media);
      } else ramp.timer = setTimeout(tick, VOLUME_TICK_MS);
    };
    ramp.timer = setTimeout(tick, VOLUME_TICK_MS);
  }

  _syncMusic() {
    if (this._music) {
      if (this._musicSource && this._musicAllowed()) {
        this._playMusicMedia();
        if (this._musicAllowed() && this._musicPlay) {
          const target = this._mediaVolume() * (this._ducking() ? MUSIC_DUCK : 1);
          this._rampVolume(this._music, target,
            target < this._music.volume ? MUSIC_ATTACK_MS : MUSIC_RELEASE_MS);
        }
      }
      else {
        this._setImmediateVolume(this._music, 0);
        this._musicPlay = null;
        this._music.pause();
      }
    }
    const context = this._context;
    if (!context || !this._master || context.state === "closed") return;
    const active = this._canPlay();
    const gain = this._master.gain;
    gain.cancelScheduledValues(context.currentTime);
    if (active) gain.setTargetAtTime(
      this._volume * MAX_GAIN * (this._ducking() ? MUSIC_DUCK : 1),
      context.currentTime,
      (this._ducking() ? MUSIC_ATTACK_MS : MUSIC_RELEASE_MS) / 3000,
    );
    else gain.setValueAtTime(0, context.currentTime);
    if (!active) {
      clearTimeout(this._timer);
      this._timer = null;
      // User silence takes priority over envelopes. Blocked sessions do not
      // continue generating inaudible notes in the background.
      for (const note of this._notes) {
        try {
          note.oscillator.stop(context.currentTime);
        } catch {
          /* Already stopped. */
        }
      }
      return;
    }
    if (this._timer === null) this._scheduleNote();
  }

  _scheduleNote() {
    if (!this._canPlay()) return;
    const context = this._context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const start = context.currentTime + 0.04;
    const midi = MOTIF[this._step++ % MOTIF.length];
    oscillator.type = "sine";
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.7, start + 0.65);
    envelope.gain.linearRampToValueAtTime(0.35, start + 1.5);
    envelope.gain.linearRampToValueAtTime(0, start + 2.8);
    oscillator.connect(envelope);
    envelope.connect(this._master);
    const note = { oscillator, envelope };
    this._notes.add(note);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this._notes.delete(note);
    };
    oscillator.start(start);
    oscillator.stop(start + 2.85);
    this._timer = setTimeout(() => {
      this._timer = null;
      this._scheduleNote();
    }, NOTE_INTERVAL_MS);
  }

  async speak(text, onEnd, onUnavailable) {
    this.stopSpeech();
    const finishUnavailable = () => {
      if (typeof onEnd === "function") onEnd();
      if (typeof onUnavailable === "function")
        onUnavailable("voice-unavailable");
      return false;
    };
    if (
      this._disposed ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 1200
    ) {
      return finishUnavailable();
    }
    const synth = globalThis.speechSynthesis;
    const Utterance = globalThis.SpeechSynthesisUtterance;
    if (!synth || !Utterance) return finishUnavailable();
    // Never fall back to an unspecified or remote voice. If the browser has
    // not exposed a local voice, the caller keeps its reviewed text visible.
    let voice, utterance;
    try {
      voice = synth
        .getVoices()
        .find(
          (candidate) =>
            candidate.localService === true &&
            /^en(?:-|$)/i.test(candidate.lang),
        );
      if (!voice) return finishUnavailable();
      utterance = new Utterance(text);
    } catch {
      return finishUnavailable();
    }

    const version = ++this._speechVersion;
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.88;
    utterance.pitch = 1;
    utterance.volume = 0.75;
    const speech = { utterance, timer: null, finish: null, failed: false };
    speech.finish = () => {
      if (this._speech !== speech || this._speechVersion !== version) return;
      clearTimeout(speech.timer);
      utterance.onend = null;
      utterance.onerror = null;
      this._speech = null;
      this._syncMusic();
      if (typeof onEnd === "function") onEnd();
    };
    speech.fail = (reason) => {
      if (this._speech !== speech || this._speechVersion !== version) return;
      speech.failed = true;
      speech.finish();
      if (typeof onUnavailable === "function") onUnavailable(reason);
    };
    this._speech = speech;
    this._syncMusic();
    utterance.onend = speech.finish;
    utterance.onerror = () => speech.fail("engine-error");
    // Some implementations omit completion events. A bounded watchdog also
    // prevents a failed speech engine from leaving music permanently paused.
    speech.timer = setTimeout(
      () => {
        if (this._speech !== speech) return;
        // Detach handlers before cancel: some engines synchronously emit errors on cancellation.
        speech.fail("engine-timeout");
        try {
          synth.cancel();
        } catch {
          /* A failed engine cannot block the lesson. */
        }
      },
      Math.min(90000, Math.max(15000, text.length * 120)),
    );
    try {
      synth.speak(utterance);
      return !speech.failed;
    } catch {
      speech.fail("engine-error");
      return false;
    }
  }

  stopSpeech() {
    this.stopClip();
    const speech = this._speech;
    if (!speech) return;
    // Detach before cancel: browsers differ in whether cancel dispatches end.
    speech.utterance.onend = null;
    speech.utterance.onerror = null;
    try {
      globalThis.speechSynthesis?.cancel();
    } catch {
      // Completion and music cleanup must still run if the speech engine fails.
    } finally {
      speech.finish();
    }
  }

  stopAll() {
    this._enabled = false;
    this._teaching = false;
    this._syncMusic();
    this.stopSpeech();
    this.cancelPreparedClip();
    this._resetMusicMedia();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    globalThis.document?.removeEventListener(
      "visibilitychange",
      this._visibilityChanged,
    );
    this.stopAll();
    for (const media of this._volumeRamps.keys()) this._cancelVolumeRamp(media);
    clearTimeout(this._timer);
    this._timer = null;
    for (const { oscillator, envelope } of this._notes) {
      oscillator.onended = null;
      try {
        oscillator.stop();
      } catch {
        /* Already stopped. */
      }
      oscillator.disconnect();
      envelope.disconnect();
    }
    this._notes.clear();
    this._master?.disconnect();
    this._context?.close().catch(() => {});
    this._context = null;
    this._master = null;
  }
}
