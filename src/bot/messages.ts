import { PackageData, TrackingResult, TrackingCheckpoint, TicketRow, TicketStatus, getStatusText } from '../api/types';
import type { AnalyticsSummary } from '../db/database';
import { translateLogistics } from '../utils/translator';

// ─── HTML Escaping ──────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Ticket Status & Topic Labels ─────────────────────────────

const TICKET_STATUS_LABELS: Record<TicketStatus, { uz: string; ru: string }> = {
  new: { uz: '🆕 Yangi', ru: '🆕 Новый' },
  in_review: { uz: '🔍 Ko\'rib chiqilmoqda', ru: '🔍 На рассмотрении' },
  transferred: { uz: '📤 Boshqa bo\'limga yuborildi', ru: '📤 Передан в отдел' },
  resolved: { uz: '✅ Yechildi', ru: '✅ Решён' },
};

export function getTicketStatusLabel(status: TicketStatus, lang: 'uz' | 'ru'): string {
  return TICKET_STATUS_LABELS[status]?.[lang] ?? status;
}

export const TOPIC_LABELS: Record<string, { uz: string; ru: string }> = {
  Delay: { uz: '⏰ Buyurtma kechikishi', ru: '⏰ Задержка заказа' },
  Payment: { uz: '💰 To‘lov / balans', ru: '💰 Оплата / баланс' },
  Weight: { uz: '⚖️ Vazn masalasi', ru: '⚖️ Вопрос по весу' },
  Warehouse: { uz: '🏢 Ombor / ID muammosi', ru: '🏢 Проблема со складом / ID' },
  Tracking: { uz: '📦 Posilka qidiruvi', ru: '📦 Поиск посылки' },
  OperatorHelp: { uz: '👩‍💻 Operator yordami', ru: '👩‍💻 Помощь оператора' },
  General: { uz: '📌 Umumiy murojaat', ru: '📌 Общее обращение' },
};

export function getTopicLabel(topic: string, lang: 'uz' | 'ru'): string {
  return TOPIC_LABELS[topic]?.[lang] ?? topic;
}

// ─── Message Dictionary (UZ + RU) ──────────────────────────────

