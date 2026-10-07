import crypto from 'crypto';

/**
 * Generates a unique, collision-resistant ticket ID in format #OP-XXXXX.
 * Uses crypto.randomBytes for unpredictable alphanumeric output.
 */
export function generateTicketId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes I,O,0,1 to avoid ambiguity
  const bytes = crypto.randomBytes(5);
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return `#OP-${id}`;
}
