// Typed RPC contracts shared by server.ts, host.ts, and BB's Provider Usage panel.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const usageBase = {
  plan: z.null(),
  accountEmail: z.string().nullable(),
  planLabel: z.string().nullable(),
};

export const usageWindowSchema = z.object({
  kind: z.enum(["five-hour", "daily", "weekly", "custom"]),
  id: z.string().min(1),
  label: z.string().min(1),
  usedPercent: z.number().min(0),
  resetsAt: z.string().nullable(),
  model: z.string().nullable(),
  cost: z.null(),
});

export const usageSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    ...usageBase,
    windows: z.array(usageWindowSchema),
  }),
  z.object({
    status: z.literal("not_installed"),
    ...usageBase,
  }),
  z.object({
    status: z.literal("unauthenticated"),
    ...usageBase,
  }),
  z.object({
    status: z.literal("error"),
    ...usageBase,
    message: z.string(),
  }),
]);

export const usageReadingSchema = z.object({
  accountKey: z.null(),
  observedAt: z.number().int().nonnegative().nullable(),
  usage: usageSchema,
});

export type UsageReading = z.infer<typeof usageReadingSchema>;

export const agyHostContract = defineRpcContract({
  probe: {
    input: z
      .object({
        cliCommand: z.string().min(1).optional(),
      })
      .strict(),
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
  readUsage: {
    input: z
      .object({
        cliCommand: z.string().min(1).optional(),
        refresh: z.boolean(),
      })
      .strict(),
    output: usageReadingSchema,
  },
});

export const USAGE_LIST = "provider-usage.v1.listResources";
export const USAGE_GET = "provider-usage.v1.getResource";

export const usageSourceContract = defineRpcContract({
  [USAGE_LIST]: {
    input: z.object({}),
    output: z.object({
      resources: z.array(
        z.object({
          accountKey: z.null(),
          id: z.string().min(1),
          providerId: z.string().min(1),
          label: z.string().min(1),
          scope: z.object({
            kind: z.literal("host"),
            hostId: z.string().min(1),
            hostName: z.string().min(1),
          }),
        }),
      ),
    }),
  },
  [USAGE_GET]: {
    input: z.object({
      resourceId: z.string().min(1),
      refresh: z.boolean(),
    }),
    output: usageReadingSchema,
  },
});
