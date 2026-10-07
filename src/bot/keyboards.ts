import { Markup } from 'telegraf';
import { messages } from './messages';
import {
  generateWebTrackLink,
  generateSupportTelegramLink,
  generateInternalChatLink,
  DeepLinkParams,
} from '../utils/deeplink';
import { env } from '../config/env';

/**
 * Mobile apps download keyboard (App Store & Google Play).
 */
export function appDownloadKeyboard(lang: 'uz' | 'ru') {
  const iosText = lang === 'uz' ? '🍏 App Store (iPhone)' : '🍏 App Store (iPhone)';
  const androidText = lang === 'uz' ? '🤖 Google Play (Android)' : '🤖 Google Play (Android)';
  return Markup.inlineKeyboard([
    [Markup.button.url(iosText, env.APP_STORE_URL)],
    [Markup.button.url(androidText, env.PLAY_STORE_URL)],
  ]);
}

/**
 * Inline keyboard for initial language selection.
 */
export function languageKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🇺🇿 O‘zbekcha', 'set_lang_uz'),
      Markup.button.callback('🇷🇺 Русский', 'set_lang_ru'),
    ],
  ]);
}

/**
 * Main menu reply keyboard with the 7 key sections + language change.
 */
export function mainMenuKeyboard(lang: 'uz' | 'ru') {
  const m = messages[lang].menu;
  return Markup.keyboard([
    [m.tracking, m.delay],
    [m.payment, m.weight],
    [m.warehouse, m.faq],
    [m.operator, m.changeLang],
  ]).resize();
}

/**
 * Cancel / Back to menu reply keyboard.
 */
export function cancelKeyboard(lang: 'uz' | 'ru') {
  const m = messages[lang].menu;
  return Markup.keyboard([[m.backToMenu]]).resize();
}

/**
 * Universal Inline Button to open OneGoPost app's internal chat ("Yordam -> Ichki xabar").
 */
export function deepLinkButton(lang: 'uz' | 'ru', linkParams?: Partial<DeepLinkParams>) {
  const text = messages[lang].ticket.openInternalChatBtn;
  const chatUrl = generateInternalChatLink(linkParams);
  return Markup.inlineKeyboard([
    [Markup.button.url(text, chatUrl)],
  ]);
}

/**
 * Rich inline action keyboard for tracked package:
 * 1. 📲 OnegoPost ilovasidagi ichki xabarga o‘tish (Yordam -> Ichki xabar)
 * 2. 🌐 Saytda tekshirish (https://www.onegopost.com/track.html?awb=...)
 */
export function trackingResultKeyboard(awb: string, lang: 'uz' | 'ru') {
  const chatText = messages[lang].ticket.openInternalChatBtn;
  const webText = lang === 'uz' ? '🌐 Saytda tekshirish' : '🌐 Проверить на сайте';
  const webUrl = generateWebTrackLink(awb);
  const chatUrl = generateInternalChatLink({ orderId: awb, issue: 'Tracking' });

  return Markup.inlineKeyboard([
    [Markup.button.url(chatText, chatUrl)],
    [Markup.button.url(webText, webUrl)],
  ]);
}

/**
 * Inline button for direct internal chat in OnegoPost mobile app ("Yordam -> Ichki xabar").
 * Telegram does not have live operators — directs user directly to in-app support chat.
 */
export function supportDirectKeyboard(lang: 'uz' | 'ru', linkParams?: Partial<DeepLinkParams>) {
  const chatText = messages[lang].ticket.openInternalChatBtn;
  const chatUrl = generateInternalChatLink(linkParams);

  return Markup.inlineKeyboard([
    [Markup.button.url(chatText, chatUrl)],
  ]);
}

/**
 * Inline button attached to a tracked package to connect with operator if needed.
 */
export function trackingHelpKeyboard(awb: string, lang: 'uz' | 'ru') {
  return trackingResultKeyboard(awb, lang);
}

/**
 * FAQ list inline keyboard.
 */
export function faqListKeyboard(lang: 'uz' | 'ru') {
  const items = messages[lang].faq.items;
  const buttons = items.map((item) => [
    Markup.button.callback(item.q, `faq_view_${item.id}`),
  ]);
  return Markup.inlineKeyboard(buttons);
}

/**
 * Return to FAQ list inline button.
 */
export function faqBackKeyboard(lang: 'uz' | 'ru') {
  return Markup.inlineKeyboard([
    [Markup.button.callback(messages[lang].faq.back, 'faq_list_back')],
  ]);
}
