import { LocaleContext, translate } from "./i18n.jsx";
import {
  use,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ArrowRightIcon,
  ArrowCounterClockwiseIcon,
  PencilSimpleIcon,
  QuestionIcon,
  PauseIcon,
  GearSixIcon,
  MusicNotesIcon,
  PlayIcon,
  CaretLeftIcon,
  HeartIcon,
  SpeakerHighIcon,
  StopIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { StudioAudio } from "./audio.js";
import { initialLesson, lessonReducer } from "./lesson.js";
import { LESSONS, getLesson, getLevel, narrationKey } from "./lesson-catalogue.js";
import { Modal } from "./Modal.jsx";
import { LessonPreview } from "./LessonPreview.jsx";
import DemonstrationErrorBoundary from "./DemonstrationErrorBoundary.js";
import { Home, Brand, Catalogue } from "./Home.jsx";
import { Onboarding } from "./Onboarding.jsx";
import { LanguagePicker } from "./LanguagePicker.jsx";
import { DEFAULT_LANGUAGE, getLanguage, languageAvailableForLevel } from "./languages.js";
import { Settings } from "./Settings.jsx";
import { Privacy } from "./Privacy.jsx";
import { isLessonAvailable, narrationForLocale, releasedLessons } from "./narration-locales.js";
import { createLatestLanguageRequest, loadLocaleLanguage } from "./language-loading.js";
import { authorizeLocaleNarration } from "./narration-registry.js";
import { useScriptedPlayback } from "./useScriptedPlayback.js";
import { useLessonClock } from "./useLessonClock.js";
import { dynamicLocale } from "./locale-dynamic.js";
import LessonTimeline from "./LessonTimeline.jsx";
import "./cat-pilot.css";

let boardPromise;
function loadDemonstrationBoard() {
  if (!boardPromise) boardPromise = import("./DemonstrationBoard.jsx").catch((error) => {
    boardPromise = undefined;
    throw error;
  });
  return boardPromise;
}
// Keep the component identity stable, but give each explicit lesson attempt its
// own promise. React.lazy would retain a rejected import across restarts.
function DemonstrationBoard({ module, ...props }) {
  const { default: Board } = use(module);
  return <Board {...props} />;
}
const identityLesson = (lesson) => lesson;
const identityTitle = (lesson) => lesson?.title ?? null;

export function App() {
  const [lesson, dispatch] = useReducer(lessonReducer, initialLesson);
  const [overlay, setOverlay] = useState(null);
  const [languageLevel, setLanguageLevel] = useState(null);
  const [languageId, setLanguageId] = useState(DEFAULT_LANGUAGE);
  const [localizeLesson, setLocalizeLesson] = useState(() => identityLesson);
  const [localizedTitle, setLocalizedTitle] = useState(() => identityTitle);
  const [localeNarration, setLocaleNarration] = useState(null);
  const [languagePending, setLanguagePending] = useState(null);
  const [languageError, setLanguageError] = useState(false);
  const [languageLoad] = useState(createLatestLanguageRequest);
  const t = (text) => translate(languageId, text);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [boardReady, setBoardReady] = useState(false);
  const [boardUnavailable, setBoardUnavailable] = useState(false);
  const [boardModule, setBoardModule] = useState(null);
  const [replayKey, setReplayKey] = useState(0);
  const [supervised, setSupervised] = useState(false);
  const [cataloguePage, setCataloguePage] = useState(0);
  const [musicOn, setMusicOn] = useState(true);
  const [musicPreview, setMusicPreview] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [notice, setNotice] = useState("");
  const [session, setSession] = useState(0);
  const [speed, setSpeed] = useState("slow");
  const [still, setStill] = useState(false);
  const audioRef = useRef(null);
  const mediaRef = useRef(null);
  const musicMediaRef = useRef(null);
  const noticeTimer = useRef(null);
  const mounted = useRef(false);
  const speechVersion = useRef(0);
  const lastNavigation = useRef(-Infinity);
  const musicProfile = useRef("standard");
  const standardMusicVolume = useRef(0.35);
  const languageLessons = useMemo(() => releasedLessons(languageId), [languageId]);
  const selectedSource = getLesson(lesson.lessonId);
  const selectedUnavailable = Boolean(lesson.lessonId && !isLessonAvailable(languageId, selectedSource, localeNarration));
  const displaySource = !selectedUnavailable && selectedSource ? selectedSource :
    languageLessons.find((item) => isLessonAvailable(languageId, item, localeNarration)) || LESSONS[0];
  const selectedLesson = useMemo(() =>
    isLessonAvailable(languageId, displaySource, localeNarration) ? localizeLesson(displaySource, languageId) : displaySource,
  [displaySource, languageId, localizeLesson, localeNarration]);
  const narration = useMemo(() => narrationForLocale(languageId,
    !selectedUnavailable && selectedSource ? [selectedSource] : languageLessons, localeNarration),
  [languageId, languageLessons, selectedSource, selectedUnavailable, localeNarration]);
  const voiceAvailable = narration.ready && getLanguage(languageId)?.ready === true;
  const voicePreferences = useRef({ "en-GB": true, "es-419": true });
  const language = getLanguage(languageId);
  const steps = selectedLesson.steps;
  const step = steps[selectedUnavailable ? 0 : lesson.step];
  const active = lesson.phase === "drawing" && !selectedUnavailable && !overlay;
  const audioAllowed =
    active ||
    (!selectedUnavailable && ["settings", "help"].includes(overlay)) ||
    (!selectedUnavailable && lesson.phase === "gate" && !overlay);

  const stopNarration = useCallback(() => {
    setMusicPreview(false);
    speechVersion.current++;
    audioRef.current?.stopSpeech();
    audioRef.current?.cancelPreparedClip();
    setSpeaking(false);
  }, []);
  const quiet = useCallback(() => {
    audioRef.current?.setBlocked(true);
    stopNarration();
  }, [stopNarration]);
  const closeOverlay = useCallback(() => {
    if (overlay === "help") stopNarration();
    else quiet();
    setOverlay(null);
  }, [overlay, quiet, stopNarration]);

  useEffect(() => {
    mounted.current = true;
    const audio = new StudioAudio();
    audio.setBlocked(true);
    audio.attachNarration(mediaRef.current);
    audio.attachMusic(musicMediaRef.current, () => {
      if (mounted.current) {
        setMusicOn(false);
        setMusicPreview(false);
        if (musicProfile.current === "cat-pilot")
          setNotice("Music couldn’t play. Check your device sound, then try Music again.");
      }
    });
    audioRef.current = audio;
    const hide = () => {
      if (!document.hidden) return;
      quiet();
      setSupervised(false);
      setOverlay(null);
      dispatch({ type: "PAUSE" });
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      speechVersion.current++;
      audio.dispose();
      clearTimeout(noticeTimer.current);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [quiet]);

  useEffect(() => {
    audioRef.current?.selectMusic(
      lesson.lessonId && lesson.phase !== "finished"
        ? selectedLesson.level
        : null,
      selectedLesson.musicId ?? null,
    );
  }, [
    lesson.lessonId,
    lesson.phase === "finished",
    session,
    selectedLesson.level,
    selectedLesson.musicId,
  ]);

  useEffect(() => {
    document.documentElement.lang = language.id;
    document.title = dynamicLocale(language.id)?.copy.documentTitle ?? (language.id === "es-419"
      ? "Little Line Studio — Todo dibujo comienza con una pequeña línea"
      : "Little Line Studio — Every drawing starts with a little line");
  }, [language.id]);

  useEffect(() => {
    if (["home", "catalogue", "gate", "drawing"].includes(lesson.phase))
      document.querySelector("main h1")?.focus({ preventScroll: true });
  }, [lesson.phase, lesson.level, cataloguePage]);

  function notify(message) {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6500);
  }
  async function narrate(key, force = false, callbacks = {}) {
    if (!voiceAvailable || (!voiceOn && !force)) { callbacks.onUnavailable?.(); return; }
    const token = ++speechVersion.current;
    audioRef.current?.stopSpeech();
    audioRef.current?.setTeaching(true);
    setSpeaking(true);
    setVoiceUnavailable(false);
    const current = () => mounted.current && token === speechVersion.current;
    const available = await audioRef.current?.playClip(
      narration.index[key],
      (reason) => {
        if (current()) {
          setSpeaking(false);
          if (reason === "ended") callbacks.onEnd?.();
        }
      },
      () => {
        if (current()) {
          setVoiceUnavailable(true);
          callbacks.onUnavailable?.();
        }
      },
    );
    if (current()) setVoiceUnavailable(!available);
  }
  function sampleVoice() {
    if (speaking) quiet();
    else void narrate("sample", true);
  }
  function openOverlay(value) {
    if (value === "help" && active) stopNarration();
    else quiet();
    setOverlay(value);
  }
  async function enableMusic() {
    const audio = audioRef.current;
    const enabled = await audio?.enableMusic();
    if (!mounted.current || audio !== audioRef.current) return;
    const playing = Boolean(enabled && audio?.musicEnabled);
    setMusicOn(playing);
    if (!playing)
      notify("Music couldn’t play. A quiet drawing moment is welcome too.");
  }
  function previewMusic() {
    if (musicPreview) {
      quiet();
      return;
    }
    quiet();
    setMusicPreview(true);
    audioRef.current?.setBlocked(false);
    void enableMusic();
  }
  function muteMusic() {
    setMusicPreview(false);
    audioRef.current?.setMusicEnabled(false);
    setMusicOn(false);
  }
  function openCatalogue(levelId) {
    if (!getLevel(levelId)) return;
    languageLoad.cancel();
    setLanguagePending(null);
    setLanguageError(false);
    quiet();
    setLanguageLevel(levelId);
  }
  function closeLanguagePicker() {
    languageLoad.cancel();
    setLanguagePending(null);
    setLanguageError(false);
    setLanguageLevel(null);
  }
  async function selectLanguage(id) {
    if (!getLevel(languageLevel) || !languageAvailableForLevel(id, languageLevel)) return;
    const level = languageLevel;
    await languageLoad.run(
      () => id !== "en-GB" ? loadLocaleLanguage(id, releasedLessons(id)) :
        Promise.resolve({ localizeLesson: identityLesson, localizedTitle: identityTitle, narration: null }),
      {
        onStart: () => { setLanguagePending(id !== "en-GB" ? id : null); setLanguageError(false); },
        onSuccess: ({ localizeLesson: localizer, localizedTitle: title, narration: nextNarration }) => {
          if (id !== "en-GB" && !authorizeLocaleNarration(id, nextNarration)) {
            setLanguagePending(null);
            setLanguageError(true);
            return;
          }
          quiet();
          voicePreferences.current[languageId] = voiceOn;
          setLocalizeLesson(() => localizer);
          setLocalizedTitle(() => title);
          setLocaleNarration(nextNarration);
          setLanguageId(id);
          setVoiceOn(voicePreferences.current[id] ?? true);
          setVoiceUnavailable(false);
          setCataloguePage(0);
          setLanguagePending(null);
          dispatch({ type: "OPEN_CATALOGUE", level });
          setLanguageLevel(null);
        },
        onError: () => { setLanguagePending(null); setLanguageError(true); },
      },
    );
  }
  function changeCollection(levelId) {
    if (!getLevel(levelId) || !["catalogue", "finished"].includes(lesson.phase)) return;
    quiet();
    setCataloguePage(0);
    dispatch({ type: "OPEN_CATALOGUE", level: levelId });
  }
  function prepareBoard() {
    const module = loadDemonstrationBoard();
    setBoardModule(module);
    // Prefetch at selection; the boundary handles any rejection when rendered.
    void module.catch(() => {});
  }
  function selectLesson(lessonId) {
    const candidate = getLesson(lessonId);
    if (lesson.phase !== "catalogue" || candidate?.level !== lesson.level ||
        !isLessonAvailable(languageId, candidate, localeNarration)) return;
    prepareBoard();
    quiet();
    audioRef.current?.stopAll();
    const pilot = candidate.pilot === true;
    const nextProfile = pilot ? "cat-pilot" : "standard";
    if (nextProfile !== musicProfile.current) {
      if (pilot) standardMusicVolume.current = volume;
      const nextVolume = pilot ? 0.6 : standardMusicVolume.current;
      audioRef.current?.setVolume(nextVolume);
      setVolume(nextVolume);
      musicProfile.current = nextProfile;
    }
    audioRef.current?.setMusicProfile(nextProfile);
    setSupervised(false);
    setReplayKey(0);
    setDemoPlaying(false);
    setBoardReady(false);
    setBoardUnavailable(false);
    setSession((value) => value + 1);
    dispatch({ type: "SELECT_LESSON", lessonId });
  }
  function cancelSetup() {
    const level = lesson.level;
    reset();
    dispatch({ type: "OPEN_CATALOGUE", level });
  }
  function start() {
    if (!supervised || lesson.phase !== "gate" || !isLessonAvailable(languageId, getLesson(lesson.lessonId), localeNarration)) return;
    quiet();
    if (voiceAvailable && voiceOn)
      audioRef.current?.prepareClip(narration.index[narrationKey(selectedLesson, 0)]);
    // Unlock from the adult's gesture; the trusted active state permits sound.
    if (musicOn) void enableMusic();
    lastNavigation.current = -Infinity;
    dispatch({ type: "START", supervised });
    setSupervised(false);
  }
  function pause() {
    quiet();
    setSupervised(false);
    setOverlay(null);
    dispatch({ type: "PAUSE" });
  }
  function finish() {
    quiet();
    audioRef.current?.stopAll();
    setSupervised(false);
    setOverlay(null);
    dispatch({ type: "FINISH" });
  }
  function interrupted(message) {
    pause();
    notify(t(message));
  }
  function navigate(direction) {
    if (!active || (direction < 0 && lesson.step === 0)) return;
    const now = performance.now();
    if (now - lastNavigation.current < 450) return;
    lastNavigation.current = now;
    speechVersion.current++;
    audioRef.current?.setTeaching(true);
    audioRef.current?.stopSpeech();
    setSpeaking(false);
    if (direction > 0 && lesson.step === steps.length - 1) return finish();
    dispatch({ type: direction > 0 ? "NEXT" : "BACK" });
  }
  function replay() {
    if (!active) return;
    speechVersion.current++;
    audioRef.current?.setTeaching(true);
    audioRef.current?.stopSpeech();
    setSpeaking(false);
    setReplayKey((n) => n + 1);
  }
  function reset(toSetup = false) {
    if (toSetup && !isLessonAvailable(languageId, getLesson(lesson.lessonId), localeNarration)) return;
    if (toSetup) prepareBoard();
    languageLoad.cancel();
    setLanguagePending(null);
    setLanguageError(false);
    quiet();
    audioRef.current?.stopAll();
    setOverlay(null);
    setSupervised(false);
    setSession((n) => n + 1);
    setReplayKey(0);
    setDemoPlaying(false);
    setBoardReady(false);
    setBoardUnavailable(false);
    setLanguageLevel(null);
    lastNavigation.current = -Infinity;
    dispatch({ type: toSetup ? "RESTART" : "RESET" });
  }
  function resume() {
    if (!supervised) return;
    if (musicOn) void enableMusic();
    if (playback.state?.interrupted) setReplayKey((value) => value + 1);
    dispatch({ type: "RESUME", supervised });
    setSupervised(false);
  }
  const playback = useScriptedPlayback({
    lesson: selectedLesson,
    stepIndex: selectedUnavailable ? 0 : lesson.step,
    session,
    replayKey,
    active,
    boardReady: boardReady || boardUnavailable,
    boardUnavailable,
    voiceOn,
    narrationDurations: narration.durations,
    speed,
    still,
    narrate,
    onAdvance: () => navigate(1),
    onInterruption: interrupted,
  });
  const lessonClock = useLessonClock({
    enabled: selectedLesson.pilot === true,
    session,
    stepIndex: lesson.step,
    playback: playback.state,
    active: active && (boardReady || boardUnavailable),
  });
  const previewAllowed = musicPreview && lesson.phase === "gate" && !overlay;
  const helpMusicAllowed = lesson.phase === "drawing" && !selectedUnavailable && overlay === "help";
  useEffect(() => {
    audioRef.current?.setBlocked(
      !previewAllowed && !active && !helpMusicAllowed,
    );
    audioRef.current?.setTeaching(
      speaking || (!previewAllowed && (playback.state?.stage !== "practice" || demoPlaying)),
    );
    if (!audioAllowed) quiet();
  }, [
    active,
    helpMusicAllowed,
    playback.state?.stage,
    demoPlaying,
    speaking,
    audioAllowed,
    quiet,
    previewAllowed,
  ]);
  useEffect(() => {
    if (!active || boardReady || boardUnavailable) return;
    const timeout = setTimeout(() => {
      quiet();
      setSupervised(false);
      dispatch({ type: "PAUSE" });
      setNotice(
        "The drawing board is taking a moment. We’ve paused here for you.",
      );
    }, 20000);
    return () => clearTimeout(timeout);
  }, [active, boardReady, boardUnavailable, quiet]);
  const modal =
    overlay ||
    (["paused", "finished"].includes(lesson.phase) ? lesson.phase : null);
  const stepLabel = selectedLesson.pilot
    ? step.kind === "observe"
      ? "TAKE A LOOK"
      : step.kind === "colour"
        ? `COLOURING ${steps.slice(0, lesson.step + 1).filter((part) => part.kind === "colour").length} OF ${steps.filter((part) => part.kind === "colour").length}`
        : step.kind === "explore"
          ? "YOUR OWN TIME"
          : `DRAWING ${selectedLesson.strokes.findIndex((stroke) => stroke.id === step.id) + 1} OF ${selectedLesson.strokes.length}`
    : lesson.step === 0
      ? "GET READY"
      : `STEP ${lesson.step} OF ${steps.length - 1}`;
  const status = playback.state?.hold
    ? "All the time you need."
    : speaking
      ? "Listen to this little step."
      : demoPlaying
        ? "Watch this little part."
        : step.kind === "explore"
          ? "Make it yours. Stay as long as you like."
          : playback.state?.stage === "practice"
            ? step.kind === "colour" ? "Your quiet colouring time." : "Your quiet drawing time."
            : "One little part at a time.";

  const spanishStepLabel = step.kind === "observe" ? "OBSERVA" : step.kind === "colour"
    ? `COLOREAR ${steps.slice(0, lesson.step + 1).filter((part) => part.kind === "colour").length} DE ${steps.filter((part) => part.kind === "colour").length}`
    : step.kind === "explore" ? "TU TIEMPO" : selectedLesson.pilot
      ? `DIBUJO ${selectedLesson.strokes.findIndex((stroke) => stroke.id === step.id) + 1} DE ${selectedLesson.strokes.length}`
      : lesson.step === 0 ? "PREPARACIÓN" : `PASO ${lesson.step} DE ${steps.length - 1}`;

  return (
    <LocaleContext.Provider value={languageId}>
      <audio
        ref={mediaRef}
        preload="none"
        aria-label={t("Lesson instruction audio")}
        hidden
      />
      <audio
        ref={musicMediaRef}
        preload="none"
        aria-label={t("Optional drawing music")}
        hidden
      />
      {lesson.phase === "home" ? (
        <Home
          onExplore={openCatalogue}
          onPrivacy={() => openOverlay("privacy")}
          onHow={() => openOverlay("how")}
        />
      ) : lesson.phase === "catalogue" ? (
        <Catalogue
          levelId={lesson.level}
          page={cataloguePage}
          onPage={setCataloguePage}
          onLevel={changeCollection}
          onSelect={selectLesson}
          onHome={() => reset()}
          onPrivacy={() => openOverlay("privacy")}
          language={language}
          localizeLesson={localizeLesson}
          localizedTitle={localizedTitle}
          localeNarration={localeNarration}
          onLanguage={() => openCatalogue(lesson.level)}
        />
      ) : selectedUnavailable ? (
        <main className="setup-page entry-confirmation">
          <section className="entry-confirmation-card">
            <h1>{t(languageId === "es-419" ? "This Spanish lesson is being prepared." : "This lesson is being prepared.")}</h1>
            <button className="primary" onClick={cancelSetup}>{t("Drawings")}</button>
          </section>
        </main>
      ) : lesson.phase === "gate" ? (
        <Onboarding
          lesson={selectedLesson}
          language={language}
          voiceOn={voiceOn}
          voiceAvailable={voiceAvailable}
          narrationDurations={narration.durations}
          onVoice={(value) => {
            quiet();
            setVoiceOn(value);
          }}
          speaking={speaking}
          voiceUnavailable={voiceUnavailable}
          supervised={supervised}
          onSupervised={setSupervised}
          onSample={sampleVoice}
          musicOn={musicOn}
          musicPreview={musicPreview}
          onMusic={musicOn ? muteMusic : enableMusic}
          onMusicPreview={previewMusic}
          volume={volume}
          onVolume={(value) => {
            setVolume(value);
            audioRef.current?.setVolume(value);
          }}
          onSoundClose={quiet}
          onBack={cancelSetup}
          onStart={start}
          onHome={() => reset()}
          onPrivacy={() => openOverlay("privacy")}
        />
      ) : (
        <main className={`studio ${selectedLesson.pilot ? "cat-pilot" : ""}`}>
          <header className="topbar">
            <Brand onClick={() => openOverlay("leave")} />
            <nav
              className="header-actions"
              aria-label={t("Lesson and grown-up controls")}
            >
              {(musicOn || selectedLesson.pilot) && (
                <button
                  className="header-button"
                  onClick={musicOn ? muteMusic : enableMusic}
                  aria-label={t(musicOn ? "Mute background music" : "Enable background music")}
                  aria-pressed={musicOn}
                >
                  <MusicNotesIcon size={22} />
                  <span className={selectedLesson.pilot ? "music-label" : "button-label"}>{t("Music")} {t(musicOn ? "on" : "off")}</span>
                </button>
              )}
              <button
                className="header-button"
                onClick={pause}
                disabled={lesson.phase !== "drawing"}
                aria-label={t("Pause lesson")}
              >
                <PauseIcon size={22} />
                <span className="button-label">{t("lesson.pause")}</span>
              </button>
              <button
                className="header-button"
                onClick={() => openOverlay("settings")}
                aria-label={t("Parent settings")}
              >
                <GearSixIcon size={22} />
                <span className="button-label">{t("Grown-ups")}</span>
              </button>
            </nav>
          </header>
          {selectedLesson.pilot && (
            <LessonTimeline lesson={selectedLesson} stepIndex={lesson.step}
              playback={playback} {...lessonClock} speed={speed} still={still} voiceOn={voiceOn} narrationDurations={narration.durations} boardUnavailable={boardUnavailable} />
          )}
          <div className="lesson-shell">
            <section
              className="instruction"
              aria-label={t("Current drawing instruction")}
            >
              <div className="instruction-copy">
                <div className="instruction-meta">
                  <p className="eyebrow">
                    {selectedLesson.title}{" "}
                    <span className="step-label">
                      {dynamicLocale(languageId) ? dynamicLocale(languageId).stage(selectedLesson, lesson.step) : languageId === "es-419" ? spanishStepLabel : stepLabel}
                    </span>
                  </p>
                  <button
                    className={`listen-button ${speaking ? "is-speaking" : ""}`}
                    onClick={() => {
                      setVoiceOn(true);
                      replay();
                    }}
                    disabled={!active || !voiceAvailable}
                    aria-label={t("Hear this instruction again")}
                  >
                    <SpeakerHighIcon size={21} />
                    <span>{t("lesson.replayInstruction")}</span>
                  </button>
                </div>
                <div aria-live="polite" aria-atomic="true">
                  <h1 tabIndex={-1}>{step.title}</h1>
                  <p className="instruction-text">{step.instruction}</p>
                </div>
                {voiceUnavailable && (
                  <p className="voice-note" role="status">
                    {t("Sound couldn’t play. Try Listen, or read together.")}
                  </p>
                )}
              </div>
              <figure className="reference">
                <LessonPreview lesson={selectedLesson} />
                <figcaption>{t("One way to draw it")}</figcaption>
              </figure>
            </section>
            <section
              className="workspace"
              aria-label={t("Teacher demonstration — draw on your paper")}
            >
              <div className="board-caption">
                <PencilSimpleIcon size={17} />
                <span>{step.kind === "colour" ? selectedLesson.colouringLabel || t("Your picture, your colours. Colour on paper.") : t("Watch here. Draw on paper.")}</span>
                {step.canSkip && (
                  <span className="optional-note">{t("Your choice")}</span>
                )}
              </div>
              <div className="board-surface">
                <DemonstrationErrorBoundary
                  locale={languageId}
                  resetKey={session}
                  onError={() => {
                    setDemoPlaying(false);
                    setBoardReady(false);
                    setBoardUnavailable(true);
                    interrupted(
                      "The demonstration couldn’t load. We’ve paused so you can read together.",
                    );
                  }}
                >
                  <Suspense
                    fallback={
                      <p className="canvas-loading" role="status">
                        {t("Getting our drawing ready…")}
                      </p>
                    }
                  >
                    <DemonstrationBoard
                      module={boardModule}
                      key={`${selectedLesson.id}-${session}`}
                      lesson={selectedLesson}
                      stepIndex={lesson.step}
                      replayKey={playback.state?.run || 0}
                      paused={
                        !active || !(playback.state?.stage === "demonstration" ||
                          (playback.state?.timing.parallelTeaching && playback.state.stage === "instruction"))
                      }
                      speed={speed}
                      still={still}
                      onPlayingChange={setDemoPlaying}
                      onReady={() => setBoardReady(true)}
                      onComplete={playback.demoComplete}
                    />
                  </Suspense>
                </DemonstrationErrorBoundary>
                {step.kind === "prepare" && (
                  <div className="paper-ready">
                    <PencilSimpleIcon size={46} weight="duotone" />
                    <h2>{t("Paper. Pencil. You.")}</h2>
                    <p>{t("Let’s begin with one little line.")}</p>
                  </div>
                )}
              </div>
              <div className="board-status" role="status">
                <span
                  className={`status-symbol ${speaking || demoPlaying ? "showing" : ""}`}
                  aria-hidden="true"
                >
                  {speaking ? (
                    <SpeakerHighIcon size={16} />
                  ) : demoPlaying ? (
                    <PlayIcon size={15} weight="fill" />
                  ) : (
                    <CheckIcon size={16} weight="bold" />
                  )}
                </span>
                <strong>{t(status)}</strong>
                <span className="patience-note">
                  {t(step.kind === "explore" || playback.state?.hold
                    ? "No hurry."
                    : "Continues gently. Pause any time.")}
                </span>
              </div>
            </section>
            <footer
              className="lesson-toolbar"
              aria-label={t("Demonstration controls")}
            >
              <div className="secondary-actions">
                <button
                  className="lesson-button"
                  onClick={() => navigate(-1)}
                  disabled={!active || lesson.step === 0}
                >
                  <CaretLeftIcon size={22} />
                  <span>{t("Back")}</span>
                </button>
                <button
                  className="lesson-button"
                  onClick={replay}
                  disabled={!active}
                >
                  <ArrowCounterClockwiseIcon size={23} />
                  <span>{t("lesson.replayDemonstration")}</span>
                </button>
                <button
                  className="lesson-button"
                  onClick={() => openOverlay("help")}
                  disabled={!active}
                >
                  <QuestionIcon size={23} />
                  <span>{t("Help")}</span>
                </button>
              </div>
              <div className="guided-actions">
                {step.kind !== "explore" && (
                  <button
                    className="next-button time-button"
                    disabled={!active}
                    onClick={
                      playback.state?.hold ? playback.continue : playback.hold
                    }
                  >
                    {playback.state?.hold ? (
                      <PlayIcon size={22} />
                    ) : (
                      <HeartIcon size={22} />
                    )}
                    <span>
                      {t(playback.state?.hold ? "Continue lesson" : "lesson.moreTime")}
                    </span>
                  </button>
                )}
                <button
                  className="ready-button"
                  onClick={() => navigate(1)}
                  disabled={!active}
                >
                  <span>
                    {t(step.kind === "explore"
                      ? "Finish drawing"
                      : step.canSkip
                        ? "Leave this detail"
                        : "Ready for next")}
                  </span>
                  <ArrowRightIcon size={20} />
                </button>
              </div>
            </footer>
          </div>
          <footer className="session-strip">
            <p>
              <HeartIcon size={16} /> {t("Stay together. Make it yours.")}
            </p>
            <div>
              <button
                onClick={finish}
                disabled={!["drawing", "paused"].includes(lesson.phase)}
              >
                {t("Finish for now")}
              </button>
              <button onClick={() => openOverlay("privacy")}>{t("Privacy")}</button>
            </div>
          </footer>
        </main>
      )}

      {notice && (
        <div className="toast" role="status">
          {t(notice)}
        </div>
      )}
      {modal === "paused" && (
        <Modal title={t("A little pause is welcome.")} className="pause-modal">
          <div className="modal-symbol">
            <PauseIcon size={30} />
          </div>
          <p className="modal-intro">
            {t("The drawing and sound are paused. We’ll stay right here.")}
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={supervised}
              onChange={(e) => setSupervised(e.target.checked)}
            />
            <span>{t("I’m here with my child and ready to continue.")}</span>
          </label>
          <button
            className="primary wide"
            disabled={!supervised}
            onClick={resume}
          >
            <PlayIcon size={20} weight="fill" />{" "}
            {t(boardUnavailable
              ? "Continue with written steps"
              : "Continue together")}
          </button>
          {voiceUnavailable && (
            <button
              className="quiet-button wide"
              disabled={!supervised}
              onClick={() => {
                setVoiceOn(false);
                resume();
              }}
            >
              {t("Continue with written instructions")}
            </button>
          )}
          <button className="text-button" onClick={finish}>
            {t("Finish for now")}
          </button>
        </Modal>
      )}
      {modal === "finished" && (
        <Modal title={t("A drawing that’s yours.")} className="finished-modal">
          <LessonPreview
            lesson={selectedLesson}
            className="finished-cat"
            labelled={false}
          />
          <p className="modal-intro">
            {t("Your picture can tell its own story. Talk about it together, if you like.")}
          </p>
          <button
            className="primary wide"
            onClick={() => dispatch({ type: "KEEP_DRAWING" })}
          >
            {t("Keep drawing")} <PencilSimpleIcon size={21} />
          </button>
          <div className="finished-actions">
            <button className="quiet-button" onClick={() => reset(true)}>
              {t("Draw together again")}
            </button>
            <button
              className="quiet-button"
              onClick={() => {
                quiet();
                changeCollection(lesson.level);
              }}
            >
              {t("Choose another drawing")}
            </button>
            <button className="quiet-button" onClick={() => reset()}>
              {t("Back home")}
            </button>
          </div>
        </Modal>
      )}
      {languageLevel && (
        <LanguagePicker level={getLevel(languageLevel)} onSelect={selectLanguage}
          pending={languagePending} error={languageError} onClose={closeLanguagePicker} />
      )}
      {modal === "help" && (
        <Modal title={t("One little thing to try.")} onClose={closeOverlay}>
          {selectedLesson.teachingPack && step.spoken !== step.instruction && (
            <div className="gentle-note">
              <strong>{t("The teacher’s words")}</strong>
              <p>{step.spoken}</p>
            </div>
          )}
          <p className="modal-intro">{step.hint}</p>
          <button
            className="sample-button compact"
            disabled={!voiceAvailable}
            onClick={() =>
              speaking
                ? stopNarration()
                : void narrate(
                    narrationKey(selectedLesson, lesson.step, "hint"),
                    true,
                  )
            }
          >
            {speaking ? <StopIcon size={20} /> : <SpeakerHighIcon size={21} />}{" "}
            {t(speaking ? "help.stopHint" : "help.playHint")}
          </button>
          <div className="gentle-note">
            <strong>{t(step.notice === selectedLesson.parentNote ? "For this drawing" : "Try it together")}</strong>
            <p>{step.notice.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase(languageId))}</p>
          </div>
          <p className="settings-note">
            {selectedLesson.simplify ||
              t("Try a larger shape or leave out a detail. Your version is welcome.")}
          </p>
          <button className="primary wide" onClick={closeOverlay}>
            {t("Back to this step")} <ArrowRightIcon size={22} />
          </button>
        </Modal>
      )}
      {modal === "settings" && (
        <Settings
          onClose={closeOverlay}
          voiceOn={voiceOn}
          voiceAvailable={voiceAvailable}
          onVoice={() => {
            quiet();
            setVoiceOn((v) => !v);
          }}
          musicOn={musicOn}
          onMusic={musicOn ? muteMusic : enableMusic}
          volume={volume}
          onVolume={(value) => {
            setVolume(value);
            audioRef.current?.setVolume(value);
          }}
          still={still}
          onStill={() => setStill((v) => !v)}
          speed={speed}
          onSpeed={setSpeed}
          onSample={sampleVoice}
          speaking={speaking}
          voiceUnavailable={voiceUnavailable}
          onPrivacy={() => openOverlay("privacy")}
        />
      )}
      {modal === "privacy" && (
        <Privacy onClose={closeOverlay} />
      )}
      {modal === "how" && (
        <Modal title={t("A little step. Then your turn.")} onClose={closeOverlay}>
          <ol className="how-steps">
            <li>
              <strong>{t("Choose together.")}</strong> {t("Pick any level and a drawing that interests you.")}
            </li>
            <li>
              <strong>{t("Watch and listen.")}</strong> {t("We show one little part. Voice is optional.")}
            </li>
            <li>
              <strong>{t("Try it on paper.")}</strong> {t("A quiet drawing break follows each demonstration. The next part starts gently on its own.")}
            </li>
          </ol>
          <p className="gentle-note">
            {t("A grown-up stays alongside throughout. More time waits for you; Pause stops everything. Every picture can be different.")}
          </p>
          <button className="primary wide" onClick={closeOverlay}>
            {t("Let’s explore")} <ArrowRightIcon size={21} />
          </button>
        </Modal>
      )}
      {modal === "leave" && (
        <Modal title={t("Finish this little drawing?")} onClose={closeOverlay}>
          <p>
            {t("Your paper is yours to keep. Going home starts a fresh lesson next time.")}
          </p>
          <button className="primary wide" onClick={closeOverlay}>
            {t("Stay with this drawing")}
          </button>
          <button className="text-button" onClick={() => reset()}>
            {t("Finish and go home")}
          </button>
        </Modal>
      )}
    </LocaleContext.Provider>
  );
}
