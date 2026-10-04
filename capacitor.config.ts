import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pixeldungeon3d.app',
  appName: 'Pixel Dungeon 3D',
  webDir: 'dist',
  backgroundColor: '#000000',
  ios: {
    contentInset: 'never',
  },
  android: {
    backgroundColor: '#000000',
    // Android 15 draws apps edge-to-edge and the WebView doesn't report the gesture-bar inset to CSS: keep the
    // web view inside the system bars instead.
    adjustMarginsForEdgeToEdge: 'force',
  },
};

export default config;
