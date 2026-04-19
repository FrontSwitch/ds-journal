import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.frontswitch.dsj',
  appName: 'DSJ',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: { iosDatabaseLocation: 'Library/LocalDatabase' }
  }
};

export default config;
