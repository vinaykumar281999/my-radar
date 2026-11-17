// Runs tests/unit/*.test.ts (pure logic, no browser or database).
//   npm run test:unit
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const dir = join(root, "tests/unit");

const tests = [];
globalThis.test = (name, fn) => tests.push({ name, fn });

for (const file of readdirSync(dir).filter((f) => f.endsWith(".test.ts")).sort()) {
  await jiti.import(join(dir, file));
}

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${err.message.split("\n").join("\n      ")}`);
  }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
