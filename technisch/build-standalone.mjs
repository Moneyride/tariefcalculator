import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const technicalDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(technicalDirectory, "..");
const appDirectory = path.join(rootDirectory, "app");

const scriptFiles = [
  "runtime-config.js",
  "saas/config.js",
  "saas/supabaseClient.js",
  "saas/pushService.js",
  "saas/authService.js",
  "saas/profileService.js",
  "saas/settingsService.js",
  "saas/functionService.js",
  "saas/equipmentService.js",
  "saas/projectService.js",
  "saas/workdayService.js",
  "saas/shareService.js",
  "saas/subscriptionService.js",
  "saas/featureGate.js",
  "saas/accountingService.js",
  "calculator.js",
  "accountingExportModel.js",
  "accountingUi.js",
  "liveWorkday.js",
  "workdayNotifications.js",
  "analytics.js",
  "saas/sessionUi.js",
  "vendor/jsQR.js",
  "qrScanner.js",
  "qrCode.js",
  "saas/shareUi.js",
  "interactionGuard.js",
  "selectUi.js",
  "timePicker.js",
  "app.js",
  "pwa.js"
];

const [template, styles, ...scripts] = await Promise.all([
  readFile(path.join(appDirectory, "index.html"), "utf8"),
  readFile(path.join(appDirectory, "styles.css"), "utf8"),
  ...scriptFiles.map((file) => readFile(path.join(appDirectory, file), "utf8"))
]);

let standalone = template
  .replace(
    /\s*<link rel="stylesheet" href="styles\.css\?v=[^"]+">/,
    `\n    <style>\n${styles}\n    </style>`
  );

scriptFiles.forEach((file) => {
  const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  standalone = standalone.replace(new RegExp(`\\s*<script src="${escapedFile}\\?v=[^"]+" defer><\\/script>`), "");
});

standalone = standalone.replace(
  /\n  <\/body>/,
  `${scripts.map((script) => `\n    <script>\n${script}\n    </script>`).join("")}\n  </body>`
);

await writeFile(path.join(rootDirectory, "Overuurtje.html"), standalone);
console.log("Overuurtje.html is opnieuw opgebouwd.");
