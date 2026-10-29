import { Component, createElement } from "react";
import { FRENCH_UI } from "./french-ui.fr-FR.js";
import SPAIN_UI from "./spanish-ui.es-ES.json" with { type: "json" };
import GERMAN_UI from "./german-ui.de-DE.json" with { type: "json" };
import ITALIAN_UI from "./italian-ui.it-IT.json" with { type: "json" };
import DUTCH_UI from "./dutch-ui.nl-NL.json" with { type: "json" };

export function DemonstrationFailure({ onRetry, locale = "en-GB" }) {
  const spanish = locale === "es-419";
  const dictionary = { "fr-FR": FRENCH_UI, "es-ES": SPAIN_UI, "de-DE": GERMAN_UI, "it-IT": ITALIAN_UI, "nl-NL": DUTCH_UI }[locale];
  const translate = (text) => dictionary?.[text] ?? text;
  return createElement(
    "div",
    { className: "demonstration-unavailable", role: "alert" },
    createElement("p", null, spanish ? "La demostración de dibujo no está disponible." : translate("The drawing demonstration is unavailable.")),
    createElement(
      "p",
      null,
      spanish ? "Pueden continuar juntos con las instrucciones escritas. Su dibujo queda en el papel." : translate("You can keep using the written instructions together. Your drawing stays on paper."),
    ),
    typeof onRetry === "function"
      ? createElement(
          "button",
          { type: "button", onClick: onRetry },
          spanish ? "Intentar cargar la demostración de nuevo" : translate("Try loading the demonstration again"),
        )
      : null,
  );
}

// Keep this boundary around the board only, so failed chunks cannot hide the lesson controls.
// onRetry belongs to the caller: a rejected React.lazy import needs a fresh loader or page reload.
export default class DemonstrationErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed
      ? createElement(DemonstrationFailure, { onRetry: this.props.onRetry, locale: this.props.locale })
      : this.props.children;
  }
}
