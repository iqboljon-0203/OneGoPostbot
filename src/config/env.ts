import dotenv from 'dotenv';
import path from 'path';

// Load .env file from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (!value) {
    throw new Error(`[Config Error] Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Parse a comma-separated list of Telegram admin IDs from the environment.
 * Returns an empty array if the variable is unset or blank.
 */
function parseAdminIds(raw: string | undefined): number[] {
  if (!raw || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => {
      const num = parseInt(id, 10);
      if (isNaN(num)) {
        throw new Error(`[Config Error] Invalid ADMIN_TELEGRAM_IDS entry: "${id}"`);
      }
      return num;
    });
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  BOT_TOKEN: getEnv('BOT_TOKEN'),
  ONEGOPOST_API_BASE_URL: process.env.ONEGOPOST_API_BASE_URL || 'https://vop.onegopost.com',
  ONEGOPOST_API_TOKEN: getEnv('ONEGOPOST_API_TOKEN'),
  DEEPLINK_BASE_URL: process.env.DEEPLINK_BASE_URL || 'https://www.onegopost.com',
  INTERNAL_CHAT_URL:
    process.env.INTERNAL_CHAT_URL ||
    `${(process.env.DEEPLINK_BASE_URL || 'https://www.onegopost.com').replace(/\/+$/, '')}/support/chat`,
  SUPPORT_TELEGRAM_URL: process.env.SUPPORT_TELEGRAM_URL || 'https://t.me/onegopost_admin',
  APP_STORE_URL: process.env.APP_STORE_URL || 'https://apps.apple.com/uz/app/onegopost/id6763209482',
  PLAY_STORE_URL: process.env.PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=com.wangouyou.onegopost',
  WEB_APP_DOWNLOAD_URL: process.env.WEB_APP_DOWNLOAD_URL || 'https://www.onegopost.com/app.html',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ADMIN_TELEGRAM_IDS: parseAdminIds(process.env.ADMIN_TELEGRAM_IDS),
} as const;

export type Env = typeof env;
