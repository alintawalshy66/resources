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
const JIRA_WORK_TYPE_LABELS = new Map([
  ["wt-development", "wt:development"],
  ["wt-process-automation", "wt:process-automation"],
]);
const JIRA_MODEL_LABELS = new Map([
  ["model-github-copilot-gpt-5.5", "model:github-copilot/gpt-5.5"],
  ["model-github-copilot-gpt-5-5", "model:github-copilot/gpt-5.5"],
  ["model-github-copilot-claude-opus-4.7", "model:github-copilot/claude-opus-4.7"],
  ["model-github-copilot-claude-opus-4-7", "model:github-copilot/claude-opus-4.7"],
  ["model-github-copilot-claude-sonnet-4.5", "model:github-copilot/claude-sonnet-4.5"],
  ["model-github-copilot-claude-sonnet-4.7", "model:github-copilot/claude-sonnet-4.7"],
]);
const JIRA_SAFE_STATUS_LABEL_BY_STATE = new Map([
  ["ready", "status-ready"],
  ["execute", "status-execute"],
  ["ready to build", "status-ready-to-build"],
  ["building", "status-building"],
  ["build", "status-building"],
  ["review", "status-review"],
  ["in review", "status-review"],
  ["done", "status-done"],
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
        JIRA_WORK_TYPE_LABELS.get(normalized) ??
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

function encodeIssueBasePath(issueKey) {
  return `/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
}

function encodeIssuePath(issueKey) {
  return `${encodeIssueBasePath(issueKey)}?fields=summary,description,status,labels,parent`;
}

function attachBrowseUrl(issue, config) {
  const issueKey = issue?.key ? getIssueKey(issue.key) : null;
  if (issueKey && !issue.browseUrl && config?.baseUrl) {
    issue.browseUrl = `${config.baseUrl}/browse/${issueKey}`;
  }
  return issue;
}

function getSafeStatusLabelForState(state) {
  const normalized = String(state ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return JIRA_SAFE_STATUS_LABEL_BY_STATE.get(normalized) ?? null;
}

function isJiraStatusLabel(label) {
  return normalizeJiraLabels([label])[0]?.startsWith("status:") === true;
}

function labelsForState(currentLabels, state) {
  const targetLabel = getSafeStatusLabelForState(state);
  if (!targetLabel) return null;

  const nextLabels = [];
  const seen = new Set();
  for (const label of Array.isArray(currentLabels) ? currentLabels : []) {
    const trimmed = String(label ?? "").trim();
    if (!trimmed || isJiraStatusLabel(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    nextLabels.push(trimmed);
  }

  if (!seen.has(targetLabel)) {
    nextLabels.push(targetLabel);
  }

  return nextLabels;
}

function plainTextToAdf(text) {
  const paragraphs = String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    }));

  return {
    type: "doc",
    version: 1,
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph", content: [] }],
  };
}

export function createJiraTrackerAdapter(options = {}) {
  const config = options.config ?? loadJiraConfig(options.configOptions);
  const requestJson =
    typeof options.requestJson === "function"
      ? options.requestJson
      : (request) => defaultRequestJson(config, request);

  async function loadRawIssue(issueKey) {
    const issue = await requestJson({ method: "GET", path: encodeIssuePath(issueKey) });
    return attachBrowseUrl(issue, config);
  }

  async function loadDirectChildren(issueKey) {
    const searchResult = await requestJson({
      method: "POST",
      path: "/rest/api/3/search/jql",
      body: {
        jql: `parent = ${issueKey} ORDER BY key ASC`,
        fields: ["summary", "description", "status", "labels", "parent"],
        maxResults: 100,
      },
    });

    return (Array.isArray(searchResult?.issues) ? searchResult.issues : []).map((child) =>
      toCrosbyJiraIssue(attachBrowseUrl(child, config), []),
    );
  }

  async function loadIssue(issueRef) {
    const issueKey = getIssueKey(issueRef);
    const [issue, children] = await Promise.all([
      loadRawIssue(issueKey),
      loadDirectChildren(issueKey),
    ]);
    return toCrosbyJiraIssue(issue, children);
  }

  async function fetchParentQueue(issueRef) {
    const issueKey = getIssueKey(issueRef);
    const [root, children] = await Promise.all([
      loadRawIssue(issueKey),
      loadDirectChildren(issueKey),
    ]);

    return {
      parent: toCrosbyJiraIssue(root, children),
      children,
    };
  }

  async function moveIssue(issueRef, state) {
    const issueKey = getIssueKey(issueRef);
    const issue = await loadRawIssue(issueKey);
    const nextLabels = labelsForState(issue?.fields?.labels, state);
    if (!nextLabels) return;

    await requestJson({
      method: "PUT",
      path: encodeIssueBasePath(issueKey),
      body: {
        fields: {
          labels: nextLabels,
        },
      },
    });
  }

  async function addComment(issueRef, body) {
    const issueKey = getIssueKey(issueRef);
    await requestJson({
      method: "POST",
      path: `${encodeIssueBasePath(issueKey)}/comment`,
      body: {
        body: plainTextToAdf(body),
      },
    });
  }

  return {
    kind: "jira",
    fetchParentQueue,
    loadIssue,
    moveIssue,
    addComment,
  };
}
