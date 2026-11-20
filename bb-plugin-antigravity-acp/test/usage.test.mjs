import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectUsage, parseUsageJson } from "../usage.ts";

const samplePayload = {
  conversation_id: "",
  status: "SUCCESS",
  response:
    "Gemini Models\tWeekly Limit Remaining\t79%\t2026-11-26T07:48:24Z\nGemini Models\tFive Hour Limit Remaining\t86%\t2026-11-20T18:05:40Z\n",
  duration_seconds: 0,
  num_turns: 0,
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: 0,
  },
  command: {
    name: "usage",
    data: {
      description: "Quota summary",
      groups: [
        {
          name: "Gemini Models",
          buckets: [
            {
              id: "gemini-weekly",
              name: "Weekly Limit Remaining",
              description: "You have used some of your weekly limit, it will fully refresh in 5 days, 16 hours.",
              window: "weekly",
              remaining_fraction: 0.7891488671302795,
              reset_time: "2026-11-26T07:48:24Z",
            },
            {
              id: "gemini-5h",
              name: "Five Hour Limit Remaining",
              description: "You have used some of your 5-hour limit, it will fully refresh in 2 hours, 21 minutes.",
              window: "5h",
              remaining_fraction: 0.8590662479400635,
              reset_time: "2026-11-20T18:05:40Z",
            },
          ],
        },
        {
          name: "Claude and GPT models",
          buckets: [
            {
              id: "3p-weekly",
              name: "Weekly Limit Remaining",
              window: "weekly",
              remaining_fraction: 1,
              reset_time: "2026-11-27T15:44:08Z",
            },
            {
              id: "3p-5h",
              name: "Five Hour Limit Remaining",
              window: "5h",
              remaining_fraction: 1,
              reset_time: "2026-11-20T20:44:08Z",
            },
          ],
        },
        {
          name: "Gemini 4 Argon",
          buckets: [
            {
              id: "gemini-argon-wtu-weekly",
              name: "Gemini 4 Argon Weekly Limit",
              window: "weekly",
              remaining_fraction: 1,
              reset_time: "2026-11-27T15:44:08Z",
            },
          ],
        },
      ],
    },
  },
};

test("parseUsageJson converts remaining_fraction to consumed percent and clears rolling reset times on unused buckets", () => {
  const result = parseUsageJson(JSON.stringify(samplePayload));
  assert.equal(result.status, "ok");
  assert.equal(result.windows.length, 5);
  assert.deepEqual(
    result.windows.map((w) => ({
      id: w.id,
      kind: w.kind,
      label: w.label,
      model: w.model,
      usedPercent: w.usedPercent,
      resetsAt: w.resetsAt,
    })),
    [
      {
        id: "gemini-weekly",
        kind: "weekly",
        label: "Gemini weekly",
        model: "Gemini",
        usedPercent: 21.09,
        resetsAt: "2026-11-26T07:48:24.000Z",
      },
      {
        id: "gemini-5h",
        kind: "custom",
        label: "5h · Gemini",
        model: "Gemini",
        usedPercent: 14.09,
        resetsAt: "2026-11-20T18:05:40.000Z",
      },
      {
        id: "3p-weekly",
        kind: "weekly",
        label: "Claude & GPT weekly",
        model: "Claude & GPT",
        usedPercent: 0,
        resetsAt: null,
      },
      {
        id: "3p-5h",
        kind: "custom",
        label: "5h · Claude & GPT",
        model: "Claude & GPT",
        usedPercent: 0,
        resetsAt: null,
      },
      {
        id: "gemini-argon-wtu-weekly",
        kind: "weekly",
        label: "Gemini 4 Argon weekly",
        model: "Gemini 4 Argon",
        usedPercent: 0,
        resetsAt: null,
      },
    ],
  );
});

test("parseUsageJson handles future/custom groups and daily windows without hardcoded bucket counts", () => {
  const payload = {
    status: "SUCCESS",
    command: {
      name: "usage",
      data: {
        groups: [
          {
            name: "Gemini 5 Next",
            buckets: [
              {
                id: "next-daily",
                name: "Daily Limit Remaining",
                window: "daily",
                remaining_fraction: 0.4,
                reset_time: "2026-11-22T00:00:00Z",
              },
            ],
          },
        ],
      },
    },
  };
  const result = parseUsageJson(JSON.stringify(payload));
  assert.equal(result.status, "ok");
  assert.deepEqual(result.windows, [
    {
      id: "next-daily",
      kind: "daily",
      label: "Gemini 5 Next daily",
      model: "Gemini 5 Next",
      usedPercent: 60,
      resetsAt: "2026-11-22T00:00:00.000Z",
      cost: null,
    },
  ]);
});

test("parseUsageJson classifies unauthenticated JSON errors and rejects malformed payloads", () => {
  const unauth = parseUsageJson(JSON.stringify({ status: "ERROR", error: "Not logged in. Run agy to sign in." }));
  assert.equal(unauth.status, "unauthenticated");

  assert.throws(() => parseUsageJson(""));
  assert.throws(() => parseUsageJson("not json"));
  assert.throws(() => parseUsageJson(JSON.stringify({ status: "SUCCESS", command: { name: "usage", data: { groups: [] } } })));
  assert.throws(() =>
    parseUsageJson(
      JSON.stringify({
        status: "SUCCESS",
        command: {
          name: "usage",
          data: {
            groups: [
              {
                name: "Gemini Models",
                buckets: [{ id: "bad", window: "weekly", remaining_fraction: 1.5 }],
              },
            ],
          },
        },
      }),
    ),
  );
});

test("collectUsage returns not_installed when the CLI command does not exist", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-usage-missing-"));
  try {
    const res = await collectUsage({
      cliCommand: path.join(dir, "does-not-exist-agy"),
      cwd: dir,
    });
    assert.equal(res.status, "not_installed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("collectUsage invokes agy with --log-file <devNull> -p /usage --output-format json and parses stdout", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-usage-cli-"));
  const fakeAgy = path.join(dir, "fake-agy.sh");
  const argsFile = path.join(dir, "args.txt");
  fs.writeFileSync(
    fakeAgy,
    `#!/bin/sh
printf '%s\\n' "$@" > ${JSON.stringify(argsFile)}
printf '%s\\n' ${JSON.stringify(JSON.stringify(samplePayload))}
`,
    { mode: 0o755 },
  );

  try {
    const res = await collectUsage({ cliCommand: fakeAgy, cwd: dir, timeoutMs: 5000 });
    assert.equal(res.status, "ok");
    assert.equal(res.windows.length, 5);
    const recordedArgs = fs.readFileSync(argsFile, "utf8").trim().split("\n");
    assert.deepEqual(recordedArgs, ["--log-file", os.devNull, "-p", "/usage", "--output-format", "json"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("collectUsage classifies unauthenticated CLI exit cleanly", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-usage-unauth-"));
  const fakeAgy = path.join(dir, "fake-agy-unauth.sh");
  fs.writeFileSync(
    fakeAgy,
    `#!/bin/sh
echo "Authentication required: please sign in with agy" >&2
exit 1
`,
    { mode: 0o755 },
  );

  try {
    const res = await collectUsage({ cliCommand: fakeAgy, cwd: dir, timeoutMs: 5000 });
    assert.equal(res.status, "unauthenticated");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
