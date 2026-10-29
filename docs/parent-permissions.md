# Parent-controlled assistance: design for review

**Status: proposed next-stage design, not a live feature.** The shipped app has no accounts, capture, uploads, runtime cloud AI or family-session bridge. The local agent workspace operates on public lessons and isolated rehearsals. The existing supervision acknowledgement does not establish identity or verified consent.

This proposal makes the next decision concrete: an adult could request help with an authored lesson without handing an agent control of a family session. Product wording, authentication, provider/data handling and any new network capability need review before implementation.

## Smallest useful sharing scope

The first candidate is a parent-initiated, one-shot request using a preview of public lesson context. The preview would show the locale, lesson title, selected step and the exact authored instruction/hint being shared. Sharing would start off and require an explicit action for each request. A live feed, free-text child description and automatic sharing on lesson changes are outside this candidate.

A request would contain only allowlisted public content identifiers and a content revision. The trusted host would resolve the approved text itself; the agent could not substitute a URL, provider prompt, file path, transcript or additional lesson. Even public lesson choices can reveal activity when linked to a household, so the request must not include a child name, age, history, persistent device identifier or browser session snapshot.

No drawing, microphone, camera, screen, location or account data would be shared. There is no evidence from the current prototype that those capabilities are needed. Adding any of them would be a separate product/privacy decision.

## Authority and lifecycle

| Boundary | Proposed rule |
| --- | --- |
| Parent action | Preview the exact approved fields and recipient before creating a grant. Cancel closes the preview without a request. |
| Trusted host | Establish the parent's authenticated session if the feature uses a backend; a checkbox, agent assertion or client role field is insufficient. Select the authentication approach separately. |
| Grant | Bind one request to its issuer, intended recipient, operation, locale, lesson, step, content revision and expiry. No wildcard, delegation or agent-controlled scope changes. |
| Admission | Check authority, scope, expiry and revocation at every dispatch. Bound request size, execution time, rate and concurrent work. Fail closed if authorization state cannot be checked. |
| In-flight result | Recheck the grant before releasing a result and before displaying it. A changed lesson/locale or replaced request makes the old response ineligible. |
| Stop or expiry | Stop accepting work, suppress late results and request cancellation of outstanding work. A replacement grant requires a fresh parent action. |
| Lesson control | The existing authored controller remains authoritative. An agent cannot start/resume a lesson, advance a step, change sound or permissions, or mark supervision present. |
| Output | Present only a bounded, validated result to the adult for review. No direct insertion into the child's spoken instructions, external links, HTML or executable commands. |

Use established session/authentication components, not a custom token scheme. The trusted host must enforce authorization outside the model's prompt and outside editable browser state. If implemented, session credentials must not be exposed to agents or stored in localStorage; cookie-based changes also need CSRF protection. These boundaries follow [OWASP's authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) and [session-management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Expiry should be short and enforced by the trusted host's clock. The exact lifetime is still a design decision; it must not silently extend when an agent retries. Revocation must prevent subsequent dispatch and delivery even if cancellation cannot stop an already executing provider call. Revocation cannot retract information already sent to a recipient; the preview and provider agreement must make that limit clear.

## Data handling to settle before a network pilot

Choose the recipient/provider and document what it receives, where it processes the request, its retention and deletion behavior, and whether requests are used for training. Avoid recording content or credentials in logs. If an audit record is needed, define its minimum fields and deletion deadline explicitly rather than adding analytics to the current app.

Network and filesystem access for an agent worker must be independently restricted by its host. The existing CLI grant is not an operating-system sandbox. Do not turn the current local CLI into a public endpoint or treat possession of a request ID as authorization.

## Acceptance cases before enabling live assistance

1. Without a parent action and valid host-issued grant, no request reaches a provider.
2. Another household, recipient, operation, lesson, locale, step or content revision is denied, including guessed identifiers.
3. Revocation or expiry during loading/execution prevents result delivery; replaying a completed request does not start another paid call.
4. Navigating, closing the preview or replacing a request suppresses late responses without changing current lesson/audio state.
5. Prompt injection and malformed agent output cannot widen permissions, issue lesson commands or cause arbitrary network/file access.
6. Authorization-service outages, provider timeouts and rate limits leave the existing authored lesson usable, with no automatic data-sharing retry.
7. Request/log inspection confirms that no child data, media, credential or full browser state crosses the boundary.
8. Parent usability review and independent adversarial testing confirm the behavior and its limits before a public pilot.

These are proposed acceptance criteria. The current release tests the separate local workspace's closed defaults, fixed grants, public projection and revocation. It does not claim to have implemented or verified this future live-assistance design.
