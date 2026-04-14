# App Deployment Specification

## Overview

This document specifies deployment strategies for Archangel across web, progressive web app (PWA), and native mobile platforms. The architecture prioritizes a single codebase that can be deployed to multiple targets with minimal platform-specific code.

---

## Deployment Targets

| Platform | Technology | Priority |
|----------|------------|----------|
| Web | Vercel / Railway / Netlify | MVP |
| PWA | Service Worker + Web Manifest | MVP |
| iOS | Capacitor wrapper | Post-MVP |
| Android | Capacitor wrapper | Post-MVP |

---

## Strategy: Progressive Web App First

The recommended approach is to build the web application with PWA capabilities from the start, then wrap it with Capacitor for native app store distribution. This provides the best balance of development speed, code reuse, and native capabilities.

**Why PWA + Capacitor:**

Capacitor is Ionic's native runtime that wraps web applications in a native shell. It provides access to native APIs (camera, filesystem, push notifications) while allowing the core application to remain a standard React web app. Unlike React Native, there is no need to rewrite components or maintain separate codebases.

The application logic, components, and styling remain identical across all platforms. Only platform-specific features (app store metadata, native API calls, splash screens) require additional configuration.

---

## Part 1: Web Deployment

### Hosting Options

**Vercel (Recommended for MVP)**

Vercel provides zero-configuration deployment for React applications with automatic HTTPS, global CDN, and preview deployments for pull requests.

Configuration file (`vercel.json`):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Railway (Recommended for Full-Stack)**

Railway supports both frontend and backend deployment with managed PostgreSQL. Better suited when running Express backend alongside the React frontend.

**Environment Variables:**
```
DATABASE_URL=postgresql://...
VITE_MAPTILER_API_KEY=...
VITE_API_URL=https://api.o-10.com
NODE_ENV=production
```

### Build Configuration

Vite production build configuration (`vite.config.ts`):
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          map: ['maplibre-gl'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-tabs'],
        },
      },
    },
  },
});
```

### API Deployment

The Express backend can be deployed separately or alongside the frontend depending on hosting choice.

**Separate Deployment (Recommended):**
- Frontend: Vercel at `o-10.com`
- Backend: Railway at `api.o-10.com`
- Database: Neon PostgreSQL

**Monolithic Deployment:**
- Both frontend and backend on Railway
- API routes served from same origin

---

## Part 2: Progressive Web App (PWA)

### PWA Configuration

PWA capabilities enable the application to be installed on mobile devices directly from the browser, work offline for cached content, and receive push notifications.

**Required Files:**

1. Web App Manifest (`public/manifest.json`):
```json
{
  "name": "Archangel",
  "short_name": "Archangel",
  "description": "US Manufacturing Workforce Intelligence Platform",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#60A5FA",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/map-view.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Map View showing US manufacturing facilities"
    },
    {
      "src": "/screenshots/mobile-view.png",
      "sizes": "750x1334",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Mobile view of factory details"
    }
  ]
}
```

2. HTML Meta Tags (`index.html`):
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  
  <!-- PWA Meta Tags -->
  <meta name="theme-color" content="#60A5FA" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Archangel" />
  
  <!-- Icons -->
  <link rel="icon" type="image/png" href="/icons/icon-32x32.png" />
  <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
  
  <!-- Manifest -->
  <link rel="manifest" href="/manifest.json" />
  
  <title>Archangel</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

3. Service Worker (`public/sw.js`):
```javascript
const CACHE_NAME = 'archangel-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/data/us-states.geojson',
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // API requests: Network only, no caching
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Map tiles: Cache with network fallback
  if (url.hostname.includes('maptiler') || url.hostname.includes('tiles')) {
    event.respondWith(
      caches.open('map-tiles').then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetched = fetch(event.request).then((response) => {
            cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetched;
        });
      })
    );
    return;
  }
  
  // Static assets: Cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
```

4. Service Worker Registration (`src/main.tsx`):
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// Register service worker for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('SW registered:', registration.scope);
      },
      (error) => {
        console.log('SW registration failed:', error);
      }
    );
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### PWA Build Plugin

Use `vite-plugin-pwa` for automated service worker generation:

```bash
npm install vite-plugin-pwa -D
```

Updated Vite configuration:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png', 'data/*.geojson'],
      manifest: {
        name: 'Archangel',
        short_name: 'Archangel',
        description: 'US Manufacturing Workforce Intelligence Platform',
        theme_color: '#60A5FA',
        background_color: '#0a0a0f',
        display: 'standalone',
        icons: [
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.maptiler\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
```

### PWA Testing

Test PWA functionality using Chrome DevTools:

