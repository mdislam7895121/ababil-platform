import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireRole } from '../middleware/auth.js';
import { mobileDraftLimiter, mobileApproveLimiter, mobileGenerateLimiter } from '../middleware/rateLimit.js';
import { logAudit } from '../lib/audit.js';
import { createWriteStream, createReadStream, mkdirSync, existsSync, statSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import archiver from 'archiver';

const router = Router();
const prisma = new PrismaClient();

const MOBILE_BUILD_DIR = '/tmp/mobile-builds';
const EXPO_EXPIRY_HOURS = 24;
const MAX_PROMPT_LENGTH = 4000;

const FORBIDDEN_PATTERNS = [
  /malware/i,
  /hack(ing|er)?/i,
  /exploit/i,
  /phishing/i,
  /ransomware/i,
  /keylogger/i,
  /trojan/i,
  /illegal/i
];

function validatePromptContent(prompt: string): { valid: boolean; error?: string } {
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(prompt)) {
      return { valid: false, error: 'Prompt contains prohibited content' };
    }
  }

  return { valid: true };
}

function sanitizePromptForStorage(prompt: string): string {
  return prompt
    .replace(/\b\d{16}\b/g, '[REDACTED_CARD]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\b(?:password|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi, '[REDACTED_SECRET]');
}

function extractAppName(prompt: string): string {
  const patterns = [
    /(?:app|application)\s+(?:called|named)\s+["']?([a-zA-Z0-9\s]+)["']?/i,
    /(?:called|named)\s+["']?([a-zA-Z0-9\s]+)["']?\s+(?:app|application)/i,
    /["']([a-zA-Z0-9\s]+)["']\s+(?:app|application)/i,
    /(?:build|create|make)\s+(?:a|an)?\s*([a-zA-Z]+)\s+(?:app|application)/i
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match) {
      return match[1].trim().replace(/\s+/g, '');
    }
  }

  const words = prompt.split(/\s+/).filter(w => w.length > 3);
  const typeWords = ['booking', 'fitness', 'food', 'delivery', 'chat', 'social', 'shop', 'store', 'health', 'travel', 'music', 'photo', 'video', 'task', 'note', 'calendar'];
  for (const word of words) {
    if (typeWords.includes(word.toLowerCase())) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() + 'App';
    }
  }

  return 'MyExpoApp';
}

function extractFeatures(prompt: string): string[] {
  const featureMap: Record<string, string[]> = {
    'login|auth|sign[- ]?in|sign[- ]?up': ['Authentication', 'User Profile'],
    'book|reservation|appointment': ['Booking System', 'Calendar'],
    'pay|stripe|checkout|purchase': ['Payment Processing', 'Order History'],
    'chat|message|dm|inbox': ['Real-time Chat', 'Push Notifications'],
    'map|location|gps|navigate': ['Location Services', 'Maps Integration'],
    'camera|photo|image|gallery': ['Camera Access', 'Image Gallery'],
    'push|notif': ['Push Notifications'],
    'settings|preferences': ['User Settings'],
    'dark|theme': ['Dark Mode', 'Theme Switching'],
    'offline|cache': ['Offline Mode', 'Data Caching'],
    'search|filter': ['Search', 'Filters'],
    'share|social': ['Social Sharing'],
    'analytics|track': ['Analytics Integration'],
    'bengali|hindi|spanish|french|arabic|chinese|multi[- ]?lang': ['Multi-Language Support', 'i18n'],
  };

  const features: string[] = [];
  const promptLower = prompt.toLowerCase();

  for (const [pattern, feats] of Object.entries(featureMap)) {
    if (new RegExp(pattern, 'i').test(promptLower)) {
      features.push(...feats);
    }
  }

  return [...new Set(features)];
}

function extractScreens(prompt: string, features: string[]): Array<{ name: string; path: string; description: string }> {
  const screens: Array<{ name: string; path: string; description: string }> = [];

  screens.push({ name: 'Home', path: '/(tabs)/index', description: 'Main landing screen' });

  if (features.includes('Authentication')) {
    screens.push({ name: 'Login', path: '/login', description: 'User authentication screen' });
  }

  if (features.includes('User Settings')) {
    screens.push({ name: 'Settings', path: '/(tabs)/settings', description: 'App settings and preferences' });
  }

  if (features.includes('User Profile')) {
    screens.push({ name: 'Profile', path: '/(tabs)/profile', description: 'User profile management' });
  }

  if (features.includes('Booking System')) {
    screens.push({ name: 'Bookings', path: '/(tabs)/bookings', description: 'View and manage bookings' });
    screens.push({ name: 'New Booking', path: '/booking/new', description: 'Create a new booking' });
  }

  if (features.includes('Payment Processing')) {
    screens.push({ name: 'Checkout', path: '/checkout', description: 'Payment processing screen' });
  }

  if (features.includes('Real-time Chat')) {
    screens.push({ name: 'Messages', path: '/(tabs)/messages', description: 'Chat inbox' });
    screens.push({ name: 'Conversation', path: '/chat/[id]', description: 'Individual chat conversation' });
  }

  screens.push({ name: 'Preview', path: '/preview/[token]', description: 'Preview mode screen' });
  screens.push({ name: 'Invite', path: '/invite/[token]', description: 'Invite link handler' });

  return screens;
}

function extractEnvRequirements(features: string[]): Array<{ key: string; description: string; required: boolean }> {
  const envReqs: Array<{ key: string; description: string; required: boolean }> = [];

  envReqs.push({ key: 'EXPO_PUBLIC_API_URL', description: 'Backend API URL', required: true });

  if (features.includes('Payment Processing')) {
    envReqs.push({ key: 'STRIPE_PUBLISHABLE_KEY', description: 'Stripe public key for payments', required: true });
  }

  if (features.includes('Push Notifications')) {
    envReqs.push({ key: 'EXPO_PUBLIC_PUSH_PROJECT_ID', description: 'Expo push notification project ID', required: false });
  }

  if (features.includes('Maps Integration')) {
    envReqs.push({ key: 'GOOGLE_MAPS_API_KEY', description: 'Google Maps API key', required: true });
  }

  if (features.includes('Analytics Integration')) {
    envReqs.push({ key: 'ANALYTICS_API_KEY', description: 'Analytics service API key', required: false });
  }

  return envReqs;
}

function extractWarnings(prompt: string, features: string[]): string[] {
  const warnings: string[] = [];

  if (features.includes('Payment Processing')) {
    warnings.push('Payment processing requires PCI compliance review before production');
  }

  if (features.includes('Location Services')) {
    warnings.push('Location services require user permission and privacy policy disclosure');
  }

  if (features.includes('Camera Access')) {
    warnings.push('Camera access requires user permission');
  }

  if (features.length > 8) {
    warnings.push('Complex feature set may require extended development timeline');
  }

  return warnings;
}

function generateBundleId(appName: string, tenantId: string): string {
  const sanitized = appName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const shortTenant = tenantId.slice(0, 8);
  return `com.platformfactory.${sanitized}.${shortTenant}`;
}

router.post('/spec/draft', mobileDraftLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { prompt, target = 'expo' } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const validation = validatePromptContent(prompt);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const sanitizedPrompt = sanitizePromptForStorage(prompt);
    const appName = extractAppName(prompt);
    const features = extractFeatures(prompt);
    const screens = extractScreens(prompt, features);
    const envRequirements = extractEnvRequirements(features);
    const warnings = extractWarnings(prompt, features);
    const bundleId = generateBundleId(appName, req.tenantId!);

    const spec = await prisma.mobileAppSpec.create({
      data: {
        tenantId: req.tenantId!,
        createdByUserId: req.user!.id,
        prompt: sanitizedPrompt,
        target,
        appName,
        bundleId,
        features,
        screens,
        envRequirements,
        warnings,
        status: 'draft'
      }
    });

    await logAudit(prisma, {
      tenantId: req.tenantId!,
      actorUserId: req.user!.id,
      action: 'MOBILE_SPEC_DRAFT',
      entityType: 'mobile_app_spec',
      entityId: spec.id,
      metadata: { appName, target, featureCount: features.length }
    });

    res.json({
      id: spec.id,
      status: spec.status,
      target: spec.target,
      appName: spec.appName,
      bundleId: spec.bundleId,
      features: spec.features,
      screens: spec.screens,
      envRequirements: spec.envRequirements,
      warnings: spec.warnings,
      createdAt: spec.createdAt
    });
  } catch (error) {
    console.error('Mobile spec draft error:', error);
    res.status(500).json({ error: 'Failed to create mobile app specification' });
  }
});

