import { BadRequestException } from '@nestjs/common';

// Administrative names verified against the National Bureau of Statistics.
export const NIGERIA_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;

export const NIGERIA_SERVICES = [
  {
    key: 'ride',
    name: 'Ride Booking',
    label: 'Ride',
    description: 'Request a ride with an approved local driver',
    icon: 'ride',
    kind: 'ride',
  },
  {
    key: 'food-delivery',
    name: 'Food Delivery',
    label: 'Food',
    description: 'Food pickup and delivery from your chosen vendor',
    icon: 'food',
    kind: 'delivery',
  },
  {
    key: 'grocery-delivery',
    name: 'Grocery Delivery',
    label: 'Grocery',
    description: 'Groceries and essentials delivered to your address',
    icon: 'shopping',
    kind: 'delivery',
  },
  {
    key: 'parcel-delivery',
    name: 'Parcel Delivery',
    label: 'Delivery',
    description: 'Send a parcel between two addresses',
    icon: 'delivery',
    kind: 'delivery',
  },
  {
    key: 'laundry',
    name: 'Laundry',
    label: 'Laundry',
    description: 'Clothes cleaning, collection and return',
    icon: 'laundry',
    kind: 'home',
  },
  {
    key: 'cleaning',
    name: 'Home Cleaning',
    label: 'Cleaning',
    description: 'Professional cleaning for your home or office',
    icon: 'cleaning',
    kind: 'home',
  },
  {
    key: 'plumbing',
    name: 'Plumbing',
    label: 'Plumbing',
    description: 'Plumbing installation, maintenance and repairs',
    icon: 'plumbing',
    kind: 'home',
  },
  {
    key: 'electrical',
    name: 'Electrical',
    label: 'Electrical',
    description: 'Electrical installation, maintenance and repairs',
    icon: 'electrical',
    kind: 'home',
  },
  {
    key: 'beauty',
    name: 'Beauty & Barber',
    label: 'Beauty',
    description: 'Hair, grooming and beauty appointments',
    icon: 'beauty',
    kind: 'home',
  },
  {
    key: 'car-wash',
    name: 'Car Wash',
    label: 'Car Wash',
    description: 'Vehicle washing and detailing',
    icon: 'car-wash',
    kind: 'home',
  },
  {
    key: 'tutoring',
    name: 'Tutoring',
    label: 'Tutoring',
    description: 'Lessons and tutoring at an agreed location',
    icon: 'tutoring',
    kind: 'home',
  },
  {
    key: 'carpentry',
    name: 'Carpentry',
    label: 'Carpentry',
    description: 'Furniture, fittings and woodwork repairs',
    icon: 'carpentry',
    kind: 'home',
  },
  {
    key: 'pharmacy',
    name: 'Pharmacy',
    label: 'Pharmacy',
    description: 'Request fulfilment from an approved pharmacy provider',
    icon: 'pharmacy',
    kind: 'delivery',
  },
  {
    key: 'tailoring',
    name: 'Tailoring',
    label: 'Tailoring',
    description: 'Fitting, alterations and custom clothing',
    icon: 'tailoring',
    kind: 'home',
  },
  {
    key: 'mechanic',
    name: 'Mechanic',
    label: 'Mechanic',
    description: 'Vehicle inspection, servicing and repairs',
    icon: 'mechanic',
    kind: 'home',
  },
  {
    key: 'shoe-repair',
    name: 'Shoe repair',
    label: 'Shoe Repair',
    description: 'Shoe repairs and finishing',
    icon: 'shoe',
    kind: 'home',
  },
  {
    key: 'provisions',
    name: 'Provisions',
    label: 'Provisions',
    description: 'Everyday groceries and essentials',
    icon: 'shopping',
    kind: 'home',
  },
  {
    key: 'soup-ingredients',
    name: 'Soup ingredients',
    label: 'Soup Ingredients',
    description: 'Ingredients for your next meal',
    icon: 'food',
    kind: 'home',
  },
  {
    key: 'solar',
    name: 'Solar installation',
    label: 'Solar',
    description: 'Solar installation and maintenance',
    icon: 'solar',
    kind: 'home',
  },
  {
    key: 'painting',
    name: 'Painting',
    label: 'Painting',
    description: 'Interior and exterior painting',
    icon: 'painting',
    kind: 'home',
  },
] as const;

export const SERVICE_NAMES: readonly string[] = NIGERIA_SERVICES.map(
  (s) => s.name,
);

export function cityKey(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (
    !normalized ||
    normalized.length > 60 ||
    !/^[\p{L}\p{N} .'-]+$/u.test(normalized)
  ) {
    throw new BadRequestException('Enter a valid Nigerian city or town');
  }
  return normalized;
}
