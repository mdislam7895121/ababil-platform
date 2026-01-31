import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TEMPLATES, classifyPromptToTemplate, extractEntitiesFromPrompt, generateBlueprint, generateSummary } from '../lib/templates.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';
import { createHash } from 'crypto';

const router = Router();
const prisma = new PrismaClient();

interface OnboardingAnswers {
  businessType: 'salon' | 'clinic' | 'courier';
  businessName: string;
  city: string;
  staffCount: '1' | '2-5' | '6-20' | '20+';
  needsPayment: boolean;
  notifications: ('email' | 'sms' | 'whatsapp' | 'none')[];
  workingHours?: '9-6' | '10-8' | '24/7';
}

const BUSINESS_TYPE_TO_TEMPLATE = {
  salon: 'booking_business',
  clinic: 'clinic_appointment',
  courier: 'courier_delivery'
} as const;

const BUSINESS_TYPE_LABELS = {
  salon: 'hair salon / beauty business',
  clinic: 'clinic / diagnostic center',
  courier: 'courier / delivery service'
};

const STAFF_LABELS = {
  '1': '1 person (solo)',
  '2-5': '2-5 staff members',
  '6-20': '6-20 staff members',
  '20+': 'more than 20 staff members'
};

const HOURS_LABELS = {
  '9-6': '9 AM to 6 PM',
  '10-8': '10 AM to 8 PM',
  '24/7': '24/7 operation'
};

function sanitizeInput(input: string): string {
  return input
    .replace(/\b\d{16}\b/g, '')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .replace(/\b(?:password|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi, '')
    .trim();
}

function generateInternalPrompt(answers: OnboardingAnswers): string {
  const parts: string[] = [];
  
  const businessTypeLabel = BUSINESS_TYPE_LABELS[answers.businessType] || answers.businessType;
  parts.push(`Create a ${businessTypeLabel}`);
  
  if (answers.businessName) {
    parts.push(`called "${sanitizeInput(answers.businessName)}"`);
  }
  
  if (answers.city) {
    parts.push(`in ${sanitizeInput(answers.city)}`);
  }
  
  const staffLabel = STAFF_LABELS[answers.staffCount] || answers.staffCount;
  parts.push(`with ${staffLabel}`);
  
  if (answers.needsPayment) {
    parts.push('with online payment processing');
  } else {
    parts.push('without online payments');
  }
  
  const notificationTypes = answers.notifications.filter(n => n !== 'none');
  if (notificationTypes.length > 0) {
    parts.push(`with ${notificationTypes.join(', ')} notifications`);
  } else {
    parts.push('with no notifications');
  }
  
  if (answers.workingHours) {
    const hoursLabel = HOURS_LABELS[answers.workingHours] || answers.workingHours;
    parts.push(`operating hours ${hoursLabel}`);
  }
  
  return parts.join(' ') + '.';
}

function validateAnswers(answers: any): { valid: boolean; error?: string } {
  if (!answers.businessType || !['salon', 'clinic', 'courier'].includes(answers.businessType)) {
    return { valid: false, error: 'Please select a valid business type' };
  }
  
  if (!answers.businessName || typeof answers.businessName !== 'string' || answers.businessName.trim().length < 2) {
    return { valid: false, error: 'Please enter a valid business name (at least 2 characters)' };
  }
  
  if (answers.businessName.length > 100) {
    return { valid: false, error: 'Business name is too long (max 100 characters)' };
  }
  
  if (!answers.city || typeof answers.city !== 'string' || answers.city.trim().length < 2) {
    return { valid: false, error: 'Please enter a valid city name' };
  }
  
  if (!answers.staffCount || !['1', '2-5', '6-20', '20+'].includes(answers.staffCount)) {
    return { valid: false, error: 'Please select a staff count' };
  }
  
  if (typeof answers.needsPayment !== 'boolean') {
    return { valid: false, error: 'Please indicate if you need online payments' };
  }
  
  if (!Array.isArray(answers.notifications)) {
    return { valid: false, error: 'Please select notification preferences' };
  }
  
  return { valid: true };
}

router.post('/draft', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const answers: OnboardingAnswers = req.body;
    
    const validation = validateAnswers(answers);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
    
    const internalPrompt = generateInternalPrompt(answers);
    const promptHash = createHash('sha256').update(internalPrompt.toLowerCase().trim()).digest('hex');
    
    const templateKey = BUSINESS_TYPE_TO_TEMPLATE[answers.businessType];
    const entities = {
      businessName: sanitizeInput(answers.businessName),
      city: sanitizeInput(answers.city),
      staffCount: answers.staffCount,
      needsPayment: answers.needsPayment,
      notifications: answers.notifications,
      workingHours: answers.workingHours
    };
    
    const { blueprint, customizations } = generateBlueprint(templateKey, entities);
    
    if (answers.needsPayment && !blueprint.connectors.includes('stripe')) {
      blueprint.connectors.push('stripe');
    }
    
    const summary = generateSummary(blueprint, customizations);
    
    const builderRequest = await prisma.builderRequest.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        promptText: `[ONBOARDING] ${answers.businessType} - ${sanitizeInput(answers.businessName)}`,
        normalizedPromptHash: promptHash,
        status: 'draft'
      }
    });
    
    const blueprintRecord = await prisma.blueprint.create({
      data: {
        tenantId: req.tenantId!,
        builderRequestId: builderRequest.id,
        templateKey,
        blueprintJson: {
          template: blueprint,
          customizations,
          entities,
          onboardingAnswers: {
            businessType: answers.businessType,
            staffCount: answers.staffCount,
            needsPayment: answers.needsPayment,
            notifications: answers.notifications,
            workingHours: answers.workingHours
          }
        },
        summary
      }
    });
    
    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.user?.id,
      action: 'ONBOARDING_DRAFT_CREATED',
      entityType: 'builder_request',
      entityId: builderRequest.id,
      metadata: {
        businessType: answers.businessType,
        templateKey
      }
    });
    
    res.json({
      builderRequestId: builderRequest.id,
      blueprintId: blueprintRecord.id,
      blueprint: {
        templateKey,
        templateName: blueprint.name,
        description: blueprint.description,
        modules: blueprint.modules,
        connectors: blueprint.connectors,
        workflows: blueprint.workflows,
        sampleData: blueprint.sampleData,
        dashboardWidgets: blueprint.dashboardWidgets,
        checklist: blueprint.checklist,
        customizations
      },
      summary,
      context: {
        businessName: sanitizeInput(answers.businessName),
        city: sanitizeInput(answers.city),
        staffCount: answers.staffCount,
        needsPayment: answers.needsPayment,
        notifications: answers.notifications,
        workingHours: answers.workingHours
      }
    });
  } catch (error) {
    console.error('Onboarding draft error:', error);
    res.status(500).json({ error: 'Failed to create onboarding draft' });
  }
});

router.get('/business-types', async (req: AuthRequest, res: Response) => {
  res.json([
    { key: 'salon', label: 'Hair Salon / Beauty', description: 'Appointments, styling, treatments', icon: 'scissors' },
    { key: 'clinic', label: 'Clinic / Diagnostic', description: 'Medical appointments, patient records', icon: 'stethoscope' },
    { key: 'courier', label: 'Courier / Delivery', description: 'Package tracking, deliveries', icon: 'truck' }
  ]);
});

export { router as onboardingRoutes };
