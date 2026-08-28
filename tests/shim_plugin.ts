import { z } from "npm:zod@4.1.8";
export function tool(input: unknown) {
  return input;
}
// deno-lint-ignore no-explicit-any
(tool as any).schema = z;
