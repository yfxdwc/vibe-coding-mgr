// tests/server/subnav.spec.js — ADR-0034 v0.18.2 accordion behavior.
//
// The sidebar sub-nav (project-as-folder with collapsible children) must
// obey an accordion rule: at most ONE project's sub-nav is expanded at
// any time, and the expanded one is the one matching the current URL.
// User clicks on a project tag (link to /projects/<name>) collapse any
// previously-expanded project and expand only the clicked one. The
// chevron toggle on a single project is also single-select.
//
// Background: HTMX 1.9 swaps <body> on hx-boosted navigation. The
// sidebar DOM is replaced; Alpine re-initializes sidebarNav() on the
// fresh aside. Two pre-conditions must hold for the x-show directives
// on the new subnavs to render correctly:
//   1. sidebarNav() parses window.location.pathname (NOT body[data-active-project],
//      which goes stale because HTMX swaps <body> attributes don't refresh).
//   2. htmx.config.attributesToSettle excludes 'style' (HTMX 1.9's Te()
//      function copies old style onto new element, then restores it
//      ~20ms later, which would silently undo Alpine's x-show inline
//      display:none).
//
// The playwright DB starts empty — each test self-registers two
// throwaway projects (PW_A, PW_B) so we have at least 2 to switch
// between for the accordion assertions.

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

async function registerProject(page, name) {
  const projectPath = '/home/mm7/.vcm/' + name;
  mkdirSync(projectPath, { recursive: true });
  await page.goto('/');
  await page.locator('[data-c="sidebar-add"]').click();
  const dialog = page.locator('[data-c="add-project-dialog"]');
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.locator('input[name="path"]').fill(projectPath);
  await Promise.all([
    page.waitForURL(/\/$/, { timeout: 10_000 }),
    dialog.locator('button[type="submit"]').click(),
  ]);
  await expect(page.locator(`a[data-c="sidebar-project"][data-project="${name}"]`)).toBeVisible();
}

async function subnavVisible(page, projectName) {
  const el = page.locator(
    `[data-project="${projectName}"][data-c="sidebar-project-row"] [data-c="sidebar-subnav"]`
  );
  const display = await el.evaluate(node => getComputedStyle(node).display);
  return display !== 'none';
}

async function sidebarState(page) {
  return page.evaluate(() => {
    const aside = document.querySelector('aside.sidebar');
    const ad = aside && window.Alpine && window.Alpine.$data(aside);
    return {
      pathname: window.location.pathname,
      current: ad ? ad.current : null,
      expanded: ad ? [...ad.expanded] : null,
    };
  });
}

// Pick names fresh per test run so the tests are rerunnable.
const stamp = Date.now().toString(36);
const PROJECT_A = `pw-sub-a-${stamp}`;
const PROJECT_B = `pw-sub-b-${stamp}`;

test.describe('Sidebar sub-nav accordion (ADR-0034)', () => {
  // Register two projects once at the start of the describe block.
  // We use a single page (passed via test.beforeAll as a fixture).
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await registerProject(page, PROJECT_A);
    await registerProject(page, PROJECT_B);
    await page.close();
  });

  test('scenario 1: click project A tag → only A is expanded', async ({ page }) => {
    await page.goto(`/projects/${PROJECT_A}`);
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_A}$`));
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(true);

    // Click B's project link.
    await page.locator(`a[data-project="${PROJECT_B}"][data-c="sidebar-project"]`).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_B}$`));

    // Accordion: B expanded, A collapsed.
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(false);

    const state = await sidebarState(page);
    expect(state.pathname).toBe(`/projects/${PROJECT_B}`);
    expect(state.current).toBe(PROJECT_B);
    expect(state.expanded).toEqual([PROJECT_B]);
  });

  test('scenario 2: click another project tag → previous collapses, new expands', async ({ page }) => {
    await page.goto(`/projects/${PROJECT_A}`);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(true);

    await page.locator(`a[data-project="${PROJECT_B}"][data-c="sidebar-project"]`).click();
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(false);

    // Click A again — should switch back, B collapses.
    await page.locator(`a[data-project="${PROJECT_A}"][data-c="sidebar-project"]`).click();
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(false);
  });

  test('scenario 3: chevron click is also single-select (preview mode)', async ({ page }) => {
    await page.goto(`/projects/${PROJECT_A}`);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(false);

    // Click B's chevron to preview.
    await page.locator(
      `[data-project="${PROJECT_B}"][data-c="sidebar-project-row"] [data-c="sidebar-project-toggle"]`
    ).click();
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(false);

    // Click A's chevron to switch back.
    await page.locator(
      `[data-project="${PROJECT_A}"][data-c="sidebar-project-row"] [data-c="sidebar-project-toggle"]`
    ).click();
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(false);
  });

  test('scenario 4: on non-project pages, no sub-nav is expanded', async ({ page }) => {
    await page.goto(`/projects/${PROJECT_A}`);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(true);

    await page.locator('a[data-link="cockpit"]').click();
    await expect(page).toHaveURL(/\/$/);

    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(false);
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(false);
  });

  test('scenario 5: deep-link (full page reload) honors accordion rule', async ({ page }) => {
    await page.goto(`/projects/${PROJECT_B}`);
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(false);

    const state = await sidebarState(page);
    expect(state.current).toBe(PROJECT_B);
    expect(state.expanded).toEqual([PROJECT_B]);
  });

  test('scenario 6: browser back/forward respects accordion rule', async ({ page }) => {
    // Build a history: A → B → cockpit.
    await page.goto(`/projects/${PROJECT_A}`);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(true);

    await page.locator(`a[data-project="${PROJECT_B}"][data-c="sidebar-project"]`).click();
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(true);

    await page.locator('a[data-link="cockpit"]').click();
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(false);

    // Back to B.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_B}$`));
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(false);

    // Back again to A.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_A}$`));
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(false);

    // Forward to B.
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_B}$`));
    await expect.poll(async () => subnavVisible(page, PROJECT_B)).toBe(true);
    await expect.poll(async () => subnavVisible(page, PROJECT_A)).toBe(false);
  });

  test('scenario 7: htmx config applied (regression — no silent no-op)', async ({ page }) => {
    // The whole accordion chain depends on htmx.config.attributesToSettle
    // NOT including 'style'. If the vcmApplyHtmxConfig() hook silently
    // no-ops (e.g. because of script-ordering quirks), the sub-nav
    // becomes stuck-visible after navigation — see scenario 1's polling.
    // This test guards against that by checking the config flag directly.
    await page.goto(`/projects/${PROJECT_A}`);
    const cfg = await page.evaluate(() => ({
      applied: window.__vcm_config_applied,
      settle: window.htmx && window.htmx.config.attributesToSettle,
    }));
    expect(cfg.applied).toBe(true);
    expect(cfg.settle).not.toContain('style');
  });
});