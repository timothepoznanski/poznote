# Poznote - Cloud Manage Guide

This guide will help you **Configure, update and manage** Poznote on cloud platforms.

## Table of Contents

- [Railway Cloud](#Railway Cloud)
  - [Get Your Instance URL](#get-your-instance-url)
  - [Change Poznote Settings](#change-poznote-settings)
  - [Poznote Password Recovery](#poznote-password-recovery)
  - [Update Poznote to the latest version](#update-poznote-to-the-latest-version)
- [Other Cloud Providers](#other-cloud-providers)

## Railway Cloud

### Get Your Instance URL

1. Go to your Railway dashboard
2. Click on your Poznote project
3. Click on the Poznote service
4. Navigate to the **Settings** tab
5. Find your public URL in the **Networking** section

Or watch the end of the [deployment tutorial video](https://youtu.be/RkN0-v8sz2w) to see how to get the URL.

Your instance URL will look like: `https://poznote-production-xxxx.up.railway.app` but you can change it. See the [deployment tutorial video](https://youtu.be/RkN0-v8sz2w) to see how to. 

### Change Poznote Settings

To change your username or password on Railway, watch this video tutorial that shows you step by step how to change your settings:

**[Change Settings on Railway](https://youtu.be/_h5pP7LreZc)**

> 📝 **Note:** Unlike self-hosted installations, you cannot change the port.

### Poznote Password Recovery

If you forgot your password, you can retrieve it from Railway:

Watch this video tutorial:

**[Retrieve Your Password on Railway](https://youtu.be/_h5pP7LreZc)**

### Update Poznote to the latest version

To update your Poznote instance to the latest version:

**Video Tutorial**

**[Update Poznote on Railway](https://youtu.be/jbUlCEWndoo)**

Railway will automatically:
- Pull the latest Poznote image
- Redeploy your instance
- Preserve all your data (notes, attachments, database)

## Other Cloud Providers

The management of your Poznote instance will depend on your chosen cloud provider. Each platform has its own interface and procedures for:

- **Configuration**: Accessing and modifying environment variables (username, password, port settings)
- **Updates**: Redeploying with the latest Poznote Docker image
- **Monitoring**: Viewing logs and managing your instance
- **Password Recovery**: Accessing your credentials through the platform's interface

Please refer to your cloud provider's documentation for specific instructions on how to manage Docker-based applications and environment variables.


