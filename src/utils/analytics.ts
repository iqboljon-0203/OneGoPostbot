import { analyticsLogger } from './logger';

export type AnalyticsEventType =
  | 'bot_start'
  | 'language_selected'
  | 'menu_click'
  | 'tracking_lookup'
  | 'tracking_found'
  | 'tracking_not_found'
  | 'ticket_created'
  | 'deeplink_generated'
  | 'faq_viewed'
  | 'scene_entered'
  | 'scene_exited'
  | 'error';

export interface AnalyticsEvent {
  eventType: AnalyticsEventType;
  telegramUserId: number;
  username?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Logs an analytics event to structured output.
 * In production this can be piped to BigQuery, Elasticsearch, or any log aggregator.
 */
export function logAnalyticsEvent(event: AnalyticsEvent): void {
  analyticsLogger.info(
    {
      event_type: event.eventType,
      tg_user_id: event.telegramUserId,
      username: event.username ?? 'unknown',
      ...event.metadata,
    },
    `analytics:${event.eventType}`,
  );
}
