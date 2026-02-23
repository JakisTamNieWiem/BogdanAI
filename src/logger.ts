import pino from "pino";

const logName = `log-${new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-")}.txt`;

export const logger = pino(
	{
		transport: {
			target: "pino-pretty",
		},
	},
	pino.destination(process.env.LOG_DEST + logName),
);
