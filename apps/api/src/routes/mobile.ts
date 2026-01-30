import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireRole } from '../middleware/auth.js';
import { 
  mobileDraftLimiter, 
  mobileApproveLimiter, 
  mobileGenerateLimiter,
  mobilePublishCredentialsLimiter,
  mobilePublishStartLimiter,
  mobilePublishJobsListLimiter
} from '../middleware/rateLimit.js';
import { logAudit } from '../lib/audit.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { redactObject, safeLog } from '../lib/redact.js';
import { createWriteStream, createReadStream, mkdirSync, existsSync, statSync, unlinkSync, rmSync, writeFileSync } from 'fs';
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

    await logAudit({
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

    await logAudit({
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

      const actualTarget = target || spec.target || 'expo';
      const zipFilename = `${actualTarget}-app-${buildJob.id}.zip`;
      const zipPath = join(MOBILE_BUILD_DIR, zipFilename);
      const downloadUrl = `/api/mobile/download/${buildJob.id}`;

      if (actualTarget === 'flutter') {
        await generateFlutterProject(zipPath, spec);
      } else if (actualTarget === 'flutterflow') {
        await generateFlutterFlowProject(zipPath, spec);
      } else {
        await generateExpoProject(zipPath, spec);
      }

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

      await logAudit({
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'MOBILE_PROJECT_GENERATE',
        entityType: 'mobile_build_job',
        entityId: buildJob.id,
        metadata: { appName: spec.appName, target: actualTarget }
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

      res.status(500).json({ error: 'Failed to generate mobile project' });
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

async function generateFlutterProject(zipPath: string, spec: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    const projectName = spec.appName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const screens = spec.screens as Array<{ name: string; path: string; description: string }>;
    const features = spec.features as string[];

    archive.append(`name: ${projectName}
description: ${spec.appName} - Generated by Platform Factory
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  cupertino_icons: ^1.0.6
  go_router: ^13.0.0
  flutter_secure_storage: ^9.0.0
  provider: ^6.1.1
  http: ^1.1.0
  intl: ^0.18.1

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
  generate: true
`, { name: `${projectName}/pubspec.yaml` });

    archive.append(`import 'package:flutter/material.dart';
import 'routes.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: '${spec.appName}',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      darkTheme: ThemeData.dark(useMaterial3: true),
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
`, { name: `${projectName}/lib/main.dart` });

    const routeEntries = screens.map(s => {
      const routeName = s.name.toLowerCase().replace(/\s+/g, '_');
      const routePath = s.path.replace(/\(tabs\)\//g, '').replace(/\[(\w+)\]/g, ':$1');
      return `    GoRoute(
      path: '${routePath === '/(tabs)/index' ? '/' : '/' + routeName}',
      builder: (context, state) => const ${s.name.replace(/\s+/g, '')}Screen(),
    ),`;
    }).join('\n');

    archive.append(`import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/preview_screen.dart';

final router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const HomeScreen(),
    ),
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsScreen(),
    ),
    GoRoute(
      path: '/preview/:token',
      builder: (context, state) => PreviewScreen(token: state.pathParameters['token'] ?? ''),
    ),
    GoRoute(
      path: '/invite/:token',
      builder: (context, state) => PreviewScreen(token: state.pathParameters['token'] ?? ''),
    ),
  ],
);
`, { name: `${projectName}/lib/routes.dart` });

    archive.append(`import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('${spec.appName}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'Welcome to ${spec.appName}',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => context.push('/login'),
              child: const Text('Login'),
            ),
          ],
        ),
      ),
    );
  }
}
`, { name: `${projectName}/lib/screens/home_screen.dart` });

    archive.append(`import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _storage = const FlutterSecureStorage();
  bool _loading = false;

  Future<void> _handleLogin() async {
    if (_emailController.text.isEmpty || _passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in all fields')),
      );
      return;
    }

    setState(() => _loading = true);
    
    try {
      await _storage.write(key: 'auth_token', value: 'demo_token');
      if (mounted) {
        context.go('/');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Login failed: \$e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(
                labelText: 'Email',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _passwordController,
              decoration: const InputDecoration(
                labelText: 'Password',
                border: OutlineInputBorder(),
              ),
              obscureText: true,
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _handleLogin,
                child: _loading
                    ? const CircularProgressIndicator()
                    : const Text('Login'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
`, { name: `${projectName}/lib/screens/login_screen.dart` });

    archive.append(`import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _storage = const FlutterSecureStorage();
  bool _darkMode = false;

  Future<void> _handleLogout() async {
    await _storage.delete(key: 'auth_token');
    if (mounted) {
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          SwitchListTile(
            title: const Text('Dark Mode'),
            value: _darkMode,
            onChanged: (value) => setState(() => _darkMode = value),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Logout', style: TextStyle(color: Colors.red)),
            onTap: _handleLogout,
          ),
        ],
      ),
    );
  }
}
`, { name: `${projectName}/lib/screens/settings_screen.dart` });

    archive.append(`import 'package:flutter/material.dart';

class PreviewScreen extends StatelessWidget {
  final String token;
  
  const PreviewScreen({super.key, required this.token});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Preview')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'Preview Mode',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text('Token: \$token', style: const TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
`, { name: `${projectName}/lib/screens/preview_screen.dart` });

    archive.append(`import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthService {
  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'auth_token';

  static Future<String?> getToken() async {
    return await _storage.read(key: _tokenKey);
  }

  static Future<void> setToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
  }

  static Future<void> removeToken() async {
    await _storage.delete(key: _tokenKey);
  }

  static Future<bool> isAuthenticated() async {
    final token = await getToken();
    return token != null && token.isNotEmpty;
  }

  static Future<Map<String, String>> getAuthHeaders() async {
    final token = await getToken();
    if (token != null) {
      return {'Authorization': 'Bearer \$token'};
    }
    return {};
  }
}
`, { name: `${projectName}/lib/services/auth_service.dart` });

    archive.append(`arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
`, { name: `${projectName}/l10n.yaml` });

    archive.append(`{
  "@@locale": "en",
  "appTitle": "${spec.appName}",
  "@appTitle": {
    "description": "The title of the application"
  },
  "login": "Login",
  "logout": "Logout",
  "settings": "Settings",
  "darkMode": "Dark Mode",
  "welcome": "Welcome"
}
`, { name: `${projectName}/lib/l10n/app_en.arb` });

    archive.append(`# ${spec.appName}

Generated by Platform Factory Mobile Builder (Flutter).

## Features
${features.map((f: string) => `- ${f}`).join('\n')}

## Screens
${screens.map((s: { name: string; path: string; description: string }) => `- **${s.name}**: ${s.description}`).join('\n')}

## Quick Start

\`\`\`bash
cd ${projectName}
flutter pub get
flutter run
\`\`\`

## Build for Production

\`\`\`bash
flutter build apk --release
flutter build ios --release
\`\`\`

## Deep Linking

The app supports deep links with the scheme: \`platformfactory://\`

Examples:
- \`platformfactory://preview/abc123\`
- \`platformfactory://invite/xyz789\`
`, { name: `${projectName}/README_MOBILE.md` });

    archive.append(`include: package:flutter_lints/flutter.yaml

linter:
  rules:
    prefer_const_constructors: true
    prefer_const_declarations: true
`, { name: `${projectName}/analysis_options.yaml` });

    archive.finalize();
  });
}

async function generateFlutterFlowProject(zipPath: string, spec: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    const projectName = spec.appName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const screens = spec.screens as Array<{ name: string; path: string; description: string }>;
    const features = spec.features as string[];

    const pages = screens.map((s, index) => ({
      id: `page_${index + 1}`,
      name: s.name.replace(/\s+/g, ''),
      path: s.path.replace(/\(tabs\)\//g, '').replace(/\[(\w+)\]/g, ':$1'),
      description: s.description,
      isHomePage: index === 0,
      widgets: [
        {
          id: `widget_${index + 1}_scaffold`,
          type: 'Scaffold',
          properties: {
            appBar: {
              title: s.name,
              backgroundColor: '#007AFF'
            }
          }
        },
        {
          id: `widget_${index + 1}_body`,
          type: 'Column',
          properties: {
            mainAxisAlignment: 'center',
            crossAxisAlignment: 'center'
          },
          children: [
            {
              id: `widget_${index + 1}_text`,
              type: 'Text',
              properties: {
                text: s.name,
                fontSize: 24,
                fontWeight: 'bold'
              }
            }
          ]
        }
      ]
    }));

    const navRoutes = screens.map((s, index) => ({
      pageId: `page_${index + 1}`,
      path: s.path.replace(/\(tabs\)\//g, '').replace(/\[(\w+)\]/g, ':$1'),
      name: s.name.replace(/\s+/g, ''),
      parameters: s.path.includes('[') ? [{ name: 'token', type: 'String' }] : []
    }));

    const components = [
      {
        id: 'comp_auth_button',
        name: 'AuthButton',
        type: 'Component',
        properties: {
          text: 'Login',
          onPressed: { action: 'navigate', target: '/login' }
        }
      },
      {
        id: 'comp_nav_bar',
        name: 'BottomNavBar',
        type: 'Component',
        properties: {
          items: [
            { icon: 'home', label: 'Home', route: '/' },
            { icon: 'settings', label: 'Settings', route: '/settings' }
          ]
        }
      }
    ];

    const featureFlags = features.reduce((acc, f) => {
      const key = f.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      acc[key] = true;
      return acc;
    }, {} as Record<string, boolean>);

    const exportJson = {
      version: '1.0.0',
      projectName: spec.appName,
      bundleId: spec.bundleId,
      createdAt: new Date().toISOString(),
      generator: 'Platform Factory Mobile Builder',
      target: 'flutterflow',
      theme: {
        primaryColor: '#007AFF',
        secondaryColor: '#5856D6',
        backgroundColor: '#FFFFFF',
        textColor: '#000000',
        fontFamily: 'Roboto'
      },
      navigation: {
        type: 'go_router',
        routes: navRoutes,
        initialRoute: '/'
      },
      pages,
      components,
      features: featureFlags,
      assets: {
        images: [],
        fonts: [],
        icons: ['material_icons']
      },
      integrations: {
        authentication: features.includes('Authentication'),
        analytics: features.includes('Analytics Integration'),
        pushNotifications: features.includes('Push Notifications'),
        payments: features.includes('Payment Processing')
      },
      localization: {
        enabled: features.includes('Multi-Language Support') || features.includes('i18n'),
        defaultLocale: 'en',
        supportedLocales: ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi']
      }
    };

    archive.append(JSON.stringify(exportJson, null, 2), { name: `${projectName}/export.json` });

    archive.append(`# ${spec.appName} - FlutterFlow Import

Generated by Platform Factory Mobile Builder.

## Import Instructions

1. Open FlutterFlow (https://flutterflow.io)
2. Create a new project or open an existing one
3. Go to Settings > Import/Export
4. Select "Import from JSON"
5. Upload the \`export.json\` file from this package

## What's Included

### Pages
${pages.map(p => `- **${p.name}** (${p.path}): ${p.description}`).join('\n')}

### Components
${components.map(c => `- **${c.name}**: ${c.type}`).join('\n')}

### Features
${features.map((f: string) => `- ${f}`).join('\n')}

### Theme
- Primary Color: #007AFF
- Secondary Color: #5856D6
- Font Family: Roboto

## After Import

1. Review the imported pages and components
2. Connect your backend API (Firebase, Supabase, or custom)
3. Set up authentication if enabled
4. Configure push notifications
5. Test on both iOS and Android simulators
6. Deploy using FlutterFlow's built-in deployment

## Deep Linking

The project is configured for deep links with scheme: \`platformfactory://\`

## Support

For issues with the import, please contact Platform Factory support.
`, { name: `${projectName}/README_FLUTTERFLOW.md` });

    archive.append(JSON.stringify({
      images: [],
      fonts: [],
      icons: ['material_icons'],
      customAssets: []
    }, null, 2), { name: `${projectName}/assets_manifest.json` });

    archive.finalize();
  });
}

// ============================================================================
// MOBILE PUBLISH PIPELINE
// ============================================================================

const MOBILE_PUBLISH_LOGS_DIR = '/tmp/mobile-publish-logs';
const PUBLISH_JOB_EXPIRY_HOURS = 72;

const VALID_CREDENTIAL_TYPES = [
  'apple_api_key',
  'apple_cert',
  'android_keystore',
  'play_service_account',
  'expo_token'
] as const;

const VALID_TARGETS = ['expo', 'flutter', 'flutterflow'] as const;
const VALID_PLATFORMS = ['ios', 'android', 'both'] as const;

// Ensure logs directory exists
if (!existsSync(MOBILE_PUBLISH_LOGS_DIR)) {
  mkdirSync(MOBILE_PUBLISH_LOGS_DIR, { recursive: true });
}

// POST /api/mobile/publish/credentials - Store encrypted credentials
router.post('/publish/credentials', mobilePublishCredentialsLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { type, name, data } = req.body;

    if (!type || !VALID_CREDENTIAL_TYPES.includes(type)) {
      res.status(400).json({ 
        error: 'Invalid credential type', 
        validTypes: VALID_CREDENTIAL_TYPES 
      });
      return;
    }

    if (!name || typeof name !== 'string' || name.length < 1) {
      res.status(400).json({ error: 'Credential name is required' });
      return;
    }

    if (!data || typeof data !== 'string' || data.length < 10) {
      res.status(400).json({ error: 'Credential data is required and must be at least 10 characters' });
      return;
    }

    // Encrypt the credential data
    const encryptedData = encrypt(data);

    // Upsert credential (one per type per tenant)
    const credential = await prisma.mobilePublishCredential.upsert({
      where: {
        tenantId_type: {
          tenantId,
          type
        }
      },
      create: {
        tenantId,
        type,
        name,
        encryptedData
      },
      update: {
        name,
        encryptedData,
        updatedAt: new Date()
      }
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'MOBILE_PUBLISH_CREDENTIAL_STORED',
      entityType: 'mobile_publish_credential',
      entityId: credential.id,
      metadata: { 
        type,
        name,
        // Never log actual credential data
      }
    });

    safeLog('info', `[MobilePublish] Credential stored type=${type} tenant=${tenantId}`);

    res.json({
      id: credential.id,
      type: credential.type,
      name: credential.name,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt
    });
  } catch (error: any) {
    safeLog('error', '[MobilePublish] Credential storage failed', { error: error.message });
    res.status(500).json({ error: 'Failed to store credential' });
  }
});

// GET /api/mobile/publish/credentials/status - Check what credentials are configured
router.get('/publish/credentials/status', mobilePublishCredentialsLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const credentials = await prisma.mobilePublishCredential.findMany({
      where: { tenantId },
      select: {
        id: true,
        type: true,
        name: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const credentialMap: Record<string, { configured: boolean; name?: string; updatedAt?: Date }> = {};
    
    for (const type of VALID_CREDENTIAL_TYPES) {
      const cred = credentials.find(c => c.type === type);
      credentialMap[type] = cred 
        ? { configured: true, name: cred.name, updatedAt: cred.updatedAt }
        : { configured: false };
    }

    // Calculate what's missing per target
    const missing: Record<string, string[]> = {
      expo: [],
      flutter: [],
      flutterflow: []
    };

    // Expo needs: expo_token (optional), apple_api_key (for iOS), android_keystore (for Android)
    if (!credentialMap.expo_token?.configured) missing.expo.push('expo_token');
    if (!credentialMap.apple_api_key?.configured) missing.expo.push('apple_api_key');
    if (!credentialMap.android_keystore?.configured) missing.expo.push('android_keystore');

    // Flutter needs: apple_cert (for iOS), android_keystore (for Android), play_service_account (for Play Store)
    if (!credentialMap.apple_cert?.configured) missing.flutter.push('apple_cert');
    if (!credentialMap.android_keystore?.configured) missing.flutter.push('android_keystore');
    if (!credentialMap.play_service_account?.configured) missing.flutter.push('play_service_account');

    // FlutterFlow: primarily visual builder, needs same as flutter for actual publishing
    if (!credentialMap.apple_cert?.configured) missing.flutterflow.push('apple_cert');
    if (!credentialMap.android_keystore?.configured) missing.flutterflow.push('android_keystore');

    res.json({
      credentials: credentialMap,
      missing,
      readyFor: {
        expo: missing.expo.length === 0,
        flutter: missing.flutter.length === 0,
        flutterflow: missing.flutterflow.length === 0
      }
    });
  } catch (error: any) {
    safeLog('error', '[MobilePublish] Credentials status check failed', { error: error.message });
    res.status(500).json({ error: 'Failed to check credentials status' });
  }
});

// DELETE /api/mobile/publish/credentials/:type - Delete a credential
router.delete('/publish/credentials/:type', mobilePublishCredentialsLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { type } = req.params;

    if (!VALID_CREDENTIAL_TYPES.includes(type as any)) {
      res.status(400).json({ error: 'Invalid credential type' });
      return;
    }

    const deleted = await prisma.mobilePublishCredential.deleteMany({
      where: { tenantId, type }
    });

    if (deleted.count === 0) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'MOBILE_PUBLISH_CREDENTIAL_DELETED',
      entityType: 'mobile_publish_credential',
      entityId: type,
      metadata: { type }
    });

    res.json({ success: true, deletedCount: deleted.count });
  } catch (error: any) {
    safeLog('error', '[MobilePublish] Credential deletion failed', { error: error.message });
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

// POST /api/mobile/publish/start - Start a publish job
router.post('/publish/start', mobilePublishStartLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { target, platform, specId, stage = 'build', channel = 'preview' } = req.body;

    if (!target || !VALID_TARGETS.includes(target)) {
      res.status(400).json({ 
        error: 'Invalid target', 
        validTargets: VALID_TARGETS 
      });
      return;
    }

    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      res.status(400).json({ 
        error: 'Invalid platform', 
        validPlatforms: VALID_PLATFORMS 
      });
      return;
    }

    const validStages = ['build', 'submit'];
    if (!validStages.includes(stage)) {
      res.status(400).json({
        error: 'Invalid stage',
        validStages
      });
      return;
    }

    const validChannels = ['preview', 'production'];
    if (!validChannels.includes(channel)) {
      res.status(400).json({
        error: 'Invalid channel',
        validChannels
      });
      return;
    }

    // Check if required credentials are configured
    const credentials = await prisma.mobilePublishCredential.findMany({
      where: { tenantId },
      select: { type: true }
    });
    const configuredTypes = credentials.map(c => c.type);

    const requiredCreds: string[] = [];
    if (target === 'expo') {
      requiredCreds.push('expo_token');
      if (platform === 'ios' || platform === 'both') requiredCreds.push('apple_api_key');
    } else if (target === 'flutter' || target === 'flutterflow') {
      if (platform === 'ios' || platform === 'both') requiredCreds.push('apple_cert');
      if (platform === 'android' || platform === 'both') {
        requiredCreds.push('android_keystore');
        if (stage === 'submit') requiredCreds.push('play_service_account');
      }
    }

    const missingCreds = requiredCreds.filter(r => !configuredTypes.includes(r));
    if (missingCreds.length > 0) {
      res.status(400).json({
        error: 'Missing required credentials',
        missing: missingCreds,
        hint: 'Please configure all required credentials before starting a publish job'
      });
      return;
    }

    // Determine provider based on target
    let provider = 'local';
    if (target === 'expo') provider = 'eas';
    else if (target === 'flutter') provider = 'flutter_local';
    else if (target === 'flutterflow') provider = 'flutterflow';

    // Create logs file
    const jobIdPrefix = `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const logsPath = join(MOBILE_PUBLISH_LOGS_DIR, `${jobIdPrefix}.log`);
    const initialLog = `[${new Date().toISOString()}] Job ${jobIdPrefix} created for ${target}/${platform} (stage=${stage}, channel=${channel})\n`;
    writeFileSync(logsPath, initialLog);

    // Create the publish job
    const expiresAt = new Date(Date.now() + PUBLISH_JOB_EXPIRY_HOURS * 60 * 60 * 1000);
    
    const job = await prisma.mobilePublishJob.create({
      data: {
        tenantId,
        specId: specId || null,
        target,
        platform,
        stage,
        provider,
        channel,
        status: 'queued',
        logsPath,
        logs: initialLog,
        expiresAt
      }
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'MOBILE_PUBLISH_JOB_ENQUEUED',
      entityType: 'mobile_publish_job',
      entityId: job.id,
      metadata: { target, platform, stage, channel, provider }
    });

    // If runner is enabled, it will pick up the job automatically
    // Otherwise, use /run-now endpoint or the fallback inline runner
    const runnerEnabled = process.env.MOBILE_PUBLISH_RUNNER_ENABLED === 'true';
    
    if (!runnerEnabled) {
      // Fallback: run job inline (async) when runner is disabled
      setTimeout(async () => {
        try {
          const { runJobNow } = await import('../jobs/mobilePublishRunner');
          await runJobNow(job.id);
        } catch (err: any) {
          safeLog('error', '[MobilePublish] Inline runner error', { error: err.message });
        }
      }, 100);
    }

    safeLog('info', `[MobilePublish] Job enqueued id=${job.id} target=${target} stage=${stage} runner=${runnerEnabled ? 'background' : 'inline'}`);

    res.json({
      id: job.id,
      target: job.target,
      platform: job.platform,
      stage: job.stage,
      provider: job.provider,
      channel: job.channel,
      status: job.status,
      expiresAt: job.expiresAt,
      createdAt: job.createdAt
    });
  } catch (error: any) {
    safeLog('error', '[MobilePublish] Job start failed', { error: error.message });
    res.status(500).json({ error: 'Failed to start publish job' });
  }
});

// GET /api/mobile/publish/jobs - List publish jobs for tenant
router.get('/publish/jobs', mobilePublishJobsListLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [jobs, total] = await Promise.all([
      prisma.mobilePublishJob.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          artifacts: true
        }
      }),
      prisma.mobilePublishJob.count({ where: { tenantId } })
    ]);

    res.json({
      jobs: jobs.map(j => ({
        id: j.id,
        target: j.target,
        platform: j.platform,
        stage: j.stage,
        provider: j.provider,
        channel: j.channel,
        status: j.status,
        error: j.error,
        artifacts: j.artifacts.map(a => ({
          id: a.id,
          kind: a.kind,
          path: a.path,
          url: a.url,
          size: a.size,
          expiresAt: a.expiresAt
        })),
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        expiresAt: j.expiresAt,
        createdAt: j.createdAt
      })),
      total,
      limit,
      offset
    });
  } catch (error: any) {
    safeLog('error', '[MobilePublish] Jobs list failed', { error: error.message });
    res.status(500).json({ error: 'Failed to list publish jobs' });
  }
});

// GET /api/mobile/publish/jobs/:id - Get job details
router.get('/publish/jobs/:id', mobilePublishJobsListLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const job = await prisma.mobilePublishJob.findFirst({
      where: { id, tenantId },
      include: {
        artifacts: true
      }
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // Read logs if available
    let logs = '';
    if (job.logsPath && existsSync(job.logsPath)) {
      const { readFileSync } = await import('fs');
      logs = readFileSync(job.logsPath, 'utf-8');
    }

    // Prefer DB logs, fallback to file
    let logContent = job.logs || '';
    if (!logContent && job.logsPath && existsSync(job.logsPath)) {
      logContent = logs;
    }

    res.json({
      id: job.id,
      target: job.target,
      platform: job.platform,
      stage: job.stage,
      provider: job.provider,
      channel: job.channel,
      status: job.status,
      error: job.error,
      logs: logContent,
      artifacts: job.artifacts.map(a => ({
        id: a.id,
        kind: a.kind,
        path: a.path,
        url: a.url,
        checksum: a.checksum,
        size: a.size,
        metadata: a.metadata,
        expiresAt: a.expiresAt,
        createdAt: a.createdAt
      })),
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  } catch (error: any) {
    safeLog('error', '[MobilePublish] Job detail failed', { error: error.message });
    res.status(500).json({ error: 'Failed to get job details' });
  }
});

// POST /api/mobile/publish/jobs/:id/cancel - Cancel a publish job
router.post('/publish/jobs/:id/cancel', mobilePublishJobsListLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { id } = req.params;

    const job = await prisma.mobilePublishJob.findFirst({
      where: { id, tenantId }
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') {
      res.status(400).json({ error: `Cannot cancel job with status: ${job.status}` });
      return;
    }

    const updatedJob = await prisma.mobilePublishJob.update({
      where: { id },
      data: {
        status: 'canceled',
        completedAt: new Date()
      }
    });

    // Append to logs
    if (job.logsPath && existsSync(job.logsPath)) {
      writeFileSync(job.logsPath, `[${new Date().toISOString()}] Job canceled by user\n`, { flag: 'a' });
    }

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'MOBILE_PUBLISH_JOB_CANCELED',
      entityType: 'mobile_publish_job',
      entityId: id,
      metadata: { previousStatus: job.status }
    });

    res.json({
      id: updatedJob.id,
      status: updatedJob.status,
      canceledAt: updatedJob.completedAt
    });
  } catch (error: any) {
    safeLog('error', '[MobilePublish] Job cancel failed', { error: error.message });
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// GET /api/mobile/publish/jobs/:id/logs - Get job logs (admin only)
router.get('/publish/jobs/:id/logs', mobilePublishJobsListLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const { lines = '200' } = req.query;

    const job = await prisma.mobilePublishJob.findFirst({
      where: { id, tenantId },
      select: { id: true, logs: true, logsPath: true }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let logContent = job.logs || '';

    // If logs stored in file, read from file
    if (!logContent && job.logsPath && existsSync(job.logsPath)) {
      logContent = readFileSync(job.logsPath, 'utf-8');
    }

    // Limit to last N lines
    const maxLines = Math.min(parseInt(lines as string, 10) || 200, 500);
    const logLines = logContent.split('\n');
    const trimmedLogs = logLines.slice(-maxLines).join('\n');

    res.json({
      jobId: job.id,
      lines: logLines.length,
      logs: trimmedLogs
    });
  } catch (error: any) {
    safeLog('error', '[MobilePublish] Get logs failed', { error: error.message });
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

// POST /api/mobile/publish/jobs/:id/run-now - Trigger immediate job execution (admin only)
router.post('/publish/jobs/:id/run-now', mobilePublishStartLimiter, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { id } = req.params;

    const job = await prisma.mobilePublishJob.findFirst({
      where: { id, tenantId }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'queued') {
      return res.status(400).json({ 
        error: 'Job is not in queued status',
        currentStatus: job.status
      });
    }

    // Import runner dynamically to avoid circular deps
    const { runJobNow } = await import('../jobs/mobilePublishRunner');
    const result = await runJobNow(id);

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'MOBILE_PUBLISH_JOB_RUN_NOW',
      entityType: 'mobile_publish_job',
      entityId: id,
      metadata: { result }
    });

    res.json({
      jobId: id,
      triggered: result.success,
      message: result.message
    });
  } catch (error: any) {
    safeLog('error', '[MobilePublish] Run-now failed', { error: error.message });
    res.status(500).json({ error: 'Failed to trigger job' });
  }
});

export const mobileRoutes = router;
