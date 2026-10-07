import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the built web game (dist/) as a native iOS / Android app.
 * See docs/PLATFORMS.md for the build steps.
 */
const config: CapacitorConfig = {
  // The owner's ID is ca.506clicks.cageboss. Apple bundle IDs accept a segment that starts
  // with a digit, Android application IDs (and Capacitor's validator) do not, so Capacitor /
  // Android use ca.clicks506.cageboss and the Xcode project's PRODUCT_BUNDLE_IDENTIFIER is
  // set to ca.506clicks.cageboss (ios/App/App.xcodeproj). See docs/PLATFORMS.md.
  appId: 'ca.clicks506.cageboss',
  appName: 'CAGE BOSS',
  webDir: 'dist',
  backgroundColor: '#0d0b0c',
  ios: {
    // the game draws its own safe-area margins (env(safe-area-inset-*)), so let the
    // web view run edge to edge under the notch / home indicator
    contentInset: 'never',
    backgroundColor: '#0d0b0c',
    scrollEnabled: false,
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#0d0b0c',
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#0d0b0c',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#0d0b0c',
    },
  },
};

export default config;
