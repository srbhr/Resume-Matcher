import 'server-only';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';

type Locale = typeof locales[number];

// Define minimal message map type (string -> string | nested map)
// (Keeps flexibility while avoiding broad any)
export type MessageValue = string | MessageMap;
export interface MessageMap { [key: string]: MessageValue }

export async function getMessages(locale: string): Promise<MessageMap> {
  if (!locales.includes(locale as Locale)) notFound();
  try {
  const messages = (await import(`../../messages/${locale}.json`)).default as MessageMap;
  return messages;
  } catch {
    notFound();
  }
}
