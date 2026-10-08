import { Context, Telegraf, session } from 'telegraf';
import { onegoClient } from '../api/onego-client';
import { MessageType, IssueTopic, SupportMessagePayload } from '../api/types';
import { generateTicketId, generateDeepLink } from '../utils/deeplink';
import { botLogger } from '../utils/logger';
import { env } from '../config/env';
import {
  upsertUser,
  createTicket,
  getTicket,
  trackEvent,
  resetAllData,
} from '../db/database';
import {
  messages,
  formatPackageCard,
  formatTrackingTimeline,
  formatComprehensiveTrackingCard,
  formatAdminStats,
  formatDailyStats,
} from './messages';
import {
  languageKeyboard,
  mainMenuKeyboard,
  cancelKeyboard,
  deepLinkButton,
  trackingResultKeyboard,
  supportDirectKeyboard,
  appDownloadKeyboard,
  tashkentWarehouseKeyboard,
  adminPanelInlineKeyboard,
  faqListKeyboard,
  faqBackKeyboard,
} from './keyboards';
import { getAnalyticsSummary, getDailyAnalytics } from '../db/database';

// ─── Bot Context & Session Definition ─────────────────────────────

export type UserState =
  | 'idle'
  | 'awaiting_tracking_awb'
  | 'awaiting_delay_awb'
  | 'awaiting_delay_desc'
  | 'awaiting_payment_desc'
  | 'awaiting_weight_awb'
  | 'awaiting_weight_desc'
  | 'awaiting_warehouse_desc'
  | 'awaiting_operator_desc';

export interface BotSession {
  lang: 'uz' | 'ru';
  state: UserState;
  tempAwb?: string;
}

export interface BotContext extends Context {
  session: BotSession;
}

function defaultSession(): BotSession {
  return {
    lang: 'uz',
    state: 'idle',
  };
}

// ─── Smart Input Patterns ─────────────────────────────────────────

/**
 * Returns true if the input looks like a Client ID (5–7 digit numeric code).
 * Examples: 100081, 387183
 */
function isClientId(text: string): boolean {
  return /^(UZ)?\d{5,7}$/i.test(text.trim());
}

/**
 * Returns true if the input looks like an AWB tracking number.
 * Matches:
 *  - Starts with EMU/EMS/EP/LP/CP prefix + digits
 *  - Pure numeric 10-15 digits (e.g. 773437914450735)
 *  - Alphanumeric 6+ chars (generic tracking codes)
 */
function isAwbLike(text: string): boolean {
  const cleaned = text.replace(/[\s-]/g, '');
  // Known logistics prefixes
  if (/^(EMU|EMS|EP|LP|CP|RR|LZ|CY)\d{5,}/i.test(cleaned)) return true;
  // Pure numeric 10-15 digits
  if (/^\d{10,15}$/.test(cleaned)) return true;
  // Alphanumeric at least 6 chars
  if (/^[A-Za-z0-9]{6,}$/.test(cleaned)) return true;
  return false;
}

// ─── Admin Check ──────────────────────────────────────────────────

function isAdmin(telegramId: number): boolean {
  return env.ADMIN_TELEGRAM_IDS.includes(telegramId);
}

/**
 * Register all commands, message listeners, action callbacks, and state machines.
 */
