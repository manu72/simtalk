export type Language = {
  readonly code: string;
  readonly bcp47: string;
  readonly name: string;
  readonly flag: string;
  readonly color: string;
};

export const LANGUAGES: readonly Language[] = [
  { code: 'EN',    bcp47: 'en',      name: 'English',              flag: '🇬🇧', color: '#2BE6F2' },
  { code: 'ES',    bcp47: 'es',      name: 'Spanish',              flag: '🇪🇸', color: '#FF3E9E' },
  { code: 'FR',    bcp47: 'fr',      name: 'French',               flag: '🇫🇷', color: '#8B5BFF' },
  { code: 'DE',    bcp47: 'de',      name: 'German',               flag: '🇩🇪', color: '#FFD23F' },
  { code: 'IT',    bcp47: 'it',      name: 'Italian',              flag: '🇮🇹', color: '#34D27A' },
  { code: 'PT',    bcp47: 'pt',      name: 'Portuguese',           flag: '🇵🇹', color: '#FF9F1C' },
  { code: 'JA',    bcp47: 'ja',      name: 'Japanese',             flag: '🇯🇵', color: '#FF5A5F' },
  { code: 'KO',    bcp47: 'ko',      name: 'Korean',               flag: '🇰🇷', color: '#6B3FD0' },
  { code: 'ZH',    bcp47: 'zh-Hans', name: 'Chinese (Simplified)', flag: '🇨🇳', color: '#34D27A' },
  { code: 'AR',    bcp47: 'ar',      name: 'Arabic',               flag: '🇸🇦', color: '#FFD23F' }
] as const;

const FALLBACK_LANGUAGE: Language = LANGUAGES[0]!;

export const findLanguage = (bcp47: string): Language =>
  LANGUAGES.find((lang) => lang.bcp47 === bcp47) ?? FALLBACK_LANGUAGE;
