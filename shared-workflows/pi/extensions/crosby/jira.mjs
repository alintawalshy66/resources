import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const DEFAULT_FALLBACK_ENV_PATH = "/home/developer/projects/dlhub/backend/.env";
const JIRA_ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;
const JIRA_TYPE_LABELS = new Map([
  ["type-parent", "type:parent"],
  ["type-child", "type:child"],
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
const JIRA_MODEL_COMPONENTS = new Map([
  ["openai gpt-5.5", "github-copilot/gpt-5.5"],
  ["openai gpt-5.6 luna", "github-copilot/gpt-5.6-luna"],
  ["openai gpt-5.6 sol", "github-copilot/gpt-5.6-sol"],
  ["anthropic claude opus 4.7", "github-copilot/claude-opus-4.7"],
  ["anthropic claude opus 5", "github-copilot/claude-opus-5"],
]);
const JIRA_STATUS_BY_CROSBY_STATE = new Map([
  ["backlog", "Backlog"],
  ["ready to build", "Ready to build"],
  ["building", "Building"],
  ["build", "Building"],
  ["review", "Review"],
  ["in review", "Review"],
  ["done", "Done"],
]);
const MAX_JIRA_COMMENT_CHARS = 8000;

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
    .filter((label) => !/^status[-:]/i.test(label))
    .map((label) => {
      const normalized = label.toLowerCase();
      return (
        JIRA_TYPE_LABELS.get(normalized) ??
        JIRA_MODE_LABELS.get(normalized) ??
        JIRA_EFFORT_LABELS.get(normalized) ??
        JIRA_WORK_TYPE_LABELS.get(normalized) ??
        JIRA_MODEL_LABELS.get(normalized) ??
        label
      );
    });
}

function normalizeJiraStatus(status) {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getStateFromJiraStatus(status) {
  switch (normalizeJiraStatus(status)) {
    case "ready to build":
      return { name: "Ready to Build", type: "unstarted" };
    case "building":
    case "in progress":
      return { name: "Building", type: "started" };
    case "review":
      return { name: "Review", type: "review" };
    case "done":
    case "withdrawn":
      return { name: "Done", type: "completed" };
    case "backlog":
      return { name: "Backlog", type: "unstarted" };
    default:
      return { name: String(status ?? "Unknown").trim() || "Unknown", type: "unstarted" };
  }
}

function slugifyBranchPart(value, fallback = "issue") {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function deriveBranchNameFromJiraIssue(description, labels, issueKey, summary) {
  const bodyMatch = String(description ?? "").match(/(?:^|\n)\s*Branch:\s*([^\n]+)\s*/i);
  if (bodyMatch?.[1]?.trim()) return bodyMatch[1].trim();

  const branchLabel = (Array.isArray(labels) ? labels : []).find((label) =>
    /^branch:/i.test(String(label ?? "").trim()),
  );
  if (branchLabel) return String(branchLabel).replace(/^branch:/i, "").trim();

  return `issue-${slugifyBranchPart(issueKey)}-${slugifyBranchPart(summary)}`;
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

function getJiraComponentNames(components) {
  return (Array.isArray(components) ? components : [])
    .map((component) => ({
      id: component?.id,
      name: String(component?.name ?? "").trim(),
    }))
    .filter((component) => component.name);
}

function getJiraModelOverride(components, issueKey) {
  const overrides = [
    ...new Set(
      getJiraComponentNames(components)
        .map((component) => JIRA_MODEL_COMPONENTS.get(component.name.toLowerCase()))
        .filter(Boolean),
    ),
  ];
  if (overrides.length > 1) {
    throw new Error(
      `Jira issue ${issueKey} has multiple model components: ${overrides.join(", ")}. Recovery: keep exactly one approved model component on the issue before running Crosby.`,
    );
  }
  return overrides[0] ?? null;
}

function toCrosbyJiraIssue(jiraIssue, children = []) {
  const fields = jiraIssue?.fields ?? {};
  const key = getIssueKey(jiraIssue?.key);
  const rawLabels = Array.isArray(fields.labels) ? fields.labels : [];
  const labels = normalizeJiraLabels(rawLabels).map((name) => ({ name }));
  const components = getJiraComponentNames(fields.components);
  const modelOverride = getJiraModelOverride(fields.components, key);
  const trackerStatus = String(fields.status?.name ?? "").trim() || "Unknown";
  const blockedBy = (Array.isArray(fields.issuelinks) ? fields.issuelinks : [])
    .filter((link) => String(link?.type?.name ?? "").toLowerCase() === "blocks")
    .filter((link) => link?.inwardIssue?.key)
    .map((link) => ({
      identifier: link.inwardIssue.key,
      title: link.inwardIssue.fields?.summary ?? link.inwardIssue.key,
      state: getStateFromJiraStatus(link.inwardIssue.fields?.status?.name),
    }));
  const description = adfToPlainText(fields.description).trim();
  const comments = Array.isArray(jiraIssue?.comments?.nodes)
    ? jiraIssue.comments.nodes
    : [];

  return {
    key,
    identifier: key,
    title: fields.summary ?? key,
    description,
    body: description,
    url: jiraIssue?.browseUrl,
    tracker: "jira",
    trackerStatus,
    branchName: deriveBranchNameFromJiraIssue(description, rawLabels, key, fields.summary ?? key),
    state: getStateFromJiraStatus(trackerStatus),
    labels: { nodes: labels },
    components: { nodes: components },
    modelOverride,
    issueType: fields.issuetype?.name,
    parent: fields.parent?.key ? { identifier: fields.parent.key } : undefined,
    relations: blockedBy.length > 0 ? { blockedBy } : undefined,
    children,
    comments: { nodes: comments },
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
  return `${encodeIssueBasePath(issueKey)}?fields=summary,description,status,labels,parent,issuetype,components,issuelinks`;
}

function encodeIssueTransitionsPath(issueKey) {
  return `${encodeIssueBasePath(issueKey)}/transitions`;
}

function encodeIssueCommentsPath(issueKey) {
  return `${encodeIssueBasePath(issueKey)}/comment?maxResults=100&orderBy=-created`;
}

function attachBrowseUrl(issue, config) {
  const issueKey = issue?.key ? getIssueKey(issue.key) : null;
  if (issueKey && !issue.browseUrl && config?.baseUrl) {
    issue.browseUrl = `${config.baseUrl}/browse/${issueKey}`;
  }
  return issue;
}

function getJiraStatusForState(state) {
  return JIRA_STATUS_BY_CROSBY_STATE.get(normalizeJiraStatus(state)) ?? null;
}

function statusMatches(actual, expected) {
  return normalizeJiraStatus(actual) === normalizeJiraStatus(expected);
}

function limitJiraCommentText(text, maxChars = MAX_JIRA_COMMENT_CHARS) {
  const value = String(text ?? "").trimEnd();
  if (value.length <= maxChars) return value;

  const suffix = "\n\n[Comment truncated by Crosby before posting to Jira to stay within Jira comment size limits. See the Crosby worker transcript or branch commits for full details.]";
  return `${value.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

function plainTextToAdf(text) {
  const paragraphs = limitJiraCommentText(text)
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

  async function loadIssueComments(issueKey) {
    const commentsResult = await requestJson({ method: "GET", path: encodeIssueCommentsPath(issueKey) });
    return (Array.isArray(commentsResult?.comments) ? commentsResult.comments : []).map((comment) => ({
      id: comment?.id,
      body: adfToPlainText(comment?.body).trim(),
      createdAt: comment?.created,
      updatedAt: comment?.updated,
      author: comment?.author?.displayName ?? comment?.author?.accountId,
    }));
  }

  async function loadRawIssue(issueKey, options = {}) {
    const issue = await requestJson({ method: "GET", path: encodeIssuePath(issueKey) });
    const withBrowseUrl = attachBrowseUrl(issue, config);
    if (options.includeComments) {
      withBrowseUrl.comments = { nodes: await loadIssueComments(issueKey) };
    }
    return withBrowseUrl;
  }

  async function loadDirectChildren(issueKey) {
    const searchResult = await requestJson({
      method: "POST",
      path: "/rest/api/3/search/jql",
      body: {
        jql: `parent = ${issueKey} ORDER BY key ASC`,
        fields: ["summary", "description", "status", "labels", "parent", "issuetype", "components", "issuelinks"],
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
      loadRawIssue(issueKey, { includeComments: true }),
      loadDirectChildren(issueKey),
    ]);

    return {
      parent: toCrosbyJiraIssue(root, children),
      children,
    };
  }

  async function moveIssue(issueRef, state) {
    const issueKey = getIssueKey(issueRef);
    const targetStatus = getJiraStatusForState(state);
    if (!targetStatus) {
      throw new Error(
        `Unsupported Crosby Jira state '${state}'. Recovery: use Backlog, Ready to build, Building, Review, or Done.`,
      );
    }

    const issue = await loadRawIssue(issueKey);
    const currentStatus = issue?.fields?.status?.name;
    if (statusMatches(currentStatus, targetStatus)) return;

    const transitionsResult = await requestJson({
      method: "GET",
      path: encodeIssueTransitionsPath(issueKey),
    });
    const transitions = Array.isArray(transitionsResult?.transitions)
      ? transitionsResult.transitions
      : [];
    const transition = transitions.find((candidate) =>
      statusMatches(candidate?.to?.name, targetStatus),
    );

    if (!transition?.id) {
      const available = transitions
        .map((candidate) => candidate?.to?.name)
        .filter(Boolean);
      throw new Error(
        `Jira issue ${issueKey} cannot transition from '${currentStatus ?? "Unknown"}' to '${targetStatus}'. Available destinations: ${available.join(", ") || "none"}. Recovery: check the WCSD workflow and rerun Crosby after the issue has a valid transition.`,
      );
    }

    await requestJson({
      method: "POST",
      path: encodeIssueTransitionsPath(issueKey),
      body: { transition: { id: String(transition.id) } },
    });

    const refreshed = await loadRawIssue(issueKey);
    const refreshedStatus = refreshed?.fields?.status?.name;
    if (!statusMatches(refreshedStatus, targetStatus)) {
      throw new Error(
        `Jira transition for ${issueKey} did not reach '${targetStatus}'. Actual status after transition: '${refreshedStatus ?? "Unknown"}'. Recovery: inspect the issue in Jira before rerunning Crosby.`,
      );
    }
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
