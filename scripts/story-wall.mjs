#!/usr/bin/env node
/**
 * Regenerates docs/stories.json from the issues labelled `on-the-record`.
 * Run by .github/workflows/story-wall.yml when that label is added; the workflow
 * commits the file, and the README badge reads its `count`.
 */
import { writeFileSync } from 'node:fs';

const REPO = process.env.GITHUB_REPOSITORY ?? 'MikhailSagalaev/openradar';
const TOKEN = process.env.GITHUB_TOKEN;
const LABEL = 'on-the-record';

async function gh(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'openradar-story-wall',
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${path}: HTTP ${response.status}`);
  return response.json();
}

const stories = [];
let page = 1;
for (;;) {
  const issues = await gh(`/repos/${REPO}/issues?labels=${LABEL}&state=all&per_page=100&page=${page}`);
  if (!Array.isArray(issues) || issues.length === 0) break;
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const body = String(issue.body ?? '');
    const pick = (label) => {
      // Issue forms render answers as "### <label>\n\n<value>"; take the first line after it.
      const match = body.match(new RegExp(`### ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+([^\\n#]+)`));
      return match ? match[1].trim().slice(0, 200) : '';
    };
    stories.push({
      number: issue.number,
      url: issue.html_url,
      title: issue.title.replace(/^\[История\]\s*/i, ''),
      signed: pick('Как вас подписать') || 'участник openradar',
      channel: pick('Как нашли заказ'),
      kind: pick('Что это было'),
      at: issue.closed_at ?? issue.created_at,
    });
  }
  page += 1;
}

stories.sort((a, b) => String(b.at).localeCompare(String(a.at)));
const payload = {
  updated: new Date().toISOString(),
  count: stories.length,
  stories,
};
writeFileSync(new URL('../docs/stories.json', import.meta.url), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`docs/stories.json: ${stories.length} stories`);
