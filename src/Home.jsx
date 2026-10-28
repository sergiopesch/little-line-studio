import { useLocale } from "./i18n.jsx";
import {
  ArrowRightIcon,
  CaretLeftIcon,
  HeartIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react";
import { LEVELS, LESSONS, getLevel } from "./lesson-catalogue.js";
import { LessonPreview } from "./LessonPreview.jsx";
import { LanguageCarousel, LanguageFlag } from "./LanguagePicker.jsx";
import { isLessonAvailable } from "./narration-locales.js";
import { dynamicLocale } from "./locale-dynamic.js";

export function Brand({ onClick }) {
  const { t } = useLocale();
  return (
    <button
      className="brand"
      onClick={onClick}
      aria-label={t("Little Line Studio home")}
    >
      <img
        className="brand-pencil"
        src="/brand/pencil.webp"
        width="60"
        height="44"
        alt=""
      />
      <span className="wordmark">little line studio</span>
    </button>
  );
}

export function Home({ onExplore, onPrivacy, onHow }) {
  const { t, locale } = useLocale();
  const dynamic = dynamicLocale(locale)?.copy;
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
            aria-label={dynamic ? dynamic.levelExplore(t(level.name)) : locale === "es-419" ? `Explorar ${t(level.name)}: 10 dibujos` : `Explore ${t(level.name)}: 10 drawings`}
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
              <span>{t("10 drawings")}</span>
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

export function Catalogue({
  levelId,
  page,
  onPage,
  onLevel,
  onSelect,
  onHome,
  onPrivacy,
  language,
  localizeLesson,
  localizedTitle,
  localeNarration,
  onLanguage,
}) {
  const { t, locale } = useLocale();
  const dynamic = dynamicLocale(locale)?.copy;
  const level = getLevel(levelId);
  const lessons = LESSONS.filter((lesson) => lesson.level === levelId);
  const hasAvailableLesson = lessons.some((lesson) => isLessonAvailable(locale, lesson, localeNarration));
  const pageSize = 4,
    pages = Math.ceil(lessons.length / pageSize);
  const visible = lessons.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <main className="catalogue-page">
      <header className="site-header">
        <Brand onClick={onHome} />
        <div className="catalogue-header-actions">
          <button className="catalogue-language" onClick={onLanguage} aria-label={t("Change lesson language")}>
            <LanguageFlag language={language} /> {language.name} <span>{t(language.region)}</span>
          </button>
          <button className="quiet-button" onClick={onPrivacy}>{t("For grown-ups")}</button>
        </div>
      </header>
      <section className="catalogue-heading" aria-labelledby="catalogue-title">
        <button className="back-link" onClick={onHome}>
          <CaretLeftIcon size={19} /> {t("Home")}
        </button>
        <div>
          <h1 id="catalogue-title" tabIndex={-1}>
            {t("What shall we draw?")}
          </h1>
          <p>{t(level.description)} {t("Your own version is welcome.")}</p>
          {!hasAvailableLesson && <p className="catalogue-unavailable">{t(locale === "es-419" ? "Spanish lessons in this level are being prepared. Choose another level or language." : "Lessons in this level are being prepared. Choose another level or language.")}</p>}
        </div>
        <div
          className="level-tabs"
          role="group"
          aria-label={t("Drawing collection")}
        >
          {LEVELS.map((item) => (
            <button
              key={item.id}
              aria-pressed={levelId === item.id}
              onClick={() => onLevel(item.id)}
            >
              {t(item.short)}
            </button>
          ))}
        </div>
      </section>
      <section
        className="drawing-grid"
        aria-label={dynamic ? dynamic.catalogueRange(t(level.name), page * pageSize + 1, Math.min((page + 1) * pageSize, 10)) : locale === "es-419" ? `${t(level.name)}, dibujos ${page * pageSize + 1} a ${Math.min((page + 1) * pageSize, 10)} de 10` : `${level.name}, drawings ${page * pageSize + 1} to ${Math.min((page + 1) * pageSize, 10)} of 10`}
      >
        {visible.map((original) => {
          const available = isLessonAvailable(locale, original, localeNarration);
          const lesson = available ? localizeLesson(original, locale) : original;
          const title = available ? lesson.title : localizedTitle(original, locale) || t("Drawing being prepared");
          const content = <>
            <div className="drawing-thumbnail">
              <LessonPreview lesson={lesson} labelled={false} />
            </div>
            <span className="drawing-choice-copy">
              <strong>{title}</strong>
              <span>{available ? lesson.invitation : t(locale === "es-419" ? "This Spanish lesson is being prepared." : "This lesson is being prepared.")}</span>
            </span>
            {available && <ArrowRightIcon className="drawing-choice-arrow" size={22} />}
          </>;
          return available ? (
            <button className="drawing-choice" key={original.id}
              onClick={() => onSelect(original.id)}
              aria-label={dynamic ? dynamic.drawTitle(title) : locale === "es-419" ? `Dibujar ${title}` : `Draw ${title}`}>
              {content}
            </button>
          ) : (
            <article className="drawing-choice drawing-choice--preparing" key={original.id}
              aria-label={`${title}. ${t(locale === "es-419" ? "This Spanish lesson is being prepared." : "This lesson is being prepared.")}`}>
              {content}
            </article>
          );
        })}
      </section>
      <footer className="catalogue-footer">
        <span className="catalogue-supervision">
          <HeartIcon size={18} /> {t("Little marks. Your own ideas.")}
        </span>
        <nav className="catalogue-pagination" aria-label={t("More drawings")}>
          <button
            className="quiet-button"
            onClick={() => onPage(page - 1)}
            disabled={page === 0}
            aria-label={t("Previous drawings")}
          >
            <CaretLeftIcon size={20} />
          </button>
          <span>
            {dynamic ? dynamic.pageCount(page + 1, pages) : `${page + 1} ${locale === "es-419" ? "de" : "of"} ${pages}`}
          </span>
          <button
            className="quiet-button"
            onClick={() => onPage(page + 1)}
            disabled={page === pages - 1}
            aria-label={t("More drawings")}
          >
            <ArrowRightIcon size={20} />
          </button>
        </nav>
      </footer>
    </main>
  );
}
