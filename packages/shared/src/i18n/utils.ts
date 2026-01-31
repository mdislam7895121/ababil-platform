import { TranslationKeys } from './types';
import { DEFAULT_LANGUAGE } from './languages';

type NestedKeyOf<T> = T extends object
  ? { [K in keyof T]: K extends string ? `${K}` | `${K}.${NestedKeyOf<T[K]>}` : never }[keyof T]
  : never;

export type TranslationKey = NestedKeyOf<TranslationKeys>;

export function getNestedValue(obj: any, path: string): string | undefined {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }
  
  return typeof current === 'string' ? current : undefined;
}

export function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return params[key]?.toString() ?? `{{${key}}}`;
  });
}

export function mergeTranslations(
  base: Partial<TranslationKeys>,
  override: Partial<TranslationKeys>
): Partial<TranslationKeys> {
  const result: any = { ...base };
  
  for (const key in override) {
    if (typeof override[key as keyof TranslationKeys] === 'object' && override[key as keyof TranslationKeys] !== null) {
      result[key] = {
        ...(result[key] || {}),
        ...override[key as keyof TranslationKeys]
      };
    } else {
      result[key] = override[key as keyof TranslationKeys];
    }
  }
  
  return result;
}

export function detectBrowserLanguage(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return DEFAULT_LANGUAGE;
  }
  
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (!browserLang) return DEFAULT_LANGUAGE;
  
  const langCode = browserLang.split('-')[0].toLowerCase();
  return langCode;
}

export function getStoredLanguage(): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  
  return localStorage.getItem('preferred_language');
}

export function setStoredLanguage(lang: string): void {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.setItem('preferred_language', lang);
  }
}
