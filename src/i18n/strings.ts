import { APP_SHELL_STRINGS } from "./stringsAppShell"

export type LocaleCode = "en" | "es"

const CORE: Record<LocaleCode, Record<string, string>> = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.leads": "Leads",
    "nav.conversations": "Conversations",
    "nav.quotes": "Quotes",
    "nav.calendar": "Calendar",
    "nav.customers": "Customers",
    "nav.payments": "Payments",
    "nav.web-support": "Web support",
    "nav.tech-support": "Tech support",
    "nav.settings": "Settings",
    "nav.account": "Account",
    "layout.menu": "Menu",
    "layout.logout": "Log out",
    "dashboard.title": "Dashboard",
    "dashboard.demoLabel": "Demo account.",
    "dashboard.demoBanner":
      "Demo account. Leads, conversations, quotes, calendar, and inbox-style activity are cleared on a schedule (typically every hour or two). Your login and profile stay; Twilio channels are not removed. Ask your admin for a full account when you are ready.",
    "dashboard.welcomeTitle": "Welcome to Tradesman",
    "dashboard.welcomeBody1":
      "We help contractors and small businesses manage leads, conversations, quotes, and scheduling in one clean workspace.",
    "dashboard.welcomeBody2":
      "Use the sidebar to jump to the next step in your workflow. The layout is optimized for desktop and mobile web so your team can stay productive anywhere.",
    "dashboard.card.pipeline": "Leads → Quotes → Calendar",
    "dashboard.card.pipelineSub": "Track every customer from first contact to booked job.",
    "dashboard.card.comm": "Messages + Notes",
    "dashboard.card.commSub": "Keep customer history centralized and easy to review.",
    "dashboard.card.schedule": "Smart Recurrence",
    "dashboard.card.scheduleSub": "Plan one-time and recurring jobs with less manual work.",
    "dashboard.kicker.pipeline": "Pipeline",
    "dashboard.kicker.comm": "Communication",
    "dashboard.kicker.schedule": "Scheduling",
    "dashboard.billingDueTitleToday": "Payment due today",
    "dashboard.billingDueBodyToday":
      "Your billing date is {{due}}. If you have not paid yet, open Payments to complete your subscription.",
    "dashboard.billingDueTitlePast": "Payment past due",
    "dashboard.billingDueBodyPast":
      "Your payment was due on {{due}} ({{days}} days ago). Open Payments to bring your account current, or contact support if you believe this is an error.",
    "dashboard.billingDueCtaPayments": "Open Payments",
    "account.language": "Site language",
    "account.languageHint": "Controls navigation and shared labels. More screens will follow your choice over time.",
    "account.aiSignupNote":
      "Matches the AI automation choice from signup. You can change this anytime; it also appears under Account.",
    "leads.timingTitle": "Timing preference",
    "leads.asap": "ASAP (prefer urgent / same-day language for Hot)",
    "leads.flexible": "Flexible",
  },
  es: {
    "nav.dashboard": "Panel",
    "nav.leads": "Prospectos",
    "nav.conversations": "Conversaciones",
    "nav.quotes": "Cotizaciones",
    "nav.calendar": "Calendario",
    "nav.customers": "Clientes",
    "nav.payments": "Pagos",
    "nav.web-support": "Soporte web",
    "nav.tech-support": "Soporte técnico",
    "nav.settings": "Ajustes",
    "nav.account": "Cuenta",
    "layout.menu": "Menú",
    "layout.logout": "Cerrar sesión",
    "dashboard.title": "Panel",
    "dashboard.demoBanner":
      "Los prospectos, conversaciones, cotizaciones, calendario y actividad tipo bandeja se borran periódicamente (cada una o dos horas). Su inicio de sesión y perfil se conservan; los canales de Twilio no se eliminan. Pida a su administrador una cuenta completa cuando esté listo.",
    "dashboard.welcomeTitle": "Bienvenido a Tradesman",
    "dashboard.welcomeBody1":
      "Ayudamos a contratistas y pequeñas empresas a gestionar prospectos, conversaciones, cotizaciones y la agenda en un solo lugar.",
    "dashboard.welcomeBody2":
      "Use el menú lateral para avanzar en su flujo de trabajo. El diseño funciona en escritorio y móvil para que su equipo trabaje desde cualquier lugar.",
    "dashboard.card.pipeline": "Prospectos → Cotizaciones → Calendario",
    "dashboard.card.pipelineSub": "Siga a cada cliente desde el primer contacto hasta la cita reservada.",
    "dashboard.card.comm": "Mensajes + Notas",
    "dashboard.card.commSub": "Mantenga el historial del cliente centralizado y fácil de revisar.",
    "dashboard.card.schedule": "Recurrencia inteligente",
    "dashboard.card.scheduleSub": "Planifique trabajos puntuales y recurrentes con menos trabajo manual.",
    "dashboard.kicker.pipeline": "Embudo",
    "dashboard.kicker.comm": "Comunicación",
    "dashboard.kicker.schedule": "Programación",
    "dashboard.billingDueTitleToday": "Pago vence hoy",
    "dashboard.billingDueBodyToday":
      "Su fecha de facturación es {{due}}. Si aún no ha pagado, abra Pagos para completar su suscripción.",
    "dashboard.billingDueTitlePast": "Pago vencido",
    "dashboard.billingDueBodyPast":
      "Su pago vencía el {{due}} (hace {{days}} días). Abra Pagos para poner su cuenta al día, o contacte a soporte si cree que es un error.",
    "dashboard.billingDueCtaPayments": "Abrir Pagos",
    "account.language": "Idioma del sitio",
    "account.languageHint": "Controla la navegación y textos comunes. Más pantallas seguirán esta opción con el tiempo.",
    "account.aiSignupNote":
      "Coincide con la opción de automatización con IA al registrarse. Puede cambiarla en cualquier momento; también aparece en Cuenta.",
    "leads.timingTitle": "Preferencia de tiempo",
    "leads.asap": "Lo antes posible (lenguaje urgente / mismo día para Hot)",
    "leads.flexible": "Flexible",
  },
}

export const STRINGS: Record<LocaleCode, Record<string, string>> = {
  en: { ...CORE.en, ...APP_SHELL_STRINGS.en },
  es: { ...CORE.es, ...APP_SHELL_STRINGS.es },
}
