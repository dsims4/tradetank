# Start with Node.js 24 on a small Debian base.
FROM node:24-bookworm-slim

WORKDIR /app

# Copy dependency manifests first so dependency installation can be cached.
COPY package.json package-lock.json ./

# Install exactly the locked production dependencies.
RUN npm ci --omit=dev

# Copy the application source.
COPY . .

ENV NODE_ENV=production

# Run as the non-root user included in the Node image.
USER node

EXPOSE 3000

CMD ["npm", "start"]