import { Router } from 'express';
import { randomBytes } from 'crypto';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/generate', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { type } = req.body;
    
    let secrets: { key: string; value: string; description: string }[] = [];

    if (type === 'jwt' || type === 'all') {
      secrets.push({
        key: 'SESSION_SECRET',
        value: randomBytes(32).toString('hex'),
        description: 'JWT signing secret for authentication tokens'
      });
    }

    if (type === 'encryption' || type === 'all') {
      secrets.push({
        key: 'ENCRYPTION_KEY',
        value: randomBytes(16).toString('hex'),
        description: 'Encryption key for sensitive data (exactly 32 characters)'
      });
    }

    if (secrets.length === 0) {
      secrets = [
        {
          key: 'SESSION_SECRET',
          value: randomBytes(32).toString('hex'),
          description: 'JWT signing secret for authentication tokens'
        },
        {
          key: 'ENCRYPTION_KEY',
          value: randomBytes(16).toString('hex'),
          description: 'Encryption key for sensitive data (exactly 32 characters)'
        }
      ];
    }

    res.json({
      ok: true,
      secrets,
      warning: 'Save these securely. They will not be shown again.',
      instructions: [
        'Copy each value and add it to your environment variables',
        'In Replit, go to the Secrets tab and add these keys',
        'Restart your application after adding the secrets'
      ]
    });
  } catch (error) {
    console.error('Generate env error:', error);
    res.status(500).json({ error: 'Failed to generate secrets' });
  }
});

export { router as envRoutes };
