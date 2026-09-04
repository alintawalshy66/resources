import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const DEFAULT_FALLBACK_ENV_PATH = "/home/walsc0/projects/dlhub/backend/.env";
const JIRA_ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;
const JIRA_STATUS_LABELS = new Map([
  ["status-ready", "status:ready"],
  ["status-execute", "status:execute"],
  ["status-ready-to-build", "status:ready-to-build"],
  ["status-building", "status:building"],
  ["status-review", "status:review"],
  ["status-done", "status:done"],
]);
const JIRA_MODE_LABELS = new Map([
  ["mode-afk", "mode:afk"],
  ["mode-hitl", "mode:hitl"],
]);
const JIRA_EFFORT_LABELS = new Map([
  ["effort-off", "effort:off"],
  ["effort-minimal", "effort:minimal"],
  ["effort-low", "effort:low"],
  ["effort-medium", "effort:medium"],
  ["effort-high", "effort:high"],
  ["effort-xhigh", "effort:xhigh"],
  ["effort-max", "effort:max"],
]);
const JIRA_MODEL_LABELS = new Map([
  ["model-github-copilot-gpt-5.5", "model:github-copilot/gpt-5.5"],
  ["model-github-copilot-claude-opus-4.7", "model:github-copilot/claude-opus-4.7"],
  ["model-github-copilot-claude-sonnet-4.5", "model:github-copilot/claude-sonnet-4.5"],
  ["model-github-copilot-claude-sonnet-4.7", "model:github-copilot/claude-sonnet-4.7"],
]);

