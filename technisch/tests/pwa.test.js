import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testsDirectory, "../..");

async function read(relativePath) {
  return readFile(path.join(rootDirectory, relativePath), "utf8");
}

async function pngDimensions(relativePath) {
  const png = await readFile(path.join(rootDirectory, relativePath));
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}

test("manifest beschrijft een zelfstandig installeerbare Overuurtje-app", async () => {
  const manifest = JSON.parse(await read("app/site.webmanifest"));
  assert.equal(manifest.name, "Overuurtje.nl");
  assert.equal(manifest.start_url, "./index.html");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#073f3d");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url === "./workdays.html"));
});

test("PWA-iconen hebben de vereiste afmetingen", async () => {
  assert.deepEqual(await pngDimensions("app/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(await pngDimensions("app/icon-512.png"), { width: 512, height: 512 });
  assert.deepEqual(await pngDimensions("app/apple-touch-icon.png"), { width: 180, height: 180 });
});

test("alle webapp-pagina's registreren dezelfde PWA-laag", async () => {
  for (const page of ["index.html", "dashboard.html", "account.html", "workdays.html", "projects.html"]) {
    const html = await read(`app/${page}`);
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /apple-mobile-web-app-capable/);
    assert.match(html, /site\.webmanifest\?v=/);
    assert.match(html, /pwa\.js\?v=/);
  }
});

test("installatie-interface ondersteunt browserprompt en iPhone-beginscherm", async () => {
  const html = await read("app/index.html");
  const script = await read("app/pwa.js");
  assert.match(html, /id="install-app"/);
  assert.match(html, /id="pwa-install-dialog"/);
  assert.match(script, /beforeinstallprompt/);
  assert.match(script, /appinstalled/);
  assert.match(script, /Zet op beginscherm/);
  assert.match(script, /serviceWorker\.register/);
});

test("service worker bewaart de app-shell maar nooit API-verkeer", async () => {
  const worker = await read("app/service-worker.js");
  assert.match(worker, /const APP_SHELL/);
  assert.match(worker, /\.\/calculator\.js/);
  assert.match(worker, /\.\/workdays\.html/);
  assert.match(worker, /\.\/dashboard\.html/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/\.netlify\/functions\/"\)/);
  assert.match(worker, /networkFirst\(request/);
});

test("Netlify laat browsers de service worker steeds hercontroleren", async () => {
  const config = await read("netlify.toml");
  assert.match(config, /for = "\/service-worker\.js"/);
  assert.match(config, /max-age=0, must-revalidate/);
});

test("Cookie settings behoudt een transparante tekst-hover", async () => {
  const styles = await read("app/styles.css");
  const hoverRule = styles.match(/\.cookie-settings-link:hover\s*\{[^}]+\}/)?.[0] || "";
  assert.match(hoverRule, /background:\s*transparent/);
  assert.match(hoverRule, /box-shadow:\s*none/);
  assert.match(hoverRule, /transform:\s*none/);
});

test("Printlayouts houden veilige ruimte over voor mobiele browserfooters", async () => {
  const styles = await read("app/styles.css");
  assert.match(styles, /\.project-print-page\s*\{[^}]*min-height:\s*248mm/);
  const footerRule = [...styles.matchAll(/\.print-footer\s*\{[^}]+\}/g)].at(-1)?.[0] || "";
  assert.match(footerRule, /position:\s*absolute/);
  assert.doesNotMatch(footerRule, /position:\s*fixed/);
  assert.match(styles, /\.print-breakdown\s*\{[^}]*min-height:\s*248mm/);
});
