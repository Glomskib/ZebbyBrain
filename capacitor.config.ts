import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zebbysworld.app',
  appName: 'Zebby',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https'
  }
};

export default config;
