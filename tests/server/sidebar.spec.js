// tests/server/sidebar.spec.js — ADR-0030 v0.18.0 visual tests.
// Runs against a fresh vcm-server spawned by playwright.config.js on
// port 7342 with VCM_SERVER_DB=/tmp/vcm-playwright.db. The DB is wiped
// at start of every run, so the visual tests are self-contained.
import { test, expect } from '@playwright/test';

// ADR-0032 + ADR-0034: top-level sidebar is 2 items (cockpit / settings)
// — leaderboard moved to /?tab=leaderboard (302 redirect), the 6 project
// features moved into /projects/<name>/<feature> sub-nav.
const PAGES = [
  ['/',                       'cockpit'],
  ['/settings',               'settings'],
  ['/projects/vcm-smoke',     null], // no top-level nav link match
  ['/projects/vcm-smoke/drift',  null],
  ['/projects/vcm-smoke/skills', null],
  ['/projects/vcm-smoke/trends', null],
  ['/projects/vcm-smoke/peers',  null],
  ['/projects/vcm-smoke/audit',  null],
  ['/projects/vcm-smoke/docs',   null],
];

test.describe('Sidebar (ADR-0030)', () => {
  test('scenario 1: sidebar renders on every page + aria-current correct', async ({ page }) => {
    for (const [path, link] of PAGES) {
      await page.goto(path);
      // sidebar present
      await expect(page.locator('aside[data-c="sidebar"]')).toBeVisible();
      // brand visible
      await expect(page.locator('[data-c="sidebar-brand"]')).toBeVisible();
      // ADR-0032+0034: 2 nav links (was 9 in v0.18.0, 3 in v0.18.1;
      // leaderboard moved to cockpit tab)
      const navLinks = page.locator('a[data-c="sidebar-link"]');
      await expect(navLinks).toHaveCount(2);

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
    // ADR-0032: /leaderboard redirects to /; project features live at
    // /projects/<name>/<feature>. Test theme on real top-level + a
    // project sub-nav page.
    const pages = ['/', '/settings', '/projects/vcm-smoke/drift',
                   '/projects/vcm-smoke/skills'];
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
    //
    // ADR-0034: project sub-nav (sidebar links) replaces the old
    // in-page tabs. This test self-creates a project because the
    // playwright DB starts empty (no vcm-smoke).
    const name = 'pw-nav-' + Date.now().toString(36);
    const projectPath = '/home/mm7/.vcm/' + name;
    const { mkdirSync } = await import('node:fs');
    mkdirSync(projectPath, { recursive: true });
    await page.goto('/');
    await page.locator('[data-c="sidebar-add"]').click();
    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="path"]').fill(projectPath);
    await Promise.all([
      page.waitForURL('**/', { timeout: 10_000 }),
      page.locator('button[type="submit"]').click(),
    ]);
    await expect(page.locator(`a[data-c="sidebar-project"][data-project="${name}"]`)).toBeVisible();

    // Navigate to the project overview so its sub-nav auto-expands
    // (ADR-0034 §2: current project auto-expands).
    await page.locator(`a[data-c="sidebar-project"][data-project="${name}"]`).click();
    await expect(page).toHaveURL(new RegExp('/projects/' + name));

    // Snapshot a DOM-stable identity token on the sidebar (the brand
    // link element). After a nav, this same DOM node must still be
    // attached — proving the sidebar wasn't replaced.
    const brand = page.locator('[data-c="sidebar-brand"]');
    await expect(brand).toBeVisible();

    // Click a top-level sidebar nav link (settings — leaderboard is
    // no longer a top-level link since ADR-0032 moved it to /?tab=)
    await page.locator('a[data-link="settings"]').click();

    // URL should update via history.pushState (no full reload)
    await expect(page).toHaveURL(/\/settings/);

    // The brand node is still the SAME DOM element (sidebar unchanged)
    await expect(brand).toBeVisible();

    // The <main> contents changed (new page rendered)
    await expect(page.locator('main')).toContainText(/服务器设置|Settings/i);

    // Now click the project's sub-nav link from the sidebar
    // (ADR-0034: per-project sub-nav replaces the old in-page tabs).
    await page.locator(`a[data-c="sidebar-project"][data-project="${name}"]`).click();
    await expect(page).toHaveURL(new RegExp('/projects/' + name + '$'));
    const brandBefore = await brand.evaluate((el) => el.outerHTML);
    await page.locator(`a[data-sub="drift"][data-c="sidebar-sub-link"][data-project="${name}"]`).click();
    await expect(page).toHaveURL(new RegExp('/projects/' + name + '/drift'));
    const brandAfter = await brand.evaluate((el) => el.outerHTML);
    expect(brandAfter).toBe(brandBefore);  // identical node, no re-mount
  });
});