import { useLocale } from "./i18n.jsx";
import { Modal } from "./Modal.jsx";

export function Privacy({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  return (
    <Modal
      title={t("Privacy & supervision")}
      onClose={onClose}
      className="privacy-modal"
    >
      <p>
        {t("A grown-up stays alongside throughout. The checkbox is a reminder, not a way to verify supervision.")}
      </p>
      <ul className="privacy-list">
        <li>{t("Your child draws on paper. This website cannot see or judge it.")}</li>
        <li>
          {t("No microphone, camera, uploads, accounts, advertising, app analytics or child profiles.")}
        </li>
        <li>
          {t("Your lesson choice and settings stay in this page’s memory and reset on reload.")}
        </li>
        <li>
          {t("Voice and music play from this site. There is no live AI conversation.")}
        </li>
        <li>
          {t("The hosting provider receives ordinary connection information when serving the page and audio.")}
        </li>
      </ul>
      <p className="licence-note">
        <a href="/tldraw/LICENSE.md" target="_blank" rel="noopener noreferrer">
          {t("Legal notices")}
        </a>{" "}
        ·{" "}
        <a
          href="/narration/NOTICE.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Audio credits")}
        </a>
      </p>
      <button className="primary wide" onClick={onClose}>
        {t("Back to drawing together")}
      </button>
    </Modal>
  );
}
