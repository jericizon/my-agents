/**
 * Example client-demo flow — COPY and adapt per feature. The recorder loads it via
 *   node demo-recorder.mjs --base <url> --flow ./<feature>-flow.mjs ...
 *
 * Export a default async function `runFlow(page, h)`. `h` gives you helpers that make
 * the recording presentation-quality (visible cursor glide + subtitle captions +
 * milestone screenshots; pass --voiceover to read each caption aloud):
 *
 *   h.BASE                      base URL passed on the CLI
 *   h.viewport                  { width, height }
 *   h.goto(pathOrUrl)           navigate (relative paths resolve against BASE), waits networkidle
 *   h.caption(text)             update the on-screen subtitle/narration bar (pass '' to hide); this text is spoken in voiceover mode
 *   h.glideClick(locator, opts) glide the cursor to the element, then click  (opts: {steps, settle})
 *   h.glideTo(locator, opts)    glide the cursor to the element without clicking
 *   h.highlight(locator, opts)  draw the pulsing spotlight box around an element (opts: {padding})
 *   h.clearHighlight()          hide the spotlight box
 *   h.explain(locator, text, opts) glide + highlight + caption + read-pause, in one call
 *                                (opts: {steps, read}) — use this to walk EVERY meaningful
 *                                control on the page, not only the ones the flow acts on
 *   h.type(locator, text)       realistic per-key typing
 *   h.shot(label)               capture a numbered milestone screenshot (NNN_label.png)
 *   h.sleep(ms)                 pause so viewers can read the screen
 *   page                        the Playwright Page (full API available)
 *
 * Use normal Playwright locators: page.getByRole, page.getByLabel, page.getByText,
 * page.locator('[id="x"]'), etc. (CSS ids starting with a digit are invalid — use [id="123_foo"].)
 *
 * GUIDELINES
 * - Narrate EVERY step with h.caption so a non-technical client can follow along. In voiceover
 *   mode, every non-empty caption is also read aloud, so keep captions concise and complete.
 * - Explain the WHOLE page: use h.explain(locator, text) on every meaningful control, even
 *   ones this flow never interacts with (e.g. a "remember me" checkbox, a "forgot password"
 *   link) — the viewer should come away understanding the whole page, not just the 3 fields
 *   that got filled in.
 * - Take h.shot(...) at each milestone (open, each explained element, each key action, final result).
 * - Prefer h.glideClick/h.glideTo (or h.explain) over raw clicks so the cursor is visibly moving.
 * - Prove the outcome on screen (assert/await the result), not just the clicks.
 * - If the action creates/changes content that renders on ANOTHER page (e.g. an admin/CMS
 *   editor publishing something the public site then displays), h.goto() to that page and
 *   h.explain() the result there too, before the final shot — don't stop at the "Saved!" toast.
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

  // 2. Explain the page's controls BEFORE acting on them — highlight each one so the
  //    viewer's focus lands exactly where the narration is pointing. Include controls the
  //    flow itself never touches (e.g. "remember me", "forgot password").
  await h.explain(page.getByLabel(/email/i),
    'This field is your account email — the one you signed up with');
  await h.shot('explain-email-field');

  await h.explain(page.getByLabel(/password/i),
    'Your password goes here — it\'s masked as you type for privacy');
  await h.shot('explain-password-field');

  const rememberMe = page.getByLabel(/remember me/i);
  if (await rememberMe.count()) {
    await h.explain(rememberMe, 'Check this to stay signed in on this device');
    await h.shot('explain-remember-me');
  }

  const forgotLink = page.getByRole('link', { name: /forgot password/i });
  if (await forgotLink.count()) {
    await h.explain(forgotLink, 'Forgot your password? This link starts the reset flow');
    await h.shot('explain-forgot-password');
  }
  await h.clearHighlight();

  // 3. Enter the email
  await h.caption('Step 1 · Enter your email address');
  await h.glideClick(page.getByLabel(/email/i));
  await h.type(page.getByLabel(/email/i), 'demo@example.com');
  await h.shot('email-entered');

  // 4. Enter the password
  await h.caption('Step 2 · Enter your password');
  await h.glideClick(page.getByLabel(/password/i));
  await h.type(page.getByLabel(/password/i), 'demo-password');
  await h.shot('password-entered');

  // 5. Submit
  await h.caption('Step 3 · Click "Sign in"');
  await h.glideClick(page.getByRole('button', { name: /log ?in|sign ?in/i }));
  await page.waitForLoadState('networkidle');
  await h.sleep(800);

  // 6. Prove the result
  await h.caption('Logged in successfully');
  await h.shot('logged-in');
  await h.sleep(1500);

  // 7. DOWNSTREAM/RELATED PAGE PATTERN (delete if not applicable to this feature):
  // If the action just performed changes what renders elsewhere — e.g. this was a CMS
  // "publish page" action rather than a login — follow through to where the client actually
  // sees the result, instead of stopping at the editor's "Saved!" toast:
  //
  //   await h.caption('Let\'s see the published page live on the site');
  //   await h.goto('/blog/my-new-post');           // the public-facing route it now lives at
  //   await h.explain(page.getByRole('heading', { level: 1 }),
  //     'This is the title we just entered in the editor — now live for visitors');
  //   await h.shot('published-page-live');

  await h.sleep(2500);
}
