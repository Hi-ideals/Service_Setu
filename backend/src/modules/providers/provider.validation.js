import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, for example 09:30');
const minor = z.coerce.number().int().min(0, 'Amount cannot be negative');
const pincode = z.string().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit pincode');

export const updateProfileSchema = z
  .object({
    businessName: z.string().trim().max(150).nullish(),
    headline: z.string().trim().max(160).nullish(),
    bio: z.string().trim().max(2000).nullish(),
    experienceYears: z.coerce.number().int().min(0).max(70).optional(),
    languages: z.array(z.string().trim().min(2).max(40)).max(10).optional(),
    skills: z.array(z.string().trim().min(2).max(60)).max(30).optional(),
    slotBufferMinutes: z.coerce.number().int().min(0).max(240).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const availabilityStatusSchema = z.object({
  isAcceptingBookings: z.coerce.boolean(),
});

export const serviceSchema = z.object({
  categoryId: z.string().uuid('Choose a valid service category'),
  priceMinor: minor,
  pricingUnit: z.enum(['per_visit', 'per_hour', 'per_unit', 'quote_on_inspection']).optional(),
  // The visit charge was withdrawn from the product. Any value a client still
  // sends is accepted and ignored rather than rejected, so an older cached
  // build of the app does not start failing to save an offering.
  visitChargeMinor: minor.default(0).optional(),
  isActive: z.coerce.boolean().default(true),
});

export const areaSchema = z.object({
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincodes: z.array(pincode).max(60).default([]),
  centerLat: z.coerce.number().min(-90).max(90).nullish(),
  centerLng: z.coerce.number().min(-180).max(180).nullish(),
  radiusKm: z.coerce.number().min(0.5).max(200).default(10),
  isActive: z.coerce.boolean().default(true),
});

export const areaUpdateSchema = areaSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Provide at least one field to update' },
);

const windowShape = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0, 'Day must be 0 (Sunday) to 6 (Saturday)').max(6),
    startTime: time,
    endTime: time,
    isActive: z.coerce.boolean().default(true),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'The end time must be after the start time',
    path: ['endTime'],
  });

export const windowSchema = windowShape;

export const scheduleSchema = z.object({
  windows: z.array(windowShape).max(35, 'At most five windows per day'),
});

export const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD'),
    isAvailable: z.coerce.boolean().default(false),
    startTime: time.nullish(),
    endTime: time.nullish(),
    reason: z.string().trim().max(200).nullish(),
  })
  .refine((v) => !v.isAvailable || (v.startTime && v.endTime && v.endTime > v.startTime), {
    message: 'Extra working hours need a start and end time',
    path: ['startTime'],
  });

export const idParamSchema = z.object({ id: z.string().uuid('Invalid identifier') });
export const categoryParamSchema = z.object({ categoryId: z.string().uuid('Invalid identifier') });


/**
 * A payout destination, validated as a whole rather than field by field.
 *
 * The discriminated union is the point: a UPI destination with a stray IFSC,
 * or a bank destination missing one, are both rejected here rather than
 * reaching the database and failing a check constraint the provider cannot
 * read. The same completeness rule exists in the schema as a backstop.
 */
export const payoutMethodSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('upi'),
    // Deliberately loose on the handle, strict on the shape: banks keep adding
    // new PSP suffixes and an allowlist would reject valid ids within months.
    upiId: z
      .string()
      .trim()
      .regex(/^[\w.\-]{2,64}@[a-zA-Z]{2,32}$/, 'Enter a UPI id such as name@bank'),
    accountName: z.string().trim().min(2).max(120).optional(),
  }),
  z.object({
    method: z.literal('bank'),
    accountName: z.string().trim().min(2, 'Enter the name on the account').max(120),
    accountNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{6,20}$/, 'An account number is 6 to 20 digits'),
    ifsc: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'Enter a valid 11-character IFSC code'),
    bankName: z.string().trim().min(2).max(120).optional(),
  }),
]);

export default {
  payoutMethodSchema,
  updateProfileSchema, availabilityStatusSchema, serviceSchema, areaSchema,
  areaUpdateSchema, windowSchema, scheduleSchema, exceptionSchema,
  idParamSchema, categoryParamSchema,
};
