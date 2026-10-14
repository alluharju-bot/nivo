import { z } from 'zod';

export const distributionOptionsSchema = z
  .object({
    axis: z.enum(['x', 'y', 'z']),
    reverse: z.boolean(),
    count: z.number().int().min(2).max(1001),
    measure: z.enum(['extent', 'span', 'step', 'gap']),
    value: z.number().finite().nonnegative().max(100000),
    reference: z.enum(['min', 'center', 'max']),
  })
  .refine((o) => o.value > 0 || o.measure === 'gap');
export const distributionSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(['bodies', 'guides']),
  mode: z.enum(['copy', 'arrange']),
  options: distributionOptionsSchema,
  members: z
    .array(
      z.object({
        ids: z.array(z.string().min(1).max(100)).min(1).max(10000),
        groupId: z.string().min(1).max(100).optional(),
      }),
    )
    .min(1)
    .max(1001),
});
export type DistributionOptions = z.infer<typeof distributionOptionsSchema>;
export type Distribution = z.infer<typeof distributionSchema>;
