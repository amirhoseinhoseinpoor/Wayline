# Use official Node image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build NestJS app
RUN npm run build

# Expose port
EXPOSE 3000

# Start app
CMD ["node", "dist/main.js"]
