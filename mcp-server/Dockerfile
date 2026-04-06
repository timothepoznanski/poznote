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

# Copy project files for installation
COPY pyproject.toml ./
COPY src/ ./src/

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir .

# Remove build dependencies to reduce image size
RUN apk del gcc musl-dev libffi-dev

# Switch to non-root user
USER mcp

# Default environment variables (can be overridden)
ENV MCP_PORT=8045

# Expose MCP server port
EXPOSE $MCP_PORT

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD nc -z 127.0.0.1 ${MCP_PORT} || exit 1

# Run the MCP server
CMD ["sh", "-c", "poznote-mcp serve --host=0.0.0.0 --port=${MCP_PORT}"]
