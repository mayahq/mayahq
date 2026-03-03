import 'dotenv/config'

// Helper to get env vars with fallbacks
const getEnvVar = (name: string, fallback = ''): string => {
  // Try different prefixes
  return (
    process.env[`EXPO_PUBLIC_${name}`] || 
    process.env[`NEXT_PUBLIC_${name}`] || 
    fallback
  );
};

module.exports = {
  expo: {
    name: "MayaHQ",
    slug: "mayahq",
    version: "1.0.0",
    sdkVersion: "51.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#1a1a2e",
      hideExponentIconAfterLoadingJSBundle: true
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.mayahq.app",
      jsEngine: "hermes",
      deploymentTarget: "15.1",
      infoPlist: {
        NSMicrophoneUsageDescription: "MayaHQ needs access to your microphone for voice mode to transcribe your speech.",
        NSSpeechRecognitionUsageDescription: "MayaHQ needs access to speech recognition to convert your voice to text in voice mode."
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.mayahq.app",
      permissions: [
        "RECORD_AUDIO"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      supabaseUrl: getEnvVar('SUPABASE_URL'),
      supabaseAnonKey: getEnvVar('SUPABASE_ANON_KEY'),
      mayaApiEndpoint: getEnvVar('MAYA_API_ENDPOINT'),
      seriesGeneratorUrl: getEnvVar('SERIES_GENERATOR_URL', 'https://series-generator-production.up.railway.app'),
      eas: {
        projectId: "af3cdfb9-6201-4f50-9070-b2125e0e7213"
      }
    },
    plugins: [
      [
        "expo-secure-store",
        {
          "faceIDPermission": "Allow MayaHQ to access your Face ID biometric data."
        }
      ],
      "expo-updates",
      [
        "expo-image-picker",
        {
          "photosPermission": "MayaHQ needs access to your photos to let you select a profile picture.",
          "cameraPermission": "MayaHQ needs access to your camera to let you take a profile picture."
        }
      ],
      [
        "react-native-vision-camera",
        {
          "cameraPermissionText": "$(PRODUCT_NAME) needs access to your Camera for the Snap-to-Prompt feature.",
          "enableMicrophonePermission": true,
          "microphonePermissionText": "$(PRODUCT_NAME) needs access to your Microphone for video recording in Snap-to-Prompt."
        }
      ],
      "expo-av"
      // "expo-web-browser" // Still temporarily removed for upgrade process
    ],
    scheme: "mayahq",
    runtimeVersion: "1.0.0",
    updates: {
      enabled: true,
      fallbackToCacheTimeout: 0,
      checkAutomatically: "ON_LOAD",
      url: "https://u.expo.dev/af3cdfb9-6201-4f50-9070-b2125e0e7213"
    },
    // EAS specific configuration
    owner: "blakeurmos"
  }
} 