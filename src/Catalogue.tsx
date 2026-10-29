import type { LevelId, NarrationData } from "./core/contracts.ts";
import type { LanguageView, InitialSelection } from "./browser/ui-contracts.ts";
export interface CatalogueProps {
  levelId: LevelId;
  page: number;
  onPage: (page: number) => void;
  onLevel: (level: LevelId) => void;
  onSelect: (lessonId: string) => void;
  onHome: () => void;
  onPrivacy: () => void;
  language: LanguageView;
  localizeLesson: InitialSelection["localizeLesson"];
  localizedTitle: InitialSelection["localizedTitle"];
  localeNarration: NarrationData | null;
  onLanguage: () => void;
}
import { useLocale } from "./i18n.jsx";
import { ArrowRightIcon, CaretLeftIcon, HeartIcon } from "@phosphor-icons/react";
import { LEVELS, LESSONS, getLevel } from "./lesson-catalogue.js";
import { Brand } from "./Home.jsx";
import { LessonPreview } from "./LessonPreview.jsx";
import { LanguageFlag } from "./LanguagePicker.jsx";
import { isLessonAvailable } from "./narration-locales.js";
import { dynamicLocale } from "./locale-dynamic.js";

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
}: CatalogueProps) {
  const { t, locale } = useLocale();
  const dynamic = dynamicLocale(locale)?.copy;
  const level = getLevel(levelId);
  if (!level) throw new TypeError("A known drawing level is required.");
  const lessons = LESSONS.filter((lesson) => lesson.level === levelId);
  const hasAvailableLesson = lessons.some((lesson) => isLessonAvailable(locale, lesson, localeNarration));
  const pageSize = 4,
    pages = Math.max(1, Math.ceil(lessons.length / pageSize));
  const currentPage = Math.max(0, Math.min(page, pages - 1));
  const visible = lessons.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const first = visible.length ? currentPage * pageSize + 1 : 0;
  const last = Math.min((currentPage + 1) * pageSize, lessons.length);
  return (
    <main className="catalogue-page">
      <header className="site-header">
        <Brand onClick={onHome} />
        <div className="catalogue-header-actions">
          <button className="catalogue-language" onClick={onLanguage}
            aria-label={`${language.name} ${t(language.region)}: ${t("Change lesson language")}`}>
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
        aria-label={dynamic ? dynamic.catalogueRange(t(level.name), first, last, lessons.length) : locale === "es-419" ? `${t(level.name)}, dibujos ${first} a ${last} de ${lessons.length}` : `${level.name}, drawings ${first} to ${last} of ${lessons.length}`}
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
              onClick={() => onSelect(original.id)}>
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
            onClick={() => onPage(currentPage - 1)}
            disabled={currentPage === 0}
            aria-label={t("Previous drawings")}
          >
            <CaretLeftIcon size={20} />
          </button>
          <span>
            {dynamic ? dynamic.pageCount(currentPage + 1, pages) : `${currentPage + 1} ${locale === "es-419" ? "de" : "of"} ${pages}`}
          </span>
          <button
            className="quiet-button"
            onClick={() => onPage(currentPage + 1)}
            disabled={currentPage === pages - 1}
            aria-label={t("More drawings")}
          >
            <ArrowRightIcon size={20} />
          </button>
        </nav>
      </footer>
    </main>
  );
}
