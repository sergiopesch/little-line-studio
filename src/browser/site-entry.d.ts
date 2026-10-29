// Vite selects the licensed or restricted entry at build time.
declare module "@site-entry" {
  export const SiteEntry: typeof import("../StudioEntry.tsx").StudioEntry;
  export const dynamicLocale: typeof import("../locale-dynamic.js").dynamicLocale;
}
