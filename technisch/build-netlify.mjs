import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const technicalDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(technicalDirectory, "..");
const sourceDirectory = path.join(rootDirectory, "app");
const outputDirectory = path.join(rootDirectory, "dist");

function publicRuntimeConfig() {
  return {
    publicSiteUrl: process.env.PUBLIC_SITE_URL || "https://overuurtje.nl",
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
    shopifyCheckoutUrl: process.env.SHOPIFY_CHECKOUT_URL || "",
    shopifyManageUrl: process.env.SHOPIFY_MANAGE_URL || "",
    allowMockSubscriptions: process.env.OVERUURTJE_ALLOW_MOCK_SUBSCRIPTIONS === "true"
  };
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "runtime-config.js"),
  `window.OVERUURTJE_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(publicRuntimeConfig(), null, 2)});\n`
);

console.log("Netlify-build staat klaar in dist/.");
