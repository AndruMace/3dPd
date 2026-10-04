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
  },
};

export default config;