function parseDotenvValue(rawValue) {
  let value = String(rawValue ?? "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function parseDotenv(content) {
  const parsed = {};
  for (const line of String(content ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    parsed[match[1]] = parseDotenvValue(match[2]);
  }
  return parsed;
}

function readFallbackEnvFile(path) {
  if (!path || !existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

function firstConfigured(primary, fallback) {
  const primaryValue = String(primary ?? "").trim();
  if (primaryValue) return primaryValue;
  const fallbackValue = String(fallback ?? "").trim();
  return fallbackValue || undefined;
}

function parseVerifySsl(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return !["0", "false", "no", "off"].includes(normalized);
}

export function loadJiraConfig(options = {}) {
  const env = options.env ?? process.env;
  const fallbackPath = options.fallbackEnvPath ?? DEFAULT_FALLBACK_ENV_PATH;
  const readFallbackEnv =
    typeof options.readFallbackEnv === "function"
      ? options.readFallbackEnv
      : () => readFallbackEnvFile(fallbackPath);
  const fallback = parseDotenv(readFallbackEnv() ?? "");

  const baseUrl = firstConfigured(env.JIRA_BASE_URL, fallback.JIRA_BASE_URL)?.replace(/\/+$/, "");
  const email = firstConfigured(env.JIRA_EMAIL, fallback.JIRA_EMAIL);
  const apiToken = firstConfigured(env.JIRA_API_TOKEN, fallback.JIRA_API_TOKEN);
  const verifySslRaw = firstConfigured(env.JIRA_VERIFY_SSL, fallback.JIRA_VERIFY_SSL);
  const caBundle = firstConfigured(env.JIRA_CA_BUNDLE, fallback.JIRA_CA_BUNDLE);

  return {
    baseUrl,
    email,
    apiToken,
    verifySsl: parseVerifySsl(verifySslRaw),
    caBundle,
  };
}

function assertJiraConfig(config) {
  const missing = [];
  if (!config?.baseUrl) missing.push("JIRA_BASE_URL");
  if (!config?.email) missing.push("JIRA_EMAIL");
  if (!config?.apiToken) missing.push("JIRA_API_TOKEN");
  if (missing.length === 0) return;

  throw new Error(
    `Missing Jira configuration: ${missing.join(", ")}. Recovery: set Jira credentials in the environment or ${DEFAULT_FALLBACK_ENV_PATH}.`,
  );
}

function getIssueKey(issueRef) {
  const issueKey = String(issueRef ?? "").trim().toUpperCase();
  if (JIRA_ISSUE_KEY_PATTERN.test(issueKey)) return issueKey;
  throw new Error(
    `Invalid Jira issue key '${issueRef}'. Recovery: use a key such as WCSD-126 or an Atlassian browse URL handled by Crosby tracker detection.`,
  );
}

export function normalizeJiraLabels(labels) {
  return (Array.isArray(labels) ? labels : [])
    .map((label) => String(label ?? "").trim())
    .filter(Boolean)
    .map((label) => {
      const normalized = label.toLowerCase();
      return (
        JIRA_STATUS_LABELS.get(normalized) ??
        JIRA_MODE_LABELS.get(normalized) ??
        JIRA_EFFORT_LABELS.get(normalized) ??
        JIRA_MODEL_LABELS.get(normalized) ??
        label
      );
    });
}

function getStateFromLabels(labels) {
  const normalizedLabels = normalizeJiraLabels(labels);
  const statusLabel = normalizedLabels.find((label) => label.startsWith("status:"));
  switch (statusLabel) {
    case "status:done":
      return { name: "Done", type: "completed" };
    case "status:building":
      return { name: "Building", type: "started" };
    case "status:execute":
      return { name: "Execute", type: "started" };
    case "status:review":
      return { name: "Review", type: "review" };
    case "status:ready-to-build":
      return { name: "Ready to Build", type: "unstarted" };
    case "status:ready":
      return { name: "Ready", type: "unstarted" };
    default:
      return { name: "Unknown", type: "unstarted" };
  }
}

function adfToPlainText(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToPlainText).filter(Boolean).join("\n");
  if (typeof node !== "object") return String(node);

  if (typeof node.text === "string") return node.text;
  const childText = Array.isArray(node.content)
    ? node.content.map(adfToPlainText).filter(Boolean).join(node.type === "paragraph" ? "" : "\n")
    : "";
  return childText;
}

function toCrosbyJiraIssue(jiraIssue, children = []) {
  const fields = jiraIssue?.fields ?? {};
  const key = getIssueKey(jiraIssue?.key);
  const rawLabels = Array.isArray(fields.labels) ? fields.labels : [];
  const labels = normalizeJiraLabels(rawLabels).map((name) => ({ name }));
  const trackerStatus = String(fields.status?.name ?? "").trim() || "Unknown";
  const description = adfToPlainText(fields.description).trim();

  return {
    key,
    identifier: key,
    title: fields.summary ?? key,
    description,
    body: description,
    url: jiraIssue?.browseUrl,
    tracker: "jira",
    trackerStatus,
    state: getStateFromLabels(rawLabels),
    labels: { nodes: labels },
    parent: fields.parent?.key ? { identifier: fields.parent.key } : undefined,
    children,
  };
}

async function defaultRequestJson(config, request) {
  assertJiraConfig(config);

  const url = new URL(request.path, `${config.baseUrl}/`);
  const payload = request.body === undefined ? undefined : JSON.stringify(request.body);
  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`,
    ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
  };

  const client = url.protocol === "http:" ? http : https;
  const ca = config.caBundle ? readFileSync(config.caBundle, "utf8") : undefined;

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: request.method ?? "GET",
        headers,
        ...(url.protocol === "https:" ? { rejectUnauthorized: config.verifySsl, ca } : {}),
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new Error(
                `Jira REST request failed with status ${res.statusCode}: ${text || res.statusMessage || "No response body"}`,
              ),
            );
            return;
          }
          try {
            resolve(text ? JSON.parse(text) : null);
          } catch (error) {
            reject(new Error(`Failed to parse Jira REST response: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function encodeIssuePath(issueKey) {
  return `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,description,status,labels,parent`;
}

export function createJiraTrackerAdapter(options = {}) {
  const config = options.config ?? loadJiraConfig(options.configOptions);
  const requestJson =
    typeof options.requestJson === "function"
      ? options.requestJson
      : (request) => defaultRequestJson(config, request);

  async function loadIssue(issueRef) {
    const issueKey = getIssueKey(issueRef);
    const issue = await requestJson({ method: "GET", path: encodeIssuePath(issueKey) });
    if (!issue?.browseUrl && config?.baseUrl) {
      issue.browseUrl = `${config.baseUrl}/browse/${issueKey}`;
    }
    return toCrosbyJiraIssue(issue, []);
  }

  async function fetchParentQueue(issueRef) {
    const issueKey = getIssueKey(issueRef);
    const root = await requestJson({ method: "GET", path: encodeIssuePath(issueKey) });
    if (!root?.browseUrl && config?.baseUrl) {
      root.browseUrl = `${config.baseUrl}/browse/${issueKey}`;
    }
    const searchResult = await requestJson({
      method: "POST",
      path: "/rest/api/3/search",
      body: {
        jql: `parent = ${issueKey} ORDER BY key ASC`,
        fields: ["summary", "description", "status", "labels", "parent"],
        maxResults: 100,
      },
    });
    const children = (Array.isArray(searchResult?.issues) ? searchResult.issues : []).map((child) => {
      if (!child?.browseUrl && config?.baseUrl && child?.key) {
        child.browseUrl = `${config.baseUrl}/browse/${child.key}`;
      }
      return toCrosbyJiraIssue(child, []);
    });

    return {
      parent: toCrosbyJiraIssue(root, children),
      children,
    };
  }

  return {
    kind: "jira",
    fetchParentQueue,
    loadIssue,
    moveIssue: async () => {
      throw new Error("Crosby Jira state updates are not implemented yet. Recovery: update Jira status/labels manually or complete the Jira mutating adapter slice.");
    },
    addComment: async () => {
      throw new Error("Crosby Jira comments are not implemented yet. Recovery: add the Jira comment manually or complete the Jira mutating adapter slice.");
    },
  };
}
