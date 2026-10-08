import { PackageData, TrackingResult, TrackingCheckpoint, TicketRow, TicketStatus, getStatusText } from '../api/types';
import type { AnalyticsSummary, DailyAnalyticsSummary } from '../db/database';
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
      tashkentWarehouse: '📍 Toshkent ombori qayerda?',
      workingHours: '🕒 Ish vaqti',
      faq: '❓ Tez-tez so\'raladigan savollar',
      operator: '👩‍💻 Operator yordami',
      changeLang: '🌐 Tilni o\'zgartirish',
      adminPanel: '⚙️ Admin panel',
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
          a: 'Bosh menyu qismida "📦 Buyurtmam qayerda?" qismidan kuzatib turishingiz mumkin.',
        },
        {
          id: 'faq_awb',
          q: '🏷 AWB nima?',
          a: 'AWB — bu tovaringiz trek kodi. U kod asosan buyurtma qilganingizdan so’ng 3–4 kunda saytingizda ko’rinadigan trek raqam hisoblanadi, u raqamni kiritib botimizdan ma’lumot olishingiz mumkin.',
        },
        {
          id: 'faq_time',
          q: '⏰ Yetkazib berish qancha vaqt oladi?',
          a: '✈️ <b>Avia:</b> 9.5$ (oddiy buyurtmalarga) dan 11$ (brand, seriya) gacha — 3–7 kunda.\n\n🚛 <b>Avto:</b> 6$ (oddiy buyurtmalarga) dan 7.5$ (brand, seriya) — fura yo‘lga chiqqan kundan boshlab 18–22 kunda.\n\n<b>Minimalka yo‘q!</b>\nBojxona tekshiruvi yoki bayram kunlarida muddat biroz uzayishi mumkin.',
        },
        {
          id: 'faq_pay',
          q: '💰 To\'lov qanday amalga oshiriladi?',
          a: 'To\'lovlarni OnegoPost mobil ilovasida Click, Payme yoki naqd pul bilan to’lamoqchi bo’lsangiz shaxsiy hisob balansi orqali xavfsiz va tez to\'lashingiz mumkin.',
        },
        {
          id: 'faq_receive',
          q: '📬 Buyurtmam O’zbekistonga kelgach qanday olaman?',
          a: 'Buyurtmangiz O’zbekistonga kelgach ilovangiz yoki saytingizdan SMS xabarnoma keladi. Agar buyurtmangizning kargosiga ya’ni yuk haqqiga to’lov qilgan bo’lsangiz, avtomatik ravishda siz kiritgan manzilga EMU pochta orqali yetkaziladi.',
        },
        {
          id: 'faq_id',
          q: '🆔 Mening shaxsiy ID raqamim nima?',
          a: 'OnegoPost ilovasida ro\'yxatdan o\'tganingizda sizga 6 xonali unikal ID (masalan: UZ100081) beriladi.',
        },
        {
          id: 'faq_wh',
          q: '🏢 Xitoy ombor manzili qayerda?',
          a: 'Xitoydagi omborimizning to\'liq manzili, telefon raqami va indeks ma\'lumotlari OnegoPost mobil ilovasining "Ombor manzili" bo\'limida ko\'rsatilgan.',
        },
        {
          id: 'faq_weight',
          q: '⚖️ Vazn qanday hisoblanadi?',
          a: 'Posilka Xitoy omborida elektron tarozida tortiladi. Haqiqiy jismoniy vazn hisobga olinadi. Agar tovaringiz hajmi vaznga nisbatan katta bo‘lsa “gabarit” (Uzunlik × Kenglik × Balandlik / 6000) ning eng kattasi hisobga olinadi.',
        },
        {
          id: 'faq_op',
          q: '👩‍💻 Operator bilan qanday bog\'lanaman?',
          a: 'Bosh menyudan "👩‍💻 Operator yordami" tugmasini bosing yoki @onegopost_admin bilan to\'g\'ridan-to\'g\'ri bog\'laning.',
        },
        {
          id: 'faq_app',
          q: '📲 Mobil ilovani qayerdan yuklab olsam bo‘ladi?',
          a: 'OneGoPost ilovasini App Store (iPhone) va Google Play (Android) orqali yuklab olishingiz mumkin. /app buyrug\'i orqali to\'g\'ridan-to\'g\'ri havolalarni oling.',
        },
      ],
      back: '⬅️ Savollar ro\'yxatiga qaytish',
    },

    tashkentWarehouseInfo: [
      `📍 <b>OneGoPost — Toshkent ombori</b>`,
      ``,
      `🏢 <b>Mo‘ljal:</b> Toshkent shahri, Yakkasaroy tumani`,
      `🗺 <b>Lokatsiya:</b> Xaritadagi belgilangan nuqta bo‘yicha`,
      ``,
      `Quyidagi tugmalar orqali xaritada qulay ochishingiz mumkin:`,
    ].join('\n'),

    workingHoursInfo: [
      `🕒 <b>OneGoPost — Ish vaqti</b>`,
      ``,
      `⏰ <b>Ish vaqti:</b> dushanbadan shanbagacha 10:00 / 18:30`,
      ``,
      `📢 <i>Bayram kunlari telegram va instagramda e'lon qilinadi.</i>`,
    ].join('\n'),

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
      tashkentWarehouse: '📍 Где склад в Ташкенте?',
      workingHours: '🕒 График работы',
      faq: '❓ Частые вопросы',
      operator: '👩‍💻 Помощь оператора',
      changeLang: '🌐 Сменить язык',
      adminPanel: '⚙️ Админ-панель',
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
          a: 'В главном меню через раздел "📦 Где мой заказ?" вы можете отслеживать статус вашей посылки.',
        },
        {
          id: 'faq_awb',
          q: '🏷 Что такое AWB трек-код?',
          a: 'AWB — это трек-код вашего товара. Этот номер обычно появляется на сайте через 3–4 дня после оформления заказа, введя его в боте, вы сможете получить информацию о посылке.',
        },
        {
          id: 'faq_time',
          q: '⏰ Сколько времени занимает доставка?',
          a: '✈️ <b>Авиа:</b> от $9.5 (обычные заказы) до $11 (бренд, серия) — за 3–7 дней.\n\n🚛 <b>Авто:</b> от $6 (обычные заказы) до $7.5 (бренд, серия) — за 18–22 дня с момента выезда фуры.\n\n<b>Минимального веса нет!</b>\nВ период таможенного контроля или праздников сроки могут немного увеличиться.',
        },
        {
          id: 'faq_pay',
          q: '💰 Как оплатить заказ?',
          a: 'Оплатить посылку можно в приложении OnegoPost через платёжные системы Click, Payme или, если хотите оплатить наличными, через пополнение баланса личного кабинета.',
        },
        {
          id: 'faq_receive',
          q: '📬 Как получить заказ после прибытия в Узбекистан?',
          a: 'После прибытия вашего заказа в Узбекистан вам придёт SMS-уведомление из приложения или личного кабинета. Если доставка (карго) оплачена, посылка будет автоматически доставлена по указанному вами адресу курьерской службой EMU.',
        },
        {
          id: 'faq_id',
          q: '🆔 Что такое персональный ID клиента?',
          a: 'При регистрации в приложении OnegoPost вам выдается 6-значный персональный ID (например: UZ100081).',
        },
        {
          id: 'faq_wh',
          q: '🏢 Где найти адрес склада в Китае?',
          a: 'Точный адрес нашего склада в Китае, номер телефона и индекс доступны в разделе "Адрес склада" мобильного приложения OnegoPost.',
        },
        {
          id: 'faq_weight',
          q: '⚖️ Как рассчитывается вес?',
          a: 'Посылка взвешивается на складе в Китае на электронных весах. Учитывается фактический физический вес. Если объём товара превышает вес («габарит»), расчёт ведётся по большему значению: физический или объёмный вес (Длина × Ширина × Высота / 6000).',
        },
        {
          id: 'faq_op',
          q: '👩‍💻 Как связаться с оператором?',
          a: 'В главном меню нажмите "👩‍💻 Помощь оператора" или свяжитесь напрямую с @onegopost_admin.',
        },
        {
          id: 'faq_app',
          q: '📲 Где скачать мобильное приложение?',
          a: 'Приложение OneGoPost доступно в App Store (iPhone) и Google Play (Android). Отправьте команду /app, чтобы получить ссылки.',
        },
      ],
      back: '⬅️ Назад к списку вопросов',
    },

    tashkentWarehouseInfo: [
      `📍 <b>OneGoPost — Склад в Ташкенте</b>`,
      ``,
      `🏢 <b>Ориентир:</b> г. Ташкент, Яккасарайский район`,
      `🗺 <b>Локация:</b> по точке на карте`,
      ``,
      `Вы можете открыть локацию на карте по кнопкам ниже:`,
    ].join('\n'),

    workingHoursInfo: [
      `🕒 <b>OneGoPost — График работы</b>`,
      ``,
      `⏰ <b>Режим работы:</b> с понедельника по субботу с 10:00 до 18:30`,
      ``,
      `📢 <i>В праздничные дни график публикуется в Telegram и Instagram.</i>`,
    ].join('\n'),

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

