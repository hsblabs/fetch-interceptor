import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	outDir: "dist",
	target: "es2022",
	format: "esm",
	outExtensions() {
		return {
			js: ".js",
			dts: ".d.ts",
		};
	},
	clean: true,
	dts: true,
	treeshake: true,
	sourcemap: true,
	minify: false,
	exports: true,
});
