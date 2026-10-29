import type { LevelId } from "./core/contracts.ts";
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
  const [entry, setEntry] = useState<Awaited<ReturnType<typeof prepareEntry>> | null>(null);
  const [level, setLevel] = useState<LevelId | null>(null);
  const [overlay, setOverlay] = useState<"privacy" | "how" | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [request] = useState(createLatestLanguageRequest);
  useEffect(() => {
    document.querySelector<HTMLHeadingElement>("main h1")?.focus({ preventScroll: true });
    return () => request.cancel();
  }, [request]);

  function closePicker() {
    request.cancel();
    setLevel(null);
    setPending(null);
    setError(false);
  }
  function explore(levelId: LevelId) {
    if (!getLevel(levelId)) return;
    closePicker();
    setLevel(levelId);
    // A deliberate exploration starts the download without mounting audio or
    // selecting a language. A failure remains retryable from the picker.
    void loadStudio().catch(() => {});
  }
  function selectLanguage(languageId: string) {
    if (!level || !getLevel(level) || !languageAvailableForLevel(languageId, level)) return;
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

  const pickerLevel = getLevel(level);
  if (entry) {
    const { App } = entry.studio;
    return <App initialSelection={entry.selection} />;
  }
  return <>
    <Home onExplore={explore} onPrivacy={() => setOverlay("privacy")} onHow={() => setOverlay("how")} />
    {pickerLevel && <LanguagePicker level={pickerLevel} onSelect={selectLanguage}
      onClose={closePicker} pending={pending} error={error} />}
    {overlay === "privacy" && <Privacy onClose={() => setOverlay(null)} />}
    {overlay === "how" && <HowItWorks onClose={() => setOverlay(null)} />}
  </>;
}
