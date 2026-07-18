import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const technicalDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(technicalDirectory, "..");
const appDirectory = path.join(rootDirectory, "app");

const [template, styles, calculator, analytics, app] = await Promise.all([
  readFile(path.join(appDirectory, "index.html"), "utf8"),
  readFile(path.join(appDirectory, "styles.css"), "utf8"),
  readFile(path.join(appDirectory, "calculator.js"), "utf8"),
  readFile(path.join(appDirectory, "analytics.js"), "utf8"),
  readFile(path.join(appDirectory, "app.js"), "utf8")
]);

const standalone = template
  .replace(
    /\s*<link rel="stylesheet" href="styles\.css\?v=[^"]+">/,
    `\n    <style>\n${styles}\n    </style>`
  )
  .replace(/\s*<script src="calculator\.js\?v=[^"]+" defer><\/script>/, "")
  .replace(/\s*<script src="analytics\.js\?v=[^"]+" defer><\/script>/, "")
  .replace(/\s*<script src="app\.js\?v=[^"]+" defer><\/script>/, "")
  .replace(
    /\n  <\/body>/,
    `\n    <script>\n${calculator}\n    </script>\n    <script>\n${analytics}\n    </script>\n    <script>\n${app}\n    </script>\n  </body>`
  );

await writeFile(path.join(rootDirectory, "Overuurtje.html"), standalone);
console.log("Overuurtje.html is opnieuw opgebouwd.");
