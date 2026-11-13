import type { z } from "zod";
import { listMediaQuerySchema, updateMediaSchema } from "./media.validation.js";

export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;