export function registerHandlers(bot: Telegraf<BotContext>): void {
  // Session middleware
  bot.use(session({ defaultSession }));

  // Helper to get active language
  const getLang = (ctx: BotContext): 'uz' | 'ru' => ctx.session?.lang || 'uz';

  // Helper to extract clean user display name
  const getUserName = (ctx: BotContext): string => {
    if (ctx.from?.username) return `@${ctx.from.username}`;
    const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ');
    return name || 'Telegram User';
  };

  // Helper to check if text matches any main menu button (for instant navigation)
  const isMenuButton = (text: string): boolean => {
    const uzM = Object.values(messages.uz.menu);
    const ruM = Object.values(messages.ru.menu);
    return uzM.includes(text as any) || ruM.includes(text as any);
  };

  // Helper to construct main menu keyboard with admin button for authorized admins
  const getMenu = (ctx: BotContext) =>
    mainMenuKeyboard(getLang(ctx), isAdmin(ctx.from?.id ?? 0));

  // ─── /start command ─────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    ctx.session.state = 'idle';
    ctx.session.tempAwb = undefined;

    // Persist user in DB
    const tgId = ctx.from?.id ?? 0;
    upsertUser(tgId, ctx.from?.username, ctx.from?.first_name, ctx.session.lang);
    trackEvent(tgId, 'bot_start');

    // Show language selector on start
    await ctx.reply(messages.uz.chooseLanguage, {
      parse_mode: 'HTML',
      ...languageKeyboard(),
    });
  });

  // ─── /lang command ──────────────────────────────────────────────
  bot.command('lang', async (ctx) => {
    await ctx.reply(messages.uz.chooseLanguage, {
      parse_mode: 'HTML',
      ...languageKeyboard(),
    });
  });

  // ─── /app command — download mobile apps ─────────────────────────
  bot.command(['app', 'apps', 'ilova', 'prilojenie'], async (ctx) => {
    const lang = getLang(ctx);
    await ctx.reply(messages[lang].appsInfo, {
      parse_mode: 'HTML',
      ...appDownloadKeyboard(lang),
    });
  });

  // ─── /ticket command — check ticket status ──────────────────────
  bot.command('ticket', async (ctx) => {
    const lang = getLang(ctx);
    const args = ctx.message.text.split(/\s+/).slice(1);

    if (args.length === 0) {
      await ctx.reply(messages[lang].ticketCmdUsage, { parse_mode: 'HTML' });
      return;
    }

    let ticketId = args[0].toUpperCase().trim();
    // Normalize: remove leading #, ensure OP- prefix
    ticketId = ticketId.replace(/^#/, '');
    if (!ticketId.startsWith('OP-')) {
      ticketId = `OP-${ticketId}`;
    }
    const fullId = `#${ticketId}`;

    const ticket = getTicket(fullId);
    if (!ticket) {
      await ctx.reply(messages[lang].ticket.notFound(fullId), { parse_mode: 'HTML' });
      return;
    }

    await ctx.reply(messages[lang].ticket.statusCard(ticket), { parse_mode: 'HTML' });
  });

  // ─── /stats or /admin command — admin analytics ─────────────────
  bot.command(['stats', 'admin'], async (ctx) => {
    const lang = getLang(ctx);
    const tgId = ctx.from?.id ?? 0;

    if (!isAdmin(tgId)) {
      await ctx.reply(messages[lang].adminOnly, { parse_mode: 'HTML' });
      return;
    }

    const summary = getAnalyticsSummary();
    const report = formatAdminStats(summary, lang);
    await ctx.reply(report, {
      parse_mode: 'HTML',
      ...adminPanelInlineKeyboard(lang, 'all'),
    });
  });

  // ─── /today or /daily command — daily analytics ──────────────────
  bot.command(['today', 'daily'], async (ctx) => {
    const lang = getLang(ctx);
    const tgId = ctx.from?.id ?? 0;

    if (!isAdmin(tgId)) {
      await ctx.reply(messages[lang].adminOnly, { parse_mode: 'HTML' });
      return;
    }

    const daily = getDailyAnalytics();
    const report = formatDailyStats(daily, lang);
    await ctx.reply(report, {
      parse_mode: 'HTML',
      ...adminPanelInlineKeyboard(lang, 'daily'),
    });
  });

  bot.action('view_daily_stats', async (ctx) => {
    const lang = getLang(ctx);
    const tgId = ctx.from?.id ?? 0;

    if (!isAdmin(tgId)) {
      await ctx.answerCbQuery(messages[lang].adminOnly, { show_alert: true }).catch(() => {});
      return;
    }

    await ctx.answerCbQuery().catch(() => {});
    const daily = getDailyAnalytics();
    const report = formatDailyStats(daily, lang);
    try {
      await ctx.editMessageText(report, {
        parse_mode: 'HTML',
        ...adminPanelInlineKeyboard(lang, 'daily'),
      });
    } catch {
      // Message content is unchanged
    }
  });

  bot.action('view_all_stats', async (ctx) => {
    const lang = getLang(ctx);
    const tgId = ctx.from?.id ?? 0;

    if (!isAdmin(tgId)) {
      await ctx.answerCbQuery(messages[lang].adminOnly, { show_alert: true }).catch(() => {});
      return;
    }

    await ctx.answerCbQuery().catch(() => {});
    const summary = getAnalyticsSummary();
    const report = formatAdminStats(summary, lang);
    try {
      await ctx.editMessageText(report, {
        parse_mode: 'HTML',
        ...adminPanelInlineKeyboard(lang, 'all'),
      });
    } catch {
      // Message content is unchanged
    }
  });

  bot.action('refresh_daily_stats', async (ctx) => {
    const lang = getLang(ctx);
    const tgId = ctx.from?.id ?? 0;

    if (!isAdmin(tgId)) {
      await ctx.answerCbQuery(messages[lang].adminOnly, { show_alert: true }).catch(() => {});
      return;
    }

    await ctx.answerCbQuery(lang === 'uz' ? 'Yangilandi ✅' : 'Обновлено ✅').catch(() => {});
    const daily = getDailyAnalytics();
    const report = formatDailyStats(daily, lang);
    try {
      await ctx.editMessageText(report, {
        parse_mode: 'HTML',
        ...adminPanelInlineKeyboard(lang, 'daily'),
      });
    } catch {
      // Message content is unchanged
    }
  });

  bot.action('refresh_admin_stats', async (ctx) => {
    const lang = getLang(ctx);
    const tgId = ctx.from?.id ?? 0;

    if (!isAdmin(tgId)) {
      await ctx.answerCbQuery(messages[lang].adminOnly, { show_alert: true }).catch(() => {});
      return;
    }

    await ctx.answerCbQuery(lang === 'uz' ? 'Yangilandi ✅' : 'Обновлено ✅').catch(() => {});

    const summary = getAnalyticsSummary();
    const report = formatAdminStats(summary, lang);
    try {
      await ctx.editMessageText(report, {
        parse_mode: 'HTML',
        ...adminPanelInlineKeyboard(lang, 'all'),
      });
    } catch {
      // Message content is unchanged
    }
  });

  // ─── Reset Admin Stats Command (/resetstats) ──────────────────────
  bot.command('resetstats', async (ctx) => {
    const lang = getLang(ctx);
    const tgId = ctx.from?.id ?? 0;

    if (!isAdmin(tgId)) {
      await ctx.reply(messages[lang].adminOnly, { parse_mode: 'HTML' });
      return;
    }

    try {
      resetAllData();
      const msg =
        lang === 'uz'
          ? '🗑 <b>Admin statistikasi muvaffaqiyatli 0 ga tushirildi!</b>\n\nBarcha ko‘rsatkichlar (foydalanuvchilar, qidiruvlar, ticketlar va hodisalar) tozalandi va 0 dan hisoblash boshlandi.'
          : '🗑 <b>Статистика админ-панели успешно сброшена!</b>\n\nВсе показатели (пользователи, поиски, тикеты и события) очищены и отсчет начат с 0.';
      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err: any) {
      botLogger.error({ err }, 'Error resetting admin stats');
      await ctx.reply(messages[lang].errorOccurred);
    }
  });

  // ─── Language Callback Actions ──────────────────────────────────
  bot.action('set_lang_uz', async (ctx) => {
    ctx.session.lang = 'uz';
    ctx.session.state = 'idle';
    await ctx.answerCbQuery().catch(() => {});

    const tgId = ctx.from?.id ?? 0;
    upsertUser(tgId, ctx.from?.username, ctx.from?.first_name, 'uz');
    trackEvent(tgId, 'language_selected', { lang: 'uz' });

    await ctx.reply(messages.uz.languageSelected);
    await ctx.reply(messages.uz.welcome, {
      parse_mode: 'HTML',
      ...getMenu(ctx),
    });
  });

  bot.action('set_lang_ru', async (ctx) => {
    ctx.session.lang = 'ru';
    ctx.session.state = 'idle';
    await ctx.answerCbQuery().catch(() => {});

    const tgId = ctx.from?.id ?? 0;
    upsertUser(tgId, ctx.from?.username, ctx.from?.first_name, 'ru');
    trackEvent(tgId, 'language_selected', { lang: 'ru' });

    await ctx.reply(messages.ru.languageSelected);
    await ctx.reply(messages.ru.welcome, {
      parse_mode: 'HTML',
      ...getMenu(ctx),
    });
  });

  // ─── FAQ Actions ────────────────────────────────────────────────
  bot.action(/^faq_view_(.+)$/, async (ctx) => {
    const lang = getLang(ctx);
    const faqId = ctx.match[1];
    await ctx.answerCbQuery().catch(() => {});

    const tgId = ctx.from?.id ?? 0;
    trackEvent(tgId, 'faq_viewed', { faq_id: faqId });

    const faqItem = messages[lang].faq.items.find((item) => item.id === faqId);
    if (!faqItem) {
      await ctx.reply(messages[lang].faq.title, {
        parse_mode: 'HTML',
        ...faqListKeyboard(lang),
      });
      return;
    }

    const response = `<b>${faqItem.q}</b>\n\n${faqItem.a}`;
    if (faqId === 'faq_app') {
      await ctx.reply(response, {
        parse_mode: 'HTML',
        ...appDownloadKeyboard(lang),
      });
      await ctx.reply(messages[lang].faq.back, faqBackKeyboard(lang));
    } else {
      await ctx.reply(response, {
        parse_mode: 'HTML',
        ...faqBackKeyboard(lang),
      });
    }
  });

  bot.action('faq_list_back', async (ctx) => {
    const lang = getLang(ctx);
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(messages[lang].faq.title, {
      parse_mode: 'HTML',
      ...faqListKeyboard(lang),
    });
  });

  // ─── Main Menu Listeners (Uzbek & Russian) ──────────────────────

  // 1. 📦 Tracking
  bot.hears([messages.uz.menu.tracking, messages.ru.menu.tracking], async (ctx) => {
    const lang = getLang(ctx);
    ctx.session.state = 'awaiting_tracking_awb';
    ctx.session.tempAwb = undefined;

    trackEvent(ctx.from?.id ?? 0, 'menu_click', { menu: 'tracking' });

    await ctx.reply(messages[lang].prompts.enterTrackingAwb, {
      parse_mode: 'HTML',
      ...cancelKeyboard(lang),
    });
  });

  // 2. ⏰ Delay
  bot.hears([messages.uz.menu.delay, messages.ru.menu.delay], async (ctx) => {
    const lang = getLang(ctx);
    ctx.session.state = 'awaiting_delay_awb';
    ctx.session.tempAwb = undefined;

    trackEvent(ctx.from?.id ?? 0, 'menu_click', { menu: 'delay' });

    await ctx.reply(messages[lang].prompts.enterDelayAwb, {
      parse_mode: 'HTML',
      ...cancelKeyboard(lang),
    });
  });

  // 3. 💰 Payment
  bot.hears([messages.uz.menu.payment, messages.ru.menu.payment], async (ctx) => {
    const lang = getLang(ctx);
    ctx.session.state = 'awaiting_payment_desc';

    trackEvent(ctx.from?.id ?? 0, 'menu_click', { menu: 'payment' });

    await ctx.reply(messages[lang].prompts.enterPaymentDesc, {
      parse_mode: 'HTML',
      ...cancelKeyboard(lang),
    });
  });

  // 4. ⚖️ Weight
  bot.hears([messages.uz.menu.weight, messages.ru.menu.weight], async (ctx) => {
    const lang = getLang(ctx);
    ctx.session.state = 'awaiting_weight_awb';
    ctx.session.tempAwb = undefined;

    trackEvent(ctx.from?.id ?? 0, 'menu_click', { menu: 'weight' });

    await ctx.reply(messages[lang].prompts.enterWeightAwb, {
      parse_mode: 'HTML',
      ...cancelKeyboard(lang),
    });
  });

  // 5. 🏢 Warehouse
  bot.hears([messages.uz.menu.warehouse, messages.ru.menu.warehouse], async (ctx) => {
    const lang = getLang(ctx);
    ctx.session.state = 'awaiting_warehouse_desc';

    trackEvent(ctx.from?.id ?? 0, 'menu_click', { menu: 'warehouse' });

    await ctx.reply(messages[lang].prompts.enterWarehouseDesc, {
      parse_mode: 'HTML',
      ...cancelKeyboard(lang),
    });
  });

  // 6. ❓ FAQ
  bot.hears([messages.uz.menu.faq, messages.ru.menu.faq], async (ctx) => {
    const lang = getLang(ctx);
    ctx.session.state = 'idle';

    trackEvent(ctx.from?.id ?? 0, 'menu_click', { menu: 'faq' });

    await ctx.reply(messages[lang].faq.title, {
      parse_mode: 'HTML',
      ...faqListKeyboard(lang),
    });
  });

  // 7. 👩‍💻 Operator
  bot.hears([messages.uz.menu.operator, messages.ru.menu.operator], async (ctx) => {
    const lang = getLang(ctx);
    ctx.session.state = 'idle';
    ctx.session.tempAwb = undefined;

    trackEvent(ctx.from?.id ?? 0, 'menu_click', { menu: 'operator' });

    const tgId = ctx.from?.id ?? 0;
    const userName = getUserName(ctx);

    await ctx.reply(messages[lang].ticket.operatorNotice, {
      parse_mode: 'HTML',
      ...supportDirectKeyboard(lang, {
        telegramId: tgId,
        userName,
        issue: 'OperatorHelp',
      }),
    });
  });

  // 8. 📍 Toshkent ombori qayerda?
  bot.hears(
    [messages.uz.menu.tashkentWarehouse, messages.ru.menu.tashkentWarehouse],
    async (ctx) => {
      const lang = getLang(ctx);
      ctx.session.state = 'idle';

      trackEvent(ctx.from?.id ?? 0, 'menu_click', { menu: 'tashkent_warehouse' });

      // Send Telegram native location pin
      await ctx.replyWithLocation(41.278, 69.241642);

      // Send address details and direct Google / Yandex maps buttons
      await ctx.reply(messages[lang].tashkentWarehouseInfo, {
        parse_mode: 'HTML',
        ...tashkentWarehouseKeyboard(lang),
      });
    },
  );

  // 9. 🕒 Ish vaqti
  bot.hears(
    [messages.uz.menu.workingHours, messages.ru.menu.workingHours],
    async (ctx) => {
      const lang = getLang(ctx);
      ctx.session.state = 'idle';

      trackEvent(ctx.from?.id ?? 0, 'menu_click', { menu: 'working_hours' });

      await ctx.reply(messages[lang].workingHoursInfo, {
        parse_mode: 'HTML',
      });
    },
  );

  // 10. ⚙️ Admin panel button (for admins)
  bot.hears(
    [messages.uz.menu.adminPanel, messages.ru.menu.adminPanel],
    async (ctx) => {
      const lang = getLang(ctx);
      const tgId = ctx.from?.id ?? 0;

      if (!isAdmin(tgId)) {
        await ctx.reply(messages[lang].adminOnly, { parse_mode: 'HTML' });
        return;
      }

      ctx.session.state = 'idle';
      trackEvent(tgId, 'admin_panel_opened');

      const summary = getAnalyticsSummary();
      const report = formatAdminStats(summary, lang);
      await ctx.reply(report, {
        parse_mode: 'HTML',
        ...adminPanelInlineKeyboard(lang, 'all'),
      });
    },
  );

  // Change Language Button
  bot.hears([messages.uz.menu.changeLang, messages.ru.menu.changeLang], async (ctx) => {
    await ctx.reply(messages.uz.chooseLanguage, {
      parse_mode: 'HTML',
      ...languageKeyboard(),
    });
  });

  // Cancel / Back to Main Menu Button
  bot.hears([messages.uz.menu.backToMenu, messages.ru.menu.backToMenu], async (ctx) => {
    const lang = getLang(ctx);
    ctx.session.state = 'idle';
    ctx.session.tempAwb = undefined;
    await ctx.reply(messages[lang].cancelled, getMenu(ctx));
  });

  // ─── Text / FSM State Machine ───────────────────────────────────
  bot.on('text', async (ctx) => {
    const lang = getLang(ctx);
    const text = ctx.message.text.trim();

    // If user clicked any menu button while in a state, prioritize that navigation
    if (isMenuButton(text)) {
      ctx.session.state = 'idle';
      ctx.session.tempAwb = undefined;
      return;
    }

    const state = ctx.session.state || 'idle';
    const tgId = ctx.from?.id ?? 0;
    const userName = getUserName(ctx);

    // ── 1. Awaiting Tracking AWB ──
    if (state === 'awaiting_tracking_awb') {
      const cleanText = text.replace(/[^A-Za-z0-9_-]/g, '');

      // Smart detection: Client ID check (5-7 digit numeric)
      if (isClientId(cleanText)) {
        trackEvent(tgId, 'client_id_detected', { client_id: cleanText });

        const ticketId = generateTicketId();
        const deepLink = generateDeepLink({
          orderId: cleanText,
          issue: 'Tracking',
          ticketId,
          telegramId: tgId,
          userName,
        });

        await ctx.reply(messages[lang].clientIdDetected(cleanText), {
          parse_mode: 'HTML',
        });
        await ctx.reply(messages[lang].ticket.operatorNotice, {
          parse_mode: 'HTML',
          ...supportDirectKeyboard(lang, {
            orderId: cleanText,
            issue: 'ClientID',
            ticketId,
            telegramId: tgId,
            userName,
          }),
        });

        trackEvent(tgId, 'deeplink_generated', { reason: 'client_id_redirect' });

        ctx.session.state = 'idle';
        await ctx.reply(messages[lang].menu.backToMenu, getMenu(ctx));
        return;
      }

      const awb = cleanText;
      if (awb.length < 3) {
        await ctx.reply(messages[lang].invalidInput);
        return;
      }

      trackEvent(tgId, 'tracking_lookup', { awb });
      await ctx.reply(messages[lang].tracking.searching);

      // Fetch both live tracking timeline and official package data in parallel
      const [tracking, pkg] = await Promise.all([
        onegoClient.getTracking(awb, lang).catch(() => null),
        onegoClient.getPackage(awb).catch(() => null),
      ]);

      if (pkg || tracking) {
        trackEvent(tgId, 'tracking_found', {
          awb,
          source: pkg && tracking ? 'both' : pkg ? 'package_api' : 'tracking_api',
        });

        const cardHtml = formatComprehensiveTrackingCard(pkg, tracking, awb, lang);
        const photoUrl = pkg?.Product?.Picture?.trim();
        const markup = trackingResultKeyboard(awb, lang);

        if (photoUrl && photoUrl.startsWith('http')) {
          try {
            await ctx.replyWithPhoto(photoUrl, {
              caption: cardHtml,
              parse_mode: 'HTML',
              ...markup,
            });
          } catch (photoErr) {
            botLogger.warn({ photoUrl, error: photoErr }, 'Photo send failed, falling back to text');
            await ctx.reply(cardHtml, {
              parse_mode: 'HTML',
              ...markup,
            });
          }
        } else {
          await ctx.reply(cardHtml, {
            parse_mode: 'HTML',
            ...markup,
          });
        }
      } else {
        // Not found: provide friendly message and auto-escalation
        trackEvent(tgId, 'tracking_not_found', { awb });

        const ticketId = generateTicketId();

        const payload: SupportMessagePayload = {
          MessageId: '',
          isDelete: false,
          AdminId: '',
          Name: userName,
          UserType: 0,
          Content: `[${ticketId}] [TG:${tgId}] [Tracking] AWB: ${awb} tizimda topilmadi. Mijoz yordam so'ramoqda.`,
          Addtime: new Date().toISOString(),
        };

        await onegoClient.submitMessage(awb, MessageType.Package, 'Tracking', payload).catch(() => {});

        // Persist ticket in local DB
        createTicket({
          ticketNumber: ticketId,
          telegramId: tgId,
          awb,
          issueType: 'Tracking',
          description: `AWB ${awb} tizimda topilmadi`,
        });
        trackEvent(tgId, 'ticket_created', { ticketId, topic: 'Tracking', awb });

        await ctx.reply(messages[lang].tracking.notFound(awb), {
          parse_mode: 'HTML',
        });
        await ctx.reply(messages[lang].ticket.operatorNotice, {
          parse_mode: 'HTML',
          ...supportDirectKeyboard(lang, {
            orderId: awb,
            issue: 'Tracking',
            ticketId,
            telegramId: tgId,
            userName,
          }),
        });
      }

      ctx.session.state = 'idle';
      await ctx.reply(messages[lang].menu.backToMenu, getMenu(ctx));
      return;
    }

    // ── 2. Awaiting Delay AWB ──
    if (state === 'awaiting_delay_awb') {
      const awb = text.replace(/[^A-Za-z0-9_-]/g, '');
      if (awb.length < 3) {
        await ctx.reply(messages[lang].invalidInput);
        return;
      }
      ctx.session.tempAwb = awb;
      ctx.session.state = 'awaiting_delay_desc';
      await ctx.reply(messages[lang].prompts.enterDelayDesc, {
        parse_mode: 'HTML',
        ...cancelKeyboard(lang),
      });
      return;
    }

    // ── 3. Awaiting Delay Description ──
    if (state === 'awaiting_delay_desc') {
      const awb = ctx.session.tempAwb || 'UNKNOWN';
      await handleTicketSubmission(ctx, awb, MessageType.Package, 'Delay', text, lang);
      return;
    }

    // ── 4. Awaiting Payment Description ──
    if (state === 'awaiting_payment_desc') {
      const fkId = String(ctx.from?.id || 'CLIENT');
      await handleTicketSubmission(ctx, fkId, MessageType.Payment, 'Payment', text, lang);
      return;
    }

    // ── 5. Awaiting Weight AWB ──
    if (state === 'awaiting_weight_awb') {
      const awb = text.replace(/[^A-Za-z0-9_-]/g, '');
      if (awb.length < 3) {
        await ctx.reply(messages[lang].invalidInput);
        return;
      }
      ctx.session.tempAwb = awb;
      ctx.session.state = 'awaiting_weight_desc';
      await ctx.reply(messages[lang].prompts.enterWeightDesc, {
        parse_mode: 'HTML',
        ...cancelKeyboard(lang),
      });
      return;
    }

    // ── 6. Awaiting Weight Description ──
    if (state === 'awaiting_weight_desc') {
      const awb = ctx.session.tempAwb || 'UNKNOWN';
      await handleTicketSubmission(ctx, awb, MessageType.Package, 'Weight', text, lang);
      return;
    }

    // ── 7. Awaiting Warehouse Description ──
    if (state === 'awaiting_warehouse_desc') {
      const fkId = String(ctx.from?.id || 'CLIENT');
      await handleTicketSubmission(ctx, fkId, MessageType.Customer, 'Warehouse', text, lang);
      return;
    }

    // ── 8. Awaiting Operator Description ──
    if (state === 'awaiting_operator_desc') {
      const fkId = String(ctx.from?.id || 'CLIENT');
      await handleTicketSubmission(ctx, fkId, MessageType.Customer, 'OperatorHelp', text, lang);
      return;
    }

    // Fallback: Idle state
    await ctx.reply(messages[lang].welcome, {
      parse_mode: 'HTML',
      ...mainMenuKeyboard(lang),
    });
  });

  // Global Error Handler
  bot.catch((err, ctx) => {
    botLogger.error({ err, updateType: ctx.updateType }, 'Unhandled bot update error');
  });

  // ─── Reusable Helper for Ticket Creation and Escalation ─────────
  async function handleTicketSubmission(
    ctx: BotContext,
    fkId: string,
    type: MessageType,
    topic: IssueTopic,
    content: string,
    lang: 'uz' | 'ru',
  ): Promise<void> {
    const ticketId = generateTicketId();
    const userId = ctx.from?.id || 0;
    const userName = getUserName(ctx);

    const payload: SupportMessagePayload = {
      MessageId: '',
      isDelete: false,
      AdminId: '',
      Name: userName,
      UserType: 0,
      Content: `[${ticketId}] [TG:${userId}] [${topic}] ${content}`,
      Addtime: new Date().toISOString(),
    };

    await ctx.reply(messages[lang].ticket.creating);
    await onegoClient.submitMessage(fkId, type, topic, payload);

    // Persist ticket in local SQLite database
    const awb = ctx.session.tempAwb || null;
    createTicket({
      ticketNumber: ticketId,
      telegramId: userId,
      awb,
      issueType: topic,
      description: content,
    });

    trackEvent(userId, 'ticket_created', { ticketId, topic, awb: awb ?? fkId });

    const deepLink = generateDeepLink({
      orderId: fkId,
      issue: topic,
      ticketId,
      telegramId: userId,
      userName,
    });

    trackEvent(userId, 'deeplink_generated', { ticketId });

    await ctx.reply(messages[lang].ticket.confirmation(ticketId, topic), {
      parse_mode: 'HTML',
    });
    await ctx.reply(
      messages[lang].ticket.handoff,
      supportDirectKeyboard(lang, {
        orderId: fkId,
        ticketId,
        issue: topic,
        telegramId: userId,
        userName,
      }),
    );
    await ctx.reply(messages[lang].menu.backToMenu, getMenu(ctx));

    ctx.session.state = 'idle';
    ctx.session.tempAwb = undefined;
  }
}
