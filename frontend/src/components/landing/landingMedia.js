import {
  Armchair,
  BadgeCheck,
  Blinds,
  ClipboardList,
  CreditCard,
  Droplet,
  FileText,
  Frame,
  KeyRound,
  LifeBuoy,
  ListChecks,
  MessageSquareText,
  PaintRoller,
  ShieldCheck,
  ThumbsUp,
  Tv,
  UserCheck,
  Wrench,
} from 'lucide-react';

/**
 * Public landing copy, product-preview sample data, and local image map.
 * Photos are temporary Unsplash stand-ins (indoor apartment mood); swap files in
 * /public/landing without code changes.
 * Every quote, price, and suburb here is illustrative — never real customer activity.
 */
export const LANDING_HERO = {
  src: '/landing/hero-living.webp',
  width: 1400,
  height: 933,
  alt: 'Bright apartment living room with newly installed timber floating shelves on the wall',
};

/** Illustrative Taskio Client view shown over the hero photo. Sample data only. */
export const LANDING_HERO_PREVIEW = {
  category: 'Mounting',
  title: 'Install two floating shelves',
  suburb: 'Richmond, VIC',
  quotes: [
    { expert: 'Expert A', price: '$185', selected: true },
    { expert: 'Expert B', price: '$220' },
  ],
  expertStatus: 'Checked by Taskio',
  paymentStatus: 'Paid through Taskio · released after you approve',
};

/** Short job list in the hero so visitors see the scope within seconds. */
export const LANDING_HERO_JOBS = [
  'Shelves & TVs',
  'Flat-pack assembly',
  'Curtains & blinds',
  'Picture hanging',
  'Wall patching',
  'Make-good',
];

export const LANDING_PILLARS = [
  {
    title: 'Clearer job details',
    description:
      'A short, structured brief with photos, so every Expert quotes on the same scope with less back-and-forth.',
    icon: FileText,
  },
  {
    title: 'Suitable Experts, checked by Taskio',
    description:
      'Experts apply and Taskio reviews them before they can quote. It is not an open directory anyone can join.',
    icon: BadgeCheck,
  },
  {
    title: 'A simple quote-to-payment flow',
    description:
      'Compare quotes, book and pay through Taskio in one place. Payment is released to the Expert after you approve the completed job.',
    icon: ListChecks,
  },
];

export const LANDING_STEPS = [
  {
    title: 'Tell us about the job',
    description: 'Answer a few short questions and add photos.',
    icon: ClipboardList,
  },
  {
    title: 'Receive quotes',
    description: 'Experts checked by Taskio can quote and ask questions on the job.',
    icon: MessageSquareText,
  },
  {
    title: 'Choose your Expert',
    description: 'Compare price and details, then pick the quote that suits you.',
    icon: UserCheck,
  },
  {
    title: 'Pay through Taskio',
    description: 'Pay by card through Stripe when you book. Your total is shown before you accept.',
    icon: CreditCard,
  },
  {
    title: 'Approve the work',
    description: 'When the job is done, you approve it and Taskio releases payment to the Expert.',
    icon: ThumbsUp,
  },
];

export const LANDING_SERVICES = [
  {
    name: 'Mounting',
    description: 'Shelves, TVs and mirrors',
    image: '/landing/cat-mounting.webp',
    icon: Tv,
  },
  {
    name: 'Furniture assembly',
    description: 'Flat-pack beds, desks and wardrobes',
    image: '/landing/cat-assembly.webp',
    icon: Armchair,
  },
  {
    name: 'Minor repairs',
    description: 'Hinges, handles and cabinet doors',
    image: '/landing/cat-repairs.webp',
    icon: Wrench,
  },
  {
    name: 'Picture hanging',
    description: 'Frames and artwork',
    image: '/landing/cat-hanging.webp',
    icon: Frame,
  },
  {
    name: 'Curtains & blinds',
    description: 'Rods, blinds and small fixes',
    image: '/landing/cat-curtains.webp',
    icon: Blinds,
  },
  {
    name: 'Wall patching',
    description: 'Small holes and cosmetic touch-ups',
    image: '/landing/cat-walls.webp',
    icon: PaintRoller,
  },
  {
    name: 'Silicone touch-ups',
    description: 'Cosmetic edges in kitchens and bathrooms',
    image: '/landing/cat-silicone.webp',
    icon: Droplet,
  },
  {
    name: 'Apartment make-good',
    description: 'Small fixes before you hand back the keys',
    image: '/landing/cat-makegood.webp',
    icon: KeyRound,
  },
];

/** Real platform mechanics only — no insurance, licensing, background-check or guarantee claims. */
export const LANDING_TRUST = [
  {
    title: 'Experts are reviewed before quoting',
    description: 'Experts apply and complete onboarding. Taskio reviews each one before they can quote.',
    icon: BadgeCheck,
  },
  {
    title: 'Card payment through Stripe',
    description: 'You pay through Taskio using Stripe checkout when you book an Expert.',
    icon: CreditCard,
  },
  {
    title: 'Released after you approve',
    description: 'Taskio releases payment to the Expert after you approve the completed job.',
    icon: ShieldCheck,
  },
  {
    title: 'Everything on one job record',
    description: 'Quotes, messages and agreed changes stay together in Taskio.',
    icon: MessageSquareText,
  },
  {
    title: 'A person to help',
    description: 'During the pilot, someone at Taskio can help when something is unclear.',
    icon: LifeBuoy,
  },
];

export const LANDING_FEE = {
  summary:
    'Clients pay a 5% Taskio service fee, with a minimum of A$4.99 and a maximum of A$19.99 per booking.',
  expertNote: "Expert fees are deducted from the Expert's quote and are not added again to your booking.",
  totalNote: 'Your total, including the service fee, is shown before you accept a quote.',
};

export function landingLaunchFacts({ postingOpen = false, canExpertApply = false } = {}) {
  return [
    {
      label: 'Access',
      value: postingOpen
        ? 'Public homeowner posting — sign up or log in, no invitation'
        : 'Homeowner posting closed — join the waitlist',
    },
    { label: 'Area', value: 'Inner Melbourne' },
    { label: 'Scope', value: 'Small indoor jobs in Phase 1 categories' },
    {
      label: 'Experts',
      value: canExpertApply
        ? 'Public applications — Taskio reviews before marketplace access'
        : 'Expert waitlist — Taskio reviews before marketplace access',
    },
  ];
}

export const LANDING_LAUNCH_FACTS = landingLaunchFacts();
