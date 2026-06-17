/**
 * Example demo flow — COPY and adapt per project. The recorder loads this via
 *   node playwright-demo-recorder.mjs --base <url> --flow ./example-flow.mjs ...
 *
 * Export a default async function `runFlow(page, h)`. `h` gives you helpers that make
 * the recording demo-quality (visible cursor glide + step captions):
 *
 *   h.BASE                      base URL passed on the CLI
 *   h.goto(pathOrUrl)           navigate (relative paths resolve against BASE), waits networkidle
 *   h.caption(text)             update the on-screen narration bar (pass '' to hide)
 *   h.glideClick(locator, opts) glide the cursor to the element, then click  (opts: {steps, settle})
 *   h.glideTo(locator, opts)    glide the cursor to the element without clicking
 *   h.type(locator, text)       realistic per-key typing
 *   h.sleep(ms)                 pause so viewers can read the screen
 *   page                        the Playwright Page (full API available)
 *
 * Use normal Playwright locators: page.getByRole, page.getByText, page.locator('[id="x"]'),
 * etc. (Note: CSS ids that start with a digit are invalid — use [id="123_foo"].)
 *
 * GUIDELINES
 * - Narrate every step with h.caption so a non-technical viewer can follow along.
 * - Prefer h.glideClick/h.glideTo over raw clicks so the cursor is visibly moving.
 * - Prove the outcome on screen (assert/await the result), not just the clicks.
 * - If the demo mutates data, restore it at the end so the environment is left clean.
 */
export default async function runFlow(page, h) {
  // 1. Open the app
  await h.goto('/');
  await page.mouse.move(h.viewport.width / 2, h.viewport.height / 2, { steps: 10 });
  await h.caption('Live demo · ' + h.BASE);
  await h.sleep(1500);

  // 2. Example: sign in (adjust selectors to your app, or delete if no auth)
  // await h.caption('Signing in');
  // await h.glideClick(page.getByLabel('Email'));
  // await h.type(page.getByLabel('Email'), 'demo@example.com');
  // await h.glideClick(page.getByLabel('Password'));
  // await h.type(page.getByLabel('Password'), 'password');
  // await h.glideClick(page.getByRole('button', { name: /log ?in|sign ?in/i }));
  // await page.waitForLoadState('networkidle');

  // 3. Example: navigate to the feature and exercise it
  // await h.caption('Opening the feature under test');
  // await h.goto('/the/feature/path');
  // await h.glideClick(page.getByRole('tab', { name: 'Items' }));
  // await h.glideClick(page.getByRole('combobox', { name: 'Type' }));
  // await h.sleep(1500); // show the options
  // await h.glideClick(page.getByRole('option', { name: 'New Option' }));

  // 4. Example: prove the result, then reload to confirm persistence
  // await h.caption('Saved — confirming it persisted');
  // await h.goto('/the/feature/path');
  // const value = await page.getByTestId('type-value').innerText();
  // await h.caption(`Persisted ✓ — value = "${value}"`);
  // await h.sleep(2500);

  // 5. Example: restore mutated data so the environment is unchanged
  // await page.evaluate(() => fetch('/api/thing/1', {
  //   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ id: 1, field: 'original' }), credentials: 'include',
  // }));
}