export const CATEGORY_LABELS: Record<string, string> = {
  Delay: TOPIC_LABELS.Delay.uz,
  Payment: TOPIC_LABELS.Payment.uz,
  Weight: TOPIC_LABELS.Weight.uz,
  Warehouse: TOPIC_LABELS.Warehouse.uz,
  Tracking: TOPIC_LABELS.Tracking.uz,
  OperatorHelp: TOPIC_LABELS.OperatorHelp.uz,
  General: TOPIC_LABELS.General.uz,
};

export const STATUS_LABELS: Record<string, string> = {
  new: '🆕 Yangi',
  in_review: '🔍 Ko‘rib chiqilmoqda',
  transferred: '📤 Boshqa bo‘limga yuborildi',
  resolved: '✅ Yechildi',
};

export const FAQ_LABELS: Record<string, string> = {
  faq_track: '📦 Posilkani kuzatish',
  faq_awb: '🏷 AWB trek-kod nima',
  faq_time: '⏰ Yetkazib berish muddati',
  faq_pay: '💰 To‘lov qilish',
  faq_receive: '📬 O‘zbekistonda qabul qilish',
  faq_id: '🆔 Shaxsiy ID raqam',
  faq_wh: '🏢 Xitoy ombor manzili',
  faq_weight: '⚖️ Vazn hisoblash',
  faq_op: '👩‍💻 Operator bilan bog‘lanish',
  faq_app: '📲 Mobil ilovani yuklab olish',
};

