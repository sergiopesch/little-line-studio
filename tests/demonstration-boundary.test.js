import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DemonstrationErrorBoundary, {
  DemonstrationFailure,
} from "../src/DemonstrationErrorBoundary.js";

test("demonstration failure keeps a written-instruction path without exposing exception details", () => {
  const boundary = new DemonstrationErrorBoundary({
    children: createElement("p", null, "drawing runtime"),
  });
  boundary.state = DemonstrationErrorBoundary.getDerivedStateFromError(
    new Error("private runtime details"),
  );
  const markup = renderToStaticMarkup(boundary.render());
  assert.match(markup, /role="alert"/);
  assert.match(markup, /written instructions together/);
  assert.doesNotMatch(
    markup,
    /private runtime details|drawing runtime|<button/,
  );
});

test("retry is offered only when the caller supplies a real recovery action", () => {
  let retries = 0;
  const element = DemonstrationFailure({ onRetry: () => retries++ });
  const action = element.props.children[2];
  assert.equal(retries, 0);
  assert.equal(action.type, "button");
  assert.equal(action.props.type, "button");
  action.props.onClick();
  assert.equal(retries, 1);
  assert.equal(DemonstrationFailure({}).props.children[2], null);
});

test("a caught board failure notifies the owner without passing private exception details", () => {
  const calls = [];
  const boundary = new DemonstrationErrorBoundary({
    onError: (...args) => calls.push(args),
  });
  boundary.componentDidCatch(new Error("private exception"), {
    componentStack: "private stack",
  });
  assert.deepEqual(calls, [[]]);
  assert.doesNotThrow(() =>
    new DemonstrationErrorBoundary({}).componentDidCatch(),
  );
});

test("board recovery instructions are localized for all released language options", () => {
  for (const [locale, message] of [
    ["en-GB", "The drawing demonstration is unavailable."],
    ["en-IE", "The drawing demonstration is unavailable."],
    ["en-GB-x-scotland", "The drawing demonstration is unavailable."],
    ["es-419", "La demostración de dibujo no está disponible."],
    ["es-ES", "La demostración de dibujo no está disponible."],
    ["fr-FR", "La démonstration de dessin n’est pas disponible."],
    ["de-DE", "Die Zeichenvorführung ist nicht verfügbar."],
    ["it-IT", "La dimostrazione di disegno non è disponibile."],
    ["nl-NL", "De tekendemonstratie is niet beschikbaar."],
  ]) {
    const markup = renderToStaticMarkup(createElement(DemonstrationFailure, { locale }));
    assert.ok(markup.includes(message), locale);
    if (!locale.startsWith("en-")) assert.doesNotMatch(markup, /written instructions|drawing demonstration/);
  }
});
