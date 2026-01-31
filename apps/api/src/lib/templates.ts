export const TEMPLATE_KEYS = [
  'booking_business',
  'ecommerce_store',
  'clinic_appointment',
  'courier_delivery',
  'support_desk',
  'crm_pipeline'
] as const;

export type TemplateKey = typeof TEMPLATE_KEYS[number];

export interface BlueprintTemplate {
  key: TemplateKey;
  name: string;
  description: string;
  modules: string[];
  connectors: string[];
  workflows: Record<string, any>;
  defaultRoles: string[];
  sampleData: Record<string, any>[];
  dashboardWidgets: string[];
  checklist: string[];
}

export const TEMPLATES: Record<TemplateKey, BlueprintTemplate> = {
  booking_business: {
    key: 'booking_business',
    name: 'Booking Business',
    description: 'Appointment and reservation system for service-based businesses',
    modules: ['booking', 'analytics'],
    connectors: ['email', 'push'],
    workflows: {
      booking_states: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
      actions: {
        confirm: { from: 'pending', to: 'confirmed', notify: true },
        start: { from: 'confirmed', to: 'in_progress' },
        complete: { from: 'in_progress', to: 'completed' },
        cancel: { from: ['pending', 'confirmed'], to: 'cancelled', notify: true }
      }
    },
    defaultRoles: ['owner', 'admin', 'staff', 'viewer'],
    sampleData: [
      { type: 'service', name: 'Haircut', duration: 30, price: 25 },
      { type: 'service', name: 'Consultation', duration: 60, price: 50 }
    ],
    dashboardWidgets: ['upcoming_bookings', 'revenue_chart', 'customer_count'],
    checklist: [
      'Configure your business hours',
      'Add your services and pricing',
      'Set up email notifications',
      'Invite your staff members',
      'Share your booking link with customers'
    ]
  },

  ecommerce_store: {
    key: 'ecommerce_store',
    name: 'E-commerce Store',
    description: 'Online store with product catalog, cart, and checkout',
    modules: ['ecommerce', 'analytics'],
    connectors: ['stripe', 'email', 'storage'],
    workflows: {
      order_states: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'refunded'],
      actions: {
        pay: { from: 'pending', to: 'paid', notify: true },
        process: { from: 'paid', to: 'processing' },
        ship: { from: 'processing', to: 'shipped', notify: true },
        deliver: { from: 'shipped', to: 'delivered' },
        refund: { from: ['paid', 'processing'], to: 'refunded', notify: true }
      }
    },
    defaultRoles: ['owner', 'admin', 'staff', 'viewer'],
    sampleData: [
      { type: 'product', name: 'Sample Product', price: 29.99, stock: 100 },
      { type: 'category', name: 'General' }
    ],
    dashboardWidgets: ['sales_chart', 'orders_pending', 'low_stock_alert', 'revenue_total'],
    checklist: [
      'Connect your Stripe account for payments',
      'Upload your product catalog',
      'Configure shipping options',
      'Set up order notification emails',
      'Customize your store appearance'
    ]
  },

  clinic_appointment: {
    key: 'clinic_appointment',
    name: 'Clinic Appointments',
    description: 'Healthcare appointment scheduling with patient management',
    modules: ['booking', 'crm', 'analytics'],
    connectors: ['email', 'push'],
    workflows: {
      appointment_states: ['scheduled', 'checked_in', 'in_consultation', 'completed', 'no_show', 'cancelled'],
      actions: {
        checkin: { from: 'scheduled', to: 'checked_in' },
        start_consultation: { from: 'checked_in', to: 'in_consultation' },
        complete: { from: 'in_consultation', to: 'completed' },
        no_show: { from: 'scheduled', to: 'no_show' },
        cancel: { from: 'scheduled', to: 'cancelled', notify: true }
      }
    },
    defaultRoles: ['owner', 'admin', 'staff', 'viewer'],
    sampleData: [
      { type: 'service', name: 'General Consultation', duration: 30, price: 100 },
      { type: 'service', name: 'Follow-up Visit', duration: 15, price: 50 }
    ],
    dashboardWidgets: ['todays_appointments', 'patient_count', 'no_show_rate'],
    checklist: [
      'Set up your clinic hours',
      'Add practitioners and their schedules',
      'Configure appointment types',
      'Set up patient reminders',
      'Enable patient portal access'
    ]
  },

  courier_delivery: {
    key: 'courier_delivery',
    name: 'Courier & Delivery',
    description: 'Package tracking and delivery management system',
    modules: ['booking', 'analytics'],
    connectors: ['push', 'email'],
    workflows: {
      delivery_states: ['created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'],
      actions: {
        pickup: { from: 'created', to: 'picked_up', notify: true },
        transit: { from: 'picked_up', to: 'in_transit' },
        out_for_delivery: { from: 'in_transit', to: 'out_for_delivery', notify: true },
        deliver: { from: 'out_for_delivery', to: 'delivered', notify: true },
        fail: { from: 'out_for_delivery', to: 'failed', notify: true },
        return: { from: 'failed', to: 'returned' }
      }
    },
    defaultRoles: ['owner', 'admin', 'staff', 'viewer'],
    sampleData: [
      { type: 'zone', name: 'Zone A', basePrice: 5 },
      { type: 'zone', name: 'Zone B', basePrice: 10 }
    ],
    dashboardWidgets: ['active_deliveries', 'delivery_success_rate', 'driver_performance'],
    checklist: [
      'Define your delivery zones',
      'Set up pricing rules',
      'Add drivers and assign zones',
      'Configure customer notifications',
      'Set up proof of delivery requirements'
    ]
  },

  support_desk: {
    key: 'support_desk',
    name: 'Support Desk',
    description: 'Customer support ticket system with SLA tracking',
    modules: ['support', 'analytics'],
    connectors: ['email'],
    workflows: {
      ticket_states: ['new', 'open', 'pending', 'resolved', 'closed'],
      priority_levels: ['low', 'medium', 'high', 'urgent'],
      actions: {
        assign: { from: 'new', to: 'open' },
        respond: { from: 'open', to: 'pending' },
        resolve: { from: ['open', 'pending'], to: 'resolved', notify: true },
        close: { from: 'resolved', to: 'closed' },
        reopen: { from: ['resolved', 'closed'], to: 'open' }
      }
    },
    defaultRoles: ['owner', 'admin', 'staff', 'viewer'],
    sampleData: [
      { type: 'category', name: 'General Inquiry' },
      { type: 'category', name: 'Technical Support' },
      { type: 'category', name: 'Billing' }
    ],
    dashboardWidgets: ['open_tickets', 'avg_response_time', 'satisfaction_score', 'tickets_by_category'],
    checklist: [
      'Create ticket categories',
      'Set up SLA response times',
      'Configure auto-assignment rules',
      'Set up email templates',
      'Invite support agents'
    ]
  },

  crm_pipeline: {
    key: 'crm_pipeline',
    name: 'CRM Pipeline',
    description: 'Sales pipeline and customer relationship management',
    modules: ['crm', 'analytics'],
    connectors: ['email'],
    workflows: {
      deal_stages: ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'],
      actions: {
        qualify: { from: 'lead', to: 'qualified' },
        propose: { from: 'qualified', to: 'proposal' },
        negotiate: { from: 'proposal', to: 'negotiation' },
        win: { from: 'negotiation', to: 'won', notify: true },
        lose: { from: ['lead', 'qualified', 'proposal', 'negotiation'], to: 'lost' }
      }
    },
    defaultRoles: ['owner', 'admin', 'staff', 'viewer'],
    sampleData: [
      { type: 'pipeline', name: 'Sales Pipeline' },
      { type: 'contact_field', name: 'Company', type: 'text' },
      { type: 'contact_field', name: 'Phone', type: 'phone' }
    ],
    dashboardWidgets: ['pipeline_value', 'deals_by_stage', 'conversion_rate', 'top_performers'],
    checklist: [
      'Customize your deal stages',
      'Import existing contacts',
      'Set up email integration',
      'Configure deal value fields',
      'Create sales team structure'
    ]
  }
};

