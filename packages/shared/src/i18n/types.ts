export interface TranslationKeys {
  common: {
    welcome: string;
    login: string;
    logout: string;
    signup: string;
    submit: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    create: string;
    loading: string;
    error: string;
    success: string;
    confirm: string;
    search: string;
    filter: string;
    settings: string;
    dashboard: string;
    home: string;
    back: string;
    next: string;
    previous: string;
    close: string;
    open: string;
    yes: string;
    no: string;
    ok: string;
    language: string;
    selectLanguage: string;
  };
  auth: {
    email: string;
    password: string;
    confirmPassword: string;
    forgotPassword: string;
    resetPassword: string;
    loginTitle: string;
    signupTitle: string;
    loginButton: string;
    signupButton: string;
    noAccount: string;
    hasAccount: string;
    invalidCredentials: string;
    passwordMismatch: string;
  };
  dashboard: {
    title: string;
    overview: string;
    analytics: string;
    users: string;
    modules: string;
    connectors: string;
    apiKeys: string;
    auditLogs: string;
    billing: string;
    payments: string;
    revenue: string;
    settings: string;
    workspace: string;
    team: string;
  };
  billing: {
    title: string;
    subscription: string;
    currentPlan: string;
    upgradePlan: string;
    paymentMethod: string;
    cardPayment: string;
    manualPayment: string;
    transactionRef: string;
    submitPayment: string;
    paymentHistory: string;
    pending: string;
    approved: string;
    rejected: string;
    invoices: string;
    downloadPdf: string;
  };
  onboarding: {
    title: string;
    welcome: string;
    whatToBuild: string;
    businessName: string;
    industry: string;
    features: string;
    preferredLanguage: string;
    getStarted: string;
    step: string;
    of: string;
  };
  builder: {
    title: string;
    prompt: string;
    generate: string;
    preview: string;
    deploy: string;
    building: string;
    success: string;
    error: string;
  };
  errors: {
    notFound: string;
    unauthorized: string;
    forbidden: string;
    serverError: string;
    networkError: string;
    validationError: string;
    requiredField: string;
  };
}

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  rtl?: boolean;
}

export interface TranslationCache {
  lang: string;
  translations: Partial<TranslationKeys>;
  generatedAt: Date;
  expiresAt: Date;
}