router.post('/spec/approve', mobileApproveLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { specId } = req.body;

    if (!specId || typeof specId !== 'string') {
      res.status(400).json({ error: 'specId is required' });
      return;
    }

    const spec = await prisma.mobileAppSpec.findFirst({
      where: { id: specId, tenantId: req.tenantId! }
    });

    if (!spec) {
      res.status(404).json({ error: 'Mobile app specification not found' });
      return;
    }

    if (spec.status !== 'draft') {
      res.status(400).json({ error: `Spec is already ${spec.status}, cannot approve` });
      return;
    }

    const updated = await prisma.mobileAppSpec.update({
      where: { id: specId },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedByUserId: req.user!.id
      }
    });

    await logAudit(prisma, {
      tenantId: req.tenantId!,
      actorUserId: req.user!.id,
      action: 'MOBILE_SPEC_APPROVE',
      entityType: 'mobile_app_spec',
      entityId: spec.id,
      metadata: { appName: spec.appName }
    });

    res.json({
      id: updated.id,
      status: updated.status,
      approvedAt: updated.approvedAt,
      appName: updated.appName,
      bundleId: updated.bundleId
    });
  } catch (error) {
    console.error('Mobile spec approve error:', error);
    res.status(500).json({ error: 'Failed to approve mobile app specification' });
  }
});

