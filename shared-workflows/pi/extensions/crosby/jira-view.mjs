#!/usr/bin/env node
import { createJiraTrackerAdapter } from "./jira.mjs";

function usage() {
  return "Usage: node shared-workflows/pi/extensions/crosby/jira-view.mjs <JIRA-ISSUE-KEY>";
}

async function main(argv = process.argv.slice(2)) {
  const issueKey = String(argv[0] ?? "").trim();
  if (!issueKey || argv.length !== 1) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const adapter = createJiraTrackerAdapter();
  const issue = await adapter.loadIssue(issueKey);
  const output = {
    key: issue.key,
    identifier: issue.identifier,
    title: issue.title,
    body: issue.body,
    description: issue.description,
    state: issue.state,
    labels: issue.labels,
    milestone: null,
    url: issue.url,
    tracker: issue.tracker,
    trackerStatus: issue.trackerStatus,
    branchName: issue.branchName,
    parent: issue.parent,
    children: issue.children,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
