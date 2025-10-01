# Capacitor Native Configuration

This document provides instructions for configuring the iOS and Android native projects for Zebby's World mobile apps.

## Prerequisites

- Xcode 15+ (for iOS development)
- Android Studio (for Android development)
- Node.js 18+ installed
- Capacitor CLI installed (`@capacitor/cli` in package.json)

## Build & Sync Commands

### 1. Build the web app
```bash
npm run build
```

### 2. Sync web assets to native projects
```bash
npx cap sync
```

### 3. Open native IDEs
```bash
npx cap open ios      # Opens Xcode
npx cap open android  # Opens Android Studio
```

---

## iOS Configuration

### App-Bound Domains (Required for Service Workers)

App-Bound Domains restrict WebView navigation to specific domains, enabling service workers in iOS WKWebView.

**Steps:**
1. Open the iOS project in Xcode: `npx cap open ios`
2. Select the `App` target in the project navigator
3. Go to the **Signing & Capabilities** tab
4. Click **+ Capability** and add **App-Bound Domains**
5. Add the domain: `www.zebbysworld.com`

**Info.plist configuration:**
```xml
<key>WKAppBoundDomains</key>
<array>
    <string>www.zebbysworld.com</string>
</array>
```

### Associated Domains (Deep Links)

Associated Domains enable universal links for deep linking from web to app.

**Steps:**
1. In the **Signing & Capabilities** tab, add **Associated Domains**
2. Add the domain with `applinks:` prefix:
   - `applinks:www.zebbysworld.com`

**Info.plist configuration:**
```xml
<key>com.apple.developer.associated-domains</key>
<array>
    <string>applinks:www.zebbysworld.com</string>
</array>
```

### Push Notifications (APNs)

**Steps:**
1. In the **Signing & Capabilities** tab, add **Push Notifications**
2. Ensure you have a valid Apple Developer account and provisioning profile
3. In Apple Developer Portal:
   - Create an APNs certificate or key
   - Configure the App ID with Push Notifications capability
   - Download the certificate/key for your backend server

### Deep Link Routes

The following routes support deep links:
- `/symptom-tracker` - Log symptoms
- `/groups` - Browse groups
- `/chat` - AI chat assistant
- `/settings/export` - Export health data

**App Delegate (AppDelegate.swift):**
```swift
import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    // Handle universal links
    func application(_ application: UIApplication, 
                    continue userActivity: NSUserActivity,
                    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb {
            let url = userActivity.webpageURL!
            // Capacitor will handle the URL
            ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
            return true
        }
        return false
    }
}
```

---

## Android Configuration

### Android Scheme

The `capacitor.config.ts` already sets `androidScheme: 'https'` to enable secure communication.

### Intent Filters (Deep Links)

Add intent filters to handle deep links and app links.

**File:** `android/app/src/main/AndroidManifest.xml`

```xml
<activity
    android:name=".MainActivity"
    android:exported="true"
    android:launchMode="singleTask"
    android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
    android:theme="@style/AppTheme.NoActionBarLaunch">

    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>

    <!-- HTTPS App Links -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="https"
            android:host="www.zebbysworld.com"
            android:pathPrefix="/symptom-tracker" />
        <data
            android:scheme="https"
            android:host="www.zebbysworld.com"
            android:pathPrefix="/groups" />
        <data
            android:scheme="https"
            android:host="www.zebbysworld.com"
            android:pathPrefix="/chat" />
        <data
            android:scheme="https"
            android:host="www.zebbysworld.com"
            android:pathPrefix="/settings/export" />
    </intent-filter>

    <!-- Custom Scheme (zebby://) -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="zebby" />
    </intent-filter>

</activity>
```

### Push Notifications (FCM)

**Prerequisites:**
- Firebase project created
- `google-services.json` downloaded from Firebase Console

**Steps:**
1. Add `google-services.json` to `android/app/` directory
2. Open Android Studio: `npx cap open android`
3. Add Firebase Cloud Messaging dependency (if not auto-added by Capacitor)

**File:** `android/app/build.gradle`
```gradle
dependencies {
    // ... other dependencies
    implementation 'com.google.firebase:firebase-messaging:23.0.0'
}

apply plugin: 'com.google.gms.google-services'
```

**File:** `android/build.gradle` (project-level)
```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.3.15'
    }
}
```

---

## Testing Deep Links

### iOS
```bash
# Test universal link
xcrun simctl openurl booted "https://www.zebbysworld.com/symptom-tracker"
```

### Android
```bash
# Test HTTPS app link
adb shell am start -a android.intent.action.VIEW -d "https://www.zebbysworld.com/groups"

# Test custom scheme
adb shell am start -a android.intent.action.VIEW -d "zebby://symptom-tracker"
```

---

## Push Notification Testing

### Server-Side Setup

The device token is automatically captured and sent to `POST /api/devices` when the user:
1. Opens the app for the first time
2. Grants push notification permission
3. Is authenticated

**Expected server log:**
```
[PUSH] Device registered: platform=ios, user=47937326..., token=a1b2c3d4e5f6...
```

### Testing Push Notifications

**iOS (APNs):**
- Use a physical device (simulator doesn't support push)
- Send test notification from Apple Developer Portal or your backend

**Android (FCM):**
- Use Firebase Console > Cloud Messaging > Send test message
- Or send via your backend using the FCM server key

---

## Production Deployment

### iOS
1. Configure App-Bound Domains for production domain
2. Update Associated Domains for production domain
3. Configure APNs certificates for production
4. Archive and upload to App Store Connect

### Android
1. Configure App Links verification file at `https://www.zebbysworld.com/.well-known/assetlinks.json`
2. Configure FCM for production
3. Build signed APK/AAB
4. Upload to Google Play Console

---

## Troubleshooting

### Service Worker not working in iOS
- Verify App-Bound Domains is configured
- Check domain matches exactly (no http://, just domain)
- Ensure domain is in Info.plist

### Deep links not opening app
- Verify Associated Domains (iOS) / Intent Filters (Android)
- Check URL scheme matches exactly
- Test with device, not always reliable in simulator/emulator

### Push notifications not received
- Verify permissions granted by user
- Check device token is registered with server
- Confirm APNs/FCM configuration is correct
- Check server logs for push send attempts

---

## Development Workflow

1. Make changes to web app
2. Build: `npm run build`
3. Sync: `npx cap sync`
4. Open IDE and run: `npx cap open ios` or `npx cap open android`
5. Build and run from Xcode/Android Studio

**Live reload (optional):**
```bash
npm run dev
```

Then update `capacitor.config.ts`:
```typescript
server: {
  url: 'http://YOUR_LOCAL_IP:5000',
  cleartext: true
}
```

And run `npx cap sync` to enable live reload during development.
