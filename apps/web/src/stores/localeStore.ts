import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale, MessageKey } from "../i18n/messages";
import { t as translate } from "../i18n/messages";

interface LocaleStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}

export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set, get) => ({
      locale: "zh-Hant",
      setLocale: (locale) => set({ locale }),
      t: (key) => translate(key, get().locale),
    }),
    { name: "blade-arena-locale" }
  )
);

export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return (key: MessageKey) => translate(key, locale);
}
