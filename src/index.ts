import dns from 'dns';
import { Telegraf } from 'telegraf';
import { env } from './config/env';
import { logger } from './utils/logger';
import { BotContext, registerHandlers } from './bot/handlers';
import { startServer } from './server';
import { closeDatabase } from './db/database';

// Prioritize IPv4 DNS resolution for Telegram API reliability
dns.setDefaultResultOrder('ipv4first');

async function bootstrap(): Promise<void> {
  logger.info(
    { env: env.NODE_ENV, baseUrl: env.ONEGOPOST_API_BASE_URL, port: env.PORT },
    'Starting OnegoPost Official Telegram Support Bot & REST API...',
  );

  // ─── 1. Start Express REST API Server ─────────────────────────
  await startServer();

  // ─── 2. Start Telegram Bot ────────────────────────────────────
  const bot = new Telegraf<BotContext>(env.BOT_TOKEN);

  // Register all bot handlers, middleware, and state machine
  registerHandlers(bot);

  // ─── Graceful Shutdown Handlers ─────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Stopping OnegoPost Bot gracefully...');
    bot.stop(signal);
    closeDatabase();
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled Promise Rejection caught');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught Exception encountered — shutting down');
    bot.stop('UNCAUGHT_EXCEPTION');
    closeDatabase();
    process.exit(1);
  });

  // ─── Launch Bot (Polling Mode) with Retry ───────────────────────────
  let launched = false;
  let attempts = 0;
  const maxAttempts = 5;

  while (!launched && attempts < maxAttempts) {
    try {
      attempts++;
      await bot.launch({ dropPendingUpdates: true }, () => {
        logger.info('🚀 OnegoPost Telegram Support Bot is LIVE and listening for updates (@onegopostbot)');
      });
      launched = true;
    } catch (err: any) {
      logger.warn({ attempt: attempts, error: err.message }, 'Failed to connect to Telegram API, retrying in 3s...');
      if (attempts >= maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

bootstrap().catch((error) => {
  logger.fatal({ error }, 'Failed to bootstrap OnegoPost');
  closeDatabase();
  process.exit(1);
});
