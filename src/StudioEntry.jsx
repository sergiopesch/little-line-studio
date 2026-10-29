import { useEffect, useState } from "react";
import { Home } from "./Home.jsx";
import { HowItWorks } from "./HowItWorks.jsx";
import { Privacy } from "./Privacy.jsx";
import { LanguagePicker } from "./LanguagePicker.jsx";
import { getLevel } from "./lesson-levels.js";
import { languageAvailableForLevel } from "./languages.js";
import { createLatestLanguageRequest } from "./language-request.js";
import { loadStudio, prepareEntry } from "./entry-loading.js";

export function StudioEntry() {
  const [entry, setEntry] = useState(null);
  const [level, setLevel] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(false);
  const [request] = useState(createLatestLanguageRequest);
  useEffect(() => {
    document.querySelector("main h1")?.focus({ preventScroll: true });
    return () => request.cancel();
  }, [request]);

  function closePicker() {
    request.cancel();
    setLevel(null);
    setPending(null);
    setError(false);
  }
  function explore(levelId) {
    if (!getLevel(levelId)) return;
    closePicker();
    setLevel(levelId);
    // A deliberate exploration starts the download without mounting audio or
    // selecting a language. A failure remains retryable from the picker.
    void loadStudio().catch(() => {});
  }
  function selectLanguage(languageId) {
    if (!getLevel(level) || !languageAvailableForLevel(languageId, level)) return;
    void request.run(() => prepareEntry(languageId, level), {
      onStart: () => { setPending(languageId); setError(false); },
      onSuccess: next => {
        if (!next.studio.activateInitialSelection(next.selection))
          throw new TypeError("The selected narration could not be verified.");
        setEntry(next);
      },
      onError: () => { setPending(null); setError(true); },
    });
  }

  if (entry) {
    const { App } = entry.studio;
    return <App initialSelection={entry.selection} />;
  }
  return <>
    <Home onExplore={explore} onPrivacy={() => setOverlay("privacy")} onHow={() => setOverlay("how")} />
    {level && <LanguagePicker level={getLevel(level)} onSelect={selectLanguage}
      onClose={closePicker} pending={pending} error={error} />}
    {overlay === "privacy" && <Privacy onClose={() => setOverlay(null)} />}
    {overlay === "how" && <HowItWorks onClose={() => setOverlay(null)} />}
  </>;
}