export const messages = {
  uz: {
    welcome: [
      `🇺🇿 <b>OnegoPost — Xalqaro logistika va kargo xizmati</b>`,
      ``,
      `Assalomu alaykum! 👋`,
      `Men OnegoPost yordamchi botiman. Sizga qanday yordam bera olaman?`,
      `Quyidagi bo'limlardan birini tanlang:`,
    ].join('\n'),

    chooseLanguage: '🌐 Iltimos, tilni tanlang / Пожалуйста, выберите язык:',
    languageSelected: "✅ O'zbek tili tanlandi.",

    menu: {
      tracking: '📦 Buyurtmam qayerda?',
      delay: '⏰ Buyurtma kechikdi',
      payment: '💰 To\'lov / balans',
      weight: '⚖️ Vazn bo\'yicha savol',
      warehouse: '🏢 Ombor / ID muammosi',
      faq: '❓ Tez-tez so\'raladigan savollar',
      operator: '👩‍💻 Operator yordami',
      changeLang: '🌐 Tilni o\'zgartirish',
      backToMenu: '🏠 Asosiy menyu',
    },

    prompts: {
      enterTrackingAwb: '📝 Iltimos, <b>trek-kodni (AWB)</b> kiriting:\n\n<i>Masalan: 773437914450735</i>',
      enterDelayAwb: '⏰ Buyurtmangiz kechikmoqdami? Iltimos, <b>trek-kodingizni (AWB)</b> kiriting:',
      enterDelayDesc: '📝 Iltimos, kechikish haqida qisqacha ma\'lumot yoki xabaringizni yozing:',
      enterPaymentDesc: '💰 To\'lov yoki balans bo\'yicha muammoingizni batafsil yozing:\n\n<i>(Masalan: to\'lov o\'tmadi, chek yuborish, balansni to\'ldirish)</i>',
      enterWeightAwb: '⚖️ Vazn bo\'yicha e\'tirozingiz bormi? Iltimos, <b>trek-kodingizni (AWB)</b> kiriting:',
      enterWeightDesc: '📝 Vazn bo\'yicha tafsilotlarni yozing (masalan, kutilgan vazn va amaldagi vazn):',
      enterWarehouseDesc: '🏢 Ombor yoki mijoz ID raqami bo\'yicha muammoingizni yozing:\n\n<i>(Masalan: posilka omborga borgan lekin kiritilmagan, ID noto\'g\'ri yozilgan)</i>',
      enterOperatorDesc: '👩‍💻 Iltimos, savol yoki muammoingizni yozing. Murojaatingiz operatorga yetkaziladi:',
    },

    tracking: {
      searching: '🔍 Buyurtma qidirilmoqda, iltimos kuting...',
      notFound: (awb: string) => [
        `❌ <b>Buyurtma topilmadi</b>`,
        ``,
        `Trek-kod: <code>${escapeHtml(awb)}</code> bo'yicha ma'lumot topilmadi.`,
        `Iltimos, trek-kodni to'g'ri kiritganingizni tekshiring.`,
      ].join('\n'),
      helpPrompt: 'Bu masalani operator tekshirishi kerak.',
    },

    ticket: {
      creating: '⏳ Operatorga murojaat tayyorlanmoqda...',
      handoff: 'Bu masalani operator tekshirishi kerak.',
      operatorNotice: 'Bu masalani operator tekshirishi kerak.',
      openInternalChatBtn: '📲 OnegoPost ilovasidagi ichki xabarga o‘tish',
      confirmation: (ticketId: string, topic: string) => [
        `✅ <b>Murojaat qabul qilindi</b>`,
        ``,
        `🎫 <b>Murojaat raqami (Ticket ID):</b> <code>${ticketId}</code>`,
        `📌 <b>Mavzu:</b> ${getTopicLabel(topic, 'uz')}`,
      ].join('\n'),
      deepLinkBtn: '📲 OnegoPost ilovasidagi ichki xabarga o‘tish',
      trackWebBtn: '🌐 Saytda kuzatish',
      notFound: (id: string) => `❌ <code>${escapeHtml(id)}</code> raqamli ticket topilmadi.`,
      statusCard: (ticket: TicketRow) => [
        `🎫 <b>Murojaat holati</b>`,
        ``,
        `🔢 <b>Raqam:</b> <code>${ticket.ticket_number}</code>`,
        ticket.awb ? `📦 <b>AWB:</b> <code>${ticket.awb}</code>` : null,
        `📌 <b>Mavzu:</b> ${getTopicLabel(ticket.issue_type, 'uz')}`,
        `📍 <b>Holat:</b> ${getTicketStatusLabel(ticket.status, 'uz')}`,
        `🕒 <b>Yaratilgan:</b> ${new Date(ticket.created_at + 'Z').toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}`,
      ].filter(Boolean).join('\n'),
    },

    clientIdDetected: (clientId: string) => [
      `ℹ️ Siz mijoz ID raqamingizni kiritdingiz (<b>#${escapeHtml(clientId)}</b>).`,
      ``,
      `Posilka holatini ko'rish uchun iltimos AWB trek-kodini yuboring.`,
    ].join('\n'),

    faq: {
      title: '❓ <b>Tez-tez so\'raladigan savollar (FAQ)</b>\n\nQuyidagi mavzulardan birini tanlang:',
      items: [
        {
          id: 'faq_track',
          q: '📦 Posilkani qanday kuzataman?',
          a: 'Bosh menyudan "📦 Buyurtmam qayerda?" tugmasini bosing va trek-kodingizni (AWB) kiriting. Tizim avtomatik tarzda posilkaning hozirgi joylashuvi va holatini chiqarib beradi.',
        },
        {
          id: 'faq_time',
          q: '⏰ Yetkazib berish qancha vaqt oladi?',
          a: '✈️ <b>Avia yetkazib berish:</b> 7–12 ish kuni.\n🚛 <b>Quruqlikdagi yetkazib berish:</b> 15–25 ish kuni.\n\nBojxona tekshiruvi yoki bayram kunlarida muddat biroz uzayishi mumkin.',
        },
        {
          id: 'faq_pay',
          q: '💰 To\'lov qanday amalga oshiriladi?',
          a: 'To\'lovlarni OnegoPost mobil ilovasida Click, Payme yoki shaxsiy hisob balansi orqali xavfsiz va tez to\'lashingiz mumkin.',
        },
        {
          id: 'faq_id',
          q: '🆔 Mening shaxsiy ID raqamim nima?',
          a: 'OnegoPost ilovasida ro\'yxatdan o\'tganingizda sizga 6 xonali unikal ID (masalan: 100081) beriladi. Xitoy saytlaridan xarid qilganda ombor manziliga ushbu ID ni yozishingiz shart!',
        },
        {
          id: 'faq_wh',
          q: '🏢 Xitoy ombor manzili qayerda?',
          a: 'Xitoydagi omborimizning to\'liq manzili, telefon raqami va indeks ma\'lumotlari OnegoPost mobil ilovasining "Ombor" bo\'limida ko\'rsatilgan.',
        },
        {
          id: 'faq_weight',
          q: '⚖️ Vazn qanday hisoblanadi?',
          a: 'Posilka Xitoy omborida elektron tarozida tortiladi. Haqiqiy jismoniy vazn va hajmiy vazn (Uzunlik × Kenglik × Balandlik / 6000) ning eng kattasi hisobga olinadi.',
        },
        {
          id: 'faq_op',
          q: '👩‍💻 Operator bilan qanday bog\'lanaman?',
          a: 'Bosh menyudan "👩‍💻 Operator yordami" tugmasini bosing yoki @Onegopostadmin bilan to\'g\'ridan-to\'g\'ri bog\'laning.',
        },
        {
          id: 'faq_app',
          q: '📲 Mobil ilovani qayerdan yuklab olsam bo‘ladi?',
          a: 'OneGoPost ilovasini App Store (iPhone) va Google Play (Android) orqali yuklab olishingiz mumkin. /app buyrug\'i orqali to\'g\'ridan-to\'g\'ri havolalarni oling.',
        },
      ],
      back: '⬅️ Savollar ro\'yxatiga qaytish',
    },

    appsInfo: [
      `📲 <b>OneGoPost rasmiy mobil ilovasi</b>`,
      ``,
      `OneGoPost ilovasi orqali Xitoydan xarid qilish, posilkalarni real vaqtda kuzatish va shaxsiy hisobingizni boshqarish juda qulay!`,
      ``,
      `Ilovani quyidagi do'konlardan o'rnatib oling:`,
    ].join('\n'),

    cancelled: 'Amal bekor qilindi. Bosh menyuga qaytildi.',
    invalidInput: '⚠️ Noto\'g\'ri ma\'lumot kiritildi. Iltimos, qaytadan urinib ko\'ring.',
    errorOccurred: '❌ Xatolik yuz berdi. Iltimos, birozdan so\'ng qayta urinib ko\'ring.',
    adminOnly: '⛔ Bu buyruq faqat administratorlar uchun.',
    ticketCmdUsage: '💡 Foydalanish: <code>/ticket OP-XXXXX</code>',
  },

  ru: {
    welcome: [
      `🇷🇺 <b>OnegoPost — Международный логистический и карго сервис</b>`,
      ``,
      `Здравствуйте! 👋`,
      `Я бот поддержки OnegoPost. Чем я могу вам помочь?`,
      `Выберите один из разделов ниже:`,
    ].join('\n'),

    chooseLanguage: '🌐 Пожалуйста, выберите язык / Iltimos, tilni tanlang:',
    languageSelected: '✅ Выбран русский язык.',

    menu: {
      tracking: '📦 Где мой заказ?',
      delay: '⏰ Заказ задерживается',
      payment: '💰 Оплата / баланс',
      weight: '⚖️ Вопрос по весу',
      warehouse: '🏢 Проблема со складом / ID',
      faq: '❓ Частые вопросы',
      operator: '👩‍💻 Помощь оператора',
      changeLang: '🌐 Сменить язык',
      backToMenu: '🏠 Главное меню',
    },

    prompts: {
      enterTrackingAwb: '📝 Пожалуйста, введите <b>трек-код (AWB)</b>:\n\n<i>Например: 773437914450735</i>',
      enterDelayAwb: '⏰ Ваш заказ задерживается? Пожалуйста, введите <b>трек-код (AWB)</b>:',
      enterDelayDesc: '📝 Пожалуйста, кратко опишите причину задержки или детали вашего вопроса:',
      enterPaymentDesc: '💰 Подробно опишите проблему с оплатой или балансом:\n\n<i>(Например: платёж не прошёл, отправка чека, пополнение баланса)</i>',
      enterWeightAwb: '⚖️ Есть замечания по весу? Пожалуйста, введите <b>трек-код (AWB)</b>:',
      enterWeightDesc: '📝 Напишите детали по весу (например, ожидаемый и фактический вес):',
      enterWarehouseDesc: '🏢 Опишите проблему со складом или вашим ID:\n\n<i>(Например: посылка на складе, но не добавлена, неверно указан ID)</i>',
      enterOperatorDesc: '👩‍💻 Пожалуйста, напишите ваш вопрос или проблему. Ваше обращение будет передано оператору:',
    },

    tracking: {
      searching: '🔍 Ищем ваш заказ, пожалуйста, подождите...',
      notFound: (awb: string) => [
        `❌ <b>Заказ не найден</b>`,
        ``,
        `По трек-коду: <code>${escapeHtml(awb)}</code> данные не найдены.`,
        `Пожалуйста, убедитесь, что трек-код введён корректно.`,
      ].join('\n'),
      helpPrompt: 'Этот вопрос должен проверить оператор.',
    },

    ticket: {
      creating: '⏳ Обращение формируется...',
      handoff: 'Этот вопрос должен проверить оператор.',
      operatorNotice: 'Этот вопрос должен проверить оператор.',
      openInternalChatBtn: '📲 Перейти во внутренний чат в приложении OnegoPost',
      confirmation: (ticketId: string, topic: string) => [
        `✅ <b>Обращение принято</b>`,
        ``,
        `🎫 <b>Номер обращения (Ticket ID):</b> <code>${ticketId}</code>`,
        `📌 <b>Тема:</b> ${getTopicLabel(topic, 'ru')}`,
      ].join('\n'),
      deepLinkBtn: '📲 Перейти во внутренний чат в приложении OnegoPost',
      trackWebBtn: '🌐 Отследить на сайте',
      notFound: (id: string) => `❌ Тикет <code>${escapeHtml(id)}</code> не найден.`,
      statusCard: (ticket: TicketRow) => [
        `🎫 <b>Статус обращения</b>`,
        ``,
        `🔢 <b>Номер:</b> <code>${ticket.ticket_number}</code>`,
        ticket.awb ? `📦 <b>AWB:</b> <code>${ticket.awb}</code>` : null,
        `📌 <b>Тема:</b> ${getTopicLabel(ticket.issue_type, 'ru')}`,
        `📍 <b>Статус:</b> ${getTicketStatusLabel(ticket.status, 'ru')}`,
        `🕒 <b>Создан:</b> ${new Date(ticket.created_at + 'Z').toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`,
      ].filter(Boolean).join('\n'),
    },

    clientIdDetected: (clientId: string) => [
      `ℹ️ Вы ввели ID клиента (<b>#${escapeHtml(clientId)}</b>).`,
      ``,
      `Чтобы проверить статус посылки, отправьте трек-код AWB.`,
    ].join('\n'),

    faq: {
      title: '❓ <b>Частые вопросы (FAQ)</b>\n\nВыберите интересующую тему:',
      items: [
        {
          id: 'faq_track',
          q: '📦 Как отследить заказ?',
          a: 'В главном меню нажмите "📦 Где мой заказ?" и введите трек-код (AWB). Бот покажет актуальный статус и местонахождение посылки.',
        },
        {
          id: 'faq_time',
          q: '⏰ Сколько времени занимает доставка?',
          a: '✈️ <b>Авиадоставка:</b> 7–12 рабочих дней.\n🚛 <b>Наземная доставка:</b> 15–25 рабочих дней.\n\nВ период таможенного контроля или праздников сроки могут немного увеличиться.',
        },
        {
          id: 'faq_pay',
          q: '💰 Как оплатить заказ?',
          a: 'Оплатить посылку можно в приложении OnegoPost через платежные системы Click, Payme или с баланса личного кабинета.',
        },
        {
          id: 'faq_id',
          q: '🆔 Что такое персональный ID клиента?',
          a: 'При регистрации в приложении OnegoPost вам выдается 6-значный персональный ID (например: 100081). Его обязательно нужно указывать в адресе доставки при покупках в Китае!',
        },
        {
          id: 'faq_wh',
          q: '🏢 Где найти адрес склада в Китае?',
          a: 'Точный адрес нашего склада в Китае, номер телефона и индекс доступны в разделе "Склад" мобильного приложения OnegoPost.',
        },
        {
          id: 'faq_weight',
          q: '⚖️ Как рассчитывается вес?',
          a: 'Вес определяется на складе в Китае на электронных весах. Расчёт ведётся по большему значению: физический или объёмный вес (Длина × Ширина × Высота / 6000).',
        },
        {
          id: 'faq_op',
          q: '👩‍💻 Как связаться с оператором?',
          a: 'В главном меню нажмите "👩‍💻 Помощь оператора" или свяжитесь напрямую с @Onegopostadmin.',
        },
        {
          id: 'faq_app',
          q: '📲 Где скачать мобильное приложение?',
          a: 'Приложение OneGoPost доступно в App Store (iPhone) и Google Play (Android). Отправьте команду /app, чтобы получить ссылки.',
        },
      ],
      back: '⬅️ Назад к списку вопросов',
    },

    appsInfo: [
      `📲 <b>Официальное мобильное приложение OneGoPost</b>`,
      ``,
      `В приложении OneGoPost удобно совершать покупки из Китая, отслеживать посылки в реальном времени и управлять заказами!`,
      ``,
      `Установите приложение по ссылкам ниже:`,
    ].join('\n'),

    cancelled: 'Действие отменено. Возврат в главное меню.',
    invalidInput: '⚠️ Введены некорректные данные. Пожалуйста, попробуйте снова.',
    errorOccurred: '❌ Произошла ошибка. Пожалуйста, попробуйте чуть позже.',
    adminOnly: '⛔ Эта команда доступна только администраторам.',
    ticketCmdUsage: '💡 Использование: <code>/ticket OP-XXXXX</code>',
  },
} as const;

