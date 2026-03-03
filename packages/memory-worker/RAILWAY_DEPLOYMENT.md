# Railway Deployment Guide for Memory Worker

## 🎉 **Simple Working Solution**

The deployment now works with a straightforward approach:

### **Steps:**
1. **Commit your changes** (including the updated `pnpm-lock.yaml` and `.dockerignore`)
2. **Deploy from repository root** - Railway will use the root `Dockerfile`
3. **Set environment variables** in Railway dashboard

### **What We Fixed:**
- ✅ Updated `pnpm-lock.yaml` to include `@modelcontextprotocol/sdk`
- ✅ **Fixed `.dockerignore`** - was excluding all `dist/` folders (built files)
- ✅ Simplified Dockerfile to copy pre-built files
- ✅ No complex multi-stage builds or TypeScript compilation issues

**Critical Fix:** The main issue was `.dockerignore` excluding `dist/`, `*/dist`, `**/dist` which prevented built files from being copied to the container.

---

## 🔧 **Required Environment Variables**

Set these in your Railway service:

```bash
NODE_ENV=production
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_key
COHERE_API_KEY=your_cohere_key
ELEVEN_LABS_API_KEY=your_elevenlabs_key
ELEVEN_LABS_VOICE_ID=your_voice_id
GITHUB_TOKEN=your_github_token
MAYA_SYSTEM_USER_ID=your_maya_user_id
MEMORY_PROCESSING_ENABLED=true
RESPONSE_GENERATION_ENABLED=true
QUEUE_PROCESSING_ENABLED=true
QUEUE_PROCESSING_INTERVAL=5s
MCP_GITHUB_ENABLED=true
PORT=3002
```

## 🚀 **How the Dockerfile Works**

The simplified approach:
1. **Copies workspace files** (package.json, pnpm-lock.yaml, etc.)
2. **Copies packages/** directory (includes built `dist/` folders)
3. **Installs prod dependencies only** (`--prod` flag)
4. **Runs the service** from the built files

No TypeScript compilation in Docker = faster, more reliable builds!

## ✅ **Testing Deployment**

After successful deployment:

1. Check service logs for startup messages
2. Look for: `Memory worker initialized and ready`
3. Verify: `Memory worker API server running on port 3002`
4. Test: MCP tools should show initialization logs

## 🐛 **If You Get Build Errors**

1. **Run locally first**: `pnpm install && pnpm build`
2. **Commit everything**: Including `pnpm-lock.yaml` updates
3. **Check env vars**: All required variables set in Railway
4. **Clear Railway cache**: Trigger fresh build

---

**The key insight**: Build locally, deploy built artifacts. Simple and reliable! 🎯

## 🚀 **Three Deployment Approaches**

### **Approach 1: Fixed Root Dockerfile (Recommended)**
Use the improved root-level Dockerfile which handles the monorepo properly.

**Steps:**
1. Deploy from repository root
2. Railway will automatically use the root `Dockerfile`
3. Set environment variables in Railway dashboard

**Advantages:**
- Uses optimized multi-stage build
- Proper monorepo handling
- Smallest final image

---

### **Approach 2: Nixpacks with Railway Config**
Use Railway's Nixpacks builder with the provided `railway.json`.

**Steps:**
1. In Railway dashboard, set **Root Directory** to: `packages/memory-worker`
2. Railway will auto-detect the `railway.json` file
3. Set environment variables (they're pre-configured in the JSON)

**Advantages:**
- Simpler build process
- Automatic dependency resolution
- Faster builds

---

### **Approach 3: Simplified Dockerfile**
Use the dedicated `Dockerfile.railway` for a simpler build.

**Steps:**
1. In Railway dashboard, set **Dockerfile Path** to: `packages/memory-worker/Dockerfile.railway`
2. Set **Root Directory** to repository root (not the package directory)
3. Set environment variables

---

## 🐛 **Troubleshooting**

### **Build Fails on `pnpm install`**
- Try Approach 2 (Nixpacks) - it handles workspace dependencies better
- Check that `pnpm-lock.yaml` is committed to the repository
- Ensure Node.js version is 20+ in Railway settings

### **Module Not Found Errors**
- Verify workspace dependencies are built in correct order
- Check that `@mayahq/supabase-client` builds successfully
- Try clearing Railway's build cache

### **Environment Variable Issues**
- Use the Railway dashboard to set all required variables
- Don't include quotes around values in Railway dashboard
- Check the service logs for specific missing variables

## 📝 **Deployment Commands**

If deploying via CLI:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link
railway up

# Set environment variables
railway variables set NODE_ENV=production
railway variables set SUPABASE_URL=your_url
# ... (set all other variables)
```

---

**Recommended Order:**
1. Try **Approach 1** first (fixed root Dockerfile)
2. If that fails, use **Approach 2** (Nixpacks)
3. **Approach 3** as last resort

The fixed root Dockerfile should resolve the original `pnpm install --frozen-lockfile` error by properly handling the monorepo structure and workspace dependencies. 