export type Language = {
  readonly code: string;
  readonly bcp47: string;
  readonly name: string;
  readonly flag: string;
  readonly color: string;
  readonly isAuto?: boolean;
};

const CYAN   = '#2BE6F2';
const PINK   = '#FF3E9E';
const PURPLE = '#8B5BFF';
const YELLOW = '#FFD23F';
const GREEN  = '#34D27A';
const ORANGE = '#FF9F1C';
const RED    = '#FF5A5F';

export const AUTO_LANGUAGE: Language = {
  code: 'AUTO',
  bcp47: '',
  name: 'Automatic',
  flag: '🌐',
  color: CYAN,
  isAuto: true
};

export const LANGUAGES: readonly Language[] = [
  { code: 'AF',  bcp47: 'af',      name: 'Afrikaans',        flag: '🇿🇦', color: GREEN },
  { code: 'SQ',  bcp47: 'sq',      name: 'Albanian',         flag: '🇦🇱', color: RED },
  { code: 'AR',  bcp47: 'ar',      name: 'Arabic',           flag: '🇸🇦', color: YELLOW },
  { code: 'HY',  bcp47: 'hy',      name: 'Armenian',         flag: '🇦🇲', color: ORANGE },
  { code: 'AZ',  bcp47: 'az',      name: 'Azerbaijani',      flag: '🇦🇿', color: CYAN },
  { code: 'EU',  bcp47: 'eu',      name: 'Basque',           flag: '🟢',  color: GREEN },
  { code: 'BE',  bcp47: 'be',      name: 'Belarusian',       flag: '🇧🇾', color: PURPLE },
  { code: 'BN',  bcp47: 'bn',      name: 'Bengali',          flag: '🇧🇩', color: PINK },
  { code: 'BS',  bcp47: 'bs',      name: 'Bosnian',          flag: '🇧🇦', color: ORANGE },
  { code: 'BG',  bcp47: 'bg',      name: 'Bulgarian',        flag: '🇧🇬', color: GREEN },
  { code: 'MY',  bcp47: 'my',      name: 'Burmese',          flag: '🇲🇲', color: YELLOW },
  { code: 'CA',  bcp47: 'ca',      name: 'Catalan',          flag: '🟡',  color: YELLOW },
  { code: 'ZH',  bcp47: 'zh-Hans', name: 'Chinese',          flag: '🇨🇳', color: RED },
  { code: 'HR',  bcp47: 'hr',      name: 'Croatian',         flag: '🇭🇷', color: CYAN },
  { code: 'CS',  bcp47: 'cs',      name: 'Czech',            flag: '🇨🇿', color: PURPLE },
  { code: 'DA',  bcp47: 'da',      name: 'Danish',           flag: '🇩🇰', color: PINK },
  { code: 'NL',  bcp47: 'nl',      name: 'Dutch',            flag: '🇳🇱', color: ORANGE },
  { code: 'DZ',  bcp47: 'dz',      name: 'Dzongkha',         flag: '🇧🇹', color: ORANGE },
  { code: 'EN',  bcp47: 'en',      name: 'English',          flag: '🇬🇧', color: CYAN },
  { code: 'EO',  bcp47: 'eo',      name: 'Esperanto',        flag: '🌐', color: GREEN },
  { code: 'ET',  bcp47: 'et',      name: 'Estonian',         flag: '🇪🇪', color: PURPLE },
  { code: 'FA',  bcp47: 'fa',      name: 'Persian (Farsi)',  flag: '🇮🇷', color: PINK },
  { code: 'FIL', bcp47: 'fil',     name: 'Filipino',         flag: '🇵🇭', color: ORANGE },
  { code: 'FI',  bcp47: 'fi',      name: 'Finnish',          flag: '🇫🇮', color: CYAN },
  { code: 'FR',  bcp47: 'fr',      name: 'French',           flag: '🇫🇷', color: PURPLE },
  { code: 'GL',  bcp47: 'gl',      name: 'Galician',         flag: '🟡', color: YELLOW },
  { code: 'KA',  bcp47: 'ka',      name: 'Georgian',         flag: '🇬🇪', color: RED },
  { code: 'DE',  bcp47: 'de',      name: 'German',           flag: '🇩🇪', color: YELLOW },
  { code: 'EL',  bcp47: 'el',      name: 'Greek',            flag: '🇬🇷', color: CYAN },
  { code: 'GU',  bcp47: 'gu',      name: 'Gujarati',         flag: '🇮🇳', color: ORANGE },
  { code: 'HT',  bcp47: 'ht',      name: 'Haitian Creole',   flag: '🇭🇹', color: PINK },
  { code: 'HAW', bcp47: 'haw',     name: 'Hawaiian',         flag: '🌺', color: PINK },
  { code: 'HE',  bcp47: 'he',      name: 'Hebrew',           flag: '🇮🇱', color: PURPLE },
  { code: 'HI',  bcp47: 'hi',      name: 'Hindi',            flag: '🇮🇳', color: ORANGE },
  { code: 'HU',  bcp47: 'hu',      name: 'Hungarian',        flag: '🇭🇺', color: GREEN },
  { code: 'ID',  bcp47: 'id',      name: 'Indonesian',       flag: '🇮🇩', color: RED },
  { code: 'IT',  bcp47: 'it',      name: 'Italian',          flag: '🇮🇹', color: GREEN },
  { code: 'JA',  bcp47: 'ja',      name: 'Japanese',         flag: '🇯🇵', color: RED },
  { code: 'JV',  bcp47: 'jv',      name: 'Javanese',         flag: '🇮🇩', color: ORANGE },
  { code: 'KK',  bcp47: 'kk',      name: 'Kazakh',           flag: '🇰🇿', color: CYAN },
  { code: 'KO',  bcp47: 'ko',      name: 'Korean',           flag: '🇰🇷', color: PURPLE },
  { code: 'KU',  bcp47: 'ku',      name: 'Kurdish',          flag: '🟡', color: YELLOW },
  { code: 'LA',  bcp47: 'la',      name: 'Latin',            flag: '🏛️', color: YELLOW },
  { code: 'LV',  bcp47: 'lv',      name: 'Latvian',          flag: '🇱🇻', color: PINK },
  { code: 'LT',  bcp47: 'lt',      name: 'Lithuanian',       flag: '🇱🇹', color: GREEN },
  { code: 'MK',  bcp47: 'mk',      name: 'Macedonian',       flag: '🇲🇰', color: RED },
  { code: 'MS',  bcp47: 'ms',      name: 'Malay',            flag: '🇲🇾', color: CYAN },
  { code: 'ML',  bcp47: 'ml',      name: 'Malayalam',        flag: '🇮🇳', color: ORANGE },
  { code: 'MI',  bcp47: 'mi',      name: 'Maori',            flag: '🇳🇿', color: PURPLE },
  { code: 'MN',  bcp47: 'mn',      name: 'Mongolian',        flag: '🇲🇳', color: PINK },
  { code: 'NE',  bcp47: 'ne',      name: 'Nepali',           flag: '🇳🇵', color: RED },
  { code: 'NO',  bcp47: 'no',      name: 'Norwegian',        flag: '🇳🇴', color: ORANGE },
  { code: 'NN',  bcp47: 'nn',      name: 'Nynorsk',          flag: '🇳🇴', color: YELLOW },
  { code: 'PL',  bcp47: 'pl',      name: 'Polish',           flag: '🇵🇱', color: GREEN },
  { code: 'PT',  bcp47: 'pt',      name: 'Portuguese',       flag: '🇵🇹', color: ORANGE },
  { code: 'PA',  bcp47: 'pa',      name: 'Punjabi',          flag: '🇮🇳', color: RED },
  { code: 'RO',  bcp47: 'ro',      name: 'Romanian',         flag: '🇷🇴', color: CYAN },
  { code: 'RU',  bcp47: 'ru',      name: 'Russian',          flag: '🇷🇺', color: RED },
  { code: 'SR',  bcp47: 'sr',      name: 'Serbian',          flag: '🇷🇸', color: PURPLE },
  { code: 'SN',  bcp47: 'sn',      name: 'Shona',            flag: '🇿🇼', color: GREEN },
  { code: 'SK',  bcp47: 'sk',      name: 'Slovak',           flag: '🇸🇰', color: PINK },
  { code: 'SL',  bcp47: 'sl',      name: 'Slovenian',        flag: '🇸🇮', color: CYAN },
  { code: 'ES',  bcp47: 'es',      name: 'Spanish',          flag: '🇪🇸', color: PINK },
  { code: 'SW',  bcp47: 'sw',      name: 'Swahili',          flag: '🇰🇪', color: GREEN },
  { code: 'SV',  bcp47: 'sv',      name: 'Swedish',          flag: '🇸🇪', color: CYAN },
  { code: 'TL',  bcp47: 'tl',      name: 'Tagalog',          flag: '🇵🇭', color: PURPLE },
  { code: 'TE',  bcp47: 'te',      name: 'Telugu',           flag: '🇮🇳', color: YELLOW },
  { code: 'TH',  bcp47: 'th',      name: 'Thai',             flag: '🇹🇭', color: ORANGE },
  { code: 'TR',  bcp47: 'tr',      name: 'Turkish',          flag: '🇹🇷', color: RED },
  { code: 'UK',  bcp47: 'uk',      name: 'Ukrainian',        flag: '🇺🇦', color: YELLOW },
  { code: 'UZ',  bcp47: 'uz',      name: 'Uzbek',            flag: '🇺🇿', color: CYAN },
  { code: 'VI',  bcp47: 'vi',      name: 'Vietnamese',       flag: '🇻🇳', color: RED },
  { code: 'CY',  bcp47: 'cy',      name: 'Welsh',            flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', color: GREEN },
  { code: 'YO',  bcp47: 'yo',      name: 'Yoruba',           flag: '🇳🇬', color: ORANGE }
] as const;

const FALLBACK_LANGUAGE: Language = LANGUAGES.find((lang) => lang.bcp47 === 'en') ?? LANGUAGES[0]!;

export const findLanguage = (bcp47: string): Language =>
  LANGUAGES.find((lang) => lang.bcp47 === bcp47) ?? FALLBACK_LANGUAGE;

export const isAutoLanguage = (lang: Language): boolean => lang.isAuto === true;
