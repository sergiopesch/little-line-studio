import { Component, createElement } from "react";
import { FRENCH_UI } from "./french-ui.fr-FR.js";

export function DemonstrationFailure({ onRetry, locale = "en-GB" }) {
  const spanish = locale === "es-419";
  const translate = (text) => locale === "fr-FR" ? (FRENCH_UI[text] ?? text) : text;
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
