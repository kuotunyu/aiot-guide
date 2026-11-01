const {defineConfig, devices} = require('@playwright/test');

// CI installs Chromium; locally PW_CHANNEL=msedge reuses the installed browser.
const channel = process.env.PW_CHANNEL ? {channel: process.env.PW_CHANNEL} : {};

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  fullyParallel: true,
  reporter: [['list']],
  use: {baseURL: 'http://127.0.0.1:8799', trace: 'retain-on-failure'},
  webServer: {command: 'node scripts/serve.mjs 8799', url: 'http://127.0.0.1:8799/index.html', reuseExistingServer: true},
  projects: [
    {name: 'desktop', use: {...devices['Desktop Chrome'], ...channel, viewport: {width: 1400, height: 900}}},
    {name: 'mobile', use: {...devices['Pixel 7'], ...channel}},
  ],
});
