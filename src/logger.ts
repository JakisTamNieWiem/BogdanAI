import pino from "pino";
import fs from "node:fs";
import path from "node:path";

const logName = `log-${new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-")}.txt`;
const logDir = process.env.LOG_DEST ?? path.join(process.cwd(), "logs");
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, logName);
const level = process.env.LOG_LEVEL ?? "info";
const consoleStream = pino.transport({
	target: "pino-pretty",
	options: {
		colorize: true,
		ignore: "pid,hostname",
		translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
	},
});

export const logger = pino(
	{
		level,
	},
	pino.multistream([
		{ stream: consoleStream },
		{ stream: pino.destination(logPath) },
	]),
);
