# Runs from source rather than the compiled binary, so `bun run backup`,
# `bun run restore` and the thumb/translate scripts work inside the container.
# Floats on Bun 1.x on purpose; bun.lock pins the dependencies.
FROM oven/bun:1

# mysqldump + mysql for src/backend/backup/service.ts. Debian's
# default-mysql-client is MariaDB's, the same family as the db service.
RUN apt-get update \
 && apt-get install -y --no-install-recommends default-mysql-client \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run generate-routes

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/backend/index.ts"]