// ─── Package Card Formatter ─────────────────────────────────────

/**
 * Format a verified package card according to the official OnegoPost requirements:
 * - 📦 AWB / Trek-kod (Data.ID)
 * - 🏷 Mahsulot / Товар (Data.Product.Title or Data.Body.Name)
 * - ⚖️ Og'irlik / Вес (Data.Body.Volume.Weight kg)
 * - ✈️ Reys / Рейс (Data.Batch.ID)
 * - 📦 Quti / Коробка (Data.Box.ID)
 * - 📍 Holati / Статус (getStatusText(Data.Status, lang))
 * - 🕒 Oxirgi yangilanish / Обновлено (Data.ModifiedOn)
 */
export function formatPackageCard(pkg: PackageData, lang: 'uz' | 'ru'): string {
  const status = getStatusText(pkg.Status, lang);
  const awb = escapeHtml(pkg.ID);
  const title = escapeHtml(
    pkg.Product?.Title || pkg.Body?.Name || (lang === 'uz' ? "Ko'rsatilmagan" : 'Не указано'),
  );
  const weight =
    pkg.Body?.Volume?.Weight !== undefined
      ? `${pkg.Body.Volume.Weight} kg`
      : lang === 'uz'
      ? "Noma'lum"
      : 'Не указан';
  const batch = pkg.Batch?.ID ? escapeHtml(pkg.Batch.ID) : '-';
  const box = pkg.Box?.ID ? escapeHtml(pkg.Box.ID) : '-';
  const modified = pkg.ModifiedOn
    ? new Date(pkg.ModifiedOn).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU', {
        timeZone: 'Asia/Tashkent',
      })
    : '-';

  if (lang === 'uz') {
    return [
      `📦 <b>Buyurtma holati</b>`,
      ``,
      `📦 <b>AWB / Trek-kod:</b> <code>${awb}</code>`,
      `🏷 <b>Mahsulot:</b> ${title}`,
      `⚖️ <b>Og'irlik:</b> ${weight}`,
      `✈️ <b>Reys:</b> ${batch}`,
      `📦 <b>Quti:</b> ${box}`,
      `📍 <b>Holati:</b> <b>${status}</b>`,
      `🕒 <b>Oxirgi yangilanish:</b> ${modified}`,
    ].join('\n');
  }

  return [
    `📦 <b>Статус заказа</b>`,
    ``,
    `📦 <b>AWB / Трек-код:</b> <code>${awb}</code>`,
    `🏷 <b>Товар:</b> ${title}`,
    `⚖️ <b>Вес:</b> ${weight}`,
    `✈️ <b>Рейс:</b> ${batch}`,
    `📦 <b>Коробка:</b> ${box}`,
    `📍 <b>Статус:</b> <b>${status}</b>`,
    `🕒 <b>Обновлено:</b> ${modified}`,
  ].join('\n');
}

