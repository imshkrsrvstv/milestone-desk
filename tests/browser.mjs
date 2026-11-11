import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const dataDir = await mkdtemp(join(tmpdir(), "milestone-browser-"));
const ai = {
  configured: true,
  review: async (m) => ({
    summary:
      "Synthetic browser fixture. The first criterion is supported and remaining ones need human inspection.",
    criteria: m.criteria.map((c, i) => ({
      id: c.id,
      status: i ? "missing" : "supported",
      quote: i
        ? ""
        : "Viewport checks at 390px and 1440px passed with no horizontal scrolling.",
      reason: i
        ? "The fixture does not infer acceptance."
        : "The exact supplied excerpt mentions both widths.",
    })),
  }),
};
const app = await startServer({
  port: 0,
  dataDir,
  ai,
  paypal: { configured: false, merchantEmail: "" },
});
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PROOFDECK_CHROME ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({
      viewport: { width: 1450, height: 1050 },
      reducedMotion: "reduce",
      colorScheme: "light",
      bypassCSP: Boolean(process.env.AXE),
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(8000);
  await page.goto(app.url);
  await page
    .getByRole("heading", { name: "Northstar Studio website", exact: true })
    .waitFor();
  await page.locator(".ag-row").first().waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.getByRole("button", { name: "Dark theme", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(
    await page
      .getByRole("button", { name: "Dark theme", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.reload();
  await page.locator(".ag-row").first().waitFor();
  assert.equal(
    await page.locator("html").getAttribute("data-theme"),
    "dark",
    "Theme persists on reload",
  );
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  assert.equal(await page.locator(".ag-row").count(), 3);
  await page
    .getByRole("button", { name: "Review with AI", exact: false })
    .click();
  await page.getByText("AI suggestions", { exact: true }).waitFor();
  assert.equal(await page.locator(".evidence-matches blockquote").count(), 1);
  await page
    .getByRole("button", { name: "Review each criterion", exact: false })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reviewer name").fill("Browser test reviewer");
  const decisions = dialog.getByRole("combobox", {
      name: /Decision for criterion/,
    }),
    notes = dialog.getByLabel("Your evidence or reason", { exact: true });
  for (let i = 0; i < 3; i++) {
    await decisions.nth(i).selectOption("accepted");
    await notes
      .nth(i)
      .fill("Reviewed the synthetic delivery record for this browser check.");
  }
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save acceptance review" }).click();
  await page
    .getByText("Accepted by Browser test reviewer", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator("#human-review")
      .evaluate((el) => el === document.activeElement),
    true,
    "Saved acceptance restores focus after redraw",
  );
  await page
    .getByRole("button", { name: "Preview draft", exact: false })
    .click();
  await dialog
    .getByRole("heading", { name: "Review your sandbox draft" })
    .waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "Create PayPal sandbox draft" })
      .isDisabled(),
    true,
  );
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("searchbox", { name: "Find a milestone" })
    .fill("migration");
  assert.equal(await page.locator(".ag-row").count(), 1);
  await page.getByRole("searchbox", { name: "Find a milestone" }).fill("");
  const qa = [];
  if (process.env.SHOTS) await mkdir(process.env.SHOTS, { recursive: true });
  if (process.env.AXE) await page.addScriptTag({ path: process.env.AXE });
  async function audit(scene, theme) {
    if (!process.env.AXE) return;
    const result = await page.evaluate(() =>
      axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      }),
    );
    qa.push({
      scene,
      theme,
      violations: result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
    console.log(JSON.stringify(qa.at(-1)));
    assert.equal(
      result.violations.length,
      0,
      scene + ": accessibility violations in " + theme,
    );
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => window.MilestoneTheme.set(t), theme);
    for (const width of [320, 390, 768, 1450]) {
      await page.setViewportSize({ width, height: 1050 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Overflow at " + width + " " + theme,
      );
    }
    await audit("Populated review", theme);
    if (process.env.SHOTS) {
      await page.screenshot({
        path: join(process.env.SHOTS, "desktop-" + theme + ".png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: join(process.env.SHOTS, "mobile-" + theme + ".png"),
        fullPage: false,
      });
    }
    await page.setViewportSize({ width: 1450, height: 1050 });
    await page
      .getByRole("button", { name: "Preview draft", exact: false })
      .click();
    await audit("Invoice preview and missing configuration", theme);
    if (process.env.SHOTS)
      await page.screenshot({
        path: join(process.env.SHOTS, "invoice-" + theme + ".png"),
      });
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("button", { name: "Preview draft", exact: false })
        .evaluate((el) => el === document.activeElement),
      true,
      "Dialog restores focus",
    );
    await page
      .getByRole("button", { name: "Revise human review", exact: false })
      .click();
    await audit("Populated acceptance dialog", theme);
    await page.setViewportSize({ width: 320, height: 800 });
    assert(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      "Dialog overflow at 320px",
    );
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1450, height: 1050 });
  }
  // Theme changes must not discard unsaved evidence or grid search.
  await page
    .locator("#evidence")
    .fill("Unsaved synthetic note retained across appearance change.");
  await page.locator("#grid-search").fill("migration");
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  assert.equal(
    await page.locator("#evidence").inputValue(),
    "Unsaved synthetic note retained across appearance change.",
  );
  assert.equal(await page.locator(".ag-row").count(), 1);
  await page.locator("#grid-search").fill("");
  await page.locator("#connection").click();
  await dialog.getByRole("button", { name: "Use system appearance" }).click();
  await page.keyboard.press("Escape");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  // Before application module executes, the synchronous theme script has already painted the right palette.
  const firstVisit = await browser.newContext({ colorScheme: "dark" });
  const initial = await firstVisit.newPage();
  await initial.route("**/app.mjs", (route) => route.abort());
  await initial.goto(app.url);
  assert.equal(
    await initial.locator("html").getAttribute("data-theme"),
    "dark",
  );
  assert.equal(
    await initial
      .locator("html")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(16, 24, 39)",
  );
  await firstVisit.close();
  await page.getByRole("button", { name: "New project", exact: false }).click();
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("A second client project");
  await dialog
    .getByLabel("Client name", { exact: true })
    .fill("Fictional client");
  await dialog.getByLabel("Sandbox recipient email").fill("sample@example.com");
  await dialog.getByLabel("Milestone name").fill("First reviewed delivery");
  await dialog.getByLabel("Amount", { exact: true }).fill("120.00");
  await dialog
    .getByLabel("Acceptance criteria", { exact: false })
    .fill("Every account navigation item is keyboard reachable.");
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "A second client project", exact: true })
    .waitFor();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => window.MilestoneTheme.set(t), theme);
    await audit("Empty evidence and review", theme);
    await page.locator("#connection").click();
    await audit("Connections and appearance", theme);
    await page.keyboard.press("Escape");
  }
  for (const theme of ["light", "dark"]) {
    const errorContext = await browser.newContext({
      colorScheme: theme,
      bypassCSP: Boolean(process.env.AXE),
      viewport: { width: 390, height: 844 },
    });
    const errorPage = await errorContext.newPage();
    await errorPage.route("**/api/state", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "The local review service is unavailable. Try again after starting it.",
        }),
      }),
    );
    await errorPage.goto(app.url);
    await errorPage
      .getByRole("heading", { name: "We couldn’t open your desk." })
      .waitFor();
    assert.equal(await errorPage.locator("#connection").isDisabled(), true);
    if (process.env.AXE) {
      await errorPage.addScriptTag({ path: process.env.AXE });
      const result = await errorPage.evaluate(() =>
        axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
        }),
      );
      qa.push({
        scene: "Unavailable service",
        theme,
        violations: result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      });
      assert.equal(result.violations.length, 0, "Error screen accessibility");
    }
    if (process.env.SHOTS)
      await errorPage.screenshot({
        path: join(process.env.SHOTS, "error-" + theme + ".png"),
      });
    await errorContext.close();
  }
  if (process.env.SHOTS)
    await (
      await import("node:fs/promises")
    ).writeFile(
      join(process.env.SHOTS, "design-qa.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          checks: qa,
          widths: [320, 390, 768, 1450],
          themePersistence: true,
          systemInitialBeforeAppModule: true,
          systemChanges: true,
          keyboardToggleAndDialogFocus: true,
          unsavedContentRetained: true,
        },
        null,
        2,
      ),
    );
  assert.deepEqual(errors, []);
  console.log(
    "Browser journey passed: genuine AG Grid, AI evidence mapping, human approval, sandbox setup state, grid filtering, project creation, and phone widths.",
  );
} finally {
  await browser?.close();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
