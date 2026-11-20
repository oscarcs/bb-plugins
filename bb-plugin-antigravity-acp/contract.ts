// Typed host RPC shared by server.ts (caller) and host.ts (implementation).
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const agyHostContract = defineRpcContract({
  probe: {
    input: z.object({
      cliCommand: z.string().min(1).optional(),
    }).strict(),
    output: z.object({
      ok: z.boolean(),
      platform: z.string(),
      arch: z.string(),
      binaryPath: z.string().nullable(),
      version: z.string().nullable(),
      acpVersion: z.string().nullable(),
      error: z.string().nullable(),
    }),
  },
});
