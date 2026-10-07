// Re-export the canonical env object as `config` for backward compatibility
// with modules that import from `../config` (e.g. logger.ts).
export { env as config } from './env';
