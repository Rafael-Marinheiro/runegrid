import { ABILITIES, CONDITIONS, DAMAGE_TYPES, SIZES } from '@core/models/creature';
import { z } from 'zod';

export const PosSchema = z
  .object({ x: z.number().int().min(0), y: z.number().int().min(0) })
  .describe('Grid cell; x grows to the right, y grows downward; 1 cell = 5 ft');
export const AbilitySchema = z.enum(ABILITIES);
export const ConditionSchema = z.enum(CONDITIONS);
export const DamageTypeSchema = z.enum(DAMAGE_TYPES);
export const SizeSchema = z.enum(SIZES);
export const ModeSchema = z.enum(['normal', 'advantage', 'disadvantage']);
export const AreaSchema = z
  .object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1),
    h: z.number().int().min(1),
  })
  .describe('Rectangle of cells: top-left corner (x,y), width w, height h');
