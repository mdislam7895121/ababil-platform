import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { decrypt } from '../lib/crypto';
import { safeLog } from '../lib/redact';
import { logAudit } from '../lib/audit';

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = parseInt(process.env.MOBILE_PUBLISH_POLL_INTERVAL || '30000', 10);
const MAX_LOG_LINES = 200;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;

let isRunning = false;
let pollTimeout: NodeJS.Timeout | null = null;

export function startMobilePublishRunner(): void {
  if (process.env.MOBILE_PUBLISH_RUNNER_ENABLED !== 'true') {
    console.log('[MobilePublishRunner] Disabled (MOBILE_PUBLISH_RUNNER_ENABLED != true)');
    return;
  }

  if (isRunning) {
    console.log('[MobilePublishRunner] Already running');
    return;
  }

  isRunning = true;
  console.log('[MobilePublishRunner] Started, polling every', POLL_INTERVAL_MS, 'ms');
  pollForJobs();
}

export function stopMobilePublishRunner(): void {
  isRunning = false;
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
  console.log('[MobilePublishRunner] Stopped');
}

async function pollForJobs(): Promise<void> {
  if (!isRunning) return;

  try {
    const job = await claimNextJob();
    if (job) {
      await executeJob(job);
    }
  } catch (error) {
    safeLog('error', '[MobilePublishRunner] Poll error:', error);
  }

  if (isRunning) {
    pollTimeout = setTimeout(pollForJobs, POLL_INTERVAL_MS);
  }
}

async function claimNextJob(): Promise<any | null> {
  // Use atomic updateMany with status check to prevent race conditions
  const candidates = await prisma.mobilePublishJob.findMany({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });

  for (const candidate of candidates) {
    // Atomic claim: only update if status is still queued
    const result = await prisma.mobilePublishJob.updateMany({
      where: { 
        id: candidate.id,
        status: 'queued', // Atomic check prevents double-claim
      },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });

    if (result.count > 0) {
      // Successfully claimed - update logs and return
      const claimed = await prisma.mobilePublishJob.update({
        where: { id: candidate.id },
        data: {
          logs: appendLog('', `[${new Date().toISOString()}] Job claimed by runner`),
        },
      });
      return claimed;
    }
    // If count is 0, another runner claimed it - try next candidate
  }

  return null;
}

async function executeJob(job: any): Promise<void> {
  const startTime = Date.now();
  let logs = job.logs || '';

  try {
    logs = appendLog(logs, `[${new Date().toISOString()}] Starting ${job.target}/${job.platform} ${job.stage} job`);
    await updateJobLogs(job.id, logs);

    await logAudit({
      tenantId: job.tenantId,
      actorUserId: undefined,
      action: 'MOBILE_PUBLISH_JOB_STARTED',
      entityType: 'mobile_publish_job',
      entityId: job.id,
      metadata: { target: job.target, platform: job.platform, stage: job.stage },
    });

    let result: JobResult;

    switch (job.target) {
      case 'expo':
        result = await executeExpoJob(job, logs);
        break;
      case 'flutter':
        result = await executeFlutterJob(job, logs);
        break;
      case 'flutterflow':
        result = await executeFlutterFlowJob(job, logs);
        break;
      default:
        result = { success: false, logs: appendLog(logs, `Unknown target: ${job.target}`), error: 'Unknown target' };
    }

    const isCancelled = await checkIfCancelled(job.id);
    if (isCancelled) {
      logs = appendLog(result.logs, `[${new Date().toISOString()}] Job was cancelled`);
      await prisma.mobilePublishJob.update({
        where: { id: job.id },
        data: { status: 'canceled', logs, completedAt: new Date() },
      });
      await logAudit({
        tenantId: job.tenantId,
        actorUserId: undefined,
        action: 'MOBILE_PUBLISH_JOB_CANCELLED',
        entityType: 'mobile_publish_job',
        entityId: job.id,
        metadata: {},
      });
      return;
    }

    const elapsed = Date.now() - startTime;
    logs = appendLog(result.logs, `[${new Date().toISOString()}] Job ${result.success ? 'completed' : 'failed'} in ${elapsed}ms`);

    await prisma.mobilePublishJob.update({
      where: { id: job.id },
      data: {
        status: result.success ? 'completed' : 'failed',
        logs,
        error: result.error || null,
        completedAt: new Date(),
      },
    });

    await logAudit({
      tenantId: job.tenantId,
      actorUserId: undefined,
      action: result.success ? 'MOBILE_PUBLISH_JOB_COMPLETED' : 'MOBILE_PUBLISH_JOB_FAILED',
      entityType: 'mobile_publish_job',
      entityId: job.id,
      metadata: { elapsed, error: result.error },
    });

  } catch (error: any) {
    logs = appendLog(logs, `[${new Date().toISOString()}] Fatal error: ${error.message}`);
    await prisma.mobilePublishJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        logs,
        error: error.message,
        completedAt: new Date(),
      },
    });

    await logAudit({
      tenantId: job.tenantId,
      actorUserId: undefined,
      action: 'MOBILE_PUBLISH_JOB_FAILED',
      entityType: 'mobile_publish_job',
      entityId: job.id,
      metadata: { error: error.message },
    });
  }
}