// ─── Tracking Timeline Formatter ────────────────────────────────

/**
 * Format live tracking timeline with automatic Chinese logistics translation.
 * Shows translated location and checkpoints.
 */
export function formatTrackingTimeline(
  awb: string,
  tracking: TrackingResult,
  lang: 'uz' | 'ru',
): string {
  const safeAwb = escapeHtml(awb);

  const formatTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU', {
        timeZone: 'Asia/Tashkent',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const translatedLocation = translateLogistics(tracking.currentLocation, lang);

  const header =
    lang === 'uz'
      ? [
          `📦 <b>Buyurtma kuzatuvi</b>`,
          ``,
          `🔢 <b>AWB / Trek-kod:</b> <code>${safeAwb}</code>`,
          `📍 <b>Hozirgi holat:</b> ${escapeHtml(translatedLocation)}`,
          `🕒 <b>Vaqti:</b> ${formatTime(tracking.currentTime)}`,
        ]
      : [
          `📦 <b>Отслеживание заказа</b>`,
          ``,
          `🔢 <b>AWB / Трек-код:</b> <code>${safeAwb}</code>`,
          `📍 <b>Текущий статус:</b> ${escapeHtml(translatedLocation)}`,
          `🕒 <b>Время:</b> ${formatTime(tracking.currentTime)}`,
        ];

  if (tracking.history.length > 0) {
    const timelineTitle =
      lang === 'uz'
        ? `\n📋 <b>Harakatlanish tarixi (kuryer):</b>`
        : `\n📋 <b>История движения (курьер):</b>`;
    header.push(timelineTitle);

    for (let i = 0; i < Math.min(tracking.history.length, 8); i++) {
      const cp = tracking.history[i];
      const marker = i === 0 ? '📌' : '  ├';
      const translatedCp = translateLogistics(cp.Content, lang);
      header.push(`${marker} ${formatTime(cp.Time)} — ${escapeHtml(translatedCp)}`);
    }
  }

  return header.join('\n');
}

