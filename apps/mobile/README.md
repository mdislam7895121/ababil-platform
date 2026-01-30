# Platform Factory Mobile App

Native mobile app for Platform Factory built with Expo and React Native.

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- iOS: Xcode 14+ (macOS only)
- Android: Android Studio with SDK

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

## Environment Configuration

The app supports three environments configured in `src/config.ts`:

| Environment | API URL | Use Case |
|-------------|---------|----------|
| development | http://localhost:5000 | Local development |
| staging | https://staging-api.platform.app | Pre-release testing |
| production | https://api.platform.app | Production release |

Environment is set via `app.json > extra > environment` or build profiles in `eas.json`.

## EAS Build

### Prerequisites

1. Create an Expo account at https://expo.dev
2. Login to EAS: `eas login`
3. Configure project ID in `app.json > extra > eas > projectId`

### Build Commands

```bash
# Development build (includes dev client)
npm run build:android  # eas build --platform android
npm run build:ios      # eas build --platform ios

# Preview build (internal testing)
npm run build:preview  # eas build --profile preview

# Production build (store release)
eas build --profile production --platform all
```

### Build Profiles

| Profile | Distribution | Use Case |
|---------|-------------|----------|
| development | internal | Dev client, simulator support |
| preview | internal | Internal testing with APK |
| production | store | App Store / Play Store release |

## Deep Linking

The app supports deep links via the `platformfactory://` scheme:

| URL Pattern | Screen | Description |
|-------------|--------|-------------|
| `platformfactory://preview/<token>` | Preview | Opens live preview session |
| `platformfactory://invite/<token>` | Invite | Opens workspace invite |
| `platformfactory://login` | Login | Redirects to login screen |

### Testing Deep Links

```bash
# iOS Simulator
xcrun simctl openurl booted "platformfactory://preview/abc123"

# Android Emulator
adb shell am start -W -a android.intent.action.VIEW -d "platformfactory://preview/abc123"
```

## Push Notifications

### Setup

1. Install dependencies (already included):
   - expo-notifications
   - expo-device

2. Configure `app.json` with notification settings (already configured)

3. For iOS: Enable Push Notifications capability in Xcode

4. For Android: Add `google-services.json` from Firebase Console

### Token Registration

The app automatically registers push tokens with the backend on login via:
- POST `/api/push/register` with `{ expoPushToken, deviceInfo }`

### Testing Notifications

1. Enable notifications in Settings tab
2. Use "Send Test Notification" button (admin only)
3. Or call backend: `POST /api/push/test`

## Store Submission Checklist

### Both Platforms

- [ ] Update `app.json` version and build number
- [ ] Replace placeholder icons in `assets/`
- [ ] Add splash screen image
- [ ] Configure privacy policy URL
- [ ] Add terms of service URL

### iOS (App Store)

- [ ] Bundle identifier: `com.platformfactory.app`
- [ ] Configure Apple Developer account in EAS
- [ ] Add required app screenshots
- [ ] Complete App Store Connect metadata
- [ ] Enable capabilities: Push Notifications, Associated Domains
- [ ] Add App Tracking Transparency prompt if tracking users

### Android (Google Play)

- [ ] Package name: `com.platformfactory.app`
- [ ] Configure Google Play Console in EAS
- [ ] Add `google-services.json` for FCM
- [ ] Complete Play Store listing
- [ ] Add required screenshots
- [ ] Configure signing keystore
- [ ] Add privacy policy

## Required Permissions

| Permission | Platform | Purpose |
|------------|----------|---------|
| RECEIVE_BOOT_COMPLETED | Android | Receive notifications after reboot |
| VIBRATE | Android | Notification vibration |
| Push Notifications | iOS | Remote notifications |

## Secure Storage

The app uses `expo-secure-store` for sensitive data:

| Key | Description |
|-----|-------------|
| auth_token | JWT access token |
| refresh_token | JWT refresh token |
| auth_user | User profile JSON |
| tenant_id | Current tenant ID |
| expo_push_token | Push notification token |
| pending_deep_link | Stored deep link for post-login |

All data is cleared on logout via `auth.logout()`.

## Project Structure

```
apps/mobile/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation screens
│   ├── preview/           # Deep link preview screen
│   ├── invite/            # Deep link invite screen
│   └── _layout.tsx        # Root layout with providers
├── src/
│   ├── api.ts             # API client
│   ├── auth.ts            # Secure storage helpers
│   ├── config.ts          # Environment config
│   ├── linking.ts         # Deep link handling
│   └── notifications.ts   # Push notification setup
├── assets/                # Images and icons
├── app.json               # Expo config
├── eas.json               # EAS Build profiles
└── package.json           # Dependencies
```

## Troubleshooting

### Push notifications not working

1. Ensure physical device (simulator won't receive)
2. Check notification permissions
3. Verify token registration with backend
4. Check Expo push service status

### Deep links not opening app

1. Verify scheme in `app.json`
2. Rebuild app after scheme changes
3. Check URL format matches expected patterns

### Build failures

1. Clear Expo cache: `expo start -c`
2. Delete node_modules and reinstall
3. Check EAS build logs for details
