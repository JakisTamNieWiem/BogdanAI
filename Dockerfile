FROM oven/bun:1-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --production --no-frozen-lockfile

COPY . .
RUN mkdir -p /app/storage \
	&& chown -R bun:bun /app

ENV NODE_ENV=production
ENV DB_FILE_NAME=/app/storage/overseer.db

USER bun

CMD ["sh", "-c", "bun run migrate && bun run start"]
