import {
  BadgeCheck,
  Camera,
  FileText,
  LifeBuoy,
  ListChecks,
  Lock,
  MapPin,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react';

/**
 * Public landing copy, product-preview sample data, and local image map.
 * Photos are temporary Unsplash stand-ins (indoor apartment mood).
 * Every quote, price, and suburb here is illustrative — never real customer activity.
 */
export const LANDING_HERO = {
  src: '/landing/hero-living.webp',
  width: 1400,
  height: 933,
  alt: 'Bright apartment living room with newly installed timber floating shelves on the wall',
};

/** Illustrative Taskio product state shown over the hero photo. */
export const LANDING_HERO_PREVIEW = {
  category: 'Mounting',
  title: 'Install floating shelves in living room',
  suburb: 'Richmond, VIC',
  quotes: '3 quotes',
  range: '$180 – $260',
  expertStatus: 'Verified Expert ready',
  paymentStatus: 'Payment released after you approve',
};

export const LANDING_PROOF = [
  { label: 'Verified Experts', detail: 'Invited and checked by Taskio', icon: BadgeCheck },
  { label: 'Compare quotes', detail: 'One thread, side by side', icon: ListChecks },
  { label: 'Payment through Taskio', detail: 'Released after you approve', icon: ShieldCheck },
  { label: 'Inner Melbourne', detail: 'Small indoor jobs only', icon: MapPin },
];

export const LANDING_SERVICES = [
  {
    name: 'Mounting',
    description: 'TVs, shelves, and mirrors',
    image: '/landing/cat-mounting.webp',
  },
  {
    name: 'Assembly',
    description: 'Flat-pack furniture, beds, desks, wardrobes',
    image: '/landing/cat-assembly.webp',
  },
  {
    name: 'Small Fixture Repairs',
    description: 'Hinges, cabinet alignment, handle replacement',
    image: '/landing/cat-repairs.webp',
  },
  {
    name: 'Hanging',
    description: 'Picture frames and artwork',
    image: '/landing/cat-hanging.webp',
  },
  {
    name: 'Curtains & Blinds',
    description: 'Rods, blinds, and minor window-treatment fixes',
    image: '/landing/cat-curtains.webp',
  },
  {
    name: 'Wall Fixes',
    description: 'Small holes and minor cosmetic wall repairs',
    image: '/landing/cat-walls.webp',
  },
  {
    name: 'Silicone Touch-ups',
    description: 'Kitchen and bathroom edges',
    image: '/landing/cat-silicone.webp',
  },
  {
    name: 'Make-Good',
    description: 'Apartment make-good before handover',
    image: '/landing/cat-makegood.webp',
  },
];

/**
 * Three product stages. `preview` drives the mini Taskio UI in each stage,
 * so the section shows the product instead of describing a marketplace.
 */
export const LANDING_JOURNEY = [
  {
    index: '01',
    stage: 'Post',
    title: 'One structured brief',
    description: 'Answer the same short questions every time, so Experts quote the same job.',
    preview: {
      kind: 'brief',
      heading: 'Job brief',
      rows: [
        { label: 'Category', value: 'Mounting' },
        { label: 'Job', value: 'Mount 65" TV on plasterboard' },
        { label: 'Suburb', value: 'Richmond, VIC' },
        { label: 'Access', value: 'Weekday evenings' },
      ],
      footnote: { icon: Camera, text: '3 photos attached' },
    },
  },
  {
    index: '02',
    stage: 'Compare',
    title: 'Quotes side by side',
    description: 'Verified Experts reply in one thread. You compare and choose who to book.',
    preview: {
      kind: 'quotes',
      heading: 'Quotes received',
      quotes: [
        { expert: 'Expert A', meta: 'Verified · Richmond', price: '$185', selected: true },
        { expert: 'Expert B', meta: 'Verified · Abbotsford', price: '$220' },
        { expert: 'Expert C', meta: 'Verified · Hawthorn', price: '$260' },
      ],
      footnote: { icon: MessageSquareText, text: 'Questions stay in the same thread' },
    },
  },
  {
    index: '03',
    stage: 'Approve',
    title: 'Pay when you approve',
    description:
      'Pay securely through Taskio. Payment is released to the Expert after you approve the completed job.',
    preview: {
      kind: 'payment',
      heading: 'Payment status',
      states: [
        { text: 'Payment set up through Taskio', done: true },
        { text: 'Expert completes the job', done: true },
        { text: 'You approve the work', done: false },
        { text: 'Payment released to the Expert', done: false },
      ],
      footnote: { icon: Lock, text: 'Payment is released only after you approve' },
    },
  },
];

export const LANDING_PILLARS = [
  {
    title: 'Clear job briefs',
    description: 'A structured brief replaces long message threads, so quotes describe the same work.',
    icon: FileText,
  },
  {
    title: 'Verified Experts',
    description: 'Experts are invited and verified by Taskio — not an open directory anyone can join.',
    icon: BadgeCheck,
  },
  {
    title: 'Quotes in one place',
    description: 'Compare Expert quotes and messages on one job instead of chasing separate replies.',
    icon: ListChecks,
  },
  {
    title: 'Payment you control',
    description:
      'Pay securely through Taskio. Payment is released to the Expert after you approve the completed job.',
    icon: ShieldCheck,
  },
  {
    title: 'Human support in private launch',
    description: 'Early access is small on purpose, so a person at Taskio can help when something is unclear.',
    icon: LifeBuoy,
  },
];

export const LANDING_LAUNCH_FACTS = [
  { label: 'Access', value: 'Invitation only — public signup is not open' },
  { label: 'Area', value: 'Inner Melbourne' },
  { label: 'Scope', value: 'Small indoor jobs in Phase 1 categories' },
  { label: 'Experts', value: 'Invited and verified by Taskio' },
];

export const LANDING_EXAMPLES = [
  {
    title: 'Mount a wall shelf unit',
    suburb: 'Richmond, VIC',
    detail: 'Quoted in one thread, paid after approval',
    image: '/landing/example-shelves.webp',
    alt: 'Wall-mounted timber shelving unit holding folded towels and toiletries',
  },
  {
    title: 'Curtain rod install',
    suburb: 'South Yarra, VIC',
    detail: 'Three Expert quotes, one conversation',
    image: '/landing/example-curtains.webp',
    alt: 'Full-length curtains beside a window in a bright living room',
  },
  {
    title: 'Flat-pack furniture assembly',
    suburb: 'Carlton, VIC',
    detail: 'Payment released after approval',
    image: '/landing/example-assembly.webp',
    alt: 'Assembled leather sectional sofa and timber coffee table in a living room',
  },
];
