import { defineConfig, devices } from '@playwright/test';

/** Oberflächentests im Demo-Modus (?demo) – benötigen keine Datenbank.
 *  Projekte: „desktop“ (alle Tests außer mobile.spec.ts) und „mobile“ (Handy-Format mit Touch).
 *  PW_CHANNEL=chrome bzw. msedge nutzt den installierten Browser statt der Playwright-Downloads. */
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  use: { baseURL: 'http://localhost:4173', locale: 'de-DE', timezoneId: 'Europe/Berlin', channel },
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec\.ts$/, use: { viewport: { width: 1400, height: 900 } } },
    { name: 'mobile', testMatch: /(mobile|screens)\.spec\.ts$/, use: { ...devices['Pixel 7'], channel } }
  ],
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180000 }
});
