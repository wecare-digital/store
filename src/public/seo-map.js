/**
 * SEO Map — WECARE.DIGITAL
 *
 * Central SEO configuration for all static and system pages.
 * Used by seo-controller.js (called from masterPage.js) to apply
 * runtime SEO overrides via wix-seo-frontend.
 *
 * This eliminates manual page-by-page Wix Dashboard SEO editing.
 *
 * Structure: path → { title, description, robots, canonical, ogTitle, ogDescription,
 *   ogImage, twitterTitle, twitterDescription, structuredData[] }
 *
 * Blog posts and products are handled by their respective REST APIs,
 * not by this map. This map covers static + system pages only.
 */

const BASE = 'https://www.wecare.digital';
const BRAND = 'WECARE.DIGITAL';
const LOGO = 'https://app.wecare.digital/stream/media/m/wecare-digital.png';
const IG = 'https://www.instagram.com/wecare.digital/';

// ── Organization schema (reused across pages) ──
const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': BASE + '/#organization',
  name: BRAND,
  url: BASE + '/',
  logo: LOGO,
  email: 'one@wecare.digital',
  telephone: '+919330994400',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'The W.B.S.I.D.C. Building, Unit 1/20, 81/2/7, Phears Lane',
    addressLocality: 'Kolkata',
    addressRegion: 'West Bengal',
    postalCode: '700012',
    addressCountry: 'IN',
  },
  sameAs: [IG],
  inLanguage: 'en-IN',
};

const webSiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': BASE + '/#website',
  name: BRAND,
  url: BASE + '/',
  potentialAction: {
    '@type': 'SearchAction',
    target: BASE + '/search?q={search_term_string}',
    'query-input': 'required name=search_term_string',
  },
  inLanguage: 'en-IN',
};

function webPage(name, desc, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': url + '#webpage',
    name: name,
    description: desc,
    url: url,
    isPartOf: { '@id': BASE + '/#website' },
    about: { '@id': BASE + '/#organization' },
    inLanguage: 'en-IN',
  };
}

function breadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(function (item, i) {
      return { '@type': 'ListItem', position: i + 1, name: item.name, item: item.url };
    }),
  };
}

function bc2(parentName, parentPath, pageName, pagePath) {
  return breadcrumb([
    { name: 'Home', url: BASE + '/' },
    { name: parentName, url: BASE + parentPath },
    { name: pageName, url: BASE + pagePath },
  ]);
}

function bc1(pageName, pagePath) {
  return breadcrumb([
    { name: 'Home', url: BASE + '/' },
    { name: pageName, url: BASE + pagePath },
  ]);
}

function serviceSchema(name, desc, serviceType) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: name,
    description: desc,
    provider: { '@type': 'Organization', name: BRAND },
    areaServed: { '@type': 'Country', name: 'India' },
    serviceType: serviceType || name,
  };
}

// ── FAQ data (matches http-functions.js FAQS) ──
var FAQS = [
  { q: 'How do I submit a request?', a: 'You can submit a new request online in a few simple steps. Start by entering your basic details, then add a short summary and your Order ID. After submission, your case is created and you receive a reference ID so you can track progress.' },
  { q: 'How can I track my request?', a: 'You can check the status of your request at any time. This helps you stay informed as your case moves through stages such as received, under review, and completed.' },
  { q: 'How do I request an amendment?', a: 'If you need to update a request you have already submitted, you can request an amendment without starting over. Once your changes are reviewed and approved, the updated information will be applied to your case.' },
  { q: 'How do I book or reschedule an RX slot?', a: 'You can book or reschedule an RX slot for doctor or treatment appointments based on your travel plans and prior prescription needs.' },
  { q: 'How do I upload supporting documents?', a: 'If you have been asked for files, or if you need to add supporting documents to your case, you can upload them securely through Drop Docs.' },
  { q: 'How do I get enterprise support?', a: 'If you need help with an active business or service-related case, you can contact Enterprise Assist.' },
  { q: 'How do I book an appointment?', a: 'You can book an appointment through self-service for supported services. Once you choose your preferred slot and provide the required details, you will receive confirmation based on availability.' },
  { q: 'How do I leave a review?', a: 'You can leave a review after using a service to share your experience with us. Your feedback helps improve service quality.' },
  { q: 'What payment methods do you accept?', a: 'We accept UPI, debit cards, credit cards, net banking, and other supported digital payment methods.' },
  { q: 'What are your business hours?', a: 'Monday to Friday, 9:00 AM to 6:00 PM IST. Self-service portal available 24/7.' },
  { q: 'Is there a mobile app?', a: 'Yes. WECARE.DIGITAL offers an app for iOS and Android.' },
  { q: 'What is WECARE.DIGITAL?', a: 'A network of microservice brands serving everyday Bharat across travel, paperwork, disputes, rituals, and reflection.' },
  { q: 'Can I buy a gift card?', a: 'Yes. WECARE.DIGITAL offers e-gift cards that can be sent instantly.' },
];

var faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(function (f) {
    return { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } };
  }),
};

var localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': BASE + '/#localbusiness',
  name: BRAND,
  url: BASE + '/contact',
  email: 'one@wecare.digital',
  telephone: '+919330994400',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'The W.B.S.I.D.C. Building, Unit 1/20, 81/2/7, Phears Lane',
    addressLocality: 'Kolkata',
    addressRegion: 'West Bengal',
    postalCode: '700012',
    addressCountry: 'IN',
  },
  openingHours: 'Mo-Fr 09:00-18:00',
  inLanguage: 'en-IN',
};

// ══════════════════════════════════════════════════════════════
// DEFAULT SEO — applied when path is not in seoMap
// ══════════════════════════════════════════════════════════════

export var defaultSeo = {
  title: BRAND + ' — Microservice Brands for Everyday Bharat',
  description: 'Digital services for everyday Bharat — travel, legal, ritual, reflection, and dispute resolution with transparent pricing.',
  robots: 'index, follow',
  canonical: BASE + '/',
  ogTitle: BRAND + ' — Microservice Brands for Everyday Bharat',
  ogDescription: 'Digital services for everyday Bharat — travel, legal, ritual, reflection, and dispute resolution with transparent pricing.',
  ogImage: LOGO,
  twitterTitle: BRAND,
  twitterDescription: 'Microservice brands for everyday Bharat.',
  structuredData: [orgSchema, webSiteSchema],
};

// ══════════════════════════════════════════════════════════════
// SEO MAP — path → SEO config for every static + system page
// ══════════════════════════════════════════════════════════════

