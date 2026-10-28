import React from "react";
import { createRoot } from "react-dom/client";
import { SiteEntry } from "@site-entry";
import "@fontsource/nunito/latin-400.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/nunito/latin-900.css";
import "./styles.css";
import "./brand.css";
import { FRENCH_DYNAMIC } from "./french-dynamic.fr-FR.js";

class LessonBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // A failed lesson must not leave its sound playing behind an error screen.
    try {
      globalThis.speechSynthesis?.cancel();
    } catch {
      /* Browser speech unavailable. */
    }
  }
  render() {
    if (this.state.failed) {
      const spanish = document.documentElement.lang === "es-419";
      const french = document.documentElement.lang === "fr-FR";
      return (
        <main className="error-page">
          <h1>{french ? FRENCH_DYNAMIC.errorTitle : spanish ? "Tomemos una pequeña pausa." : "Let’s take a little pause."}</h1>
          <p>
            {french ? FRENCH_DYNAMIC.errorBody : spanish
              ? "No se pudo abrir la clase. Tu dibujo en papel es tuyo. Pídele a la persona adulta que vuelva a cargar la página cuando estén listos."
              : "The lesson could not open. Your paper drawing is yours to keep. Ask your grown-up to reload when you’re ready."}
          </p>
          <a href="/">{french ? FRENCH_DYNAMIC.errorReload : spanish ? "Volver a cargar la clase" : "Reload the lesson"}</a>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LessonBoundary>
      <SiteEntry />
    </LessonBoundary>
  </React.StrictMode>,
);
