// tests/server/sidebar.spec.js — ADR-0030 v0.18.0 visual tests.
// Runs against a fresh vcm-server spawned by playwright.config.js on
// port 7342 with VCM_SERVER_DB=/tmp/vcm-playwright.db. The DB is wiped
// at start of every run, so the visual tests are self-contained.
import { test, expect } from '@playwright/test';

const PAGES = [
  ['/',            'cockpit'],
  ['/leaderboard', 'leaderboard'],
  ['/drift',       'drift'],
  ['/skills',      'skills'],
  ['/trends',      'trends'],
  ['/peers',       'peers'],
  ['/audit',       'audit'],
  ['/settings',    'settings'],
  ['/projects/vcm-smoke', null], // a project page; no nav link match
];

test.describe('Sidebar (ADR-0030)', () => {
  test('scenario 1: sidebar renders on every page + aria-current correct', async ({ page }) => {
    for (const [path, link] of PAGES) {
      await page.goto(path);
      // sidebar present
      await expect(page.locator('aside[data-c="sidebar"]')).toBeVisible();
      // brand visible
      await expect(page.locator('[data-c="sidebar-brand"]')).toBeVisible();
      // 9 nav links present
      const navLinks = page.locator('a[data-c="sidebar-link"]');
      await expect(navLinks).toHaveCount(9);

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
});