/**
 * Format comprehensive package card combining official OnegoPost status
 * and courier movement history with clean translations.
 */
export function formatComprehensiveTrackingCard(
  pkg: PackageData | null,
  tracking: TrackingResult | null,
  awb: string,
  lang: 'uz' | 'ru',
): string {
  const parts: string[] = [];
  const safeAwb = escapeHtml(awb);

  const formatTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU', {
        timeZone: 'Asia/Tashkent',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  if (pkg) {
    const status = getStatusText(pkg.Status, lang);
    const title = escapeHtml(
      pkg.Product?.Title || pkg.Body?.Name || (lang === 'uz' ? "Ko'rsatilmagan" : 'Не указано'),
    );
    const weight =
      pkg.Body?.Volume?.Weight !== undefined
        ? `${pkg.Body.Volume.Weight} kg`
        : lang === 'uz'
        ? "Noma'lum"
        : 'Не указан';
    const batch = pkg.Batch?.ID ? escapeHtml(pkg.Batch.ID) : '-';
    const box = pkg.Box?.ID ? escapeHtml(pkg.Box.ID) : '-';
    const modified = pkg.ModifiedOn ? formatTime(pkg.ModifiedOn) : '-';

    if (lang === 'uz') {
      parts.push(
        `📦 <b>Buyurtma holati</b>`,
        ``,
        `📦 <b>AWB / Trek-kod:</b> <code>${safeAwb}</code>`,
        `🏷 <b>Mahsulot:</b> ${title}`,
        `⚖️ <b>Og'irlik:</b> ${weight}`,
        `✈️ <b>Reys (Partiya):</b> ${batch}`,
        `📦 <b>Quti:</b> ${box}`,
        `📍 <b>Rasmiy holati:</b> <b>${status}</b>`,
        `🕒 <b>Oxirgi yangilanish:</b> ${modified}`,
      );
    } else {
      parts.push(
        `📦 <b>Статус заказа</b>`,
        ``,
        `📦 <b>AWB / Трек-код:</b> <code>${safeAwb}</code>`,
        `🏷 <b>Товар:</b> ${title}`,
        `⚖️ <b>Вес:</b> ${weight}`,
        `✈️ <b>Рейс (Партия):</b> ${batch}`,
        `📦 <b>Коробка:</b> ${box}`,
        `📍 <b>Официальный статус:</b> <b>${status}</b>`,
        `🕒 <b>Обновлено:</b> ${modified}`,
      );
    }
    return parts.join('\n');
  }

  // If package is not yet registered in OneGoPost warehouse, but courier is in transit
  if (tracking) {
    if (lang === 'uz') {
      return [
        `📦 <b>Buyurtma kuzatuvi</b>`,
        ``,
        `🔢 <b>AWB / Trek-kod:</b> <code>${safeAwb}</code>`,
        `📍 <b>Holati:</b> Posilka Xitoy bo'ylab yetkazilmoqda (Xitoy omboriga qabul qilinishi kutilmoqda)`,
        `🕒 <b>Oxirgi harakat:</b> ${formatTime(tracking.currentTime)}`,
      ].join('\n');
    } else {
      return [
        `📦 <b>Отслеживание заказа</b>`,
        ``,
        `🔢 <b>AWB / Трек-код:</b> <code>${safeAwb}</code>`,
        `📍 <b>Статус:</b> Посылка в пути по Китаю (ожидается приемка складом в Китае)`,
        `🕒 <b>Последнее движение:</b> ${formatTime(tracking.currentTime)}`,
      ].join('\n');
    }
  }

  return '';
}

