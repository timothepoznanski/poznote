# Poznote - Railway Deployment Guide

This guide will help you deploy Poznote on Railway.com with automated deployments and easy scaling.

## Table of Contents

- [Introduction](#introduction)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Option 1: One-Click Deployment (Recommended)](#option-1-one-click-deployment-recommended)
  - [Option 2: Manual Railway Setup](#option-2-manual-railway-setup)
- [Access Your Instance](#access-your-instance)
- [Change Settings](#change-settings)
- [Forgot Your Password](#forgot-your-password)
- [Update to Latest Version](#update-to-latest-version)

## Introduction

Railway.com offers a simple way to deploy Poznote in the cloud without managing servers. The platform provides:
- ✅ Automated deployments from GitHub
- ✅ Free tier available (with GitHub account)
- ✅ Automatic HTTPS
- ✅ Easy scaling
- ✅ No server management required

## Prerequisites

### Create a Railway Account

You have two options:

**Option 1: Sign up with GitHub (Recommended)**
- Get **one month of free usage**
- Seamless integration with the deployment template

**Option 2: Sign up with Email**
- Choose the **$5/month plan**

Go to [Railway.com](https://railway.com) and create your account:

![railway-login](readme/railway-login.png)

## Installation

### Option 1: One-Click Deployment (Recommended)

For a **ready-to-use setup**, use the official Poznote template on Railway.

#### Step 1: Deploy with One Click

Click the button below to start the deployment:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/poznote)

#### Step 2: Follow the Video Tutorial

Watch this 2-minute video tutorial that guides you through the entire deployment process:

**[Watch the deployment tutorial](https://youtu.be/Q22kqv82bHQ)**

The video shows you:
- How to deploy Poznote in one click
- How to configure your environment variables
- How to get your instance URL
- How to access your Poznote instance

> 💡 **Tip:** You can export your notes anytime from the Poznote interface if you ever decide to leave Railway, switch providers, or back up your data.

### Option 2: Manual Railway Setup

If you prefer to deploy manually:

1. Go to your [Railway dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"** or **"Empty Project"**
4. Configure the following environment variables:
   - `SQLITE_DATABASE=/var/www/html/data/database/poznote.db`
   - `POZNOTE_USERNAME=admin`
   - `POZNOTE_PASSWORD=admin123!`
5. Set the Docker image: `ghcr.io/timothepoznanski/poznote:latest`
6. Add a volume mount: `./data:/var/www/html/data`
7. Deploy the service

## Access Your Instance

After deployment is complete:

### Step 1: Get Your Instance URL

1. Go to your Railway dashboard
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Settings** tab
5. Find your public URL in the **Networking** section

Or watch the end of the [deployment tutorial video](https://youtu.be/Q22kqv82bHQ) to see how to get the URL.

### Step 2: Log In

**Default Credentials:**
- Username: `admin`
- Password: `admin123!`

> ⚠️ **Important:** Change these default credentials after your first login!

Your instance URL will look like: `https://poznote-production-xxxx.up.railway.app`

## Change Settings

To change your username or password on Railway:

### Video Tutorial

Watch this video tutorial that shows you step by step how to change your settings:

**[Change Settings on Railway](https://youtu.be/_h5pP7LreZc)**

### Written Instructions

1. Go to your [Railway dashboard](https://railway.app/dashboard)
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Variables** tab
5. Update the following variables:
   - `POZNOTE_USERNAME` - Your new username
   - `POZNOTE_PASSWORD` - Your new password
6. Click **Save**
7. Railway will automatically redeploy your instance with the new settings

> 📝 **Note:** Unlike self-hosted installations, you cannot change the port on Railway as it's managed by the platform.

## Forgot Your Password

If you forgot your password, you can retrieve it from Railway:

### Video Tutorial

Watch this video tutorial:

**[Retrieve Your Password on Railway](https://youtu.be/_h5pP7LreZc)**

### Written Instructions

1. Go to your [Railway dashboard](https://railway.app/dashboard)
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Variables** tab
5. Look for the `POZNOTE_PASSWORD` variable
6. Click the eye icon to reveal your password

## Update to Latest Version

To update your Poznote instance to the latest version:

### Video Tutorial

Watch this video tutorial:

**[Update Poznote on Railway](https://youtu.be/Mhpk6gitul8)**

### Written Instructions

1. Go to your [Railway dashboard](https://railway.app/dashboard)
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Settings** tab
5. Scroll down to the **Service** section
6. Click on **Redeploy**

Railway will automatically:
- Pull the latest Poznote image
- Redeploy your instance
- Preserve all your data (notes, attachments, database)

The update process typically takes 1-2 minutes.

---

## Cost Information

Railway pricing (as of 2024):
- **Free Tier** (with GitHub account): 1 month free, then $5/month for small workloads
- **Usage-based pricing**: Pay only for what you use
- Check [Railway pricing](https://railway.app/pricing) for current details

## Data Ownership

Your data remains yours:
- Export your complete backup anytime from Poznote's Settings
- The backup ZIP contains all notes, attachments, and database
- Easily migrate to self-hosted or another provider

---

**Need help?** Check the [main README](README.md) for more information or open an issue on GitHub.
