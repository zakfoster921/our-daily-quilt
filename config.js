/**
 * Application Configuration
 * Centralized configuration for the Our Daily app
 */

export const CONFIG = {
  // App settings
  APP: {
    name: 'Our Daily',
    version: '2.0.0',
    defaultColor: '#f7b733',
    quiltSize: 600,
    minBlockSize: 40,
    animationDuration: 2000,
    toastDuration: 3000
  },

  // Firebase configuration
  FIREBASE: {
    apiKey: "AIzaSyBqMJlchU_luM5-XcPo0USDUjsM60Qfoqg",
    authDomain: "our-daily.firebaseapp.com",
    projectId: "our-daily",
    storageBucket: "our-daily.firebasestorage.app",
    messagingSenderId: "337201931314",
    appId: "1:337201931314:web:fb5677846d03eb285ac82b",
    measurementId: "G-65XB7QC1F4"
  },

  // Color picker settings
  COLOR_PICKER: {
    wheelSize: 280,
    defaultHue: 0,
    defaultLightness: 67,
    saturation: 90
  },

  // Share settings
  SHARE: {
    imageWidth: 1080,
    imageHeight: 1920,
    scale: 2,
    backgroundColor: '#f6f4f1'
  },

  // Animation settings
  ANIMATIONS: {
    screenTransition: 600,
    blockScale: 2000,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
  }
};

// Environment-specific overrides
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Development-specific settings
  CONFIG.APP.debug = true;
}

// Export for use in other modules
export default CONFIG; 