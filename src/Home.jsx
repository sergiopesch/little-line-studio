import { useLocale } from "./i18n.jsx";
import {
  ArrowRightIcon,
  HeartIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react";
import { LEVELS } from "./lesson-levels.js";
import LESSONS from "./lesson-directory.json";
import { LanguageCarousel } from "./LanguagePicker.jsx";
import { drawingCount } from "./catalogue-counts.js";

const levelCounts = Object.fromEntries(LEVELS.map(({ id }) => [id, LESSONS.filter(lesson => lesson.level === id).length]));

export function Brand({ onClick }) {
  const { t } = useLocale();
  return (
    <button
      className="brand"
      onClick={onClick}
      aria-label={t("Trazolino home")}
    >
      <img
        className="brand-pencil"
        src="/brand/pencil.webp"
        width="60"
        height="44"
        alt=""
      />
      <span className="wordmark">Trazolino</span>
    </button>
  );
}

export function Home({ onExplore, onPrivacy, onHow }) {
  const { t, locale } = useLocale();
  return (
    <main className="home-page home-with-languages">
      <header className="site-header">
        <Brand />
        <nav className="home-nav" aria-label={t("About the studio")}>
          <button className="quiet-button" onClick={onHow}>
            {t("How it works")}
          </button>
          <button className="quiet-button" onClick={onPrivacy}>
            {t("For grown-ups")}
          </button>
        </nav>
      </header>
      <section className="home-intro" aria-labelledby="home-title">
        <h1
          id="home-title"
          aria-label={t("Every drawing starts with a little line.")}
          tabIndex={-1}
        >
          {t("Every drawing starts")}
          <br /> <span>{t("with a little line.")}</span>
        </h1>
        <p>{t("A gently guided drawing lesson. Listen, watch, then try on paper.")}</p>
        <p className="together-note">
          <HeartIcon size={21} weight="bold" /> {t("Draw on paper. Make it yours.")}
        </p>
        <button className="mobile-how-link" onClick={onHow}>
          {t("How it works")}
        </button>
      </section>
      <section className="level-choices" aria-label={t("Choose a drawing level")}>
        {LEVELS.map((level) => (
          <button
            key={level.id}
            className="level-choice"
            onClick={() => onExplore(level.id)}
          >
            <span className="level-picture">
              <img
                className="level-illustration"
                src={level.image}
                width="400"
                height="300"
                alt=""
              />
            </span>
            <span className="level-description">
              <strong>{t(level.name)}</strong>
              <span>{drawingCount(locale, levelCounts[level.id])}</span>
            </span>
            <span className="level-link">
              <span>{t("Explore")} <span className="level-link-name">{t(level.short)}</span></span>
              <ArrowRightIcon size={22} weight="bold" />
            </span>
          </button>
        ))}
      </section>
      <LanguageCarousel />
      <footer className="home-footer">
        <span>
          <SpeakerHighIcon size={18} /> {t("Gentle teaching. Room to draw.")}
        </span>
        <button onClick={onPrivacy}>{t("Privacy & supervision")}</button>
      </footer>
    </main>
  );
}
