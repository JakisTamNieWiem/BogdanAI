#!/usr/bin/env bun

import { exec } from "child_process";
import { watch } from "fs";

const commandsDir = "./src/commands";

console.log("👀 Watching src/commands for changes...");

function runBuild() {
	console.log("🔨 Building commands...");
	exec("bun run build", (error, stdout, stderr) => {
		if (error) {
			console.error("❌ Build failed:", error.message);
			return;
		}
		if (stderr) {
			console.error("⚠️  Build warnings:", stderr);
		}
		console.log("✅ Build completed!");
	});
}

// Initial build
runBuild();

// Watch for changes
const watcher = watch(
	commandsDir,
	{ recursive: true },
	(eventType, filename) => {
		if (filename && filename.endsWith(".ts")) {
			console.log(`📝 File changed: ${filename}`);
			runBuild();
		}
	},
);

process.on("SIGINT", () => {
	watcher.close();
	process.exit(0);
});