1. Open DevTools → Application → Service Workers
2. Verify service worker is registered and active
3. Test offline mode using Network tab → Offline checkbox
4. Test installation using Application → Manifest → "Add to Home Screen"

Lighthouse PWA audit should score 100 on all PWA criteria.

---

## Part 3: Native Mobile Apps with Capacitor

### Capacitor Setup

Capacitor wraps the web application in a native shell for iOS and Android distribution.

**Installation:**
```bash
npm install @capacitor/core @capacitor/cli
npx cap init Archangel com.o10.archangel --web-dir dist
npm install @capacitor/ios @capacitor/android
```

**Configuration (`capacitor.config.ts`):**
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.o10.archangel',
  appName: 'Archangel',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // For development, point to local server:
    // url: 'http://192.168.1.100:5173',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0f',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a0f',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
```

### Native Platform Setup

**Add Platforms:**
```bash
# Build web app first
npm run build

# Add iOS (requires macOS with Xcode)
npx cap add ios

# Add Android (requires Android Studio)
npx cap add android
```

**Sync and Open:**
```bash
# After any web build, sync to native projects
npx cap sync

# Open in native IDE
npx cap open ios
npx cap open android
```

### iOS Configuration

**Required: Apple Developer Account** ($99/year)

Files to configure in `ios/App/App/`:

1. `Info.plist` additions:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Archangel uses your location to show nearby manufacturing facilities.</string>

<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

2. App Icons: Place icon files in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

3. Splash Screen: Configure in `ios/App/App/Assets.xcassets/Splash.imageset/`

**Build for TestFlight:**
```bash
npx cap sync ios
# Open Xcode
npx cap open ios
# In Xcode: Product → Archive → Distribute App → App Store Connect
```

### Android Configuration

**Required: Google Play Developer Account** ($25 one-time)

Files to configure in `android/app/`:

1. `src/main/AndroidManifest.xml` permissions:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

2. App Icons: Place in `src/main/res/mipmap-*/`

3. Splash Screen: Configure in `src/main/res/drawable/splash.xml`

**Build for Play Store:**
```bash
npx cap sync android
# Open Android Studio
npx cap open android
# In Android Studio: Build → Generate Signed Bundle / APK
```

### Native Plugins

Capacitor plugins provide access to native device capabilities:

**Geolocation** (for "Find facilities near me"):
```bash
npm install @capacitor/geolocation
npx cap sync
```

Usage in React:
```typescript
import { Geolocation } from '@capacitor/geolocation';

const getCurrentPosition = async () => {
  const position = await Geolocation.getCurrentPosition();
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
};
```

**Share** (for sharing factory links):
```bash
npm install @capacitor/share
npx cap sync
```

Usage:
```typescript
import { Share } from '@capacitor/share';

const shareFactory = async (factory: Factory) => {
  await Share.share({
    title: factory.name,
    text: `Check out ${factory.name} on Archangel`,
    url: `https://o-10.com/factories/${factory.id}`,
  });
};
```

**App** (for handling deep links):
```bash
npm install @capacitor/app
npx cap sync
```

---

## Part 4: Platform-Specific Considerations

### Safe Area Handling

Mobile devices have notches, home indicators, and status bars that can obscure content. Use CSS environment variables:

```css
/* globals.css */
:root {
  --safe-area-inset-top: env(safe-area-inset-top, 0px);
  --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-inset-left: env(safe-area-inset-left, 0px);
  --safe-area-inset-right: env(safe-area-inset-right, 0px);
}

/* Apply to layout */
.app-container {
  padding-top: var(--safe-area-inset-top);
  padding-bottom: var(--safe-area-inset-bottom);
  padding-left: var(--safe-area-inset-left);
  padding-right: var(--safe-area-inset-right);
}

/* Fixed bottom navigation */
.bottom-nav {
  padding-bottom: calc(16px + var(--safe-area-inset-bottom));
}
```

### Platform Detection

Detect platform for conditional rendering:

```typescript
// lib/platform.ts
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const isIOS = Capacitor.getPlatform() === 'ios';
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isWeb = Capacitor.getPlatform() === 'web';

