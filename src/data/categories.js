export const CATEGORIES = [
  { slug: 'criminal', name: 'Criminal Law', icon: 'shield' },
  { slug: 'family', name: 'Family & Divorce', icon: 'users' },
  { slug: 'property', name: 'Property & Real Estate', icon: 'building' },
  { slug: 'corporate', name: 'Corporate Law', icon: 'briefcase' },
  { slug: 'cyber', name: 'Cyber Crime', icon: 'lock' },
  { slug: 'consumer', name: 'Consumer Rights', icon: 'bag' },
  { slug: 'immigration', name: 'Immigration', icon: 'plane' },
  { slug: 'other', name: 'Other Matters', icon: 'dots' },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));
