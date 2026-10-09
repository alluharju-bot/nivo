// Empty project: compare the same initial inspector state before and after a UI pass.
// Usage: node scripts/audit-tool-panels.mjs http://127.0.0.1:4173/nivo/
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:4173/nivo/');
  await page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }).waitFor();
  const rows = [];
  for (const [id, key] of [
    ['rectangle', 's'],
    ['pen', 'k'],
    ['move', 'm'],
    ['rotate', 'r'],
    ['extrude', 'e'],
    ['offset', 'o'],
    ['detail', 'f'],
    ['measure', 't'],
    ['paint', 'p'],
    ['knife', 'n'],
    ['boolean', 'b'],
  ]) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press(key);
    const panel = page.getByRole('complementary', { name: 'Ominaisuudet', exact: true });
    await panel.getByTestId('tool-context').waitFor();
    rows.push(
      await panel.evaluate(
        (el, id) => ({
          id,
          height: el.scrollHeight,
          words: el.innerText.trim().split(/\s+/).length,
          text: el.innerText,
          buttons: [...el.querySelectorAll('button')].filter((b) => b.checkVisibility()).length,
        }),
        id,
      ),
    );
  }
  // innerText includes native select option text. Compare identical configurations;
  // this is a text/controls audit, not a pixel-space or rendering benchmark.
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
} finally {
  await browser.close();
}
