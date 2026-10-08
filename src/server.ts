import express, { Request, Response, NextFunction } from 'express';
import { logger } from './utils/logger';
import { env } from './config/env';
import { onegoClient } from './api/onego-client';
import { MessageType, SupportMessagePayload, IssueTopic } from './api/types';
import { generateTicketId, generateDeepLink } from './utils/deeplink';
import {
  createTicket,
  getTicket,
  trackEvent,
  getAnalyticsSummary,
  getDailyAnalytics,
} from './db/database';
import {
  getTopicLabel,
  CATEGORY_LABELS,
  STATUS_LABELS,
  FAQ_LABELS,
} from './bot/messages';

// ─── Express App Factory ────────────────────────────────────────

export function createServer(): express.Application {
  const app = express();

  app.use(express.json());

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug({ method: req.method, url: req.url }, 'HTTP request');
    next();
  });

  // ─── Health Check ─────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'onegopost-bot',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // ─── GET /api/v1/tracking/:awb ────────────────────────────────
  app.get('/api/v1/tracking/:awb', async (req: Request, res: Response) => {
    try {
      const rawAwb = req.params.awb;
      const awb = (Array.isArray(rawAwb) ? rawAwb[0] : rawAwb)?.trim() || '';
      const lang = (req.query.lang as string)?.toLowerCase() === 'ru' ? 'ru' : 'uz';

      if (!awb || awb.length < 3) {
        res.status(400).json({ error: 'AWB must be at least 3 characters' });
        return;
      }

      const tracking = await onegoClient.getTracking(awb, lang as 'uz' | 'ru');

      if (tracking) {
        res.json({
          success: true,
          awb,
          lang,
          currentLocation: tracking.currentLocation,
          currentTime: tracking.currentTime,
          totalCheckpoints: tracking.history.length,
          history: tracking.history,
        });
        return;
      }

      // Fallback: try legacy package endpoint
      const pkg = await onegoClient.getPackage(awb);

      if (pkg) {
        res.json({
          success: true,
          awb: pkg.ID,
          lang,
          source: 'package_api',
          status: pkg.Status,
          product: pkg.Product?.Title || pkg.Body?.Name || null,
          weight: pkg.Body?.Volume?.Weight ?? null,
          batch: pkg.Batch?.ID ?? null,
          box: pkg.Box?.ID ?? null,
          modifiedOn: pkg.ModifiedOn ?? null,
        });
        return;
      }

      res.status(404).json({ success: false, error: 'Package not found', awb });
    } catch (error: any) {
      logger.error({ error: error.message }, 'REST tracking error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── POST /api/v1/tickets ─────────────────────────────────────
  app.post('/api/v1/tickets', async (req: Request, res: Response) => {
    try {
      const {
        telegram_id,
        awb,
        issue_type,
        description,
        user_name,
      }: {
        telegram_id: number;
        awb?: string;
        issue_type: IssueTopic;
        description: string;
        user_name?: string;
      } = req.body;

      if (!telegram_id || !issue_type || !description) {
        res.status(400).json({
          error: 'Missing required fields: telegram_id, issue_type, description',
        });
        return;
      }

      const ticketId = generateTicketId();
      const fkId = awb || String(telegram_id);
      const name = user_name || `TG:${telegram_id}`;

      // Determine message type based on issue
      let msgType: MessageType;
      switch (issue_type) {
        case 'Tracking':
        case 'Delay':
        case 'Weight':
          msgType = MessageType.Package;
          break;
        case 'Payment':
          msgType = MessageType.Payment;
          break;
        default:
          msgType = MessageType.Customer;
      }

      const payload: SupportMessagePayload = {
        MessageId: '',
        isDelete: false,
        AdminId: '',
        Name: name,
        UserType: 0,
        Content: `[${ticketId}] [TG:${telegram_id}] [${issue_type}] ${description}`,
        Addtime: new Date().toISOString(),
      };

      // Submit to OnegoPost external API
      await onegoClient.submitMessage(fkId, msgType, issue_type, payload);

      // Persist in local DB
      const ticket = createTicket({
        ticketNumber: ticketId,
        telegramId: telegram_id,
        awb: awb ?? null,
        issueType: issue_type,
        description,
      });

      trackEvent(telegram_id, 'ticket_created', { ticketId, topic: issue_type });

      // Generate deep link
      const deepLink = generateDeepLink({
        orderId: fkId,
        issue: issue_type,
        ticketId,
        telegramId: telegram_id,
        userName: name,
      });

      res.status(201).json({
        success: true,
        ticket,
        deepLink,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'REST ticket creation error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── GET /api/v1/tickets/:ticketId ────────────────────────────
  app.get('/api/v1/tickets/:ticketId', (req: Request, res: Response) => {
    try {
      const rawParam = req.params.ticketId;
      const rawTicketId = (Array.isArray(rawParam) ? rawParam[0] : rawParam) || '';
      let ticketId = rawTicketId.toUpperCase().trim();
      // Normalize
      ticketId = ticketId.replace(/^#/, '');
      if (!ticketId.startsWith('OP-')) {
        ticketId = `OP-${ticketId}`;
      }
      const fullId = `#${ticketId}`;

      const ticket = getTicket(fullId);
      if (!ticket) {
        res.status(404).json({ success: false, error: 'Ticket not found', ticketId: fullId });
        return;
      }

      res.json({ success: true, ticket });
    } catch (error: any) {
      logger.error({ error: error.message }, 'REST ticket lookup error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── GET /api/v1/analytics/stats ──────────────────────────────
  app.get('/api/v1/analytics/stats', (_req: Request, res: Response) => {
    try {
      const summary = getAnalyticsSummary();
      res.json({ success: true, ...summary });
    } catch (error: any) {
      logger.error({ error: error.message }, 'REST analytics error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── GET /api/v1/analytics/daily ──────────────────────────────
  app.get('/api/v1/analytics/daily', (req: Request, res: Response) => {
    try {
      const date = (req.query.date as string) || undefined;
      const daily = getDailyAnalytics(date);
      res.json({ success: true, ...daily });
    } catch (error: any) {
      logger.error({ error: error.message }, 'REST daily analytics error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── GET /support/chat — Universal Link & Smart Mobile Deep Link ───
  app.get('/support/chat', (req: Request, res: Response) => {
    const orderId = (req.query.order_id as string) || '';
    const issue = (req.query.issue as string) || 'General';
    const ticketId = (req.query.ticket_id as string) || '';
    const tgId = parseInt((req.query.tg_id as string) || '0', 10);
    const userName = (req.query.user_name as string) || 'Mijoz';
    const lang = (req.query.lang as string)?.toLowerCase() === 'ru' ? 'ru' : 'uz';

    if (tgId) {
      trackEvent(tgId, 'deeplink_clicked', { orderId, issue, ticketId });
    }

    const appStoreUrl = env.APP_STORE_URL;
    const playStoreUrl = env.PLAY_STORE_URL;
    const webAppUrl = env.WEB_APP_DOWNLOAD_URL;
    const appCustomScheme = `onegopost://support/chat?order_id=${encodeURIComponent(orderId)}&issue=${encodeURIComponent(issue)}&ticket_id=${encodeURIComponent(ticketId)}`;
    const androidIntentUrl = `intent://support/chat?order_id=${encodeURIComponent(orderId)}&issue=${encodeURIComponent(issue)}&ticket_id=${encodeURIComponent(ticketId)}#Intent;scheme=onegopost;package=com.wangouyou.onegopost;end`;

    const t = {
      uz: {
        title: 'OneGoPost — Yordam markazi',
        alert: 'Bu masalani operator tekshirishi kerak.',
        subtitle: 'OnegoPost mobil ilovasidagi ichki xabarlar bo‘limi orqali operatorga murojaat qiling.',
        guideTitle: 'Ilova ichida qanday topiladi?',
        step1: 'OnegoPost mobil ilovasini oching',
        step2: 'Pastki menyudan <b>"Yordam"</b> bo‘limiga kiring',
        step3: '<b>"Ichki xabar"</b> tugmasini bosing va xabar qoldiring',
        openAppBtn: '📲 OnegoPost ilovasida ochish',
        storesTitle: 'Ilova hali o‘rnatilmaganmi?',
        ticketNum: 'Murojaat raqami',
        orderNum: 'AWB / Buyurtma',
        topic: 'Mavzu',
      },
      ru: {
        title: 'OneGoPost — Центр поддержки',
        alert: 'Этот вопрос должен проверить оператор.',
        subtitle: 'Обратитесь к оператору через раздел внутренних сообщений в приложении OnegoPost.',
        guideTitle: 'Как найти в приложении?',
        step1: 'Откройте мобильное приложение OnegoPost',
        step2: 'Перейдите в нижнем меню в раздел <b>«Помощь»</b>',
        step3: 'Нажмите <b>«Внутренние сообщения»</b> и напишите оператору',
        openAppBtn: '📲 Открыть в приложении OnegoPost',
        storesTitle: 'Приложение ещё не установлено?',
        ticketNum: 'Номер обращения',
        orderNum: 'AWB / Заказ',
        topic: 'Тема',
      },
    }[lang];

    res.send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${t.title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #ff5722;
      --primary-dark: #e64a19;
      --primary-soft: #fff3e0;
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --step-bg: #f1f5f9;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 16px;
    }
    .card {
      background: var(--card);
      border-radius: 24px;
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04);
      max-width: 440px;
      width: 100%;
      padding: 32px 24px;
      text-align: center;
    }
    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--primary-soft);
      color: var(--primary-dark);
      padding: 6px 14px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .brand-icon {
      font-size: 16px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: var(--text);
      line-height: 1.3;
      margin-bottom: 8px;
    }
    .alert-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
      padding: 12px 14px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      margin: 14px 0 16px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: var(--muted);
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .steps-container {
      background: var(--step-bg);
      border-radius: 16px;
      padding: 18px 16px;
      text-align: left;
      margin-bottom: 24px;
      border: 1px solid var(--border);
    }
    .steps-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .step-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
      font-size: 14px;
      color: var(--text);
      line-height: 1.4;
    }
    .step-item:last-child { margin-bottom: 0; }
    .step-num {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .meta-box {
      background: #fafafa;
      border: 1px dashed var(--border);
      border-radius: 12px;
      padding: 10px 14px;
      margin-bottom: 20px;
      font-size: 13px;
      text-align: left;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .meta-row:last-child { margin-bottom: 0; }
    .meta-row span { color: var(--muted); }
    .meta-row strong { color: var(--text); font-weight: 600; }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 15px 18px;
      border-radius: 14px;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      box-shadow: 0 4px 14px rgba(255, 87, 34, 0.35);
    }
    .btn-primary:hover, .btn-primary:active {
      background: var(--primary-dark);
      transform: translateY(-1px);
    }
    .stores-title {
      font-size: 12px;
      color: var(--muted);
      margin: 20px 0 10px 0;
      font-weight: 500;
    }
    .stores {
      display: flex;
      gap: 10px;
    }
    .btn-store {
      flex: 1;
      background: #ffffff;
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 13px;
      padding: 11px 8px;
      border-radius: 12px;
    }
    .btn-store:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }
  </style>
  <script>
    window.addEventListener('load', () => {
      // Automatic attempt to open app via custom scheme
      setTimeout(() => {
        var isAndroid = /Android/i.test(navigator.userAgent);
        window.location.href = isAndroid ? "${androidIntentUrl}" : "${appCustomScheme}";
      }, 350);
    });
  </script>
</head>
<body>
  <div class="card">
    <div class="brand-badge">
      <span class="brand-icon">📦</span>
      <span>OneGoPost Logistics</span>
    </div>
    
    <h1>${t.title}</h1>

    <div class="alert-box">
      <span>ℹ️</span>
      <span>${t.alert}</span>
    </div>

    <p class="subtitle">${t.subtitle}</p>

    <div class="steps-container">
      <div class="steps-title">
        <span>📍</span>
        <span>${t.guideTitle}</span>
      </div>
      <div class="step-item">
        <span class="step-num">1</span>
        <span>${t.step1}</span>
      </div>
      <div class="step-item">
        <span class="step-num">2</span>
        <span>${t.step2}</span>
      </div>
      <div class="step-item">
        <span class="step-num">3</span>
        <span>${t.step3}</span>
      </div>
    </div>

    ${ticketId || orderId ? `
    <div class="meta-box">
      ${ticketId ? `<div class="meta-row"><span>${t.ticketNum}:</span> <strong>${ticketId}</strong></div>` : ''}
      ${orderId ? `<div class="meta-row"><span>${t.orderNum}:</span> <strong>${orderId}</strong></div>` : ''}
      ${issue ? `<div class="meta-row"><span>${t.topic}:</span> <strong>${getTopicLabel(issue, lang)}</strong></div>` : ''}
    </div>` : ''}

    <a href="${appCustomScheme}" onclick="if(/Android/i.test(navigator.userAgent)){window.location.href='${androidIntentUrl}';return false;}" class="btn btn-primary" id="openAppBtn">${t.openAppBtn}</a>

    <div class="stores-title">${t.storesTitle}</div>
    <div class="stores">
      <a href="${appStoreUrl}" class="btn btn-store" target="_blank">🍏 App Store</a>
      <a href="${playStoreUrl}" class="btn btn-store" target="_blank">🤖 Google Play</a>
      <a href="${webAppUrl}" class="btn btn-store" target="_blank">🌐 Web sayt (Google)</a>
    </div>
  </div>
</body>
</html>`);
  });

  // ─── GET /admin — Visual Web Admin Dashboard ──────────────────
  app.get('/admin', (_req: Request, res: Response) => {
    const summary = getAnalyticsSummary();
    const categoriesHtml = Object.entries(summary.ticketsByCategory)
      .map(([k, v]) => `<li><span>${CATEGORY_LABELS[k] || k}</span><strong>${v} ta</strong></li>`)
      .join('') || '<li class="empty">Hozircha ma\'lumot yo\'q</li>';

    const statusHtml = Object.entries(summary.ticketsByStatus)
      .map(([k, v]) => `<li><span>${STATUS_LABELS[k] || k}</span><strong>${v} ta</strong></li>`)
      .join('') || '<li class="empty">Hozircha ma\'lumot yo\'q</li>';

    const faqHtml = summary.popularFaqTopics
      .map((f, i) => `<li><span>${i + 1}. ${FAQ_LABELS[f.topic] || f.topic}</span><strong>${f.count} marta</strong></li>`)
      .join('') || '<li class="empty">Hozircha ma\'lumot yo\'q</li>';

    const last7DaysRowsHtml =
      summary.last7Days && summary.last7Days.length > 0
        ? summary.last7Days
            .map(
              (d) =>
                `<tr><td><code>${d.date}</code></td><td><strong>${d.users}</strong></td><td><strong>${d.searches}</strong></td><td><strong>${d.tickets}</strong></td></tr>`,
            )
            .join('')
        : '<tr><td colspan="4" class="empty">Hozircha ma\'lumot yo\'q</td></tr>';

    res.send(`<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="30">
  <title>OneGoPost — Admin Analytics Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --primary: #ff5722;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 32px 20px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--card-border);
    }
    h1 { font-size: 24px; font-weight: 700; color: #fff; }
    .badge {
      background: rgba(255, 87, 34, 0.15);
      color: var(--primary);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--accent);
      margin: 20px 0 12px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 18px;
    }
    .stat-card.today {
      border-color: rgba(56, 189, 248, 0.3);
      background: linear-gradient(180deg, rgba(56, 189, 248, 0.05) 0%, var(--card-bg) 100%);
    }
    .stat-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-size: 28px; font-weight: 700; color: #fff; }
    .grid-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    .detail-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 22px;
    }
    .detail-card h3 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 14px;
      color: var(--accent);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding-bottom: 10px;
    }
    ul { list-style: none; }
    li {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 14px;
    }
    li:last-child { border-bottom: none; }
    li span { color: var(--muted); }
    li strong { color: #fff; font-weight: 600; }
    li.empty, td.empty { color: var(--muted); font-style: italic; text-align: center; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; }
    th { padding: 10px 12px; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--card-border); }
    td { padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    tr:last-child td { border-bottom: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>📊 OneGoPost Support — Boshqaruv Paneli</h1>
        <p style="color: var(--muted); font-size: 14px; margin-top: 4px;">Telegram Bot va Tizim Tahlillari</p>
      </div>
      <div class="badge">● Jonli Tizim</div>
    </header>

    <div class="section-title">⚡ Bugungi Kunlik Ko'rsatkichlar</div>
    <div class="grid-stats">
      <div class="stat-card today">
        <div class="stat-label">👤 Yangi A'zolar (Bugun)</div>
        <div class="stat-value" style="color: #38bdf8;">${summary.usersToday}</div>
      </div>
      <div class="stat-card today">
        <div class="stat-label">🔍 Qidiruvlar (Bugun)</div>
        <div class="stat-value" style="color: #38bdf8;">${summary.searchesToday}</div>
      </div>
      <div class="stat-card today">
        <div class="stat-label">🎫 Yangi Ticketlar (Bugun)</div>
        <div class="stat-value" style="color: #38bdf8;">${summary.ticketsToday}</div>
      </div>
      <div class="stat-card today">
        <div class="stat-label">✅ Hal Qilindi (Bugun)</div>
        <div class="stat-value" style="color: #10b981;">${summary.resolvedTicketsToday}</div>
      </div>
      <div class="stat-card today">
        <div class="stat-label">📲 Ilovaga O'tish (Bugun)</div>
        <div class="stat-value" style="color: #a78bfa;">${summary.deepLinkClicksToday}</div>
      </div>
    </div>

    <div class="section-title">🌐 Umumiy Ko'rsatkichlar (Barcha Vaqt)</div>
    <div class="grid-stats">
      <div class="stat-card">
        <div class="stat-label">👥 Jami Foydalanuvchilar</div>
        <div class="stat-value">${summary.totalUsers}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">🔍 Jami Qidiruvlar</div>
        <div class="stat-value">${summary.totalSearches}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">🎫 Jami Ticketlar</div>
        <div class="stat-value">${summary.totalTickets}</div>
      </div>
      <div class="stat-card" style="border-color: #f59e0b;">
        <div class="stat-label" style="color: #f59e0b;">⏳ Hali Yechilmagan</div>
        <div class="stat-value" style="color: #fbbf24;">${summary.unresolvedTickets}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">📲 Jami Ilovaga O'tishlar</div>
        <div class="stat-value">${summary.deepLinkClicks}</div>
      </div>
    </div>

    <div class="detail-card" style="margin-bottom: 24px;">
      <h3>📅 Oxirgi 7 Kunlik Faollik Dinamikasi</h3>
      <table>
        <thead>
          <tr>
            <th>Sana</th>
            <th>Yangi Foydalanuvchilar</th>
            <th>Posilka Qidiruvlari</th>
            <th>Yaratilgan Ticketlar</th>
          </tr>
        </thead>
        <tbody>
          ${last7DaysRowsHtml}
        </tbody>
      </table>
    </div>

    <div class="grid-details">
      <div class="detail-card">
        <h3>📌 Muammolar Kategoriya Bo'yicha</h3>
        <ul>${categoriesHtml}</ul>
      </div>

      <div class="detail-card">
        <h3>📍 Ticketlar Holati</h3>
        <ul>${statusHtml}</ul>
      </div>

      <div class="detail-card">
        <h3>❓ Ko'p O'qilgan FAQ Savollari</h3>
        <ul>${faqHtml}</ul>
      </div>
    </div>
  </div>
</body>
</html>`);
  });

  // ─── 404 Catch-All ────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ─── Global Error Handler ─────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ error: err.message, stack: err.stack }, 'Unhandled Express error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Start the Express HTTP server on the configured port.
 */
export function startServer(): Promise<void> {
  return new Promise((resolve) => {
    const app = createServer();
    app.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT },
        `🌐 OnegoPost REST API server listening on port ${env.PORT}`,
      );
      resolve();
    });
  });
}
