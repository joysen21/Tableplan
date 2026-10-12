import { defineConfig, devices } from '@playwright/test';

/** Oberflächentests im Demo-Modus (?demo) – benötigen keine Datenbank.
 *  Projekte: „desktop“ (alle Tests außer mobile.spec.ts) und „mobile“ (Handy-Format mit Touch).
 *  PW_CHANNEL=chrome bzw. msedge nutzt den installierten Browser statt der Playwright-Downloads. */
const channel = process.env.PW_CHANNEL || undefined;
// PW_PORT / PW_PORT2: andere Ports, wenn 4173/4174 belegt sind (z. B. zweiter Arbeitsordner)
const port = Number(process.env.PW_PORT) || 4173, port2 = Number(process.env.PW_PORT2) || 4174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  // in der CI: einmal wiederholen (wackelige Zeitabhängigkeiten), Fehler direkt in GitHub anzeigen + HTML-Bericht
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  forbidOnly: !!process.env.CI,
  use: { baseURL: `http://localhost:${port}`, locale: 'de-DE', timezoneId: 'Europe/Berlin', channel },
  projects: [
    { name: 'desktop', testIgnore: /(mobile|dienstplan-app)\.spec\.ts$/, use: { viewport: { width: 1400, height: 900 } } },
    // eigenständige Dienstplan-App (VITE_APP=dienstplan) auf eigenem Port
    { name: 'dienstplan-app', testMatch: /dienstplan-app\.spec\.ts$/, use: { baseURL: `http://localhost:${port2}`, viewport: { width: 1400, height: 900 } } },
    { name: 'mobile', testMatch: /(mobile|screens)\.spec\.ts$/, use: { ...devices['Pixel 7'], channel } }
  ],
  webServer: [
    { command: `npm run build && npx vite preview --port ${port} --strictPort`, url: `http://localhost:${port}`, reuseExistingServer: !process.env.CI, timeout: 180000 },
    { command: `npx vite build --mode dienstplan --outDir dist-dienstplan && npx vite preview --outDir dist-dienstplan --port ${port2} --strictPort`, url: `http://localhost:${port2}`, reuseExistingServer: !process.env.CI, timeout: 180000 }
  ]
});
