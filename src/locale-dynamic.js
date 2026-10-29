import { getLocale } from "./locale-registry.js";

export const dynamicLocale = locale => getLocale(locale)?.dynamic ?? null;