export var seoMap = {

  // ── HOMEPAGE ──
  '/': {
    title: 'Microservice Brands for Everyday Bharat | ' + BRAND,
    description: BRAND + ' connects everyday Bharat with trusted microservice brands in travel, legal, spiritual, events, dispute resolution and personal growth.',
    robots: 'index, follow',
    canonical: BASE + '/',
    ogTitle: 'Microservice Brands for Everyday Bharat | ' + BRAND,
    ogDescription: BRAND + ' connects everyday Bharat with trusted microservice brands in travel, legal, spiritual, events, dispute resolution and personal growth.',
    ogImage: LOGO,
    twitterTitle: BRAND + ' — Everyday Bharat',
    twitterDescription: 'Trusted microservice brands for travel, legal, spiritual, events, dispute resolution and personal growth.',
    structuredData: [
      orgSchema,
      webSiteSchema,
      webPage('Microservice Brands for Everyday Bharat | ' + BRAND, BRAND + ' connects everyday Bharat with trusted microservice brands in travel, legal, spiritual, events, dispute resolution and personal growth.', BASE + '/'),
      bc1(BRAND, '/'),
    ],
  },

  // ── BRAND HUB PAGES ──
  '/legal-champ': {
    title: 'Legal Champ: Document & Paralegal Services | ' + BRAND,
    description: 'Professional legal document preparation and paralegal workflows. Fast, affordable legal support for everyday Bharat.',
    robots: 'index, follow',
    canonical: BASE + '/legal-champ',
    ogTitle: 'Legal Champ: Document & Paralegal Services',
    ogDescription: 'Professional legal document preparation and paralegal workflows.',
    ogImage: LOGO,
    twitterTitle: 'Legal Champ | ' + BRAND,
    twitterDescription: 'Fast, affordable legal support for everyday Bharat.',
    structuredData: [
      webPage('Legal Champ: Document & Paralegal Services', 'Professional legal document preparation and paralegal workflows.', BASE + '/legal-champ'),
      bc1('Legal Champ', '/legal-champ'),
    ],
  },

  '/ritual': {
    title: 'Ritual Guru: Temple-Grade Puja Kits | ' + BRAND,
    description: 'Authentic temple-grade puja kits and spiritual services delivered to your door. Ritual Guru by ' + BRAND + '.',
    robots: 'index, follow',
    canonical: BASE + '/ritual',
    ogTitle: 'Ritual Guru: Temple-Grade Puja Kits',
    ogDescription: 'Authentic temple-grade puja kits and spiritual services delivered to your door.',
    ogImage: LOGO,
    twitterTitle: 'Ritual Guru | ' + BRAND,
    twitterDescription: 'Temple-grade puja kits and spiritual services.',
    structuredData: [
      webPage('Ritual Guru: Temple-Grade Puja Kits', 'Authentic temple-grade puja kits and spiritual services.', BASE + '/ritual'),
      bc1('Ritual Guru', '/ritual'),
    ],
  },

  '/swdhya': {
    title: 'Swdhya: Reflection & Personal Growth | ' + BRAND,
    description: 'Explore philosophical reflections on being, choice, and transformation. Swdhya by ' + BRAND + '.',
    robots: 'index, follow',
    canonical: BASE + '/swdhya',
    ogTitle: 'Swdhya: Reflection & Personal Growth',
    ogDescription: 'Philosophical reflections on being, choice, and transformation.',
    ogImage: LOGO,
    twitterTitle: 'Swdhya | ' + BRAND,
    twitterDescription: 'Reflection and personal growth.',
    structuredData: [
      webPage('Swdhya: Reflection & Personal Growth', 'Philosophical reflections on being, choice, and transformation.', BASE + '/swdhya'),
      bc1('Swdhya', '/swdhya'),
    ],
  },

  '/no-fault': {
    title: 'No Fault: Guided Dispute Resolution | ' + BRAND,
    description: 'Resolve disputes fairly with guided online dispute resolution. No Fault by ' + BRAND + '.',
    robots: 'index, follow',
    canonical: BASE + '/no-fault',
    ogTitle: 'No Fault: Guided Dispute Resolution',
    ogDescription: 'Resolve disputes fairly with guided online dispute resolution.',
    ogImage: LOGO,
    twitterTitle: 'No Fault | ' + BRAND,
    twitterDescription: 'Guided online dispute resolution.',
    structuredData: [
      webPage('No Fault: Guided Dispute Resolution', 'Resolve disputes fairly with guided online dispute resolution.', BASE + '/no-fault'),
      bc1('No Fault', '/no-fault'),
    ],
  },

  '/expoweek': {
    title: 'Expo Week: Virtual Events & Offers | ' + BRAND,
    description: 'Discover exclusive virtual events and limited-time offers. Expo Week by ' + BRAND + '.',
    robots: 'index, follow',
    canonical: BASE + '/expoweek',
    ogTitle: 'Expo Week: Virtual Events & Offers',
    ogDescription: 'Exclusive virtual events and limited-time offers.',
    ogImage: LOGO,
    twitterTitle: 'Expo Week | ' + BRAND,
    twitterDescription: 'Virtual events and exclusive offers.',
    structuredData: [
      webPage('Expo Week: Virtual Events & Offers', 'Exclusive virtual events and limited-time offers.', BASE + '/expoweek'),
      bc1('Expo Week', '/expoweek'),
    ],
  },

  // ── BRAND STORE PAGES ──
  '/legalchamp-store': {
    title: 'Legal Champ Store | ' + BRAND,
    description: 'Browse Legal Champ service packages for document preparation and paralegal support.',
    robots: 'index, follow',
    canonical: BASE + '/legalchamp-store',
    ogTitle: 'Legal Champ Store',
    ogDescription: 'Legal service packages for document preparation.',
    ogImage: LOGO,
    structuredData: [
      webPage('Legal Champ Store', 'Legal service packages.', BASE + '/legalchamp-store'),
      bc2('Legal Champ', '/legal-champ', 'Store', '/legalchamp-store'),
    ],
  },

  '/ritual-store': {
    title: 'Ritual Guru Store | ' + BRAND,
    description: 'Shop authentic puja kits and spiritual service packages from Ritual Guru.',
    robots: 'index, follow',
    canonical: BASE + '/ritual-store',
    ogTitle: 'Ritual Guru Store',
    ogDescription: 'Authentic puja kits and spiritual service packages.',
    ogImage: LOGO,
    structuredData: [
      webPage('Ritual Guru Store', 'Puja kits and spiritual services.', BASE + '/ritual-store'),
      bc2('Ritual Guru', '/ritual', 'Store', '/ritual-store'),
    ],
  },

  '/swdhya-store': {
    title: 'Swdhya Store | ' + BRAND,
    description: 'Browse Swdhya personal growth and reflection resources.',
    robots: 'index, follow',
    canonical: BASE + '/swdhya-store',
    ogTitle: 'Swdhya Store',
    ogDescription: 'Personal growth and reflection resources.',
    ogImage: LOGO,
    structuredData: [
      webPage('Swdhya Store', 'Personal growth resources.', BASE + '/swdhya-store'),
      bc2('Swdhya', '/swdhya', 'Store', '/swdhya-store'),
    ],
  },

  '/nofault-store': {
    title: 'No Fault Store | ' + BRAND,
    description: 'Browse No Fault dispute resolution service packages.',
    robots: 'index, follow',
    canonical: BASE + '/nofault-store',
    ogTitle: 'No Fault Store',
    ogDescription: 'Dispute resolution service packages.',
    ogImage: LOGO,
    structuredData: [
      webPage('No Fault Store', 'Dispute resolution packages.', BASE + '/nofault-store'),
      bc2('No Fault', '/no-fault', 'Store', '/nofault-store'),
    ],
  },

  // ── SERVICE PAGES ──
  '/appointment': {
    title: 'Book an Appointment | ' + BRAND,
    description: 'Schedule appointments for supported services. Choose your slot, provide details, get confirmation.',
    robots: 'index, follow',
    canonical: BASE + '/appointment',
    ogTitle: 'Book an Appointment | ' + BRAND,
    ogDescription: 'Schedule appointments for supported services.',
    ogImage: LOGO,
    structuredData: [
      webPage('Book an Appointment', 'Schedule appointments for supported services.', BASE + '/appointment'),
      bc1('Appointment', '/appointment'),
      serviceSchema('Appointment Booking', 'Schedule appointments for supported services.', 'Booking'),
    ],
  },

  '/submit-request': {
    title: 'Submit a Service Request | ' + BRAND,
    description: 'Submit a new request with your details and Order ID. Track progress from submission to completion.',
    robots: 'index, follow',
    canonical: BASE + '/submit-request',
    ogTitle: 'Submit a Service Request',
    ogDescription: 'Submit a new request with your details and Order ID.',
    ogImage: LOGO,
    structuredData: [
      webPage('Submit a Service Request', 'Submit a new request with your details and Order ID.', BASE + '/submit-request'),
      bc1('Submit Request', '/submit-request'),
      serviceSchema('Service Request Submission', 'Submit a new service request with basic details and Order ID.', 'Inquiry'),
    ],
  },

  '/track-request': {
    title: 'Track Your Request | ' + BRAND,
    description: 'Check the status of your existing request. Stay informed as your case moves through review stages.',
    robots: 'index, follow',
    canonical: BASE + '/track-request',
    ogTitle: 'Track Your Request',
    ogDescription: 'Check the status of your existing request.',
    ogImage: LOGO,
    structuredData: [
      webPage('Track Your Request', 'Check the status of your existing request.', BASE + '/track-request'),
      bc1('Track Request', '/track-request'),
      serviceSchema('Request Tracking', 'Check the status of an existing request.', 'Tracking'),
    ],
  },

  '/amend-request': {
    title: 'Amend Your Request | ' + BRAND,
    description: 'Request changes to an existing submission without starting over.',
    robots: 'index, follow',
    canonical: BASE + '/amend-request',
    ogTitle: 'Amend Your Request',
    ogDescription: 'Request changes to an existing submission.',
    ogImage: LOGO,
    structuredData: [
      webPage('Amend Your Request', 'Request changes to an existing submission.', BASE + '/amend-request'),
      bc1('Amend Request', '/amend-request'),
      serviceSchema('Amendment Request', 'Request changes to an existing submission.', 'Inquiry'),
    ],
  },

  '/rx-slot': {
    title: 'Book RX Slot | ' + BRAND,
    description: 'Book or reschedule doctor and treatment appointments based on your travel plans and prescription needs.',
    robots: 'index, follow',
    canonical: BASE + '/rx-slot',
    ogTitle: 'Book RX Slot',
    ogDescription: 'Book or reschedule doctor and treatment appointments.',
    ogImage: LOGO,
    structuredData: [
      webPage('Book RX Slot', 'Book or reschedule doctor and treatment appointments.', BASE + '/rx-slot'),
      bc1('RX Slot', '/rx-slot'),
      serviceSchema('RX Slot Booking', 'Book or reschedule doctor and treatment appointments.', 'Booking'),
    ],
  },

  '/drop-docs': {
    title: 'Upload Documents | ' + BRAND,
    description: 'Securely upload supporting documents to your case through Drop Docs.',
    robots: 'index, follow',
    canonical: BASE + '/drop-docs',
    ogTitle: 'Upload Documents',
    ogDescription: 'Securely upload supporting documents to your case.',
    ogImage: LOGO,
    structuredData: [
      webPage('Upload Documents', 'Securely upload supporting documents.', BASE + '/drop-docs'),
      bc1('Drop Docs', '/drop-docs'),
    ],
  },

  '/enterprise-assist': {
    title: 'Enterprise Assist | ' + BRAND,
    description: 'Get help with active business or service-related cases. Enterprise-grade support from ' + BRAND + '.',
    robots: 'index, follow',
    canonical: BASE + '/enterprise-assist',
    ogTitle: 'Enterprise Assist',
    ogDescription: 'Enterprise-grade support for business cases.',
    ogImage: LOGO,
    structuredData: [
      webPage('Enterprise Assist', 'Enterprise-grade support for business cases.', BASE + '/enterprise-assist'),
      bc1('Enterprise Assist', '/enterprise-assist'),
      serviceSchema('Enterprise Assist', 'Get help with business or service-related cases.', 'Support'),
    ],
  },

  '/leave-review': {
    title: 'Leave a Review | ' + BRAND,
    description: 'Share your experience after using a service. Your feedback helps improve service quality.',
    robots: 'index, follow',
    canonical: BASE + '/leave-review',
    ogTitle: 'Leave a Review',
    ogDescription: 'Share your experience after using a service.',
    ogImage: LOGO,
    structuredData: [
      webPage('Leave a Review', 'Share your experience after using a service.', BASE + '/leave-review'),
      bc1('Leave Review', '/leave-review'),
    ],
  },

  '/selfservice': {
    title: 'Self Service Portal | ' + BRAND,
    description: 'Access self-service tools for managing your requests, appointments, and account.',
    robots: 'index, follow',
    canonical: BASE + '/selfservice',
    ogTitle: 'Self Service Portal',
    ogDescription: 'Self-service tools for managing requests and appointments.',
    ogImage: LOGO,
    structuredData: [
      webPage('Self Service Portal', 'Self-service tools for managing requests.', BASE + '/selfservice'),
      bc1('Self Service', '/selfservice'),
    ],
  },

  '/loyalty': {
    title: 'Loyalty Program | ' + BRAND,
    description: 'Earn rewards and benefits with the ' + BRAND + ' loyalty program.',
    robots: 'index, follow',
    canonical: BASE + '/loyalty',
    ogTitle: 'Loyalty Program',
    ogDescription: 'Earn rewards with the ' + BRAND + ' loyalty program.',
    ogImage: LOGO,
    structuredData: [
      webPage('Loyalty Program', 'Earn rewards with the loyalty program.', BASE + '/loyalty'),
      bc1('Loyalty', '/loyalty'),
    ],
  },

  '/referral': {
    title: 'Referral Program | ' + BRAND,
    description: 'Refer friends and earn rewards with the ' + BRAND + ' referral program.',
    robots: 'index, follow',
    canonical: BASE + '/referral',
    ogTitle: 'Referral Program',
    ogDescription: 'Refer friends and earn rewards.',
    ogImage: LOGO,
    structuredData: [
      webPage('Referral Program', 'Refer friends and earn rewards.', BASE + '/referral'),
      bc1('Referral', '/referral'),
    ],
  },

  // ── INFORMATIONAL PAGES ──
  '/faq': {
    title: 'Frequently Asked Questions | ' + BRAND,
    description: 'Find answers about submitting requests, tracking orders, booking appointments, payments, and more.',
    robots: 'index, follow',
    canonical: BASE + '/faq',
    ogTitle: 'FAQ | ' + BRAND,
    ogDescription: 'Find answers about requests, orders, appointments, and payments.',
    ogImage: LOGO,
    structuredData: [
      webPage('Frequently Asked Questions', 'Find answers about requests, orders, appointments, and payments.', BASE + '/faq'),
      bc1('FAQ', '/faq'),
      faqSchema,
    ],
  },

  '/contact': {
    title: 'Contact Us | ' + BRAND,
    description: 'Reach ' + BRAND + ' — email one@wecare.digital, call +91 9330994400, or visit us in Kolkata.',
    robots: 'index, follow',
    canonical: BASE + '/contact',
    ogTitle: 'Contact Us | ' + BRAND,
    ogDescription: 'Reach ' + BRAND + ' — email, call, or visit us in Kolkata.',
    ogImage: LOGO,
    structuredData: [
      webPage('Contact Us', 'Reach ' + BRAND + ' — email, call, or visit.', BASE + '/contact'),
      bc1('Contact', '/contact'),
      localBusinessSchema,
    ],
  },

  '/careers-plus-culture': {
    title: 'Careers & Culture | ' + BRAND,
    description: 'Join the ' + BRAND + ' team. Explore careers, culture, and opportunities.',
    robots: 'index, follow',
    canonical: BASE + '/careers-plus-culture',
    ogTitle: 'Careers & Culture',
    ogDescription: 'Join the ' + BRAND + ' team.',
    ogImage: LOGO,
    structuredData: [
      webPage('Careers & Culture', 'Join the ' + BRAND + ' team.', BASE + '/careers-plus-culture'),
      bc1('Careers', '/careers-plus-culture'),
    ],
  },

  '/partner-up': {
    title: 'Partner Up | ' + BRAND,
    description: 'Partner with ' + BRAND + ' to grow your business with our microservice brand network.',
    robots: 'index, follow',
    canonical: BASE + '/partner-up',
    ogTitle: 'Partner Up | ' + BRAND,
    ogDescription: 'Partner with ' + BRAND + ' to grow your business.',
    ogImage: LOGO,
    structuredData: [
      webPage('Partner Up', 'Partner with ' + BRAND + '.', BASE + '/partner-up'),
      bc1('Partner Up', '/partner-up'),
    ],
  },

  '/gift-card': {
    title: 'Buy Gift Cards | ' + BRAND,
    description: 'Send e-gift cards instantly with any amount and a personal message. ' + BRAND + ' gift cards.',
    robots: 'index, follow',
    canonical: BASE + '/gift-card',
    ogTitle: 'Buy Gift Cards',
    ogDescription: 'Send e-gift cards instantly with any amount.',
    ogImage: LOGO,
    structuredData: [
      webPage('Buy Gift Cards', 'Send e-gift cards instantly.', BASE + '/gift-card'),
      bc1('Gift Card', '/gift-card'),
    ],
  },

  '/one': {
    title: 'One | ' + BRAND,
    description: BRAND + ' One — your single point of access for all services.',
    robots: 'index, follow',
    canonical: BASE + '/one',
    ogTitle: 'One | ' + BRAND,
    ogDescription: 'Your single point of access for all services.',
    ogImage: LOGO,
    structuredData: [
      webPage('One', 'Single point of access for all services.', BASE + '/one'),
      bc1('One', '/one'),
    ],
  },

  // ── LEGAL PAGES (noindex) ──
  '/legal-stuff': {
    title: 'Terms & Conditions | ' + BRAND,
    description: 'Terms and conditions for using ' + BRAND + ' services.',
    robots: 'noindex, follow',
    canonical: BASE + '/legal-stuff',
    structuredData: [
      webPage('Terms & Conditions', 'Terms and conditions.', BASE + '/legal-stuff'),
      bc1('Legal Stuff', '/legal-stuff'),
    ],
  },

  '/privacy': {
    title: 'Privacy Policy | ' + BRAND,
    description: 'Privacy policy for ' + BRAND + '.',
    robots: 'noindex, follow',
    canonical: BASE + '/privacy',
    structuredData: [
      webPage('Privacy Policy', 'Privacy policy.', BASE + '/privacy'),
      bc1('Privacy', '/privacy'),
    ],
  },

  // ── UTILITY PAGES ──
  '/blog': {
    title: 'Blog | ' + BRAND,
    description: 'Philosophical reflections by Swdhya Vaksetu on being, choice, and transformation.',
    robots: 'index, follow',
    canonical: BASE + '/blog',
    ogTitle: 'Blog | ' + BRAND,
    ogDescription: 'Philosophical reflections on being, choice, and transformation.',
    ogImage: LOGO,
    structuredData: [
      webPage('Blog', 'Philosophical reflections by Swdhya Vaksetu.', BASE + '/blog'),
      bc1('Blog', '/blog'),
    ],
  },

  '/sitemap': {
    title: 'Sitemap | ' + BRAND,
    description: 'Browse all pages on ' + BRAND + '.',
    robots: 'index, follow',
    canonical: BASE + '/sitemap',
    structuredData: [],
  },

  '/search': {
    title: 'Search | ' + BRAND,
    description: 'Search ' + BRAND + ' for services, products, and blog posts.',
    robots: 'noindex, follow',
    canonical: BASE + '/search',
    structuredData: [],
  },

  '/star': {
    title: 'Star | ' + BRAND,
    description: BRAND + ' Star — featured content and highlights.',
    robots: 'index, follow',
    canonical: BASE + '/star',
    structuredData: [
      webPage('Star', 'Featured content and highlights.', BASE + '/star'),
      bc1('Star', '/star'),
    ],
  },

  '/download-app': {
    title: 'Download the App | ' + BRAND,
    description: 'Download the ' + BRAND + ' app for iOS and Android.',
    robots: 'index, follow',
    canonical: BASE + '/download-app',
    ogTitle: 'Download the App',
    ogDescription: 'Get the ' + BRAND + ' app for iOS and Android.',
    ogImage: LOGO,
    structuredData: [
      webPage('Download the App', 'Get the app for iOS and Android.', BASE + '/download-app'),
      bc1('Download App', '/download-app'),
    ],
  },

  // ── SYSTEM PAGES (noindex, nofollow) ──
  '/cart-page': {
    title: 'Cart | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/cart-page',
    structuredData: [],
  },

  '/checkout': {
    title: 'Checkout | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/checkout',
    structuredData: [],
  },

  '/thank-you': {
    title: 'Thank You | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/thank-you',
    structuredData: [],
  },

  '/login': {
    title: 'Login | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/login',
    structuredData: [],
  },

  '/signup': {
    title: 'Sign Up | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/signup',
    structuredData: [],
  },

  '/404': {
    title: 'Page Not Found | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/',
    structuredData: [],
  },

  '/members-area': {
    title: 'Members Area | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/members-area',
    structuredData: [],
  },

  '/account/my-orders': {
    title: 'My Orders | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/account/my-orders',
    structuredData: [],
  },

  '/account/my-subscriptions': {
    title: 'My Subscriptions | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/account/my-subscriptions',
    structuredData: [],
  },

  '/account/my-rewards': {
    title: 'My Rewards | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/account/my-rewards',
    structuredData: [],
  },

  '/account/settings': {
    title: 'Account Settings | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/account/settings',
    structuredData: [],
  },

  '/order-notes': {
    title: 'Order Notes | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/order-notes',
    structuredData: [],
  },

  '/bring-friends': {
    title: 'Bring Friends | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/bring-friends',
    structuredData: [],
  },

  '/referral-landing': {
    title: 'Referral | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/referral',
    structuredData: [],
  },

  // ── CUSTOM LOGIN ──
  '/custom-login': {
    title: 'Login | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/login',
    structuredData: [],
  },

  // ── FULLSCREEN PAGE ──
  '/fullscreen': {
    title: BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/',
    structuredData: [],
  },

  // ── SIDE CART ──
  '/side-cart': {
    title: 'Cart | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/cart-page',
    structuredData: [],
  },

  // ── SEARCH SUGGESTIONS ──
  '/search-suggestions': {
    title: 'Search | ' + BRAND,
    description: '',
    robots: 'noindex, nofollow',
    canonical: BASE + '/search',
    structuredData: [],
  },
};
