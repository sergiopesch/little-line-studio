import { useLocale } from "./i18n.jsx";
import {
  CaretLeftIcon,
  CheckIcon,
  PencilSimpleIcon,
  SpeakerHighIcon,
  StopIcon,
  MusicNotesIcon,
} from "@phosphor-icons/react";
import { Brand } from "./Home.jsx";
import { LanguageFlag } from "./LanguagePicker.jsx";
import { LessonPreview } from "./LessonPreview.jsx";
import { estimateLessonDurationMs } from "./scripted-session.js";
import { FRENCH_DYNAMIC } from "./french-dynamic.fr-FR.js";

export function Onboarding({
  lesson,
  language,
  voiceOn,
  voiceAvailable = true,
  narrationDurations = {},
  onVoice,
  speaking,
  voiceUnavailable,
  supervised,
  onSupervised,
  onSample,
  onBack,
  onStart,
  onHome,
  onPrivacy,
  musicOn,
  musicPreview,
  onMusic,
  onMusicPreview,
  volume,
  onVolume,
  onSoundClose,
}) {
  const { t, locale } = useLocale();
  const minutes = Math.ceil(
    estimateLessonDurationMs(lesson, { narrationDurations }) / 60000,
  );
  return (
    <main className="setup-page entry-confirmation">
      <header className="site-header">
        <Brand onClick={onHome} />
        <button className="quiet-button" onClick={onPrivacy}>{t("For grown-ups")}</button>
      </header>
      <section className="entry-confirmation-card" aria-labelledby="setup-title">
        <div className="entry-drawing-summary">
          <div className="entry-drawing-preview"><LessonPreview lesson={lesson} labelled={false} /></div>
          <div>
            <p className="eyebrow">{t("YOUR DRAWING")}</p>
            <strong>{lesson.title}</strong>
            <p className="entry-language"><LanguageFlag language={language} /> {language.name} · {t(language.region)}</p>
          </div>
        </div>
        <h1 id="setup-title" tabIndex={-1}>{t("Ready to draw together?")}</h1>
        <p className="entry-materials"><PencilSimpleIcon size={21} /> {t("Paper, a pencil")}{lesson.pilot ? t(" and optional colours") : ""}.</p>
        <p className="entry-duration">{locale === "fr-FR" ? FRENCH_DYNAMIC.duration(minutes) : locale === "es-419" ? `Unos ${minutes} minutos, más las pausas. Tómense más tiempo cuando lo necesiten.` : `About ${minutes} minutes, plus any pauses. Take more time whenever you need.`}</p>
        <label className="check-row entry-supervision">
          <input type="checkbox" checked={supervised} onChange={(event) => onSupervised(event.target.checked)} />
          <span>{t("I’m the supervising adult. I’ll stay with my child throughout.")}</span>
        </label>
        <details className="entry-sound" onToggle={(event) => {
          if (!event.currentTarget.open) onSoundClose();
        }}>
          <summary><span><SpeakerHighIcon size={19} /> {t("Sound options")}</span><small>{t("Voice")} {t(voiceOn ? "on" : "off")} · {t("Music")} {t(musicOn ? "on" : "off")}</small></summary>
          <div className="entry-sound-panel">
            <div className="entry-sound-row">
              <label className="entry-sound-choice"><span>{t("Read the steps aloud")}</span>
                <input type="checkbox" checked={voiceOn} disabled={!voiceAvailable} onChange={(event) => onVoice(event.target.checked)} />
              </label>
              <button className="entry-sound-check" onClick={onSample} disabled={!voiceAvailable}>
                {speaking ? <StopIcon size={19} /> : <SpeakerHighIcon size={19} />}
                {t(speaking ? "Stop voice check" : "Hear a hello")}
              </button>
            </div>
            {!voiceAvailable && <p className="entry-sound-note">{t("The selected voice is being prepared. Read the steps together for now.")}</p>}
            <div className="entry-sound-row">
              <label className="entry-sound-choice"><span>{t("Gentle drawing music")}</span>
                <input type="checkbox" checked={musicOn} onChange={onMusic} />
              </label>
              <button className="entry-sound-check" onClick={onMusicPreview}>
                {musicPreview ? <StopIcon size={19} /> : <MusicNotesIcon size={19} />}
                {t(musicPreview ? "Stop music check" : "Hear the music")}
              </button>
            </div>
            <label className="entry-volume">{t("Music volume")}
              <input type="range" min="0" max="1" step="0.05" value={volume}
                onChange={(event) => onVolume(Number(event.target.value))} />
            </label>
            <p className={`entry-sound-note ${voiceUnavailable ? "is-error" : ""}`} role="status">{t(voiceUnavailable
              ? "Sound couldn’t play. Try again, or read the written steps together."
              : "Choose a comfortable device volume. Quiet drawing is welcome too.")}</p>
          </div>
        </details>
        <div className="entry-confirmation-actions">
          <button className="quiet-button" onClick={onBack}><CaretLeftIcon size={19} /> {t("Drawings")}</button>
          <button className="primary" onClick={onStart} disabled={!supervised}>{t("Let’s begin")} <CheckIcon size={21} /></button>
        </div>
      </section>
    </main>
  );
}
