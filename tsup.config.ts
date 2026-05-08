import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: ["src/cli.ts", "src/fetch-worker.ts"],
  format: ["cjs"],
  target: "node18",
  platform: "node",
  splitting: false,
  clean: true,
  define: { __VERSION__: JSON.stringify(pkg.version) },
});
