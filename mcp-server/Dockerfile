# Dockerfile for Poznote MCP Server
# Lightweight Python Alpine image for MCP (Model Context Protocol) server

FROM python:3.12-alpine

# Labels
LABEL org.opencontainers.image.title="Poznote MCP Server"
LABEL org.opencontainers.image.description="MCP server for Poznote - enables AI assistants to read, search and write notes"
LABEL org.opencontainers.image.authors="Timothé Poznanski"
LABEL org.opencontainers.image.url="https://github.com/timothepoznanski/poznote"
LABEL org.opencontainers.image.source="https://github.com/timothepoznanski/poznote"

# Install system dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1000 mcp && adduser -u 1000 -G mcp -s /bin/sh -D mcp

# Set working directory
WORKDIR /app

# Copy only dependency files first (for better caching)
COPY pyproject.toml ./

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -e .

# Copy application source
COPY src/ ./src/

# Remove build dependencies to reduce image size
RUN apk del gcc musl-dev libffi-dev

# Switch to non-root user
USER mcp

# Default environment variables (can be overridden)
ENV POZNOTE_API_URL=http://poznote:80/api/v1
ENV POZNOTE_USERNAME=admin
ENV POZNOTE_PASSWORD=admin
ENV POZNOTE_USER_ID=1
ENV POZNOTE_DEFAULT_WORKSPACE=Poznote
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8041

# Expose MCP server port
EXPOSE 8041

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${MCP_PORT}/mcp || exit 1

# Run the MCP server
CMD ["sh", "-c", "poznote-mcp serve --host=${MCP_HOST} --port=${MCP_PORT}"]