const TEMPLATE_KEYWORDS: Record<TemplateKey, string[]> = {
  booking_business: ['book', 'appointment', 'schedule', 'reservation', 'salon', 'spa', 'barber', 'beauty', 'service'],
  ecommerce_store: ['shop', 'store', 'sell', 'product', 'ecommerce', 'cart', 'checkout', 'inventory', 'merchandise'],
  clinic_appointment: ['clinic', 'doctor', 'patient', 'medical', 'health', 'hospital', 'healthcare', 'dental', 'therapy'],
  courier_delivery: ['delivery', 'courier', 'shipping', 'package', 'logistics', 'transport', 'driver', 'dispatch'],
  support_desk: ['support', 'ticket', 'helpdesk', 'customer service', 'issue', 'complaint', 'help'],
  crm_pipeline: ['crm', 'sales', 'lead', 'pipeline', 'customer', 'deal', 'prospect', 'client']
};

export function classifyPromptToTemplate(prompt: string): TemplateKey {
  const normalizedPrompt = prompt.toLowerCase();
  let bestMatch: TemplateKey = 'booking_business';
  let bestScore = 0;

  for (const [templateKey, keywords] of Object.entries(TEMPLATE_KEYWORDS) as [TemplateKey, string[]][]) {
    let score = 0;
    for (const keyword of keywords) {
      if (normalizedPrompt.includes(keyword)) {
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = templateKey;
    }
  }

  return bestMatch;
}

export function extractEntitiesFromPrompt(prompt: string, templateKey: TemplateKey): Record<string, any> {
  const entities: Record<string, any> = {};
  const normalizedPrompt = prompt.toLowerCase();

  const businessNameMatch = prompt.match(/(?:called|named|for)\s+["']?([^"'\n,]+)["']?/i);
  if (businessNameMatch) {
    entities.businessName = businessNameMatch[1].trim();
  }

  const priceMatches = prompt.match(/\$?\d+(?:\.\d{2})?/g);
  if (priceMatches) {
    entities.suggestedPrices = priceMatches.map(p => parseFloat(p.replace('$', '')));
  }

  const servicesMatch = prompt.match(/(?:services?|products?):\s*([^.]+)/i);
  if (servicesMatch) {
    entities.suggestedItems = servicesMatch[1].split(/,|and/).map(s => s.trim()).filter(s => s);
  }

  return entities;
}

export function generateBlueprint(templateKey: TemplateKey, entities: Record<string, any>): {
  blueprint: BlueprintTemplate;
  customizations: Record<string, any>;
} {
  const template = TEMPLATES[templateKey];
  const customizations: Record<string, any> = {};

  if (entities.businessName) {
    customizations.businessName = entities.businessName;
  }

  if (entities.suggestedItems && entities.suggestedItems.length > 0) {
    customizations.initialItems = entities.suggestedItems;
  }

  if (entities.suggestedPrices && entities.suggestedPrices.length > 0) {
    customizations.suggestedPrices = entities.suggestedPrices;
  }

  return { blueprint: template, customizations };
}

export function generateSummary(template: BlueprintTemplate, customizations: Record<string, any>): string {
  const parts: string[] = [];
  parts.push(`Template: ${template.name}`);
  parts.push(`Modules to enable: ${template.modules.join(', ')}`);
  parts.push(`Recommended connectors: ${template.connectors.join(', ')}`);

  if (customizations.businessName) {
    parts.push(`Business name: ${customizations.businessName}`);
  }

  return parts.join('\n');
}
