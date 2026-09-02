import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.weiguang.habits',
  appName: '微光',
  webDir: 'mobile-dist',
  backgroundColor: '#f5f3fb',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
  plugins: {
    LocalNotifications: {
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
  },
};

export default config;
