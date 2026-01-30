import Constants from 'expo-constants';

type Environment = 'development' | 'staging' | 'production';

const getEnvironment = (): Environment => {
  const env = Constants.expoConfig?.extra?.environment;
  if (env === 'production' || env === 'staging') return env;
  return 'development';
};

const configs = {
  development: {
    API_URL: 'http://localhost:5000',
    WEB_URL: 'http://localhost:5000',
    APP_SCHEME: 'platformfactory',
  },
  staging: {
    API_URL: process.env.EXPO_PUBLIC_API_URL || 'https://staging-api.platform.app',
    WEB_URL: process.env.EXPO_PUBLIC_WEB_URL || 'https://staging.platform.app',
    APP_SCHEME: 'platformfactory',
  },
  production: {
    API_URL: process.env.EXPO_PUBLIC_API_URL || 'https://api.platform.app',
    WEB_URL: process.env.EXPO_PUBLIC_WEB_URL || 'https://platform.app',
    APP_SCHEME: 'platformfactory',
  },
};

export const ENV = getEnvironment();
export const config = configs[ENV];

export const getApiUrl = (path: string): string => {
  return `${config.API_URL}${path.startsWith('/') ? path : '/' + path}`;
};
