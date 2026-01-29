import { Router } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

const BUILT_IN_PRESETS = {
  booking: [
    {
      presetKey: 'hair_salon',
      name: 'Hair Salon',
      description: 'Best for salons with staff schedules and appointment booking',
      configJson: {
        workflowLabels: { appointment: 'Hair Appointment', service: 'Hair Service', provider: 'Stylist' },
        sampleData: {
          services: ['Haircut', 'Color', 'Highlights', 'Blowout', 'Treatment'],
          durations: [30, 60, 90, 120],
          staff: ['Lead Stylist', 'Senior Stylist', 'Junior Stylist']
        },
        dashboardWidgets: { title: 'Salon Dashboard', stats: ['Appointments Today', 'Revenue', 'Top Stylists'] }
      }
    },
    {
      presetKey: 'clinic',
      name: 'Medical Clinic',
      description: 'Best for medical practices with patient scheduling',
      configJson: {
        workflowLabels: { appointment: 'Patient Visit', service: 'Medical Service', provider: 'Doctor' },
        sampleData: {
          services: ['Consultation', 'Check-up', 'Follow-up', 'Vaccination', 'Lab Work'],
          durations: [15, 30, 45, 60],
          staff: ['Doctor', 'Nurse', 'Specialist']
        },
        dashboardWidgets: { title: 'Clinic Dashboard', stats: ['Patients Today', 'Appointments', 'Staff On Duty'] }
      }
    },
    {
      presetKey: 'gym',
      name: 'Gym / Fitness Studio',
      description: 'Best for gyms with class bookings and trainer sessions',
      configJson: {
        workflowLabels: { appointment: 'Class Booking', service: 'Fitness Class', provider: 'Trainer' },
        sampleData: {
          services: ['Personal Training', 'Yoga', 'Spin Class', 'CrossFit', 'Pilates'],
          durations: [30, 45, 60],
          staff: ['Personal Trainer', 'Group Instructor', 'Manager']
        },
        dashboardWidgets: { title: 'Gym Dashboard', stats: ['Classes Today', 'Active Members', 'Trainer Schedule'] }
      }
    }
  ],
  ecommerce: [
    {
      presetKey: 'grocery',
      name: 'Grocery Store',
      description: 'Best for grocery and food delivery businesses',
      configJson: {
        workflowLabels: { order: 'Grocery Order', product: 'Product', category: 'Aisle' },
        sampleData: {
          categories: ['Fresh Produce', 'Dairy', 'Bakery', 'Meat & Seafood', 'Pantry'],
          products: ['Apples', 'Milk', 'Bread', 'Chicken', 'Rice']
        },
        dashboardWidgets: { title: 'Grocery Dashboard', stats: ['Orders Today', 'Items Sold', 'Low Stock Alerts'] }
      }
    },
    {
      presetKey: 'clothing',
      name: 'Clothing Store',
      description: 'Best for fashion and apparel retailers',
      configJson: {
        workflowLabels: { order: 'Fashion Order', product: 'Item', category: 'Collection' },
        sampleData: {
          categories: ['Tops', 'Bottoms', 'Dresses', 'Accessories', 'Shoes'],
          products: ['T-Shirt', 'Jeans', 'Dress', 'Belt', 'Sneakers']
        },
        dashboardWidgets: { title: 'Fashion Dashboard', stats: ['Orders Today', 'Best Sellers', 'Returns'] }
      }
    },
    {
      presetKey: 'pharmacy',
      name: 'Pharmacy',
      description: 'Best for pharmacies and health product stores',
      configJson: {
        workflowLabels: { order: 'Prescription Order', product: 'Medication', category: 'Category' },
        sampleData: {
          categories: ['Prescription', 'OTC Medicines', 'Vitamins', 'Personal Care', 'First Aid'],
          products: ['Aspirin', 'Vitamin C', 'Bandages', 'Cough Syrup', 'Thermometer']
        },
        dashboardWidgets: { title: 'Pharmacy Dashboard', stats: ['Prescriptions Filled', 'Inventory', 'Expiring Soon'] }
      }
    }
  ],
  crm: [
    {
      presetKey: 'real_estate',
      name: 'Real Estate CRM',
      description: 'Best for real estate agents and property managers',
      configJson: {
        workflowLabels: { lead: 'Property Lead', contact: 'Client', deal: 'Listing' },
        sampleData: {
          leadSources: ['Website', 'Referral', 'Open House', 'Zillow', 'Cold Call'],
          stages: ['New Lead', 'Showing Scheduled', 'Offer Made', 'Under Contract', 'Closed']
        },
        dashboardWidgets: { title: 'Real Estate Dashboard', stats: ['Active Listings', 'Pending Deals', 'Closings This Month'] }
      }
    },
    {
      presetKey: 'agency',
      name: 'Marketing Agency',
      description: 'Best for marketing and creative agencies',
      configJson: {
        workflowLabels: { lead: 'Prospect', contact: 'Client', deal: 'Project' },
        sampleData: {
          leadSources: ['Referral', 'LinkedIn', 'Website', 'Conference', 'Partnership'],
          stages: ['Discovery', 'Proposal', 'Negotiation', 'Signed', 'Completed']
        },
        dashboardWidgets: { title: 'Agency Dashboard', stats: ['Active Projects', 'Pipeline Value', 'Client Retention'] }
      }
    }
  ],
  support: [
    {
      presetKey: 'it_helpdesk',
      name: 'IT Helpdesk',
      description: 'Best for IT support and technical help desks',
      configJson: {
        workflowLabels: { ticket: 'IT Ticket', issue: 'Technical Issue', agent: 'Technician' },
        sampleData: {
          categories: ['Hardware', 'Software', 'Network', 'Security', 'Account'],
          priorities: ['Critical', 'High', 'Medium', 'Low']
        },
        dashboardWidgets: { title: 'IT Helpdesk', stats: ['Open Tickets', 'Avg Resolution Time', 'SLA Compliance'] }
      }
    },
    {
      presetKey: 'customer_service',
      name: 'Customer Service',
      description: 'Best for customer support and service teams',
      configJson: {
        workflowLabels: { ticket: 'Support Request', issue: 'Customer Issue', agent: 'Support Agent' },
        sampleData: {
          categories: ['Billing', 'Product', 'Shipping', 'Returns', 'General'],
          priorities: ['Urgent', 'Normal', 'Low']
        },
        dashboardWidgets: { title: 'Support Dashboard', stats: ['Open Tickets', 'Satisfaction Score', 'Response Time'] }
      }
    }
  ]
};

router.get('/', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res) => {
  try {
    const templateKey = req.query.template as string;

    if (templateKey && BUILT_IN_PRESETS[templateKey as keyof typeof BUILT_IN_PRESETS]) {
      const presets = BUILT_IN_PRESETS[templateKey as keyof typeof BUILT_IN_PRESETS];
      return res.json({ template: templateKey, presets });
    }

    res.json({
      templates: Object.keys(BUILT_IN_PRESETS),
      presets: BUILT_IN_PRESETS
    });
  } catch (error) {
    console.error('Get presets error:', error);
    res.status(500).json({ error: 'Failed to get presets' });
  }
});

router.get('/:templateKey/:presetKey', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res) => {
  try {
    const { templateKey, presetKey } = req.params;
    const templatePresets = BUILT_IN_PRESETS[templateKey as keyof typeof BUILT_IN_PRESETS];

    if (!templatePresets) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const preset = templatePresets.find(p => p.presetKey === presetKey);
    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    res.json(preset);
  } catch (error) {
    console.error('Get preset error:', error);
    res.status(500).json({ error: 'Failed to get preset' });
  }
});

export { router as presetsRoutes };