export const isMobile = () => {
  if (isNative) return true;
  return window.matchMedia('(max-width: 768px)').matches;
};
```

### Navigation Patterns

Mobile apps typically use bottom navigation instead of top navigation:

```typescript
// Conditional navigation based on platform
const Navigation = () => {
  const mobile = isMobile();
  
  if (mobile) {
    return <BottomNav />;
  }
  
  return <TopNav />;
};
```

### Touch vs Click

Ensure all interactive elements have appropriate touch targets (minimum 44x44px on iOS, 48x48dp on Android):

```css
/* Minimum touch target */
.touchable {
  min-height: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Increase tap area without changing visual size */
.tap-target::before {
  content: '';
  position: absolute;
  top: -8px;
  right: -8px;
  bottom: -8px;
  left: -8px;
}
```

### Back Button Handling (Android)

Android hardware back button needs explicit handling:

```typescript
import { App } from '@capacitor/app';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const useAndroidBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    const handler = App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        navigate(-1);
      } else if (location.pathname !== '/map') {
        navigate('/map');
      } else {
        App.exitApp();
      }
    });
    
    return () => {
      handler.remove();
    };
  }, [navigate, location]);
};
```

---

## Part 5: Deployment Pipeline

### Development Workflow

```bash
# Local development (web)
npm run dev

# Build and test PWA
npm run build
npm run preview

# Test on iOS Simulator
npm run build
npx cap sync ios
npx cap open ios

# Test on Android Emulator
npm run build
npx cap sync android
npx cap open android
```

### CI/CD Pipeline

GitHub Actions workflow for automated deployment:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          VITE_MAPTILER_API_KEY: ${{ secrets.MAPTILER_API_KEY }}
          VITE_API_URL: ${{ secrets.API_URL }}
      
      - name: Deploy to Vercel
        uses: vercel/action@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  build-mobile:
    runs-on: macos-latest
    needs: deploy-web
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build web
        run: npm run build
        env:
          VITE_MAPTILER_API_KEY: ${{ secrets.MAPTILER_API_KEY }}
          VITE_API_URL: ${{ secrets.API_URL }}
      
      - name: Sync Capacitor
        run: npx cap sync
      
      # iOS build would continue with Fastlane or manual steps
      # Android build would use Gradle
```

### Release Checklist

**Before Web Release:**
- [ ] All tests passing
- [ ] Lighthouse score > 90 on all categories
- [ ] PWA manifest valid
- [ ] Service worker functioning
- [ ] Environment variables configured

**Before App Store Release:**
- [ ] Web build complete and tested
- [ ] Capacitor synced
- [ ] App icons in all required sizes
- [ ] Splash screens configured
- [ ] Privacy policy URL valid
- [ ] App Store Connect metadata complete (iOS)
- [ ] Google Play Console listing complete (Android)
- [ ] Version number incremented

---

## Part 6: App Store Requirements

### iOS App Store

**Required Assets:**
- App Icon: 1024x1024px PNG (no transparency, no rounded corners)
- Screenshots: At minimum for iPhone 6.5" (1284x2778) and iPad 12.9" (2048x2732)
- Privacy Policy URL
- Support URL

**Required Metadata:**
- App Name (30 characters max)
- Subtitle (30 characters max)
- Description (4000 characters max)
- Keywords (100 characters max)
- Category: Business or Productivity
- Age Rating: 4+

**Review Guidelines Compliance:**
- No placeholder content
- All features must function
- Login not required for core functionality (Archangel is read-only, so no issue)
- Content must be appropriate for selected age rating

### Google Play Store

**Required Assets:**
- App Icon: 512x512px PNG
- Feature Graphic: 1024x500px
- Screenshots: At minimum 2 phone screenshots
- Privacy Policy URL

**Required Metadata:**
- App Name (50 characters max)
- Short Description (80 characters max)
- Full Description (4000 characters max)
- Category: Business
- Content Rating: Complete questionnaire

**Policy Compliance:**
- Declare all permissions with justification
- Data safety form completed
- No deceptive behavior

---

## Asset Checklist

### Icon Sizes Required

**PWA:**
- 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512

**iOS:**
- 20x20, 29x29, 40x40, 60x60, 76x76, 83.5x83.5, 1024x1024 (App Store)
- @2x and @3x variants for each

**Android:**
- mdpi (48x48), hdpi (72x72), xhdpi (96x96), xxhdpi (144x144), xxxhdpi (192x192)
- 512x512 (Play Store)

### Splash Screen Sizes

**iOS:**
- Various sizes for different device classes (handled by Xcode storyboard)
- Recommended: Use single vector or large PNG that scales

**Android:**
- mdpi (320x480), hdpi (480x800), xhdpi (720x1280), xxhdpi (1080x1920), xxxhdpi (1440x2560)

---

## Summary

The deployment strategy follows this priority order:

1. **MVP**: Deploy web application to Vercel with PWA capabilities enabled. Users can install from browser.

2. **Post-MVP**: Wrap with Capacitor and submit to iOS App Store and Google Play Store. The same codebase serves all platforms.

3. **Ongoing**: Maintain single codebase with platform-specific adjustments only where necessary (safe areas, native plugins, back button handling).

This approach minimizes development overhead while providing native app store presence and the benefits of installable PWA for users who prefer not to use app stores.
