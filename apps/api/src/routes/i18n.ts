import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, authMiddleware, tenantMiddleware, requireRole } from '../middleware/auth.js';
import { isSafeModeActive } from '../lib/safeMode.js';
import { i18nGenerateLimiter } from '../middleware/rateLimit.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true },
];

const DEFAULT_LANGUAGE = 'en';

const BUNDLED_LOCALES: Record<string, any> = {};

function loadBundledLocales() {
  const localesDir = path.resolve(__dirname, '../../../../packages/shared/src/i18n/locales');
  try {
    if (fs.existsSync(localesDir)) {
      const files = fs.readdirSync(localesDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const lang = file.replace('.json', '');
          const content = fs.readFileSync(path.join(localesDir, file), 'utf-8');
          BUNDLED_LOCALES[lang] = JSON.parse(content);
        }
      }
    }
  } catch (e) {
    console.warn('Could not load bundled locales:', e);
  }
}

loadBundledLocales();

router.get('/languages', async (_req: Request, res: Response) => {
  try {
    res.json({
      languages: SUPPORTED_LANGUAGES,
      default: DEFAULT_LANGUAGE,
      bundled: Object.keys(BUNDLED_LOCALES)
    });
  } catch (error) {
    console.error('Get languages error:', error);
    res.status(500).json({ error: 'Failed to get languages' });
  }
});

router.get('/:lang', async (req: Request, res: Response) => {
  try {
    const { lang } = req.params;
    
    if (BUNDLED_LOCALES[lang]) {
      res.json({
        lang,
        translations: BUNDLED_LOCALES[lang],
        source: 'bundled'
      });
      return;
    }
    
    const cached = await (prisma as any).translationCache.findFirst({
      where: {
        lang,
        key: 'full',
        expiresAt: { gt: new Date() }
      }
    });
    
    if (cached) {
      res.json({
        lang,
        translations: cached.translation,
        source: 'cache',
        expiresAt: cached.expiresAt
      });
      return;
    }
    
    if (BUNDLED_LOCALES[DEFAULT_LANGUAGE]) {
      res.json({
        lang: DEFAULT_LANGUAGE,
        translations: BUNDLED_LOCALES[DEFAULT_LANGUAGE],
        source: 'fallback',
        requestedLang: lang
      });
      return;
    }
    
    res.status(404).json({ error: `Translations for '${lang}' not available` });
  } catch (error) {
    console.error('Get translations error:', error);
    res.status(500).json({ error: 'Failed to get translations' });
  }
});

