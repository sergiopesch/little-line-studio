import { useLocale } from "./i18n.jsx";
import { useState } from "react";
import { ArrowRightIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { Modal } from "./Modal.jsx";
import { LANGUAGES, languageAvailabilityCopy, languageAvailableForLevel } from "./languages.js";
import "./entry-flow.css";

export function LanguageFlag({ language }) {
  return <span className="language-flag" aria-hidden="true">{language.flag}</span>;
}

export function LanguageCarousel() {
  const { t } = useLocale();
  const [paused, setPaused] = useState(false);

  return (
    <section className="language-carousel" aria-labelledby="home-languages-title">
      <div className="language-carousel-heading">
        <h2 id="home-languages-title">{t("Draw in your language.")}</h2>
        <p>{t(languageAvailabilityCopy().banner)}</p>
      </div>
      <div className="language-carousel-row">
        <div className="language-marquee" data-paused={paused}>
          {[false, true].map((duplicate) => (
            <ul className="language-track" key={String(duplicate)} aria-hidden={duplicate || undefined}>
              {LANGUAGES.map((language) => (
                <li className="language-tile" key={language.id}>
                  <LanguageFlag language={language} />
                  <span><strong lang={language.id}>{language.name}</strong><small>{t(language.region)}</small></span>
                </li>
              ))}
            </ul>
          ))}
        </div>
        <button className="language-motion-toggle" onClick={() => setPaused((value) => !value)}
          aria-label={t(paused ? "Play language banner" : "Pause language banner")}>
          {paused ? <PlayIcon size={15} /> : <PauseIcon size={15} />}
        </button>
      </div>
    </section>
  );
}

export function LanguagePicker({ level, onSelect, onClose, pending = null, error = false }) {
  const { t } = useLocale();
  return (
    <Modal title={t("Choose your language")} onClose={onClose} className="language-modal">
      <p className="language-modal-intro">{t(level.name)}. {t("Next, pick your drawing.")}</p>
      <div className="language-options" role="group" aria-label={t("Lesson language")}>
        {LANGUAGES.map((language) => {
          const ready = languageAvailableForLevel(language.id, level.id);
          return <button key={language.id} className="language-option" disabled={!ready || pending === language.id}
            aria-busy={pending === language.id || undefined}
            onClick={() => onSelect(language.id)}>
            <LanguageFlag language={language} />
            <span><strong lang={language.id}>{language.name}</strong><small>{t(language.region)}</small></span>
            {ready ? <ArrowRightIcon size={21} /> : <small className="language-preparing">{t("Preparing")}</small>}
          </button>;
        })}
      </div>
      <p className="language-modal-note">{t(languageAvailabilityCopy().note)}</p>
      {pending && <p className="language-modal-note" role="status">{t("Loading Spanish lessons…")}</p>}
      {error && <p className="language-modal-note" role="alert">{t("Spanish lessons could not load. Please try again.")}</p>}
      {LANGUAGES.find((language) => language.id === "es-419")?.ready &&
        !languageAvailableForLevel("es-419", level.id) && (
          <p className="language-modal-note">{t("Spanish lessons in this level are being prepared. Choose another level or language.")}</p>
        )}
    </Modal>
  );
}
