/**
 * Example client-demo flow — COPY and adapt per feature. The recorder loads it via
 *   node demo-recorder.mjs --base <url> --flow ./<feature>-flow.mjs ...
 *
 * Export a default async function `runFlow(page, h)`. `h` gives you helpers that make
 * the recording presentation-quality (visible cursor glide + subtitle captions +
 * milestone screenshots):
 *
 *   h.BASE                      base URL passed on the CLI
 *   h.viewport                  { width, height }
 *   h.goto(pathOrUrl)           navigate (relative paths resolve against BASE), waits networkidle
 *   h.caption(text)             update the on-screen subtitle/narration bar (pass '' to hide)
 *   h.glideClick(locator, opts) glide the cursor to the element, then click  (opts: {steps, settle})
 *   h.glideTo(locator, opts)    glide the cursor to the element without clicking
 *   h.type(locator, text)       realistic per-key typing
 *   h.shot(label)               capture a numbered milestone screenshot (NNN_label.png)
 *   h.sleep(ms)                 pause so viewers can read the screen
 *   page                        the Playwright Page (full API available)
 *
 * Use normal Playwright locators: page.getByRole, page.getByLabel, page.getByText,
 * page.locator('[id="x"]'), etc. (CSS ids starting with a digit are invalid — use [id="123_foo"].)
 *
 * GUIDELINES
 * - Narrate EVERY step with h.caption so a non-technical client can follow along.
 * - Take h.shot(...) at each milestone (open, each key action, final result).
 * - Prefer h.glideClick/h.glideTo over raw clicks so the cursor is visibly moving.
 * - Prove the outcome on screen (assert/await the result), not just the clicks.
 * - If the demo mutates data, restore it at the end so the environment is left clean.
 *
 * The example below demonstrates a LOGIN walkthrough. Adapt selectors/credentials.
 */
export default async function runFlow(page, h) {
  // 1. Open the app
  await h.caption('Welcome — this demo shows how to log in');
  await h.goto('/login');
  await page.mouse.move(h.viewport.width / 2, h.viewport.height / 2, { steps: 10 });
  await h.sleep(1200);
  await h.shot('open');

  // 2. Enter the email
  await h.caption('Step 1 · Enter your email address');
  await h.glideClick(page.getByLabel(/email/i));
  await h.type(page.getByLabel(/email/i), 'demo@example.com');
  await h.shot('email-entered');

  // 3. Enter the password
  await h.caption('Step 2 · Enter your password');
  await h.glideClick(page.getByLabel(/password/i));
  await h.type(page.getByLabel(/password/i), 'demo-password');
  await h.shot('password-entered');

  // 4. Submit
  await h.caption('Step 3 · Click "Sign in"');
  await h.glideClick(page.getByRole('button', { name: /log ?in|sign ?in/i }));
  await page.waitForLoadState('networkidle');
  await h.sleep(800);

  // 5. Prove the result
  await h.caption('Logged in successfully');
  await h.shot('logged-in');
  await h.sleep(2500);
}
