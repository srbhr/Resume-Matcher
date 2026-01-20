# ===========================
# Frontend Dockerfile
# ===========================

# Base Image
FROM node:22-slim AS frontend-builder

# Set working directory inside the container
WORKDIR /app

# Copy package files first for caching dependencies
COPY apps/frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the frontend code
COPY apps/frontend/ ./

# Allow optionally passing an API URL at build time, but do not bake host-specific defaults
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build the frontend
RUN npm run build

# Create a minimal production image
FROM node:22-slim AS frontend-runtime

WORKDIR /app

# Copy the built frontend code and essential assets
COPY --from=frontend-builder /app/.next ./.next
COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder /app/package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Add an entrypoint script that writes runtime configuration from environment
COPY docker/frontend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose the port for the frontend
EXPOSE 3000

# Start the frontend service via entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]