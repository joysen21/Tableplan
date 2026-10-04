import { defineConfig } from '@playwright/test';

/** Oberflächentests im Demo-Modus (?demo) – benötigen keine Datenbank */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1400, height: 900 }, locale: 'de-DE', timezoneId: 'Europe/Berlin' },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180000 }
});
