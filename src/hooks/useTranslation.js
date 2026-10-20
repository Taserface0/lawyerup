import { useAppState } from '../context/AppContext.jsx';
import { translations, DEFAULT_LANG } from '../i18n/index.js';

function resolvePath(dict, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), dict);
}

function interpolate(value, vars) {
  if (typeof value !== 'string' || !vars) return value;
  return Object.keys(vars).reduce((str, key) => str.replaceAll(`{{${key}}}`, vars[key]), value);
}

/**
 * useTranslation()
 *
 * t('chat.headerTitle')                     -> plain string lookup
 * t('chat.findLawyerButton', { category })   -> string with {{category}} interpolated
 * t('rights')                                -> can also resolve to non-string values
 *                                                (arrays/objects), used for list content
 *                                                like the rights cards.
 *
 * Falls back to the English dictionary (and finally the raw key) if a
 * translation is missing in the active language, so a gap in Hindi/Hinglish
 * never breaks the UI.
 */
export function useTranslation() {
  const { lang } = useAppState();
  const activeDict = translations[lang] || translations[DEFAULT_LANG];

  function t(path, vars) {
    const value = resolvePath(activeDict, path) ?? resolvePath(translations[DEFAULT_LANG], path) ?? path;
    return interpolate(value, vars);
  }

  return { t, lang };
}
