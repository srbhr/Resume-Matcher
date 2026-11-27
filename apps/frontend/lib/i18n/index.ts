/**
 * Internationalization utilities
 *
 * Simple JSON-based translations without external dependencies.
 * The browser has English up front and loads the current UI language on demand
 * (client-messages.ts); the server's translate() reads every locale statically.
 */

export { useTranslations, type Messages } from './translations';
