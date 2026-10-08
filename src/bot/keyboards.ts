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
  const iosText = '🍏 App Store (iPhone)';
  const androidText = '🤖 Google Play (Android)';
  const webText = lang === 'uz' ? '🌐 Web sayt (Google)' : '🌐 Веб-сайт (Google)';
  return Markup.inlineKeyboard([
    [Markup.button.url(iosText, env.APP_STORE_URL)],
    [Markup.button.url(androidText, env.PLAY_STORE_URL)],
    [Markup.button.url(webText, env.WEB_APP_DOWNLOAD_URL)],
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
 * Main menu reply keyboard with the key sections + language change + admin panel for admins.
 */
export function mainMenuKeyboard(lang: 'uz' | 'ru', isAdmin = false) {
  const m = messages[lang].menu;
  const rows: string[][] = [
    [m.tracking, m.delay],
    [m.payment, m.weight],
    [m.warehouse, m.faq],
    [m.tashkentWarehouse, m.workingHours],
    [m.operator, m.changeLang],
  ];
  if (isAdmin) {
    rows.push([m.adminPanel]);
  }
  return Markup.keyboard(rows).resize();
}

/**
 * Inline keyboard with Admin Panel actions (Web Dashboard URL & Refresh button).
 */
export function adminPanelInlineKeyboard(lang: 'uz' | 'ru', currentView: 'all' | 'daily' = 'all') {
  const baseUrl = env.INTERNAL_CHAT_URL ? env.INTERNAL_CHAT_URL.replace(/\/support\/chat.*$/, '') : 'http://43.172.85.77';
  const adminUrl = `${baseUrl}/admin`;

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        lang === 'uz'
          ? (currentView === 'daily' ? '📅 Bugungi (faol)' : '📅 Bugungi statistika')
          : (currentView === 'daily' ? '📅 За сегодня (актив)' : '📅 За сегодня'),
        'view_daily_stats',
      ),
      Markup.button.callback(
        lang === 'uz'
          ? (currentView === 'all' ? '📊 Umumiy (faol)' : '📊 Umumiy statistika')
          : (currentView === 'all' ? '📊 Общая (актив)' : '📊 Общая статистика'),
        'view_all_stats',
      ),
    ],
    [
      Markup.button.callback(
        lang === 'uz' ? '🔄 Yangilash' : '🔄 Обновить',
        currentView === 'daily' ? 'refresh_daily_stats' : 'refresh_admin_stats',
      ),
    ],
    [
      Markup.button.url(
        lang === 'uz' ? '🌐 Veb Admin Panelga o‘tish' : '🌐 Открыть веб админ-панель',
        adminUrl,
      ),
    ],
  ]);
}

/**
 * Inline keyboard with location maps links (Google Maps & Yandex Maps).
 */
export function tashkentWarehouseKeyboard(lang: 'uz' | 'ru') {
  const googleMapsUrl = 'https://maps.google.com/maps?q=41.278000,69.241642&ll=41.278000,69.241642&z=16';
  const yandexMapsUrl = 'https://yandex.uz/maps/?pt=69.241642,41.278000&z=16&l=map';

  return Markup.inlineKeyboard([
    [
      Markup.button.url('🗺 Google Maps', googleMapsUrl),
      Markup.button.url(lang === 'uz' ? '📍 Yandex Maps' : '📍 Яндекс Карты', yandexMapsUrl),
    ],
  ]);
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
