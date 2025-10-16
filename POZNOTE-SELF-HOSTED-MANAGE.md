# Poznote - Self-Hosted Manage Guide

This guide will help you **Configure, update and manage** Poznote on your own machine or server using Docker.

## Table of Contents

- [Change Poznote Settings](#change-poznote-settings)
- [Poznote Password Recovery](#poznote-password-recovery)
- [Update Poznote to the latest version](#update-poznote-to-the-latest-version)

## Change Poznote Settings

To modify your username, password, or port:

```bash
cd poznote && docker compose down
```

Edit the `.env` file with your preferred text editor and modify the values:

```
POZNOTE_USERNAME=your_new_username
POZNOTE_PASSWORD=your_new_password
HTTP_WEB_PORT=8040
```

```bash
docker compose up -d
```

## Poznote Password Recovery

Your credentials are stored in the `.env` file in your Poznote directory.

To retrieve your password:

1. Navigate to your Poznote directory
2. Open the `.env` file
3. Look for the `POZNOTE_PASSWORD` value

## Update Poznote to the latest version

To update Poznote to the latest version:

```bash
cd poznote && docker compose down && docker compose pull && docker compose up -d
```

Your data is preserved in the `./data` directory and will not be affected by the update.