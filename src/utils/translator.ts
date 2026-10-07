/**
 * Professional Chinese Logistics Translator for OneGoPost.
 * Translates Chinese courier tracking checkpoints (Shentong, SF Express, YTO, ZTO, etc.)
 * into clear, user-friendly Uzbek and Russian.
 */

export function translateLogistics(text: string, lang: 'uz' | 'ru'): string {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    // Remove courier marketing spam & disclaimers
    .replace(/【物流问题无需找商家或平台[^】]*】/g, '')
    .replace(/若出现揽收后物流长时间未更新[^，,。]*/g, '')
    .replace(/勿找平台[，,]少一次投诉[，,]多一份感恩/g, '')
    .replace(/可关注[“"][^"”]+[”"]官方微信公众号[^。！!]*/g, '')
    .replace(/如有疑问请联系派件员[：:]\s*\d+/g, '')
    .replace(/专属客服帮你跟进解决/g, '')
    .replace(/有事先呼叫我/g, '')
    .replace(/少一次投诉，多一份感恩/g, '')
    .replace(/处理更快捷[！!]*/g, '')
    .replace(/投诉电话[：:]\s*[\d-]+/g, '')
    .replace(/，[，\s]+/g, '，')
    .replace(/[，,]\s*$/g, '')
    .trim();

  // Dictionary of Chinese logistics terms -> UZ / RU
  const dictionary: Array<[RegExp, { uz: string; ru: string }]> = [
    // Warehouse / Acceptance
    [/您的快件已由【?仓库】?代收/g, { uz: 'Posilka OneGo ombori tomonidan qabul qilindi', ru: 'Посылка принята складом OneGo' }],
    [/已由【?仓库】?代收/g, { uz: 'Ombor tomonidan qabul qilindi', ru: 'Принята складом' }],
    [/快件已由【?(.*?)】?代收/g, { uz: 'Posilka [$1] tomonidan qabul qilindi', ru: 'Посылка принята [$1]' }],
    [/快件已到达/g, { uz: 'Yetib keldi:', ru: 'Прибыла в:' }],
    [/快件已发往/g, { uz: 'Jo\'natildi:', ru: 'Отправлена в:' }],
    [/已到达/g, { uz: 'Yetib keldi:', ru: 'Прибыла в:' }],
    [/已发往/g, { uz: 'Jo\'natildi:', ru: 'Отправлена в:' }],
    [/已揽收/g, { uz: 'Kuryer tomonidan qabul qilindi', ru: 'Принята курьером' }],
    [/正在为您派送/g, { uz: 'Sizga yetkazilmoqda (kuryer yo\'lda)', ru: 'Доставляется курьером' }],
    [/派件员/g, { uz: 'Kuryer', ru: 'Курьер' }],
    [/快递员\((.*?)\)/g, { uz: 'Kuryer ($1)', ru: 'Курьер ($1)' }],
    [/快递员/g, { uz: 'Kuryer', ru: 'Курьер' }],

    // Logistics Centers
    [/转运中心/g, { uz: 'tranzit markazi', ru: 'транзитный центр' }],
    [/分拨中心/g, { uz: 'saralash markazi', ru: 'сортировочный центр' }],
    [/集运仓/g, { uz: 'konsolidatsiya ombori', ru: 'склад консолидации' }],
    [/国际物流中心/g, { uz: 'xalqaro logistika markazi', ru: 'международный логистический центр' }],
    [/服务点/g, { uz: 'qabul punkti', ru: 'пункт приёма' }],
    [/营业部/g, { uz: 'bo\'limi', ru: 'отделение' }],
    [/公司/g, { uz: 'filiali', ru: 'филиал' }],

    // Travel & Estimates
    [/预计(.*?)到达【?(.*?)】?/g, { uz: 'Taxminan $1 da [$2]ga yetib boradi', ru: 'Ожидается прибытие $1 в [$2]' }],
    [/两地距离(\d+KM)/g, { uz: 'Masofa: $1', ru: 'Расстояние: $1' }],
    [/预计将在(.*?)为您更新快件状态/g, { uz: '$1 da holat yangilanadi', ru: '$1 обновится статус' }],
    [/请您放心/g, { uz: '', ru: '' }],

    // Provinces & Cities
    [/【?咸阳市?】?/g, { uz: '[Sianyang] ', ru: '[Сяньян] ' }],
    [/【?西安市?】?/g, { uz: '[Sian] ', ru: '[Сиань] ' }],
    [/【?揭阳市?】?/g, { uz: '[Jieyang] ', ru: '[Цзеян] ' }],
    [/【?广州市?】?/g, { uz: '[Guanchjou] ', ru: '[Гуанчжоу] ' }],
    [/【?深圳市?】?/g, { uz: '[Shenchjen] ', ru: '[Шэньчжэнь] ' }],
    [/【?义乌市?】?/g, { uz: '[Ivu] ', ru: '[Иу] ' }],
    [/【?普宁市?】?/g, { uz: '[Puning] ', ru: '[Пунин] ' }],
    [/【?北京(?:市)?】?/g, { uz: '[Pekin] ', ru: '[Пекин] ' }],
    [/【?上海(?:市)?】?/g, { uz: '[Shanxay] ', ru: '[Шанхай] ' }],
    [/【?乌鲁木齐(?:市)?】?/g, { uz: '[Urumchi] ', ru: '[Урумчи] ' }],
    [/【?霍尔果斯(?:市)?】?/g, { uz: '[Xorgos] ', ru: '[Хоргос] ' }],
    [/陕西/g, { uz: 'Shensi ', ru: 'Шэньси ' }],
    [/广东/g, { uz: 'Guandun ', ru: 'Гуандун ' }],
    [/浙江/g, { uz: 'Chjejiang ', ru: 'Чжэцзян ' }],
    [/新疆/g, { uz: 'Shinjon ', ru: 'Синьцзян ' }],
    [/渭城区/g, { uz: 'Weicheng tumani ', ru: 'р-н Вэйчэн ' }],
    [/北区/g, { uz: 'Shimoliy ', ru: 'Северный ' }],
    [/市场/g, { uz: 'bozor ', ru: 'рынок ' }],
    [/二部/g, { uz: '2-bo\'lim ', ru: '2-отдел ' }],
    [/二/g, { uz: '2 ', ru: '2 ' }],
    [/三/g, { uz: '3 ', ru: '3 ' }],
    [/一/g, { uz: '1 ', ru: '1 ' }],
    [/的/g, { uz: ' ', ru: ' ' }],
    [/已/g, { uz: '', ru: '' }],
  ];

  for (const [pattern, trans] of dictionary) {
    cleaned = cleaned.replace(pattern, trans[lang]);
  }

  // Clean trailing and extra commas, spaces, dashes
  cleaned = cleaned
    .replace(/[，,;；]+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[,，\s—-]+|[,，\s—-]+$/g, '')
    .trim();

  return cleaned || text;
}