interface JobResult {
  success: boolean;
  logs: string;
  error?: string;
  artifacts?: Array<{ kind: string; path?: string; url?: string; metadata?: any }>;
}

async function executeExpoJob(job: any, logs: string): Promise<JobResult> {
  logs = appendLog(logs, `[${new Date().toISOString()}] Expo ${job.stage} execution started`);

  const credentials = await prisma.mobilePublishCredential.findFirst({
    where: { tenantId: job.tenantId, type: 'expo_token' },
  });

  if (!credentials) {
    return {
      success: false,
      logs: appendLog(logs, 'ERROR: Expo token not configured. Please add expo_token credential.'),
      error: 'Missing expo_token credential',
    };
  }

  let expoToken: string;
  try {
    expoToken = decrypt(credentials.encryptedData);
  } catch (e) {
    return {
      success: false,
      logs: appendLog(logs, 'ERROR: Failed to decrypt expo token'),
      error: 'Credential decryption failed',
    };
  }

  logs = appendLog(logs, 'Expo token validated (value redacted)');

  if (job.stage === 'build') {
    logs = appendLog(logs, `Preparing EAS build for platform: ${job.platform}`);
    logs = appendLog(logs, 'Checking for EAS CLI availability...');

    const easAvailable = await checkCommandAvailable('npx', ['eas', '--version']);

    if (!easAvailable.available) {
      logs = appendLog(logs, 'EAS CLI check result: Not available in this environment');
      logs = appendLog(logs, 'SIMULATING EAS BUILD (no real toolchain)');

      const buildUrl = `https://expo.dev/accounts/tenant-${job.tenantId.slice(0, 8)}/projects/app/builds/${job.id}`;

      await createArtifact(job.id, 'eas_build_url', null, buildUrl, { simulated: true });
      logs = appendLog(logs, `EAS Build URL (simulated): ${buildUrl}`);

      return {
        success: true,
        logs: appendLog(logs, 'Build stage completed (simulated - real EAS requires toolchain)'),
      };
    }

    logs = appendLog(logs, `EAS CLI available: ${easAvailable.version}`);

    const buildResult = await runCommand(
      'npx',
      ['eas', 'build', '--platform', job.platform, '--profile', job.channel, '--non-interactive', '--json'],
      { EXPO_TOKEN: expoToken },
      JOB_TIMEOUT_MS
    );

    logs = appendLog(logs, buildResult.output);

    if (!buildResult.success) {
      return {
        success: false,
        logs: appendLog(logs, `EAS build failed: ${buildResult.error}`),
        error: buildResult.error,
      };
    }

    try {
      const buildData = JSON.parse(buildResult.output);
      if (buildData.id) {
        await createArtifact(job.id, 'eas_build_url', null, `https://expo.dev/builds/${buildData.id}`, { buildId: buildData.id });
      }
    } catch (e) {
      logs = appendLog(logs, 'Could not parse EAS build output as JSON');
    }

    return { success: true, logs };
  }

  if (job.stage === 'submit') {
    logs = appendLog(logs, `Preparing EAS submit for platform: ${job.platform}`);

    const submitResult = await runCommand(
      'npx',
      ['eas', 'submit', '--platform', job.platform, '--profile', job.channel, '--non-interactive'],
      { EXPO_TOKEN: expoToken },
      JOB_TIMEOUT_MS
    );

    logs = appendLog(logs, submitResult.output);

    if (!submitResult.success) {
      return {
        success: false,
        logs: appendLog(logs, `EAS submit failed: ${submitResult.error}`),
        error: submitResult.error,
      };
    }

    await createArtifact(job.id, 'submit_receipt', null, null, { submitted: true, platform: job.platform });

    return { success: true, logs };
  }

  return { success: false, logs, error: `Unknown stage: ${job.stage}` };
}

