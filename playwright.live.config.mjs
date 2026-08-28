// Playwright, pointed at the browser this environment already has.
//
// The image ships a Chromium under PLAYWRIGHT_BROWSERS_PATH, and installing a
// second one is both slow and unnecessary — but a pinned @playwright/test asks
// for the exact build it was released with, so it has to be told where the one
// that exists is. `PW_CHROMIUM` unset falls back to Playwright's own lookup,
// which is what CI does after `playwright install`.
export default {
  testDir: 'scripts',
  testMatch: /public-terminal\.live\.spec\.mjs$/,
  timeout: 60_000,
  reporter: 'line',
  workers: 1,
  use: {
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
};
