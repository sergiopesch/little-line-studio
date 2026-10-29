// Keep this endpoint pinned: a new SDK version or diagnostic needs review.
const diagnostic = new URL("https://cdn.tldraw.com/5.5.2/watermarks/watermark-track.svg");

export function expectedBlockedDiagnostic(message, violations) {
  if (!/Content[- ]Security[- ]Policy/i.test(message)) return false;
  const address = message.match(/https:\/\/cdn\.tldraw\.com\/[^\s"'<>]+/)?.[0];
  if (!address) return false;
  let url;
  try { url = new URL(address); } catch { return false; }
  if (url.origin !== diagnostic.origin || url.pathname !== diagnostic.pathname) return false;
  return violations.some(event => event.directive === "connect-src" && event.disposition === "enforce" &&
    event.origin === diagnostic.origin &&
    (event.pathname === diagnostic.pathname || event.pathname === "/"));
}