export function formatAdminStats(summary: AnalyticsSummary, lang: 'uz' | 'ru' = 'uz'): string {
  const categoryLines =
    Object.entries(summary.ticketsByCategory)
      .map(([cat, count]) => `  • ${CATEGORY_LABELS[cat] || cat}: <b>${count} ta</b>`)
      .join('\n') || (lang === 'uz' ? '  Hozircha yo‘q' : '  Пока нет');

  const statusLines =
    Object.entries(summary.ticketsByStatus)
      .map(([status, count]) => `  • ${STATUS_LABELS[status] || status}: <b>${count} ta</b>`)
      .join('\n') || (lang === 'uz' ? '  Hozircha yo‘q' : '  Пока нет');

  const faqLines =
    summary.popularFaqTopics
      .map((f, i) => `  ${i + 1}. ${FAQ_LABELS[f.topic] || f.topic} — <b>${f.count} marta</b>`)
      .join('\n') || (lang === 'uz' ? '  Hozircha yo‘q' : '  Пока нет');

  const last7DaysLines =
    summary.last7Days && summary.last7Days.length > 0
      ? summary.last7Days
          .map(
            (d) =>
              `  📅 <code>${d.date}</code>: 👤 <b>${d.users}</b> | 🔍 <b>${d.searches}</b> | 🎫 <b>${d.tickets}</b>`,
          )
          .join('\n')
      : lang === 'uz'
      ? '  Hozircha maʼlumot yo‘q'
      : '  Пока данных нет';

  if (lang === 'ru') {
    return [
      `📊 <b>OnegoPost Bot — Панель Администратора</b>`,
      ``,
      `⚡ <b>ПОКАЗАТЕЛИ ЗА СЕГОДНЯ:</b>`,
      `  • 👥 Новые пользователи: <b>${summary.usersToday}</b>`,
      `  • 🔍 Поисков посылок: <b>${summary.searchesToday}</b>`,
      `  • 🎫 Новых тикетов: <b>${summary.ticketsToday}</b>`,
      `  • ✅ Решено тикетов: <b>${summary.resolvedTicketsToday}</b>`,
      `  • 📲 Переходов в приложение: <b>${summary.deepLinkClicksToday}</b>`,
      ``,
      `🌐 <b>ОБЩИЕ ПОКАЗАТЕЛИ (ЗА ВСЁ ВРЕМЯ):</b>`,
      `  • 👥 Всего пользователей: <b>${summary.totalUsers}</b>`,
      `  • 🔍 Всего поисков: <b>${summary.totalSearches}</b>`,
      `  • 🎫 Всего тикетов: <b>${summary.totalTickets}</b>`,
      `  • ⏳ Нерешённых тикетов: <b>${summary.unresolvedTickets}</b>`,
      `  • 📲 Всего переходов в приложение: <b>${summary.deepLinkClicks}</b>`,
      ``,
      `<b>📅 Активность за последние 7 дней:</b>`,
      last7DaysLines,
      ``,
      `<b>По категориям тикетов:</b>`,
      categoryLines,
      ``,
      `<b>По статусам тикетов:</b>`,
      statusLines,
      ``,
      `❓ <b>Часто просматриваемые FAQ:</b>`,
      faqLines,
    ].join('\n');
  }

  return [
    `📊 <b>OnegoPost Bot — Admin Statistika</b>`,
    ``,
    `⚡ <b>BUGUNGI KO‘RSATKICHLAR:</b>`,
    `  • 👥 Yangi foydalanuvchilar: <b>${summary.usersToday} nafar</b>`,
    `  • 🔍 Qidiruvlar soni: <b>${summary.searchesToday} ta</b>`,
    `  • 🎫 Yangi ochilgan ticketlar: <b>${summary.ticketsToday} ta</b>`,
    `  • ✅ Hal qilingan ticketlar: <b>${summary.resolvedTicketsToday} ta</b>`,
    `  • 📲 Ilovaga o‘tishlar: <b>${summary.deepLinkClicksToday} marta</b>`,
    ``,
    `🌐 <b>UMUMIY KO‘RSATKICHLAR:</b>`,
    `  • 👥 Jami foydalanuvchilar: <b>${summary.totalUsers} nafar</b>`,
    `  • 🔍 Jami qidiruvlar: <b>${summary.totalSearches} ta</b>`,
    `  • 🎫 Jami ochilgan ticketlar: <b>${summary.totalTickets} ta</b>`,
    `  • ⏳ Hali yechilmagan ticketlar: <b>${summary.unresolvedTickets} ta</b>`,
    `  • 📲 Jami ilovaga o‘tishlar: <b>${summary.deepLinkClicks} marta</b>`,
    ``,
    `<b>📅 Oxirgi 7 kunlik faollik:</b>`,
    last7DaysLines,
    ``,
    `<b>Ticketlar mavzular bo‘yicha:</b>`,
    categoryLines,
    ``,
    `<b>Statuslar bo‘yicha:</b>`,
    statusLines,
    ``,
    `❓ <b>Eng ko‘p o‘qilgan FAQ savollari:</b>`,
    faqLines,
  ].join('\n');
}

