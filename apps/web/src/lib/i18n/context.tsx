"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface Language {
  code: string;
  name: string;
  nativeName: string;
  rtl?: boolean;
}

interface TranslationKeys {
  common: Record<string, string>;
  auth: Record<string, string>;
  dashboard: Record<string, string>;
  billing: Record<string, string>;
  onboarding: Record<string, string>;
  builder: Record<string, string>;
  errors: Record<string, string>;
}

interface I18nContextType {
  language: string;
  languages: Language[];
  translations: Partial<TranslationKeys>;
  isLoading: boolean;
  setLanguage: (lang: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const DEFAULT_LANGUAGE = "en";
const STORAGE_KEY = "preferred_language";

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function detectBrowserLanguage(): string {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE;
  }
  
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (!browserLang) return DEFAULT_LANGUAGE;
  
  return browserLang.split("-")[0].toLowerCase();
}

function getStoredLanguage(): string | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }
  return localStorage.getItem(STORAGE_KEY);
}

function setStoredLanguage(lang: string): void {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, lang);
  }
}

function getNestedValue(obj: any, path: string): string | undefined {
  const keys = path.split(".");
  let current = obj;
  
  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }
  
  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return params[key]?.toString() ?? `{{${key}}}`;
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<string>(DEFAULT_LANGUAGE);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [translations, setTranslations] = useState<Partial<TranslationKeys>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedLang = getStoredLanguage();
    const browserLang = detectBrowserLanguage();
    const initialLang = storedLang || browserLang || DEFAULT_LANGUAGE;
    setLanguageState(initialLang);
    
    fetch("/api/i18n/languages")
      .then((res) => res.json())
      .then((data) => {
        setLanguages(data.languages || []);
        const supportedCodes = (data.languages || []).map((l: Language) => l.code);
        if (!supportedCodes.includes(initialLang)) {
          setLanguageState(DEFAULT_LANGUAGE);
          loadTranslations(DEFAULT_LANGUAGE);
        } else {
          loadTranslations(initialLang);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch languages:", err);
        setIsLoading(false);
      });
  }, []);

  const loadTranslations = useCallback(async (lang: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/i18n/${lang}`);
      const data = await res.json();
      setTranslations(data.translations || {});
    } catch (err) {
      console.error("Failed to load translations:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setLanguage = useCallback((lang: string) => {
    setLanguageState(lang);
    setStoredLanguage(lang);
    loadTranslations(lang);
    
    const langInfo = languages.find((l) => l.code === lang);
    if (typeof document !== "undefined") {
      if (langInfo?.rtl) {
        document.documentElement.dir = "rtl";
        document.documentElement.classList.add("rtl");
      } else {
        document.documentElement.dir = "ltr";
        document.documentElement.classList.remove("rtl");
      }
    }
  }, [languages, loadTranslations]);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(translations, key);
    if (!value) return key;
    if (params) {
      return interpolate(value, params);
    }
    return value;
  }, [translations]);

  return (
    <I18nContext.Provider value={{ language, languages, translations, isLoading, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function useTranslation() {
  const { t, language, isLoading } = useI18n();
  return { t, language, isLoading };
}
