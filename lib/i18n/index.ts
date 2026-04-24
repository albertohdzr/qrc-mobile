import { getLocales } from 'expo-localization'
import { I18n } from 'i18n-js'

import en from './en'
import es from './es'

const i18n = new I18n({ en, es })

// Set the locale based on device language, defaulting to Spanish
const deviceLanguage = getLocales()[0]?.languageCode ?? 'es'
i18n.locale = deviceLanguage

// Fall back to Spanish for any missing keys
i18n.defaultLocale = 'es'
i18n.enableFallback = true

/**
 * Translate a key. Supports interpolation via second argument.
 *
 * @example
 *   t('checkout.totalItems', { count: 3 })
 *   t('auth.welcome')
 */
export const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, options)

export default i18n
