# GitHub Actions Workflows Configuration

This repository contains **optimized GitHub Actions workflows** to automate production deployment with validation.

## Deployment workflow (optimized for speed)

### Pull Request approach with manual merge (semi-automated)
- **Trigger** : Push to `dev` branch
- **Action** : Automatic PR creation `dev` → `main` for manual review *(~1-2 minutes)*
- **Deployment** : Manual merge, then automatic deployment to production
- **Auto-sync** : `dev` branch automatically synchronized with `main` after deployment
- **Benefits** : Additional review step, controlled deployment, **faster CI/CD pipeline**
- **Safety** : Automated tests + conflict detection + manual review

## Required configuration

### GitHub Repository Settings (Important!)
To avoid unnecessary commits and keep branches synchronized:

1. Go to your repository → **Settings** → **General** → **Pull Requests**
2. **Uncheck** "Allow merge commits" 
3. **Check** "Allow squash merging" (recommended)
4. **Check** "Allow rebase merging" (alternative)
5. **Check** "Automatically delete head branches" (optional cleanup)

This prevents GitHub from creating unnecessary merge commits that would desynchronize your branches.

### Merge strategy recommendation:
- ✅ **Use "Squash and merge"** for cleaner history
- ✅ **Use "Rebase and merge"** to preserve individual commits  
- ❌ **Avoid "Create a merge commit"** (causes branch desynchronization)

You must configure the following secrets in your GitHub repository (Settings → Secrets and variables → Actions) :

### Required secrets
- `PROD_HOST` : Production server IP address or domain name
- `PROD_USERNAME` : SSH username for server connection
- `PROD_SSH_KEY` : Private SSH key for authentication
- `PROD_SSH_PASSPHRASE` : SSH key passphrase (if your key has one)
- `PROD_PORT` : SSH port (usually 22)
- `PROD_PROJECT_PATH` : Absolute path to project on server (ex: `/root/poznote/poznote`)
- `PAT_TOKEN` : GitHub Personal Access Token to create Pull Requests
- `DOCKER_USERNAME` : Docker Hub username (for registry push / Not the email address)
- `DOCKER_PASSWORD` : Docker Hub password or access token

### SSH Configuration
1. Generate an SSH key pair on your production server:
   ```bash
   ssh-keygen -t rsa -b 4096 -C "github-actions@yourdomain.com"
   ```

2. Add the public key to the target user's `~/.ssh/authorized_keys` file

3. Copy the private key to the `PROD_SSH_KEY` secret

4. **If your key has a passphrase**: Add the passphrase to the `PROD_SSH_PASSPHRASE` secret

### GitHub Personal Access Token Configuration
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give the token a name (ex: "Poznote Auto Deploy")
4. Select the following permissions:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Click "Generate token"
6. Copy the token and add it to the `PAT_TOKEN` secret

### Alternative option: Key without passphrase
If you prefer, you can create a dedicated SSH key without passphrase for GitHub Actions:
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/github_actions_key -N ""
```
In this case, you don't need the `PROD_SSH_PASSPHRASE` secret.

## Usage

The workflow works automatically:

1. **Push to `dev`** → Automatic PR creation for manual review
2. **Manual merge** after review → Automatic deployment to production

### Workflow process
1. Develop on the `dev` branch
2. Push your changes: `git push origin dev`
3. **Conflict detection** - Checks if dev can merge cleanly into main
4. **Automated tests run** (PHP syntax, Docker build, etc.)
5. **If no conflicts AND tests pass**: A PR will be automatically created (`dev` → `main`) for manual review
6. **If conflicts OR tests fail**: No PR is created, deployment is blocked
7. **Manual merge** of the PR after review triggers automatic deployment to production

**Note**: The deployment includes multiple safety checks: conflict detection + automated testing + manual review before merge.

## File structure

```
.github/
└── workflows/
    ├── auto-pr-production.yml         # Tests + Auto PR creation dev → main
    ├── production-deployment.yml      # Deployment after merge to main
    └── README.md                      # This file
