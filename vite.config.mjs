import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { randomBytes } from "node:crypto";
import { securityHeaders } from "./config/security.js";
import { startupBudgetPlugin } from "./config/startup-budget.js";

const previewNonce = randomBytes(18).toString("base64");

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const reviewOnly =
    command === "build" && !env.VITE_TLDRAW_LICENSE_KEY?.trim();
  // Display only non-identifying parent information. The SDK verifies the key.
  let licenceInfo = null;
  try {
    const payload = JSON.parse(
      Buffer.from(
        env.VITE_TLDRAW_LICENSE_KEY.split(".")[0].split("/")[1],
        "base64",
      ).toString(),
    );
    if (
      typeof payload[2] === "number" &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload[3])
    )
      licenceInfo = {
        evaluation: Boolean(payload[2] & 16),
        expires: payload[3],
      };
  } catch {
    // Missing or malformed keys remain the SDK's responsibility.
  }
  return {
    define: { __TLDRAW_LICENSE_INFO__: JSON.stringify(licenceInfo) },
    resolve: {
      // Keep the unlicensed SDK out of the hosted review build entirely.
      alias: {
        "@site-entry": fileURLToPath(
          new URL(
            reviewOnly ? "./src/LicenceReview.jsx" : "./src/LessonEntry.jsx",
            import.meta.url,
          ),
        ),
      },
    },
    html: { cspNonce: previewNonce },
    preview: { host: "127.0.0.1", headers: securityHeaders },
    build: {
      outDir: "dist/client",
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL("./index.html", import.meta.url)),
          about: fileURLToPath(new URL("./about/index.html", import.meta.url)),
        },
      },
      modulePreload: {
        // WebKit can retain a failed preloaded entry that imports shared code
        // from its importer. Let import() fetch that entry so an explicit retry
        // can recover; preserve CSS and shared dependency preloads.
        resolveDependencies: (entry, dependencies, { hostType }) =>
          hostType === "js" ? dependencies.filter(dependency => dependency !== entry) : dependencies,
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      host: "127.0.0.1",
      // Staged recordings are generated in a large ignored cache, not served by Vite.
      watch: { ignored: ["**/media/elevenlabs/**"] },
      headers: {
        "Permissions-Policy": "microphone=(), camera=(), geolocation=()",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${previewNonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'`,
      },
      allowedHosts: ["terminal.local"],
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    plugins: [react(), startupBudgetPlugin()],
  };
});
