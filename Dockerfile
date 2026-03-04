# Use official Node.js 20 image (required by NanoClaw)
FROM node:20-slim

# Install Python 3 + build essentials for node-gyp / better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm install -g typescript
RUN npx tsc

# Expose ports
EXPOSE 18789 18792

# Run the app
CMD ["npm", "start"]