export function formatDailyStats(daily: DailyAnalyticsSummary, lang: 'uz' | 'ru' = 'uz'): string {
  const categoryLines =
    Object.entries(daily.ticketsByCategory)
      .map(([cat, count]) => `  • ${CATEGORY_LABELS[cat] || cat}: <b>${count} ta</b>`)
      .join('\n') || (lang === 'uz' ? '  Bugun ticket ochilmadi' : '  Сегодня тикетов не было');

  const statusLines =
    Object.entries(daily.ticketsByStatus)
      .map(([status, count]) => `  • ${STATUS_LABELS[status] || status}: <b>${count} ta</b>`)
      .join('\n') || (lang === 'uz' ? '  Status mavjud emas' : '  Статусов нет');

  const faqLines =
    daily.popularFaqTopics
      .map((f, i) => `  ${i + 1}. ${FAQ_LABELS[f.topic] || f.topic} — <b>${f.count} marta</b>`)
      .join('\n') || (lang === 'uz' ? '  Bugun FAQ ko‘rilmadi' : '  Сегодня FAQ не просматривали');

  if (lang === 'ru') {
    return [
      `📅 <b>OneGoPost — Статистика за сегодня (${daily.date})</b>`,
      ``,
      `👥 <b>Новые пользователи:</b> <b>${daily.usersCount}</b> чел.`,
      `🔍 <b>Поисков посылок:</b> <b>${daily.searchesCount}</b> раз`,
      `🎫 <b>Создано новых тикетов:</b> <b>${daily.ticketsCount}</b> шт.`,
      `✅ <b>Решено тикетов:</b> <b>${daily.resolvedTickets}</b> шт.`,
      `📲 <b>Переходов в моб. приложение:</b> <b>${daily.deepLinkClicks}</b> раз`,
      ``,
      `<b>📌 Тикеты по темам (за сегодня):</b>`,
      categoryLines,
      ``,
      `<b>📍 Статусы тикетов:</b>`,
      statusLines,
      ``,
      `<b>❓ Популярные FAQ (за сегодня):</b>`,
      faqLines,
    ].join('\n');
  }

  return [
    `📅 <b>OneGoPost — Bugungi Kunlik Statistika (${daily.date})</b>`,
    ``,
    `👥 <b>Bugun qo‘shilgan foydalanuvchilar:</b> <b>${daily.usersCount}</b> nafar`,
    `🔍 <b>Bugungi posilka qidiruvlari:</b> <b>${daily.searchesCount}</b> ta`,
    `🎫 <b>Bugun ochilgan yangi ticketlar:</b> <b>${daily.ticketsCount}</b> ta`,
    `✅ <b>Bugun hal qilingan ticketlar:</b> <b>${daily.resolvedTickets}</b> ta`,
    `📲 <b>Ilovaga o‘tishlar (ichki chat):</b> <b>${daily.deepLinkClicks}</b> marta`,
    ``,
    `<b>📌 Bugungi ticketlar mavzusi:</b>`,
    categoryLines,
    ``,
    `<b>📍 Ticketlar holati:</b>`,
    statusLines,
    ``,
    `<b>❓ Bugun eng ko‘p o‘qilgan FAQ:</b>`,
    faqLines,
  ].join('\n');
}