async function executeFlutterJob(job: any, logs: string): Promise<JobResult> {
  logs = appendLog(logs, `[${new Date().toISOString()}] Flutter ${job.stage} execution started`);

  const flutterAvailable = await checkCommandAvailable('flutter', ['--version']);

  if (!flutterAvailable.available) {
    logs = appendLog(logs, 'Flutter SDK not available in this environment');
    logs = appendLog(logs, 'SIMULATING Flutter build (no real toolchain)');

    if (job.stage === 'build') {
      const artifactPath = `/tmp/builds/${job.id}/app-release.${job.platform === 'android' ? 'aab' : 'ipa'}`;
      await createArtifact(job.id, job.platform === 'android' ? 'aab' : 'ipa', artifactPath, null, { simulated: true });
      logs = appendLog(logs, `Artifact path (simulated): ${artifactPath}`);

      return {
        success: true,
        logs: appendLog(logs, 'Flutter build completed (simulated - install Flutter SDK for real builds)'),
      };
    }

    if (job.stage === 'submit') {
      return {
        success: false,
        logs: appendLog(logs, 'Submit requires build artifacts and valid credentials'),
        error: 'Flutter SDK not available for submit',
      };
    }
  }

  logs = appendLog(logs, `Flutter SDK available: ${flutterAvailable.version}`);

  if (job.stage === 'build') {
    logs = appendLog(logs, 'Running flutter pub get...');
    const pubGetResult = await runCommand('flutter', ['pub', 'get'], {}, 120000);
    logs = appendLog(logs, pubGetResult.output);

    if (!pubGetResult.success) {
      return { success: false, logs, error: 'flutter pub get failed' };
    }

    const buildArgs = job.platform === 'android'
      ? ['build', 'appbundle', '--release']
      : ['build', 'ios', '--release', '--no-codesign'];

    logs = appendLog(logs, `Running flutter ${buildArgs.join(' ')}...`);
    const buildResult = await runCommand('flutter', buildArgs, {}, JOB_TIMEOUT_MS);
    logs = appendLog(logs, buildResult.output);

    if (!buildResult.success) {
      return { success: false, logs, error: 'Flutter build failed' };
    }

    const artifactPath = job.platform === 'android'
      ? 'build/app/outputs/bundle/release/app-release.aab'
      : 'build/ios/iphoneos/Runner.app';

    await createArtifact(job.id, job.platform === 'android' ? 'aab' : 'ipa', artifactPath, null, {});

    return { success: true, logs };
  }

  if (job.stage === 'submit') {
    logs = appendLog(logs, 'Submit stage for Flutter requires fastlane or API integration');
    logs = appendLog(logs, 'Checking for play_service_account credential...');

    const playCredential = await prisma.mobilePublishCredential.findFirst({
      where: { tenantId: job.tenantId, type: 'play_service_account' },
    });

    if (!playCredential) {
      return {
        success: false,
        logs: appendLog(logs, 'ERROR: play_service_account credential required for Android submit'),
        error: 'Missing play_service_account credential',
      };
    }

    logs = appendLog(logs, 'Play service account found (simulating submit)');
    await createArtifact(job.id, 'submit_receipt', null, null, { simulated: true, platform: job.platform });

    return {
      success: true,
      logs: appendLog(logs, 'Submit completed (simulated - real submit requires fastlane setup)'),
    };
  }

  return { success: false, logs, error: `Unknown stage: ${job.stage}` };
}

async function executeFlutterFlowJob(job: any, logs: string): Promise<JobResult> {
  logs = appendLog(logs, `[${new Date().toISOString()}] FlutterFlow ${job.stage} execution started`);

  const autoBuildEnabled = process.env.FLUTTERFLOW_AUTO_BUILD_ENABLED === 'true';

  if (job.stage === 'build') {
    if (autoBuildEnabled) {
      logs = appendLog(logs, 'FLUTTERFLOW_AUTO_BUILD_ENABLED=true, attempting Flutter-style build');
      return executeFlutterJob({ ...job, target: 'flutter' }, logs);
    }

    logs = appendLog(logs, 'FlutterFlow Mode A: Export-only with instructions');

    const instructions = generateFlutterFlowInstructions(job);

    await createArtifact(job.id, 'instructions', null, null, {
      content: instructions,
      filename: 'PUBLISH_INSTRUCTIONS.md',
    });

    logs = appendLog(logs, 'Generated PUBLISH_INSTRUCTIONS.md artifact');
    logs = appendLog(logs, '--- FlutterFlow Manual Publish Steps ---');
    logs = appendLog(logs, '1. Open FlutterFlow.io and navigate to your project');
    logs = appendLog(logs, '2. Go to Settings > App Settings > Deployment');
    logs = appendLog(logs, '3. Follow FlutterFlow\'s built-in publish wizard');
    logs = appendLog(logs, '----------------------------------------');

    return {
      success: true,
      logs: appendLog(logs, 'Build stage completed with instructions artifact'),
    };
  }

  if (job.stage === 'submit') {
    return {
      success: false,
      logs: appendLog(logs, 'FlutterFlow submit stage is manual. Use FlutterFlow.io dashboard.'),
      error: 'FlutterFlow submit is manual only',
    };
  }

  return { success: false, logs, error: `Unknown stage: ${job.stage}` };
}

