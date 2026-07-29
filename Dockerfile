# SynthNet MCP server — stdio transport.
# Build:  docker build -t synthnet-mcp .
# Run:    docker run -i --rm synthnet-mcp
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci && npm run build && npm prune --omit=dev
COPY skill ./skill
CMD ["node", "dist/index.js"]
