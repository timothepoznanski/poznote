// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './specs',
    // One shared instance, and the visual references depend on what exists
    workers: 1,
    fullyParallel: false,
    timeout: 60_000,
    expect: {
        timeout: 8_000,
        toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' },
    },
    outputDir: '.results/artifacts',
    snapshotPathTemplate: '.visual-reference/{projectName}/{arg}{ext}',
    reporter: [['list'], ['html', { outputFolder: '.results/report', open: 'never' }]],
    use: {
        baseURL: process.env.POZNOTE_E2E_URL || 'http://127.0.0.1:8199',
        viewport: { width: 1400, height: 900 },
        locale: 'en-US',
        timezoneId: 'UTC',
        // Would answer from its cache instead of the code under test
        serviceWorkers: 'block',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
        { name: 'firefox', use: { browserName: 'firefox' } },
    ],
});
