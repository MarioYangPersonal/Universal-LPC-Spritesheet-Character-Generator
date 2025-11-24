FROM node:18-alpine

# Install native dependencies for node-canvas
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

WORKDIR /app

# Copy package files from api directory and install dependencies
COPY api/package*.json ./
RUN npm ci --production

# Copy application code from api directory
COPY api/src ./src
COPY api/server.js ./server.js

# Copy spritesheet assets from repo root
COPY spritesheets ./spritesheets

EXPOSE 3000

CMD ["node", "server.js"]