```

## What actually happens

### Production deployment process:
1. **GitHub Actions runner** connects via SSH to your server (simple relay)
2. **Your server** executes `git pull origin main` to fetch the new code
3. **Your server** executes `docker compose build` to build the image locally
4. **Your server** executes `docker compose up -d` to start the new containers
5. **No merge commits** = branches stay synchronized automatically
6. **Everything happens on your server** - the runner only transmits SSH commands

### Why no manual pushes needed anymore:
- ✅ **With "Squash and merge"**: No extra commits, `dev` and `main` stay in sync
- ✅ **With "Rebase and merge"**: Clean linear history, no desynchronization  
- ❌ **With "Create merge commit"**: Creates extra commits that desynchronize branches

**Result**: After deployment, your local `dev` branch is automatically up to date when you `git pull`!

## Customization 

You can modify the workflows according to your needs:
- **Add more tests** in `auto-pr-production.yml` (database tests, API tests, etc.)
- Modify Docker commands according to your configuration
- Add notifications (Slack, Discord, email)
- Configure staging environments
- Add security scans or dependency checks

### Available tests in `auto-pr-production.yml`:
- ✅ **Docker build test** - Ensures the application can be built *(~3-5 minutes)*
- ✅ **Docker Compose validation** - Checks compose file syntax *(~10-30 seconds)*  
- ✅ **PHP syntax check** - Validates all PHP files *(~30-60 seconds)*
- ✅ **Merge conflict detection** - Prevents PR creation if conflicts exist *(~5-10 seconds)*
- ✅ **Changes detection** - Skips PR creation if no changes between branches *(~5-10 seconds)*

### Performance optimization
The workflow has been optimized for faster deployment:
- ⚡ **Docker build test removed by default** - Saves 3-5 minutes per deployment
- ⚡ **Only essential tests remain** - PHP syntax + Docker Compose validation
- ⚡ **Total workflow time**: ~1-2 minutes instead of 5-7 minutes
- 🔧 **Re-enable Docker build test** if needed by uncommenting the step in the workflow

### Adding custom tests:
You can add more tests to `auto-pr-production.yml` such as:
- Database connection tests
- API endpoint testing
- Security vulnerability scans
- Performance tests
- Code quality checks (PHPStan, etc.)

## Troubleshooting

### Error "divergent branches" during deployment
This error occurs when the production server's local git state differs from the remote repository:
- ✅ **Automatic handling**: The workflow now handles this automatically with `git reset --hard origin/main`
- ✅ **Backup created**: A backup branch is created before resetting (backup-YYYYMMDD-HHMMSS)
- ✅ **Clean deployment**: Ensures production always matches the exact state of `main` branch
- ✅ **No manual intervention needed**: The deployment process handles conflicts automatically

### Manual recovery (if needed)
If you need to recover to a previous state:
```bash
# On production server, list backup branches
git branch | grep backup-

# Restore to a specific backup
git checkout backup-20250721-214500  # example timestamp
git checkout -b recovery-branch
```

### Error "refusing to merge unrelated histories"
This error occurs when `dev` and `main` branches were created independently:
- ✅ **This is normal for new repositories** - the workflow handles this automatically
- ✅ **The system will use `--allow-unrelated-histories`** for the conflict check
- ✅ **No action needed** - the workflow adapts to this situation

### Error "Merge conflicts detected"
This error occurs when your `dev` branch has changes that conflict with `main` during merge:
- ✅ **First, update your dev branch with latest main**: `git checkout dev && git pull origin main --allow-unrelated-histories` (add flag if needed)
- ✅ **Resolve conflicts manually** in your code editor  
- ✅ **Commit the resolved conflicts**: `git add . && git commit -m "Resolve merge conflicts"`
- ✅ **Push again**: `git push origin dev`
- ✅ **The workflow will automatically retry** the PR creation process

### Error "invalid header field value for Authorization"
This error indicates a problem with the Personal Access Token:
- ✅ Check that the `PAT_TOKEN` secret is properly configured in your repository
- ✅ Make sure the token hasn't expired
- ✅ Verify that the token has `repo` and `workflow` permissions
- ✅ The token should not contain spaces or special characters at the beginning/end

### Tests failing
If automated tests fail and block deployment:
- ✅ **Check the Actions tab** on GitHub to see which test failed
- ✅ **Fix the issue** in your dev branch
- ✅ **Push the fix**: The workflow will run again automatically

### SSH connection error
- Check that the SSH key is properly configured
- Make sure the user has sudo permissions if necessary

### Docker error
- Check that Docker and Docker Compose are installed on the server
- Make sure the user is in the `docker` group

### Git error
- Check that the repository is cloned on the production server
- Make sure the `main` branch exists and is tracked