router.post('/generate', i18nGenerateLimiter, authMiddleware, tenantMiddleware, requireRole('owner', 'admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.user?.id;
    const { targetLang } = req.body;
    
    if (!tenantId || !userId) {
      res.status(400).json({ error: 'Tenant ID and authentication required' });
      return;
    }
    
    if (!targetLang) {
      res.status(400).json({ error: 'Target language is required' });
      return;
    }
    
    const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === targetLang);
    if (!langInfo) {
      res.status(400).json({ error: 'Unsupported language' });
      return;
    }
    
    if (BUNDLED_LOCALES[targetLang]) {
      res.json({
        lang: targetLang,
        translations: BUNDLED_LOCALES[targetLang],
        source: 'bundled',
        message: 'Bundled translations already available'
      });
      return;
    }
    
    const existingCache = await (prisma as any).translationCache.findFirst({
      where: {
        lang: targetLang,
        key: 'full',
        expiresAt: { gt: new Date() }
      }
    });
    
    if (existingCache) {
      res.json({
        lang: targetLang,
        translations: existingCache.translation,
        source: 'cache',
        expiresAt: existingCache.expiresAt,
        message: 'Cached translations returned'
      });
      return;
    }
    
    if (isSafeModeActive()) {
      res.status(503).json({
        error: 'AI translation unavailable in safe mode',
        fallback: BUNDLED_LOCALES[DEFAULT_LANGUAGE],
        message: 'System is in safe mode. Using default English translations.'
      });
      return;
    }
    
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'AI translation not configured',
        fallback: BUNDLED_LOCALES[DEFAULT_LANGUAGE],
        message: 'OpenAI API key not configured. Using default English translations.'
      });
      return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const usageCount = await prisma.aiUsage.count({
      where: {
        tenantId,
        createdAt: { gte: new Date(today) }
      }
    });
    
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const plan = tenant?.plan || 'free';
    const quotaLimits: Record<string, number> = { free: 10, pro: 100, business: 500 };
    const dailyQuota = quotaLimits[plan] || 10;
    
    if (usageCount >= dailyQuota) {
      res.status(429).json({
        error: 'AI quota exceeded for today',
        fallback: BUNDLED_LOCALES[DEFAULT_LANGUAGE],
        message: `Daily AI quota (${dailyQuota}) exceeded. Try again tomorrow.`
      });
      return;
    }
    
    const sourceTranslations = BUNDLED_LOCALES[DEFAULT_LANGUAGE];
    if (!sourceTranslations) {
      res.status(500).json({ error: 'Source translations not available' });
      return;
    }
    
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });
    
    const prompt = `Translate the following JSON translations from English to ${langInfo.name} (${langInfo.nativeName}). 
Keep the JSON structure exactly the same, only translate the string values.
Do not translate keys, only values. Return valid JSON only.

Source translations:
${JSON.stringify(sourceTranslations, null, 2)}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a professional translator. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    const responseText = completion.choices[0]?.message?.content || '';
    let translatedContent: any;
    
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        translatedContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI translation:', parseError);
      res.status(500).json({
        error: 'Failed to parse AI translation',
        fallback: BUNDLED_LOCALES[DEFAULT_LANGUAGE]
      });
      return;
    }
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    await (prisma as any).translationCache.upsert({
      where: { lang_key: { lang: targetLang, key: 'full' } },
      create: {
        lang: targetLang,
        key: 'full',
        translation: translatedContent,
        expiresAt
      },
      update: {
        translation: translatedContent,
        generatedAt: new Date(),
        expiresAt
      }
    });
    
    const tokensUsed = completion.usage?.total_tokens || 0;
    await prisma.aiUsage.create({
      data: {
        tenantId,
        userId,
        model: 'gpt-4o-mini',
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        totalTokens: tokensUsed,
        cost: (tokensUsed / 1000) * 0.00015
      }
    });
    
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: userId,
        action: 'i18n.translation_generated',
        entityType: 'TranslationCache',
        entityId: targetLang,
        metadata: { targetLang, tokensUsed }
      }
    });
    
    res.json({
      lang: targetLang,
      translations: translatedContent,
      source: 'ai_generated',
      expiresAt,
      tokensUsed,
      message: `Translations for ${langInfo.name} generated successfully`
    });
  } catch (error) {
    console.error('Generate translations error:', error);
    res.status(500).json({
      error: 'Failed to generate translations',
      fallback: BUNDLED_LOCALES[DEFAULT_LANGUAGE]
    });
  }
});

router.patch('/workspace/language', authMiddleware, tenantMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { language, languages } = req.body;
    
    if (!tenantId) {
      res.status(400).json({ error: 'Tenant ID required' });
      return;
    }
    
    const updateData: any = {};
    
    if (language) {
      const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === language);
      if (!langInfo) {
        res.status(400).json({ error: 'Unsupported language' });
        return;
      }
      updateData.language = language;
    }
    
    if (languages && Array.isArray(languages)) {
      const validLangs = languages.filter((l: string) => 
        SUPPORTED_LANGUAGES.some(sl => sl.code === l)
      );
      updateData.languages = validLangs;
    }
    
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData
    });
    
    res.json({
      language: (tenant as any).language,
      languages: (tenant as any).languages,
      message: 'Workspace language settings updated'
    });
  } catch (error) {
    console.error('Update workspace language error:', error);
    res.status(500).json({ error: 'Failed to update workspace language' });
  }
});

router.get('/workspace/language', authMiddleware, tenantMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      res.status(400).json({ error: 'Tenant ID required' });
      return;
    }
    
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });
    
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    
    res.json({
      language: (tenant as any).language || 'en',
      languages: (tenant as any).languages || ['en']
    });
  } catch (error) {
    console.error('Get workspace language error:', error);
    res.status(500).json({ error: 'Failed to get workspace language' });
  }
});

export default router;
