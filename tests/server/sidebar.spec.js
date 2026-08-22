// tests/server/sidebar.spec.js — ADR-0030 v0.18.0 visual tests.
// Runs against a fresh vcm-server spawned by playwright.config.js on
// port 7342 with VCM_SERVER_DB=/tmp/vcm-playwright.db. The DB is wiped
// at start of every run, so the visual tests are self-contained.
import { test, expect } from '@playwright/test';

// ADR-0032: top-level sidebar is now 3 items only (cockpit / leaderboard
// / settings). The other 6 features moved into /projects/<name>/<feature>
// and are tested as project-internal routes separately.
const PAGES = [
  ['/',                       'cockpit'],
  ['/leaderboard',            'leaderboard'],
  ['/settings',               'settings'],
  ['/projects/vcm-smoke',     null], // no top-level nav link match
  ['/projects/vcm-smoke/drift',  null],
  ['/projects/vcm-smoke/skills', null],
  ['/projects/vcm-smoke/trends', null],
  ['/projects/vcm-smoke/audit',  null],
];

test.describe('Sidebar (ADR-0030)', () => {
  test('scenario 1: sidebar renders on every page + aria-current correct', async ({ page }) => {
    for (const [path, link] of PAGES) {
      await page.goto(path);
      // sidebar present
      await expect(page.locator('aside[data-c="sidebar"]')).toBeVisible();
      // brand visible
      await expect(page.locator('[data-c="sidebar-brand"]')).toBeVisible();
      // ADR-0032: 3 nav links (was 9 in v0.18.0)
      const navLinks = page.locator('a[data-c="sidebar-link"]');
      await expect(navLinks).toHaveCount(3);

      if (link) {
        // active link has aria-current="page"
        const active = page.locator(`a[data-c="sidebar-link"][data-link="${link}"]`);
        await expect(active).toHaveAttribute('aria-current', 'page');
      }
    }
  });

  test('scenario 2: add project modal opens, persists, sidebar refreshes', async ({ page }) => {
    const name = 'pw-test-' + Date.now().toString(36);
    const projectPath = '/home/mm7/.vcm/' + name;

    // Pre-create the project directory; the endpoint validates path
    // is a real directory before insert.
    const { mkdirSync } = await import('node:fs');
    mkdirSync(projectPath, { recursive: true });

    // Open the sidebar Add Project modal
    await page.goto('/');
    await page.locator('[data-c="sidebar-add"]').click();
    const dialog = page.locator('[data-c="add-project-dialog"]');
    await expect(dialog).toBeVisible();

    // Fill the form
    await dialog.locator('input[name="name"]').fill(name);
    await dialog.locator('input[name="path"]').fill(projectPath);

    // Submit (form posts to /api/projects which redirects to /)
    await Promise.all([
      page.waitForURL('**/', { timeout: 10_000 }),
      dialog.locator('button[type="submit"]').click(),
    ]);

    // Sidebar should now show the new project
    await expect(page.locator(`a[data-c="sidebar-project"][data-project="${name}"]`)).toBeVisible();
  });

  test('scenario 3: add project rejects path outside $HOME', async ({ page }) => {
    const name = 'pw-bad-' + Date.now().toString(36);
    await page.goto('/');
    await page.locator('[data-c="sidebar-add"]').click();
    const dialog = page.locator('[data-c="add-project-dialog"]');
    await expect(dialog).toBeVisible();

    await dialog.locator('input[name="name"]').fill(name);
    await dialog.locator('input[name="path"]').fill('/etc');

    // Submit; expect a 422 response, page stays on /
    const responsePromise = page.waitForResponse(
      r => r.url().endsWith('/api/projects') && r.status() === 422,
      { timeout: 10_000 }
    );
    await dialog.locator('button[type="submit"]').click();
    const resp = await responsePromise;
    expect(resp.status()).toBe(422);
    const body = await resp.json();
    expect(body.error).toBe('path_outside_home');

    // The bad project should NOT appear in the sidebar
    await expect(page.locator(`a[data-c="sidebar-project"][data-project="${name}"]`)).toHaveCount(0);
  });

  test('scenario 4: theme toggle works on every page + persists', async ({ page }) => {
    const pages = ['/', '/leaderboard', '/drift', '/skills', '/trends',
                   '/peers', '/audit', '/settings'];
    for (const p of pages) {
      await page.goto(p);
      // Initially dark (default per tokens.css + _layout.html)
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      // Click toggle in sidebar (it lives in the sidebar footer, title attr is 'Toggle theme')
      await page.locator('button[title="Toggle theme"]').click();

      // Now light
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

      // Reload; theme persists via localStorage (hydration in _layout.html)
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

      // Toggle back so the next iteration starts clean
      await page.locator('button[title="Toggle theme"]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    }
  });

  test('scenario 5: SPA-style nav — clicks swap <main>, sidebar stays mounted', async ({ page }) => {
    // ADR-0033: hx-boost on body intercepts internal <a> + <form>
    // clicks. Sidebar lives outside <main> so it stays mounted; only
    // <main> is swapped. URL is pushed via history.pushState.
    await page.goto('/projects/vcm-smoke');

    // Snapshot a DOM-stable identity token on the sidebar (the brand
    // link element). After a nav, this same DOM node must still be
    // attached — proving the sidebar wasn't replaced.
    const brand = page.locator('[data-c="sidebar-brand"]');
    await expect(brand).toBeVisible();

    // Click a top-level sidebar nav link
    await page.locator('a[data-link="leaderboard"]').click();

    // URL should update via history.pushState (no full reload)
    await expect(page).toHaveURL(/\/leaderboard/);

    // The brand node is still the SAME DOM element (sidebar unchanged)
    await expect(brand).toBeVisible();

    // The <main> contents changed (new page rendered)
    await expect(page.locator('main')).toContainText(/leaderboard|排行榜/i);

    // Now click a project-internal tab from project section nav
    await page.goto('/projects/vcm-smoke');
    const brandBefore = await brand.evaluate((el) => el.outerHTML);
    await page.locator('a[data-tab="drift"]').click();
    await expect(page).toHaveURL(/\/projects\/vcm-smoke\/drift/);
    const brandAfter = await brand.evaluate((el) => el.outerHTML);
    expect(brandAfter).toBe(brandBefore);  // identical node, no re-mount
  });
});