import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function getAllKeys(obj: Record<string, any>, prefix: string = ""): string[] {
  let keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k])) {
      keys = keys.concat(getAllKeys(obj[k], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

test("Prompt 99 — Internationalization (i18n) Engine & Catalogs Verification", async (t) => {
  const i18nModulePath = pathToFileURL(path.resolve(process.cwd(), "src/platform/web/i18n/index.js")).href;
  const esModulePath = pathToFileURL(path.resolve(process.cwd(), "src/platform/web/i18n/locale-es-419.js")).href;
  const enModulePath = pathToFileURL(path.resolve(process.cwd(), "src/platform/web/i18n/locale-en.js")).href;

  const { i18n, DEFAULT_LOCALE, SUPPORTED_LOCALES } = await import(i18nModulePath);
  const { default: es419 } = await import(esModulePath);
  const { default: en } = await import(enModulePath);

  await t.test("1. Default locale is es-419 (Español Latinoamericano)", () => {
    assert.equal(DEFAULT_LOCALE, "es-419");
    assert.ok(SUPPORTED_LOCALES["es-419"]);
    assert.equal(SUPPORTED_LOCALES["es-419"].name, "Español (Latinoamérica)");
  });

  await t.test("2. Available locales include both es-419 and en", () => {
    const locales = i18n.getAvailableLocales();
    const codes = locales.map((l: any) => l.code);
    assert.ok(codes.includes("es-419"), "Must include es-419");
    assert.ok(codes.includes("en"), "Must include en");
  });

  await t.test("3. Translation catalog key symmetry (0 missing keys)", () => {
    const esKeys = getAllKeys(es419);
    const enKeys = getAllKeys(en);

    const missingInEn = esKeys.filter((k: string) => !enKeys.includes(k));
    const missingInEs = enKeys.filter((k: string) => !esKeys.includes(k));

    assert.equal(missingInEn.length, 0, `Missing keys in English catalog: ${missingInEn.join(", ")}`);
    assert.equal(missingInEs.length, 0, `Missing keys in Spanish catalog: ${missingInEs.join(", ")}`);
  });

  await t.test("4. Safe fallback: never returns undefined or null", () => {
    const translation = i18n.t("non.existent.key");
    assert.ok(translation !== undefined && translation !== null, "Must never return undefined or null");
    assert.ok(typeof translation === "string", "Must return a string fallback");
  });

  await t.test("5. Interpolation and formatting utilities work properly", () => {
    const formattedNum = i18n.formatNumber(12500.5);
    assert.ok(formattedNum.length > 0, "Number format must be non-empty");

    const formattedDuration = i18n.formatDuration(2500);
    assert.equal(formattedDuration, "2.5s");
  });

  await t.test("6. Switching locales ES ↔ EN dynamically", () => {
    i18n.setLocale("en");
    assert.equal(i18n.getLocale(), "en");
    assert.equal(i18n.t("app.themeDark"), "Dark");

    i18n.setLocale("es-419");
    assert.equal(i18n.getLocale(), "es-419");
    assert.equal(i18n.t("app.themeDark"), "Oscuro");
  });
});

test("Prompt 99 — Documentation Integrity & Internal Links Verification", async (t) => {
  const docsDir = "docs";
  const mdFiles: string[] = [];

  function collectMdFiles(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith(".")) collectMdFiles(full);
      } else if (e.name.endsWith(".md")) {
        mdFiles.push(full);
      }
    }
  }

  collectMdFiles(docsDir);
  mdFiles.push("README.md");

  await t.test("1. Required core documents exist and are non-empty", () => {
    const required = [
      "docs/MANUAL_OFICIAL.md",
      "docs/MANUAL_ARQUITECTURA.md",
      "docs/MANUAL_OPERACIONAL.md",
      "docs/MANUAL_DESARROLLADOR.md",
      "docs/GLOSARIO.md",
      "docs/ROADMAP_OFICIAL.md",
      "docs/DOCUMENTATION_STYLE_GUIDE.md",
      "docs/PORTFOLIO_OVERVIEW.md",
      "docs/CONTROL_PLANE.md",
      "docs/OPERATIONAL_CONSOLE.md",
      "docs/DEVELOPER_PLATFORM.md",
      "docs/APPLICATION_FACTORY_2.md",
      "docs/APPLICATION_ECOSYSTEM.md",
      "docs/API_REFERENCE.md",
      "docs/API_OPERATIONS.md",
      "docs/API_VERSIONING.md",
      "docs/ERROR_CONTRACT.md",
      "docs/OBSERVABILITY.md",
      "docs/BUSINESS_DEVICES.md",
      "docs/PRINT_OPERATIONS.md",
      "docs/AUTOMATION_INTEGRATION.md",
      "docs/PRODUCTION_READINESS.md",
      "docs/README.md",
      "README.md",
    ];

    for (const req of required) {
      assert.ok(fs.existsSync(req), `File ${req} must exist`);
      const stat = fs.statSync(req);
      assert.ok(stat.size > 100, `File ${req} must not be empty`);
    }
  });

  await t.test("2. Zero forbidden file:/// URLs in official documentation", () => {
    for (const f of mdFiles) {
      const content = fs.readFileSync(f, "utf8");
      assert.ok(
        !content.includes("file:///"),
        `File ${f} contains forbidden host-specific file:/// URL`
      );
    }
  });

  await t.test("3. Internal relative markdown links resolve to existing targets", () => {
    const linkRegex = /\[([^\]]+)\]\(([^\)]+\.md(?:#[^\)]*)?)\)/g;
    let brokenLinks: string[] = [];

    for (const f of mdFiles) {
      const content = fs.readFileSync(f, "utf8");
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(content)) !== null) {
        const rawTarget = match[2];
        if (rawTarget) {
          const linkTarget = rawTarget.split("#")[0];
          if (linkTarget && !linkTarget.startsWith("http://") && !linkTarget.startsWith("https://")) {
            const resolvedPath = path.resolve(path.dirname(f), linkTarget);
            if (!fs.existsSync(resolvedPath)) {
              brokenLinks.push(`${f} -> ${rawTarget} (resolved: ${resolvedPath})`);
            }
          }
        }
      }
    }

    assert.equal(
      brokenLinks.length,
      0,
      `Broken internal markdown links found:\n${brokenLinks.join("\n")}`
    );
  });
});
