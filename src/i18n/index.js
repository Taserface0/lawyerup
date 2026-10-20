import { en } from './en.js';
import { hi } from './hi.js';
import { hinglish } from './hinglish.js';

export const DEFAULT_LANG = 'en';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'hinglish', label: 'Hinglish' },
];

export const translations = { en, hi, hinglish };