router.post('/project/generate', mobileGenerateLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { approvedSpecId, target = 'expo' } = req.body;

    if (!approvedSpecId || typeof approvedSpecId !== 'string') {
      res.status(400).json({ error: 'approvedSpecId is required' });
      return;
    }

    const spec = await prisma.mobileAppSpec.findFirst({
      where: { id: approvedSpecId, tenantId: req.tenantId! }
    });

    if (!spec) {
      res.status(404).json({ error: 'Mobile app specification not found' });
      return;
    }

    if (spec.status !== 'approved') {
      res.status(400).json({ error: `Spec must be approved first (current status: ${spec.status})` });
      return;
    }

    const expiresAt = new Date(Date.now() + EXPO_EXPIRY_HOURS * 60 * 60 * 1000);

    const buildJob = await prisma.mobileBuildJob.create({
      data: {
        tenantId: req.tenantId!,
        specId: spec.id,
        target,
        status: 'building',
        expiresAt
      }
    });

    await prisma.mobileAppSpec.update({
      where: { id: spec.id },
      data: { status: 'generating' }
    });

    try {
      if (!existsSync(MOBILE_BUILD_DIR)) {
        mkdirSync(MOBILE_BUILD_DIR, { recursive: true });
      }

      const zipFilename = `expo-app-${buildJob.id}.zip`;
      const zipPath = join(MOBILE_BUILD_DIR, zipFilename);
      const downloadUrl = `/api/mobile/download/${buildJob.id}`;

      await generateExpoProject(zipPath, spec);

      await prisma.$transaction([
        prisma.mobileBuildJob.update({
          where: { id: buildJob.id },
          data: {
            status: 'completed',
            filePath: zipPath,
            downloadUrl,
            completedAt: new Date()
          }
        }),
        prisma.mobileAppSpec.update({
          where: { id: spec.id },
          data: { status: 'generated' }
        })
      ]);

      await logAudit(prisma, {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'MOBILE_PROJECT_GENERATE',
        entityType: 'mobile_build_job',
        entityId: buildJob.id,
        metadata: { appName: spec.appName, target }
      });

      res.json({
        jobId: buildJob.id,
        status: 'completed',
        downloadUrl,
        expiresAt
      });
    } catch (buildError) {
      console.error('Build generation error:', buildError);

      await prisma.$transaction([
        prisma.mobileBuildJob.update({
          where: { id: buildJob.id },
          data: { status: 'failed', error: String(buildError) }
        }),
        prisma.mobileAppSpec.update({
          where: { id: spec.id },
          data: { status: 'failed' }
        })
      ]);

      res.status(500).json({ error: 'Failed to generate Expo project' });
    }
  } catch (error) {
    console.error('Mobile project generate error:', error);
    res.status(500).json({ error: 'Failed to generate mobile project' });
  }
});

