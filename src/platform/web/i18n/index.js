// Centralized I18n Engine for AI Operating Platform Web Interface
// Supports es-419 (Default: Español Latinoamericano) and en (English)

import es419 from './locale-es-419.js';
import en from './locale-en.js';

export const SUPPORTED_LOCALES = {
  'es-419': {
    code: 'es-419',
    name: 'Español (Latinoamérica)',
    flag: '🌎',
    catalog: es419
  },
  'en': {
    code: 'en',
    name: 'English',
    flag: '🌐',
    catalog: en
  }
};

export const DEFAULT_LOCALE = 'es-419';
const STORAGE_KEY = 'ai_platform_locale';

export class TranslationRegistry {
  constructor() {
    this.catalogs = new Map();
    this.catalogs.set('es-419', es419);
    this.catalogs.set('en', en);
  }

  getCatalog(locale) {
    if (this.catalogs.has(locale)) {
      return this.catalogs.get(locale);
    }
    // Fallback: match prefix (e.g. es-MX -> es-419, en-US -> en)
    if (locale.startsWith('es')) {
      return this.catalogs.get('es-419');
    }
    if (locale.startsWith('en')) {
      return this.catalogs.get('en');
    }
    return this.catalogs.get(DEFAULT_LOCALE);
  }

  resolveValue(catalog, keyPath) {
    if (!catalog || !keyPath) return null;
    const parts = keyPath.split('.');
    let current = catalog;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }
    return typeof current === 'string' ? current : null;
  }
}

export class LocaleResolver {
  static resolveInitialLocale() {
    // 1. Explicit user choice in localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored && SUPPORTED_LOCALES[stored]) {
          return stored;
        }
      }
    } catch {
      // Ignore localStorage permission errors
    }

    // 2. Browser language check (if explicitly English, else default to es-419)
    try {
      if (typeof navigator !== 'undefined' && navigator.language) {
        const lang = navigator.language.toLowerCase();
        if (lang.startsWith('en')) {
          return 'en';
        }
      }
    } catch {
      // Ignore
    }

    // 3. System Default
    return DEFAULT_LOCALE;
  }

  static persistLocale(locale) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, locale);
      }
    } catch {
      // Ignore storage errors
    }
  }
}

export class I18nService {
  constructor() {
    this.registry = new TranslationRegistry();
    this.currentLocale = LocaleResolver.resolveInitialLocale();
    this.listeners = new Set();
  }

  getLocale() {
    return this.currentLocale;
  }

  getAvailableLocales() {
    return Object.values(SUPPORTED_LOCALES).map(l => ({
      code: l.code,
      name: l.name,
      flag: l.flag
    }));
  }

  setLocale(newLocale) {
    const target = SUPPORTED_LOCALES[newLocale] ? newLocale : DEFAULT_LOCALE;
    if (this.currentLocale !== target) {
      this.currentLocale = target;
      LocaleResolver.persistLocale(target);
      this.notifyListeners();
    }
    return this.currentLocale;
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentLocale);
      } catch (err) {
        console.error('Error notifying i18n listener:', err);
      }
    }
  }

  /**
   * Translate key with interpolation and safe fallback.
   * Never returns undefined, null, or translation.key.name to user if a fallback exists.
   */
  t(keyPath, params = {}) {
    if (!keyPath || typeof keyPath !== 'string') return '';

    // 1. Try current locale
    const primaryCatalog = this.registry.getCatalog(this.currentLocale);
    let value = this.registry.resolveValue(primaryCatalog, keyPath);

    // 2. Fallback to default locale if missing in current
    if (value === null && this.currentLocale !== DEFAULT_LOCALE) {
      const fallbackCatalog = this.registry.getCatalog(DEFAULT_LOCALE);
      value = this.registry.resolveValue(fallbackCatalog, keyPath);
    }

    // 3. Fallback to English catalog if missing in default
    if (value === null && this.currentLocale !== 'en') {
      const enCatalog = this.registry.getCatalog('en');
      value = this.registry.resolveValue(enCatalog, keyPath);
    }

    // 4. Last resort: Return humanized last segment or key itself
    if (value === null) {
      const segments = keyPath.split('.');
      return segments[segments.length - 1] || keyPath;
    }

    // Interpolate {paramName}
    if (params && typeof params === 'object') {
      return value.replace(/\\{([a-zA-Z0-9_]+)\\}/g, (_, match) => {
        return params[match] !== undefined ? String(params[match]) : {};
      });
    }

    return value;
  }

  formatDate(dateInput, options = {}) {
    if (!dateInput) return '-';
    try {
      const d = typeof dateInput === 'string' || typeof dateInput === 'number'
        ? new Date(dateInput)
        : dateInput;
      if (isNaN(d.getTime())) return String(dateInput);

      const localeTag = this.currentLocale === 'es-419' ? 'es-419' : 'en-US';
      return new Intl.DateTimeFormat(localeTag, {
        dateStyle: options.dateStyle || 'short',
        timeStyle: options.timeStyle || 'medium',
        ...options
      }).format(d);
    } catch {
      return String(dateInput);
    }
  }

  formatNumber(num, options = {}) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    try {
      const localeTag = this.currentLocale === 'es-419' ? 'es-419' : 'en-US';
      return new Intl.NumberFormat(localeTag, options).format(num);
    } catch {
      return String(num);
    }
  }

  formatDuration(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '0ms';
    const n = Number(ms);
    if (n < 1000) return `${Math.round(n)}ms`;
    const sec = (n / 1000).toFixed(1);
    return `${sec}s`;
  }
}

export const i18n = new I18nService();
