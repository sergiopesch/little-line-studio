import type { ReactNode } from "react";
interface FailureProps {
  onRetry?: (() => void) | undefined;
  locale?: string | undefined;
}
interface BoundaryProps extends FailureProps {
  children: ReactNode;
  resetKey: string | number;
  onError?: () => void;
}
import { Component, createElement } from "react";
import { translate } from "../ui-translations.js";

export function DemonstrationFailure({ onRetry, locale = "en-GB" }: FailureProps) {
  const t = (text: string) => translate(locale, text);
  return createElement(
    "div",
    { className: "demonstration-unavailable", role: "alert" },
    createElement("p", null, t("The drawing demonstration is unavailable.")),
    createElement(
      "p",
      null,
      t("You can keep using the written instructions together. Your drawing stays on paper."),
    ),
    typeof onRetry === "function"
      ? createElement(
          "button",
          { type: "button", onClick: onRetry },
          t("Try loading the demonstration again"),
        )
      : null,
  );
}

// Keep this boundary around the board only, so failed chunks cannot hide the lesson controls.
// onRetry belongs to the caller: a rejected React.lazy import needs a fresh loader or page reload.
export default class DemonstrationErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  componentDidUpdate(previousProps: BoundaryProps) {
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