router.get('/download/:jobId', async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.mobileBuildJob.findFirst({
      where: { id: jobId, tenantId: req.tenantId! }
    });

    if (!job) {
      res.status(404).json({ error: 'Build job not found' });
      return;
    }

    if (job.status !== 'completed' || !job.filePath) {
      res.status(400).json({ error: 'Build not completed or file not available' });
      return;
    }

    if (new Date() > job.expiresAt) {
      res.status(410).json({ error: 'Download link has expired' });
      return;
    }

    if (!existsSync(job.filePath)) {
      res.status(404).json({ error: 'Build file not found' });
      return;
    }

    const stat = statSync(job.filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="expo-app-${jobId}.zip"`);

    const stream = createReadStream(job.filePath);
    stream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download build' });
  }
});

router.get('/specs', async (req: AuthRequest, res: Response) => {
  try {
    const specs = await prisma.mobileAppSpec.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ specs });
  } catch (error) {
    console.error('List specs error:', error);
    res.status(500).json({ error: 'Failed to list mobile app specifications' });
  }
});

router.get('/jobs', async (req: AuthRequest, res: Response) => {
  try {
    const jobs = await prisma.mobileBuildJob.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { spec: { select: { appName: true } } }
    });

    res.json({ jobs });
  } catch (error) {
    console.error('List jobs error:', error);
    res.status(500).json({ error: 'Failed to list build jobs' });
  }
});

async function generateExpoProject(zipPath: string, spec: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    const projectName = spec.appName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const screens = spec.screens as Array<{ name: string; path: string; description: string }>;
    const features = spec.features as string[];

    archive.append(JSON.stringify({
      name: projectName,
      slug: projectName,
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "automatic",
      scheme: "platformfactory",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      ios: {
        bundleIdentifier: spec.bundleId,
        supportsTablet: true,
        infoPlist: {
          CFBundleAllowMixedLocalizations: true
        }
      },
      android: {
        package: spec.bundleId,
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#ffffff"
        }
      },
      extra: {
        eas: { projectId: "YOUR_EAS_PROJECT_ID" }
      },
      plugins: [
        "expo-router",
        "expo-secure-store"
      ]
    }, null, 2), { name: `${projectName}/app.json` });

    archive.append(JSON.stringify({
      cli: { version: ">= 5.0.0" },
      build: {
        development: {
          developmentClient: true,
          distribution: "internal"
        },
        preview: {
          distribution: "internal"
        },
        production: {}
      },
      submit: {
        production: {}
      }
    }, null, 2), { name: `${projectName}/eas.json` });

    archive.append(JSON.stringify({
      name: projectName,
      version: "1.0.0",
      main: "expo-router/entry",
      scripts: {
        start: "expo start",
        android: "expo start --android",
        ios: "expo start --ios",
        web: "expo start --web"
      },
      dependencies: {
        "expo": "~50.0.0",
        "expo-router": "~3.4.0",
        "expo-secure-store": "~12.8.0",
        "expo-linking": "~6.2.0",
        "react": "18.2.0",
        "react-native": "0.73.0"
      },
      devDependencies: {
        "@babel/core": "^7.20.0",
        "typescript": "^5.3.0"
      }
    }, null, 2), { name: `${projectName}/package.json` });

    archive.append(`# ${spec.appName}

Generated by Platform Factory Mobile Builder.

## Features
${features.map((f: string) => `- ${f}`).join('\n')}

## Screens
${screens.map((s: { name: string; path: string; description: string }) => `- **${s.name}** (\`${s.path}\`): ${s.description}`).join('\n')}

## Quick Start

\`\`\`bash
cd ${projectName}
npm install
npx expo start
\`\`\`

## Environment Variables

Create a \`.env\` file with the following variables:

\`\`\`
${(spec.envRequirements as any[]).map((e: any) => `${e.key}=${e.required ? 'REQUIRED' : 'optional'} # ${e.description}`).join('\n')}
\`\`\`

## Build for Production

\`\`\`bash
npx eas build --platform all
\`\`\`

## Deep Linking

The app supports deep links with the scheme: \`platformfactory://\`

Examples:
- \`platformfactory://preview/abc123\`
- \`platformfactory://invite/xyz789\`
`, { name: `${projectName}/README_MOBILE.md` });

    archive.append(`import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="preview/[token]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="invite/[token]" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
`, { name: `${projectName}/app/_layout.tsx` });

    archive.append(`import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>${spec.appName}</Text>
      <Text style={styles.subtitle}>Welcome to your app</Text>
      <Link href="/login" style={styles.link}>
        <Text style={styles.linkText}>Login</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 24 },
  link: { backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  linkText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});
`, { name: `${projectName}/app/(tabs)/index.tsx` });

    archive.append(`import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} />
        }}
      />
    </Tabs>
  );
}
`, { name: `${projectName}/app/(tabs)/_layout.tsx` });

    archive.append(`import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export default function SettingsScreen() {
  const [darkMode, setDarkMode] = useState(false);

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('auth_token');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Dark Mode</Text>
        <Switch value={darkMode} onValueChange={setDarkMode} />
      </View>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  label: { fontSize: 16 },
  logoutButton: { marginTop: 32, backgroundColor: '#ff3b30', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});
`, { name: `${projectName}/app/(tabs)/settings.tsx` });

    archive.append(`import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(\`\${process.env.EXPO_PUBLIC_API_URL}/api/auth/login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        await SecureStore.setItemAsync('auth_token', data.token);
        router.replace('/(tabs)');
      } else {
        Alert.alert('Error', data.error || 'Login failed');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Login'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 32, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16 },
  button: { backgroundColor: '#007AFF', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});
`, { name: `${projectName}/app/login.tsx` });

    archive.append(`import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

export default function PreviewScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Text style={styles.title}>Preview Mode</Text>
          <Text style={styles.subtitle}>Token: {token}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' }
});
`, { name: `${projectName}/app/preview/[token].tsx` });

    archive.append(`import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [status, setStatus] = useState('Processing invite...');

  useEffect(() => {
    const processInvite = async () => {
      try {
        await SecureStore.setItemAsync('invite_token', token || '');
        setStatus('Invite accepted!');
        setTimeout(() => router.replace('/(tabs)'), 1500);
      } catch {
        setStatus('Failed to process invite');
      }
    };
    processInvite();
  }, [token]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  status: { marginTop: 16, fontSize: 16, color: '#666' }
});
`, { name: `${projectName}/app/invite/[token].tsx` });

    archive.append(`import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: \`Bearer \${token}\` } : {};
}
`, { name: `${projectName}/lib/auth.ts` });

    archive.append(`import * as Linking from 'expo-linking';

export const linking = {
  prefixes: [Linking.createURL('/'), 'platformfactory://'],
  config: {
    screens: {
      '(tabs)': {
        screens: {
          index: '',
          settings: 'settings'
        }
      },
      login: 'login',
      'preview/[token]': 'preview/:token',
      'invite/[token]': 'invite/:token'
    }
  }
};
`, { name: `${projectName}/lib/linking.ts` });

    archive.append(`{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
`, { name: `${projectName}/tsconfig.json` });

    archive.append(`module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo']
  };
};
`, { name: `${projectName}/babel.config.js` });

    archive.finalize();
  });
}

export const mobileRoutes = router;
