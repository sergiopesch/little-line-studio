import { useLocale } from "./i18n.jsx";
import { useState } from "react";
import { CheckIcon, SpeakerHighIcon, StopIcon } from "@phosphor-icons/react";
import { Modal } from "./Modal.jsx";

function Setting({ title, description, checked, onChange, label, disabled = false }) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button
        className={`switch ${checked ? "on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={label || title}
        onClick={onChange}
        disabled={disabled}
      >
        <span />
      </button>
    </div>
  );
}

export function Settings({
  onClose,
  voiceOn,
  voiceAvailable = true,
  onVoice,
  musicOn,
  onMusic,
  volume,
  onVolume,
  still,
  onStill,
  speed,
  onSpeed,
  onSample,
  speaking,
  voiceUnavailable,
  onPrivacy,
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState("sound");
  function changeTab(value) {
    if (value !== tab) {
      if (speaking) onSample();
      setTab(value);
    }
  }
  return (
    <Modal
      title={t("A little comfort.")}
      onClose={onClose}
      className="settings-modal"
    >
      <div
        className="settings-tabs"
        role="tablist"
        aria-label={t("Parent settings categories")}
      >
        {[
          ["sound", "Sound"],
          ["drawing", "Drawing"],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            id={`tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => changeTab(value)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? "sound"
                    : e.key === "End"
                      ? "drawing"
                      : tab === "sound"
                        ? "drawing"
                        : "sound";
                changeTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {tab === "sound" ? (
        <section role="tabpanel" id="panel-sound" aria-labelledby="tab-sound">
          <Setting
            title={t("Read instructions aloud")}
            description={t("Short, prepared audio. No microphone.")}
            checked={voiceOn}
            disabled={!voiceAvailable}
            onChange={onVoice}
          />
          <button className="sample-button compact" onClick={onSample} disabled={!voiceAvailable}>
            {speaking ? <StopIcon size={20} /> : <SpeakerHighIcon size={21} />}{" "}
            {t(speaking ? "Stop voice check" : "Check the voice")}
          </button>
          {!voiceAvailable && <p className="sound-guidance">{t("Spanish voice is being prepared. Read the steps together for now.")}</p>}
          {voiceUnavailable && (
            <p className="sound-guidance" role="status">
              {t("Sound couldn’t play. Check your device volume or try again.")}
            </p>
          )}
          <Setting
            title={t("Gentle music")}
            description={t("Starts with the lesson. Mute any time.")}
            label={t("Enable background music")}
            checked={musicOn}
            onChange={onMusic}
          />
          <label className="volume-label">
            {t("Music volume")} <span>{Math.round(volume * 100)}%</span>
            <input
              aria-label={t("Music volume")}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => onVolume(Number(e.target.value))}
            />
          </label>
          <p className="settings-note">
            {t("Music fades softly under teaching. Pause and mute stop it immediately.")}
          </p>
        </section>
      ) : (
        <section
          role="tabpanel"
          id="panel-drawing"
          aria-labelledby="tab-drawing"
        >
          <Setting
            title={t("Still demonstrations")}
            label={t("Use still demonstrations")}
            description={t("Show the little part without movement.")}
            checked={still}
            onChange={onStill}
          />
          <fieldset className="speed-picker" disabled={still}>
            <legend>{t("Demonstration pace")}</legend>
            {[
              ["slow", "Slow"],
              ["slower", "Extra slow"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="speed"
                  checked={speed === value}
                  onChange={() => onSpeed(value)}
                />
                {t(label)}
              </label>
            ))}
          </fieldset>
          <p className="gentle-note">
            {t("More time holds the current part until you choose Continue lesson. Extra slow also gives longer quiet drawing breaks. Device reduced-motion settings are respected too.")}
          </p>
        </section>
      )}
      <div className="dialog-actions">
        <button className="quiet-button" onClick={onPrivacy}>
          {t("Privacy & supervision")}
        </button>
        <button className="primary" onClick={onClose}>
          {t("Done")} <CheckIcon size={21} />
        </button>
      </div>
    </Modal>
  );
}