function generateFlutterFlowInstructions(job: any): string {
  return `# FlutterFlow Publish Instructions

## Job Details
- Job ID: ${job.id}
- Platform: ${job.platform}
- Channel: ${job.channel}
- Created: ${job.createdAt}

## Steps to Publish

### 1. Open FlutterFlow Dashboard
Navigate to [FlutterFlow.io](https://flutterflow.io) and open your project.

### 2. Configure App Settings
- Go to **Settings** > **App Settings**
- Verify your app name, bundle ID, and version
- Configure splash screen and app icon

### 3. Platform-Specific Setup

#### For Android:
1. Go to **Deployment** > **Android**
2. Upload your keystore file (or create one)
3. Fill in keystore credentials
4. Click "Build APK" or "Build AAB"

#### For iOS:
1. Go to **Deployment** > **iOS**
2. Connect your Apple Developer account
3. Configure provisioning profiles
4. Click "Build IPA"

### 4. Download and Submit
1. Download the generated artifact from FlutterFlow
2. Upload to Google Play Console (Android) or App Store Connect (iOS)
3. Complete the store listing and submit for review

## Notes
- FlutterFlow handles the build process through their cloud infrastructure
- This platform provides export and tracking, but actual builds happen in FlutterFlow
- Contact FlutterFlow support for build-related issues
`;
}

async function checkCommandAvailable(cmd: string, args: string[]): Promise<{ available: boolean; version?: string }> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, { timeout: 10000 });
      let output = '';

      proc.stdout?.on('data', (data) => { output += data.toString(); });
      proc.stderr?.on('data', (data) => { output += data.toString(); });

      proc.on('close', (code) => {
        resolve({ available: code === 0, version: output.trim().split('\n')[0] });
      });

      proc.on('error', () => {
        resolve({ available: false });
      });
    } catch {
      resolve({ available: false });
    }
  });
}

async function runCommand(
  cmd: string,
  args: string[],
  env: Record<string, string>,
  timeout: number
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      env: { ...process.env, ...env },
      timeout,
    });

    let output = '';
    let errorOutput = '';

    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      const combined = output + (errorOutput ? `\nSTDERR:\n${errorOutput}` : '');
      resolve({
        success: code === 0,
        output: redactSensitive(combined),
        error: code !== 0 ? `Exit code ${code}` : undefined,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: redactSensitive(output + errorOutput),
        error: err.message,
      });
    });
  });
}

function redactSensitive(text: string): string {
  return text
    .replace(/EXPO_TOKEN=\S+/g, 'EXPO_TOKEN=[REDACTED]')
    .replace(/token":\s*"[^"]+"/g, 'token": "[REDACTED]"')
    .replace(/key":\s*"[^"]+"/g, 'key": "[REDACTED]"')
    .replace(/password":\s*"[^"]+"/g, 'password": "[REDACTED]"')
    .replace(/secret":\s*"[^"]+"/g, 'secret": "[REDACTED]"')
    .replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]');
}

function appendLog(logs: string, line: string): string {
  const lines = logs.split('\n').filter(l => l);
  lines.push(line);
  if (lines.length > MAX_LOG_LINES) {
    lines.splice(0, lines.length - MAX_LOG_LINES);
  }
  return lines.join('\n');
}

async function updateJobLogs(jobId: string, logs: string): Promise<void> {
  await prisma.mobilePublishJob.update({
    where: { id: jobId },
    data: { logs },
  });
}

async function checkIfCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.mobilePublishJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  return job?.status === 'canceled';
}

async function createArtifact(
  jobId: string,
  kind: string,
  path: string | null,
  url: string | null,
  metadata: any
): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.mobilePublishArtifact.create({
    data: {
      jobId,
      kind,
      path,
      url,
      metadata,
      expiresAt,
    },
  });
}

export async function runJobNow(jobId: string): Promise<{ success: boolean; message: string }> {
  const job = await prisma.mobilePublishJob.findUnique({ where: { id: jobId } });

  if (!job) {
    return { success: false, message: 'Job not found' };
  }

  if (job.status !== 'queued') {
    return { success: false, message: `Job is not queued (current status: ${job.status})` };
  }

  executeJob(job).catch(err => {
    safeLog('error', '[MobilePublishRunner] runJobNow error:', err);
  });

  return { success: true, message: 'Job execution started' };
}
