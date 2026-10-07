import crypto from 'crypto';
import { env } from '../config/env';

export interface DeepLinkParams {
  orderId: string;
  issue: string;
  ticketId: string;
  telegramId: number;
  userName: string;
}

/**
 * Generates a unique, collision-resistant ticket ID in format #OP-XXXXX.
 * Excludes ambiguous characters (I, O, 0, 1) for crystal-clear readability.
 */
export function generateTicketId(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(5);
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return `#OP-${id}`;
}

/**
 * Generates official OneGoPost web tracking link.
 * Output: https://www.onegopost.com/track.html?awb={awb}
 */
export function generateWebTrackLink(awb: string): string {
  const base = env.DEEPLINK_BASE_URL.replace(/\/+$/, '');
  return `${base}/track.html?awb=${encodeURIComponent(awb.trim())}`;
}

/**
 * Returns official Telegram operator support URL (legacy fallback).
 * Output: https://t.me/Onegopostadmin
 */
export function generateSupportTelegramLink(): string {
  return env.SUPPORT_TELEGRAM_URL;
}

/**
 * Generates the Smart Web Bridge link that opens the OneGoPost app's internal chat
 * ("Yordam -> Ichki xabar").
 * Output: https://www.onegopost.com/support/chat?order_id=...&issue=...&ticket_id=...
 */
export function generateInternalChatLink(params?: Partial<DeepLinkParams>): string {
  const base = env.INTERNAL_CHAT_URL.trim();
  try {
    const url = new URL(base);
    if (params?.orderId) url.searchParams.set('order_id', params.orderId);
    if (params?.issue) url.searchParams.set('issue', params.issue);
    if (params?.ticketId) url.searchParams.set('ticket_id', params.ticketId);
    if (params?.telegramId) url.searchParams.set('tg_id', String(params.telegramId));
    if (params?.userName) url.searchParams.set('user_name', params.userName);
    return url.toString();
  } catch {
    return base;
  }
}

/**
 * Generates a context-preserving universal deep link for OnegoPost.
 * If website tracking is available, links directly to the tracked package.
 */
export function generateDeepLink(params: DeepLinkParams): string {
  if (params.orderId && params.orderId.length >= 6) {
    return generateWebTrackLink(params.orderId);
  }
  return generateInternalChatLink(params);
}
