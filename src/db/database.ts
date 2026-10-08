import Database from 'better-sqlite3';
import path from 'path';
import { logger } from '../utils/logger';
import type { IssueTopic, TicketStatus, TicketRow } from '../api/types';

// ─── Database Path ──────────────────────────────────────────────

const DB_PATH = path.resolve(process.cwd(), 'database.sqlite');

// ─── Database Instance (Singleton) ──────────────────────────────

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('busy_timeout = 5000');
    initSchema(_db);
    logger.info({ path: DB_PATH }, 'SQLite database initialized');
  }
  return _db;
}

// ─── Schema Initialization ──────────────────────────────────────

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id   INTEGER PRIMARY KEY,
      username      TEXT,
      first_name    TEXT,
      lang          TEXT NOT NULL DEFAULT 'uz' CHECK(lang IN ('uz', 'ru')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      ticket_number TEXT PRIMARY KEY,
      telegram_id   INTEGER NOT NULL,
      awb           TEXT,
      issue_type    TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'in_review', 'transferred', 'resolved')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id   INTEGER NOT NULL,
      event_type    TEXT NOT NULL,
      metadata      TEXT DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_telegram_id ON tickets(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
  `);
}

// ─── User Operations ────────────────────────────────────────────

export function upsertUser(
  telegramId: number,
  username: string | undefined,
  firstName: string | undefined,
  lang: 'uz' | 'ru',
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username, first_name, lang, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(telegram_id) DO UPDATE SET
      username   = excluded.username,
      first_name = excluded.first_name,
      lang       = excluded.lang,
      updated_at = datetime('now')
  `);
  stmt.run(telegramId, username ?? null, firstName ?? null, lang);
}

export function getUserLang(telegramId: number): 'uz' | 'ru' | null {
  const db = getDb();
  const row = db.prepare('SELECT lang FROM users WHERE telegram_id = ?').get(telegramId) as
    | { lang: string }
    | undefined;
  if (!row) return null;
  return row.lang as 'uz' | 'ru';
}

// ─── Ticket Operations ──────────────────────────────────────────

export interface CreateTicketInput {
  ticketNumber: string;
  telegramId: number;
  awb: string | null;
  issueType: IssueTopic;
  description: string;
}

export function createTicket(input: CreateTicketInput): TicketRow {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO tickets (ticket_number, telegram_id, awb, issue_type, description, status)
    VALUES (?, ?, ?, ?, ?, 'new')
  `);
  stmt.run(input.ticketNumber, input.telegramId, input.awb, input.issueType, input.description);

  return getTicket(input.ticketNumber)!;
}

export function getTicket(ticketNumber: string): TicketRow | null {
  const db = getDb();
  // Normalize: accept "OP-XXXXX", "#OP-XXXXX"
  const normalized = ticketNumber.startsWith('#') ? ticketNumber : `#${ticketNumber}`;
  const row = db.prepare('SELECT * FROM tickets WHERE ticket_number = ?').get(normalized) as
    | TicketRow
    | undefined;
  return row ?? null;
}

export function getTicketsByUser(telegramId: number): TicketRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM tickets WHERE telegram_id = ? ORDER BY created_at DESC')
    .all(telegramId) as TicketRow[];
}

export function updateTicketStatus(ticketNumber: string, status: TicketStatus): boolean {
  const db = getDb();
  const normalized = ticketNumber.startsWith('#') ? ticketNumber : `#${ticketNumber}`;
  const info = db
    .prepare(`UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE ticket_number = ?`)
    .run(status, normalized);
  return info.changes > 0;
}

// ─── Analytics Operations ───────────────────────────────────────

