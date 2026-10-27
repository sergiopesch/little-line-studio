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