// ─── Admin Stats Formatter ──────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  Delay: TOPIC_LABELS.Delay.uz,
  Payment: TOPIC_LABELS.Payment.uz,
  Weight: TOPIC_LABELS.Weight.uz,
  Warehouse: TOPIC_LABELS.Warehouse.uz,
  Tracking: TOPIC_LABELS.Tracking.uz,
  OperatorHelp: TOPIC_LABELS.OperatorHelp.uz,
  General: TOPIC_LABELS.General.uz,
};

const STATUS_LABELS: Record<string, string> = {
  new: '🆕 Yangi',
  in_review: '🔍 Ko‘rib chiqilmoqda',
  transferred: '📤 Boshqa bo‘limga yuborildi',
  resolved: '✅ Yechildi',
};

const FAQ_LABELS: Record<string, string> = {
  faq_track: '📦 Posilkani kuzatish',
  faq_time: '⏰ Yetkazib berish muddati',
  faq_pay: '💰 To‘lov qilish',
  faq_id: '🆔 Shaxsiy ID raqam',
  faq_wh: '🏢 Xitoy ombor manzili',
  faq_weight: '⚖️ Vazn hisoblash',
  faq_op: '👩‍💻 Operator bilan bog‘lanish',
  faq_app: '📲 Mobil ilovani yuklab olish',
};