export function trackEvent(
  telegramId: number,
  eventType: string,
  metadata?: Record<string, unknown>,
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO analytics_events (telegram_id, event_type, metadata)
    VALUES (?, ?, ?)
  `);
  stmt.run(telegramId, eventType, JSON.stringify(metadata ?? {}));
}

export interface DayHistoryItem {
  date: string;
  users: number;
  searches: number;
  tickets: number;
}

export interface AnalyticsSummary {
  totalUsers: number;
  usersToday: number;
  searchesToday: number;
  totalSearches: number;
  ticketsToday: number;
  totalTickets: number;
  unresolvedTickets: number;
  resolvedTicketsToday: number;
  deepLinkClicksToday: number;
  deepLinkClicks: number;
  ticketsByCategory: Record<string, number>;
  ticketsByStatus: Record<string, number>;
  popularFaqTopics: Array<{ topic: string; count: number }>;
  last7Days: DayHistoryItem[];
}

export interface DailyAnalyticsSummary {
  date: string;
  usersCount: number;
  searchesCount: number;
  ticketsCount: number;
  resolvedTickets: number;
  deepLinkClicks: number;
  ticketsByCategory: Record<string, number>;
  ticketsByStatus: Record<string, number>;
  popularFaqTopics: Array<{ topic: string; count: number }>;
}

export function getDailyAnalytics(targetDate?: string): DailyAnalyticsSummary {
  const db = getDb();
  // Default to today in Tashkent timezone (UTC+5)
  const date =
    targetDate ||
    (
      db.prepare("SELECT date('now', '+5 hours') AS today").get() as {
        today: string;
      }
    ).today;

  const usersCount = (
    db
      .prepare("SELECT COUNT(*) AS cnt FROM users WHERE date(created_at, '+5 hours') = ?")
      .get(date) as { cnt: number }
  ).cnt;

  const searchesCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM analytics_events
         WHERE event_type = 'tracking_lookup' AND date(created_at, '+5 hours') = ?`,
      )
      .get(date) as { cnt: number }
  ).cnt;

  const ticketsCount = (
    db
      .prepare("SELECT COUNT(*) AS cnt FROM tickets WHERE date(created_at, '+5 hours') = ?")
      .get(date) as { cnt: number }
  ).cnt;

  const resolvedTickets = (
    db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM tickets WHERE status = 'resolved' AND date(updated_at, '+5 hours') = ?",
      )
      .get(date) as { cnt: number }
  ).cnt;

  const deepLinkClicks = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM analytics_events
         WHERE event_type IN ('deeplink_generated', 'deeplink_clicked', 'app_deeplink_click')
           AND date(created_at, '+5 hours') = ?`,
      )
      .get(date) as { cnt: number }
  ).cnt;

  const ticketCatRows = db
    .prepare(
      "SELECT issue_type, COUNT(*) AS cnt FROM tickets WHERE date(created_at, '+5 hours') = ? GROUP BY issue_type",
    )
    .all(date) as Array<{ issue_type: string; cnt: number }>;
  const ticketsByCategory: Record<string, number> = {};
  for (const row of ticketCatRows) {
    ticketsByCategory[row.issue_type] = row.cnt;
  }

  const ticketStatusRows = db
    .prepare(
      "SELECT status, COUNT(*) AS cnt FROM tickets WHERE date(created_at, '+5 hours') = ? GROUP BY status",
    )
    .all(date) as Array<{ status: string; cnt: number }>;
  const ticketsByStatus: Record<string, number> = {};
  for (const row of ticketStatusRows) {
    ticketsByStatus[row.status] = row.cnt;
  }

  const faqRowsRaw = db
    .prepare(
      `SELECT json_extract(metadata, '$.faq_id') AS topic, COUNT(*) AS cnt
       FROM analytics_events
       WHERE event_type = 'faq_viewed' AND topic IS NOT NULL AND date(created_at, '+5 hours') = ?
       GROUP BY topic ORDER BY cnt DESC LIMIT 5`,
    )
    .all(date) as Array<{ topic: string; cnt: number }>;
  const faqRows = faqRowsRaw.map((r) => ({ topic: r.topic, count: r.cnt }));

  return {
    date,
    usersCount,
    searchesCount,
    ticketsCount,
    resolvedTickets,
    deepLinkClicks,
    ticketsByCategory,
    ticketsByStatus,
    popularFaqTopics: faqRows,
  };
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const db = getDb();

  // Total users
  const totalUsers = (
    db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }
  ).cnt;

  // Users today (UTC+5)
  const usersToday = (
    db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM users WHERE date(created_at, '+5 hours') = date('now', '+5 hours')",
      )
      .get() as { cnt: number }
  ).cnt;

  // Searches today (UTC+5)
  const searchesToday = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM analytics_events
         WHERE event_type = 'tracking_lookup' AND date(created_at, '+5 hours') = date('now', '+5 hours')`,
      )
      .get() as { cnt: number }
  ).cnt;

  // Total searches all-time
  const totalSearches = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM analytics_events WHERE event_type = 'tracking_lookup'`)
      .get() as { cnt: number }
  ).cnt;

  // Tickets today (UTC+5)
  const ticketsToday = (
    db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM tickets WHERE date(created_at, '+5 hours') = date('now', '+5 hours')",
      )
      .get() as { cnt: number }
  ).cnt;

  // Resolved tickets today (UTC+5)
  const resolvedTicketsToday = (
    db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM tickets WHERE status = 'resolved' AND date(updated_at, '+5 hours') = date('now', '+5 hours')",
      )
      .get() as { cnt: number }
  ).cnt;

  // Total tickets
  const totalTickets = (
    db.prepare('SELECT COUNT(*) AS cnt FROM tickets').get() as { cnt: number }
  ).cnt;

  // Unresolved tickets (new, in_review, transferred)
  const unresolvedTickets = (
    db.prepare("SELECT COUNT(*) AS cnt FROM tickets WHERE status != 'resolved'").get() as { cnt: number }
  ).cnt;

  // Tickets by category (issue_type)
  const ticketCatRows = db
    .prepare('SELECT issue_type, COUNT(*) AS cnt FROM tickets GROUP BY issue_type')
    .all() as Array<{ issue_type: string; cnt: number }>;
  const ticketsByCategory: Record<string, number> = {};
  for (const row of ticketCatRows) {
    ticketsByCategory[row.issue_type] = row.cnt;
  }

  // Tickets by status
  const ticketStatusRows = db
    .prepare('SELECT status, COUNT(*) AS cnt FROM tickets GROUP BY status')
    .all() as Array<{ status: string; cnt: number }>;
  const ticketsByStatus: Record<string, number> = {};
  for (const row of ticketStatusRows) {
    ticketsByStatus[row.status] = row.cnt;
  }

  // Deep link clicks today (UTC+5)
  const deepLinkClicksToday = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM analytics_events
         WHERE event_type IN ('deeplink_generated', 'deeplink_clicked', 'app_deeplink_click')
           AND date(created_at, '+5 hours') = date('now', '+5 hours')`,
      )
      .get() as { cnt: number }
  ).cnt;

  // Total deep link clicks
  const deepLinkClicks = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM analytics_events
         WHERE event_type IN ('deeplink_generated', 'deeplink_clicked', 'app_deeplink_click')`,
      )
      .get() as { cnt: number }
  ).cnt;

  // Popular FAQ topics (top 10)
  const faqRowsRaw = db
    .prepare(
      `SELECT json_extract(metadata, '$.faq_id') AS topic, COUNT(*) AS cnt
       FROM analytics_events
       WHERE event_type = 'faq_viewed' AND topic IS NOT NULL
       GROUP BY topic ORDER BY cnt DESC LIMIT 10`,
    )
    .all() as Array<{ topic: string; cnt: number }>;
  const faqRows = faqRowsRaw.map((r) => ({ topic: r.topic, count: r.cnt }));

  // Last 7 days breakdown (Tashkent timezone UTC+5)
  const last7Days = db
    .prepare(
      `WITH RECURSIVE days(d) AS (
         SELECT date('now', '+5 hours', '-6 days')
         UNION ALL
         SELECT date(d, '+1 day') FROM days WHERE d < date('now', '+5 hours')
       )
       SELECT 
         days.d AS date,
         (SELECT COUNT(*) FROM users WHERE date(created_at, '+5 hours') = days.d) AS users,
         (SELECT COUNT(*) FROM analytics_events WHERE event_type = 'tracking_lookup' AND date(created_at, '+5 hours') = days.d) AS searches,
         (SELECT COUNT(*) FROM tickets WHERE date(created_at, '+5 hours') = days.d) AS tickets
       FROM days
       ORDER BY days.d DESC`,
    )
    .all() as DayHistoryItem[];

  return {
    totalUsers,
    usersToday,
    searchesToday,
    totalSearches,
    ticketsToday,
    totalTickets,
    unresolvedTickets,
    resolvedTicketsToday,
    deepLinkClicksToday,
    deepLinkClicks,
    ticketsByCategory,
    ticketsByStatus,
    popularFaqTopics: faqRows,
    last7Days,
  };
}

// ─── Reset All Analytics and Data ───────────────────────────────

export function resetAllData(): void {
  const db = getDb();
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DELETE FROM tickets;
    DELETE FROM analytics_events;
    DELETE FROM users;
  `);
  try {
    db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'analytics_events', 'users');`);
  } catch {
    // sqlite_sequence may not exist if no autoincrement yet
  }
  db.exec('VACUUM;');
  db.pragma('foreign_keys = ON');
  logger.info('Database statistics and data successfully reset to 0');
}

// ─── Graceful Shutdown ──────────────────────────────────────────

export function closeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
    logger.info('SQLite database connection closed');
  }
}
