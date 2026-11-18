import { z } from "zod";
export const statuses = ["TODO", "IN_PROGRESS", "COMPLETED"] as const;
export const priorities = ["LOW", "MEDIUM", "HIGH"] as const;
const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72)
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "Password must be at most 72 bytes",
  );
export const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password,
});
export const loginSchema = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});
const dueDate = z.iso.date().nullable().optional();
const taskFields = {
  title: z.string().trim().min(1, "A title is required").max(160),
  description: z.string().trim().max(3000),
  status: z.enum(statuses),
  priority: z.enum(priorities),
  dueDate,
};
export const taskSchema = z.strictObject({
  ...taskFields,
  description: taskFields.description.default(""),
  status: taskFields.status.default("TODO"),
  priority: taskFields.priority.default("MEDIUM"),
});
// PATCH must not inherit create defaults: omitted fields must remain unchanged.
export const patchSchema = z
  .strictObject(taskFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");
export const filterSchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export const idSchema = z.uuid();
