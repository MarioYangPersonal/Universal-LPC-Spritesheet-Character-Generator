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

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

# Copy spritesheet assets from parent directory
COPY ../spritesheets ./spritesheets

EXPOSE 3000

CMD ["node", "server.js"]
