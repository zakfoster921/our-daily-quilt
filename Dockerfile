FROM node:20-slim

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Set working directory
WORKDIR /app

# Install locked production dependencies only. Playwright browsers are used by CI,
# not by the Railway API runtime.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy only runtime files that the API or public app needs.
COPY server.js index.html our-daily-beta.html privacy.html support.html rumi-colors.js ./
COPY lib ./lib
COPY scripts ./scripts
COPY assets ./assets

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
