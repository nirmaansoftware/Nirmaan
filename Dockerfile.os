# The Nirmaan OS (os/) for Fly.io: the web app and the campaign worker in one
# machine, with the database and project files on a persistent volume (/data).
# Build and deploy with `fly deploy` from the repo root (see fly.toml and
# docs/engineering/deployment.md). The website is not in this image.

FROM node:22-bookworm-slim AS build
WORKDIR /srv/os
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY os/package.json os/package-lock.json ./
COPY os/prisma ./prisma
RUN npm ci
COPY os/ ./
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# The claude CLI: the OS's default model provider, signed in with CLAUDE_CODE_OAUTH_TOKEN
# (from `claude setup-token`, billed to the Claude subscription, not the metered API).
RUN npm install -g @anthropic-ai/claude-code@latest && claude --version
WORKDIR /srv/os
COPY --from=build /srv/os ./
COPY agents /srv/agents
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/nirmaan.db \
    PROJECTS_ROOT=/data/projects \
    AGENTS_ROOT=/srv/agents \
    CLAUDE_CODE_EXECPATH=claude \
    NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