export function formatAdminStats(summary: AnalyticsSummary): string {
  const categoryLines =
    Object.entries(summary.ticketsByCategory)
      .map(([cat, count]) => `  • ${CATEGORY_LABELS[cat] || cat}: <b>${count} ta</b>`)
      .join('\n') || '  Hozircha yo‘q';

  const statusLines =
    Object.entries(summary.ticketsByStatus)
      .map(([status, count]) => `  • ${STATUS_LABELS[status] || status}: <b>${count} ta</b>`)
      .join('\n') || '  Hozircha yo‘q';

  const faqLines =
    summary.popularFaqTopics
      .map((f, i) => `  ${i + 1}. ${FAQ_LABELS[f.topic] || f.topic} — <b>${f.count} marta</b>`)
      .join('\n') || '  Hozircha yo‘q';

  return [
    `📊 <b>OnegoPost Bot — Admin Statistika</b>`,
    ``,
    `👥 <b>Jami foydalanuvchilar:</b> ${summary.totalUsers} nafar`,
    `🔍 <b>Bugungi qidiruvlar:</b> ${summary.searchesToday} ta`,
    `🔍 <b>Jami qidiruvlar:</b> ${summary.totalSearches} ta`,
    ``,
    `🎫 <b>Jami ticketlar:</b> ${summary.totalTickets} ta`,
    `<b>Mavzular bo‘yicha:</b>`,
    categoryLines,
    ``,
    `<b>Statuslar bo‘yicha:</b>`,
    statusLines,
    ``,
    `📲 <b>Ilovaga o‘tishlar (deep link):</b> ${summary.deepLinkClicks} marta`,
    ``,
    `❓ <b>Eng ko‘p o‘qilgan FAQ savollari:</b>`,
    faqLines,
  ].join('\n');
}
