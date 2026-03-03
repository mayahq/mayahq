# Mobile App - Claude Code Instructions

## Quick Reference

### After Making Changes
1. **Commit the change** (if significant)
2. **Determine deployment type:**
   - JS-only changes → OTA Update
   - New native modules → New Build Required

### Deployment Commands
```bash
# OTA Update (JS changes only)
cd mobile && eas update --branch production --message "Description of change"

# New Native Build (when adding native modules)
cd mobile && eas build --platform all --profile production
```

---

## OTA vs Native Build Decision Tree

### Use OTA Update (`eas update`) when:
- Changing React components, screens, styles
- Updating API calls or business logic
- Fixing bugs in JS/TS code
- Adding new screens (JS-only)
- Modifying navigation (JS-only)
- Updating assets (images, fonts already in bundle)

### Requires New Native Build (`eas build`) when:
- Adding/removing packages with native code
- Changing `app.json` or `app.config.js`
- Modifying `eas.json` build profiles
- Updating Expo SDK version
- Adding new permissions (camera, location, etc.)
- Changing iOS/Android specific configs

### Native Module Detection
Before deploying OTA, check if any new imports require native code:

**Known Native Modules (require build):**
- `expo-image-manipulator` - Image processing
- `expo-camera` - Already in build
- `expo-av` - Audio/video
- `expo-notifications` - Push notifications
- `react-native-vision-camera` - Already in build
- `expo-local-authentication` - Biometrics
- `expo-sensors` - Device sensors

**Safe for OTA:**
- `expo-image-picker` - Uses system picker, already bundled
- `expo-file-system` - Already bundled
- `@expo/vector-icons` - Already bundled
- Any pure JS/TS libraries
- `zustand`, `react-query`, etc.

### OTA Failure Pattern
If users report the app "updates but shows old content":
1. A native module was likely added via OTA
2. OTA crashed on load, fell back to embedded bundle
3. **Fix:** Remove the native module OR do a new build

---

## Project Structure

```
mobile/
├── src/
│   ├── screens/           # All app screens
│   │   ├── FeedScreen.tsx
│   │   ├── ChatScreenNew.tsx
│   │   ├── SceneGenerationScreen.tsx  # Camera + Generate Maya
│   │   ├── BatchUploadScreen.tsx      # Multi-image batch upload
│   │   └── snap-to-prompt/
│   │       └── CameraScreen.tsx       # Alternative camera entry
│   ├── navigation/
│   │   └── index.tsx      # All navigation setup + screen registration
│   ├── components/        # Reusable components
│   ├── auth/              # Authentication context
│   └── stores/            # Zustand state stores
├── app.json               # Expo configuration
├── eas.json               # EAS Build/Update configuration
└── package.json
```

### Adding a New Screen
1. Create the screen in `src/screens/`
2. Add to `RootStackParamList` type in `navigation/index.tsx`
3. Add `<Stack.Screen>` in the navigator
4. OTA deploy (unless screen uses new native modules)

---

## API Integration

### Memory Worker Base URL
```typescript
const MEMORY_WORKER_API_URL = process.env.EXPO_PUBLIC_MAYA_API_ENDPOINT
  || 'https://mayahq-production.up.railway.app';
```

### Key Endpoints Used by Mobile

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/image/generate-scene` | Single image scene generation |
| `POST /api/v1/batch/create` | Create batch with multiple images |
| `GET /api/v1/batch/:id` | Get batch status and items |
| `GET /api/v1/batch/list` | List user's batches |
| `POST /api/v1/batch/:id/cancel` | Cancel a batch |
| `GET /api/v1/feed/items` | Fetch feed items |
| `POST /process` | Send chat message |

---

## Environment Variables

Required in `.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
EXPO_PUBLIC_MAYA_API_ENDPOINT=https://mayahq-production.up.railway.app
```

---

## Testing Before Deploy

### Local Testing
```bash
# Start Expo dev server
cd mobile && yarn start

# Test on device with Expo Go (limited - no native camera)
# Test on device with development build (full features)
```

### Pre-Deploy Checklist
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] No new native modules added (or plan for build)
- [ ] Test critical flows: camera, generate, batch upload
- [ ] Check console for errors

---

## Common Issues & Fixes

### "Image generation returns no data"
- Check Railway logs for memory-worker errors
- Gemini may be blocking content (check `promptFeedback` in logs)
- Image may be too large (compress before upload)

### "Camera not showing"
- Check camera permissions in device settings
- `react-native-vision-camera` requires development/production build
- Won't work in Expo Go

### "OTA update not applying"
- Force close app completely, reopen
- Check if native module was accidentally added
- Verify update was published: check EAS dashboard

### "413 Payload Too Large"
- Memory worker body limit is 10MB
- Compress images before upload (`quality: 0.5` in ImagePicker)

---

## EAS Configuration

### Current Profiles (eas.json)
- `development` - Dev builds with dev client
- `preview` - Internal testing builds
- `production` - App Store / Play Store builds

### Runtime Version
Current: `1.0.0` (in app.json)

**Important:** If you change `runtimeVersion`, all users need a new native build. OTA updates only work within the same runtime version.

---

## Commit Message Conventions

```
feat: Add new feature
fix: Bug fix
refactor: Code refactoring
style: UI/styling changes
chore: Maintenance tasks
```

Always note if change requires OTA or build:
```
feat: Add batch upload screen

OTA-safe: JS-only changes
```

or

```
feat: Add image compression with expo-image-manipulator

REQUIRES BUILD: New native module
```
