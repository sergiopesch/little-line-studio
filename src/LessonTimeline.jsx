import { useLocale } from "./i18n.jsx";
import { formatTogetherTime, getLessonProgress } from "./lesson-progress.js";
import { FRENCH_DYNAMIC, timelineEstimate } from "./french-dynamic.fr-FR.js";
import "./cat-timeline.css";

export default function LessonTimeline(props) {
  const { t, locale } = useLocale();
  const progress = getLessonProgress({
    ...props,
    narrationDurations: props.narrationDurations || {},
  });
  const estimate = locale === "fr-FR" ? timelineEstimate(progress, t) : locale === "es-419" && /^About \d+ min left$/.test(progress.estimateLabel)
    ? `Quedan unos ${Math.ceil(progress.remainingMs / 60000)} min` : t(progress.estimateLabel);
  return (
    <section className="cat-timeline" aria-label={t("Lesson timeline")}>
      <div className="cat-timeline-summary">
        <span className="cat-timeline-phase">{t(progress.phaseLabel)}</span>
        <span className="cat-timeline-time">
          <span aria-live="off">
            {locale === "fr-FR" ? FRENCH_DYNAMIC.together(formatTogetherTime(progress.elapsedMs)) : `${formatTogetherTime(progress.elapsedMs)} ${locale === "es-419" ? "juntos" : "together"}`}
          </span>
          <span className="cat-timeline-estimate">{estimate}</span>
        </span>
      </div>
      <div
        className="cat-timeline-track"
        role="progressbar"
        aria-label={t("Guided lesson progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.progressPercent}
        aria-valuetext={`${t(progress.phaseLabel)}. ${estimate}.`}
      >
        {progress.segments.map((segment) => (
          <span
            className="cat-timeline-segment"
            key={segment.key}
            data-status={segment.status}
          >
            <span style={{ width: `${segment.progress * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="cat-timeline-labels" aria-hidden="true">
        {progress.segments.map((segment) => (
          <span key={segment.key} data-status={segment.status}>
            {t(segment.label)}
          </span>
        ))}
      </div>
      <p className="cat-timeline-note">
        {t("Estimates are a guide. More time is always yours.")}
      </p>
    </section>
  );
}
