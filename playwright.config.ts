import { defineConfig, devices } from '@playwright/test';

/**
 * Responsive smoke suite: renders every route on the device profiles that
 * cover our real breakpoints and fails on horizontal overflow or a blank
 * page. Run `npm run test:ui`; screenshots land in test-results/.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  retries: 0,
  // Seven parallel map loads saturate the local API (7 × 6.7 MB GeoJSON on one
  // event loop) and stall font/tile loading; three keeps the run honest.
  workers: 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  // Apple device descriptors default to WebKit; we keep their viewport, DPR,
  // touch and UA but run everything in Chromium so one browser install covers
  // the suite (layout is what we're checking, not engine quirks).
  projects: [
    { name: 'iphone-se',        use: { ...devices['iPhone SE'], browserName: 'chromium' } },
    { name: 'iphone-15-pro',    use: { ...devices['iPhone 15 Pro'], browserName: 'chromium' } },
    { name: 'pixel-7',          use: { ...devices['Pixel 7'] } },
    { name: 'ipad-portrait',    use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    { name: 'ipad-landscape',   use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' } },
    { name: 'laptop',           use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'desktop',          use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } },
  ],
});
