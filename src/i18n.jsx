import { createContext, useContext } from "react";
import { translate } from "./ui-translations.js";

export { translate } from "./ui-translations.js";
export const LocaleContext = createContext("en-GB");

export function useLocale() {
  const locale = useContext(LocaleContext);
  return { locale, t: (text) => translate(locale, text) };
}
