// bb-plugin-row-info — frontend entry.
//
// Adds an item to the metadata line under each sidebar thread title: the
// git branch and its pull request. Each item is one
// `experimental_threadRowMetadata` registration at the bottom of this file;
// add another there to show more on the row. The line is drawn only while the
// `threadRowMetadata` experiment and Organize → Rows → Metadata are on.
//
// Data comes from bb's own plugins through batched keyed reads, keyed by
// environment id, so this plugin runs no git or gh commands itself:
// - bb--git `status`: the checkout's current and default branch.
// - bb--github-pr-status `pullRequests`: the current branch's pull request.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useRpcKeyedQuery as useRpcKeyedQuery,
  useSettings,
  type ExperimentalThreadRowMetadataDataInput as DataInput,
  type ExperimentalThreadRowMetadataProps as ItemProps,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Settings (declared in server.ts)

interface Settings {
  showBranch: boolean;
  hideDefaultBranch: boolean;
  showPullRequest: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  showBranch: true,
  hideDefaultBranch: true,
  showPullRequest: true,
};

function useRowInfoSettings(): Settings {
  const { values } = useSettings();
  const flag = (key: keyof Settings) =>
    typeof values?.[key] === "boolean" ? (values[key] as boolean) : DEFAULT_SETTINGS[key];
  return {
    showBranch: flag("showBranch"),
    hideDefaultBranch: flag("hideDefaultBranch"),
    showPullRequest: flag("showPullRequest"),
  };
}

/** Distinct environment ids of every thread a list may draw. */
function environmentIds(threads: readonly PluginSidebarThread[]): string[] {
  const ids = new Set<string>();
  for (const thread of threads) {
    if (thread.environment?.id) ids.add(thread.environment.id);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Contracts: only the parts of the other plugins' outputs this plugin reads.
// `bb plugin rpc inspect bb--git status` and
// `bb plugin rpc inspect bb--github-pr-status pullRequests` print the rest.

const keysInput = z.object({ keys: z.array(z.string()) });

const gitContract = defineRpcContract({
  status: {
    input: keysInput,
    output: z.record(
      z.string(),
      z.object({
        outcome: z.string(),
        workspace: z
          .object({
            branch: z.object({
              currentBranch: z.string().nullable(),
              defaultBranch: z.string(),
            }),
          })
          .optional(),
      }),
    ),
  },
});

const pullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["draft", "open", "merged", "closed"]),
  attention: z.string(),
  checks: z.object({
    state: z.string(),
    totalCount: z.number(),
    passedCount: z.number(),
    failedCount: z.number(),
    pendingCount: z.number(),
  }),
  review: z.object({ state: z.string() }),
});
type PullRequest = z.infer<typeof pullRequestSchema>;

const prContract = defineRpcContract({
  pullRequests: {
    input: keysInput,
    output: z.record(
      z.string(),
      z.discriminatedUnion("outcome", [
        z.object({ outcome: z.literal("available"), pullRequest: pullRequestSchema }),
        z.object({ outcome: z.literal("absent") }),
        z.object({ outcome: z.literal("unavailable"), message: z.string() }),
      ]),
    ),
  },
});

// ---------------------------------------------------------------------------
// Data: one batched read per source for every listed thread.

interface GitBranch {
  current: string | null;
  defaultBranch: string;
}

interface GitData {
  settings: Settings;
  /** Live branch per environment id; missing while loading or for non-git environments. */
  branches: Record<string, GitBranch>;
  /** The current branch's PR per environment id; missing when there is none. */
  pullRequests: Record<string, PullRequest>;
}

function useGitData({ threads }: DataInput): GitData {
  const settings = useRowInfoSettings();
  const keys = environmentIds(threads);
  const branches = useRpcKeyedQuery({
    pluginId: "bb--git",
    contract: gitContract,
    method: "status",
    keys,
    enabled: settings.showBranch && keys.length > 0,
    select: (rows) => {
      const result: Record<string, GitBranch> = {};
      for (const [id, row] of Object.entries(rows)) {
        const branch = row.outcome === "available" ? row.workspace?.branch : undefined;
        if (branch) result[id] = { current: branch.currentBranch, defaultBranch: branch.defaultBranch };
      }
      return result;
    },
  }).data;
  const pullRequests = useRpcKeyedQuery({
    pluginId: "bb--github-pr-status",
    contract: prContract,
    method: "pullRequests",
    keys,
    enabled: settings.showPullRequest && keys.length > 0,
    select: (rows) => {
      const result: Record<string, PullRequest> = {};
      for (const [id, row] of Object.entries(rows)) {
        if (row.outcome === "available") result[id] = row.pullRequest;
      }
      return result;
    },
  }).data;
  return { settings, branches: branches ?? {}, pullRequests: pullRequests ?? {} };
}

/** The branch to show, or null when it is unknown, hidden, or turned off. */
function visibleBranch(thread: PluginSidebarThread, data: GitData): string | null {
  if (!data.settings.showBranch) return null;
  const environmentId = thread.environment?.id;
  const git = environmentId ? data.branches[environmentId] : undefined;
  // Prefer git's live answer; fall back to what bb recorded for the
  // environment while git has not answered or the machine is offline.
  const branch = git ? git.current : (thread.environment?.branchName ?? null);
  if (!branch) return null;
  if (data.settings.hideDefaultBranch && git && branch === git.defaultBranch) return null;
  return branch;
}

// bb's theme tokens, the same ones its own PR badge uses, so custom palettes apply.
const FAILURE = "text-destructive-text";
const PENDING = "text-[color:var(--attention)]";
const SUCCESS = "text-success-foreground";
const MUTED = "text-muted-foreground";

const STATE_STYLE: Record<PullRequest["state"], { icon: string; className: string }> = {
  open: { icon: "GitPullRequest", className: SUCCESS },
  draft: { icon: "GitPullRequestDraft", className: MUTED },
  merged: { icon: "GitMerge", className: "text-pr-merged" },
  closed: { icon: "GitPullRequestClosed", className: FAILURE },
};

/** A trailing glyph for what the PR is waiting on; null when nothing stands out. */
function attentionGlyph(attention: string): { icon: string; className: string; label: string } | null {
  switch (attention) {
    case "checks_failed":
      return { icon: "X", className: FAILURE, label: "Checks failed" };
    case "changes_requested":
      return { icon: "X", className: FAILURE, label: "Changes requested" };
    case "conflicts":
      return { icon: "X", className: FAILURE, label: "Merge conflicts" };
    case "blocked":
      return { icon: "X", className: FAILURE, label: "Blocked" };
    case "checks_pending":
      return { icon: "Dot", className: PENDING, label: "Checks running" };
    case "queued":
      return { icon: "Dot", className: PENDING, label: "In merge queue" };
    case "review_requested":
      return { icon: "Eye", className: MUTED, label: "Review requested" };
    case "ready_to_merge":
      return { icon: "Check", className: SUCCESS, label: "Ready to merge" };
    default:
      return null;
  }
}

function describe(pr: PullRequest): string {
  const { checks } = pr;
  const checkText =
    checks.totalCount === 0
      ? "no checks"
      : [
          `${checks.passedCount}/${checks.totalCount} passed`,
          checks.failedCount ? `${checks.failedCount} failed` : null,
          checks.pendingCount ? `${checks.pendingCount} running` : null,
        ]
          .filter(Boolean)
          .join(", ");
  return [
    `#${pr.number} ${pr.title}`,
    `State: ${pr.state} · Review: ${pr.review.state.replace(/_/g, " ")}`,
    `Checks: ${checkText}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The row item: one leading icon, the branch in muted text, then the PR.
//
//   ⇡ feature-x #42 ✕    PR: the icon and number take the PR state's color
//   ⑂ feature-x          no PR: a muted branch icon

function GitItem({ thread, data }: ItemProps<GitData>) {
  const environmentId = thread.environment?.id;
  const branch = visibleBranch(thread, data);
  const pr = data.settings.showPullRequest && environmentId ? data.pullRequests[environmentId] : undefined;
  if (!branch && !pr) return null;

  const style = pr ? STATE_STYLE[pr.state] : { icon: "GitBranch", className: MUTED };
  const glyph = pr && (pr.state === "open" || pr.state === "draft") ? attentionGlyph(pr.attention) : null;
  const tooltip = [
    branch ? `Branch: ${branch}` : null,
    pr ? describe(pr) : null,
    glyph?.label ?? null,
  ]
    .filter(Boolean)
    .join("\n");
  // Marks rows where this item shows a PR, so the style below can hide bb's own badge there.
  const marker = pr ? { [PR_ITEM_ATTRIBUTE]: "" } : {};

  return (
    <span className="inline-flex min-w-0 max-w-[18rem] items-center gap-1" title={tooltip} {...marker}>
      <Icon name={style.icon} fallback="GitBranch" className={`size-3 shrink-0 ${style.className}`} aria-hidden />
      {branch ? <span className={`min-w-0 truncate ${MUTED}`}>{branch}</span> : null}
      {pr ? (
        <span className="inline-flex shrink-0 items-center gap-0.5">
          <span className={style.className}>#{pr.number}</span>
          {glyph ? (
            <Icon name={glyph.icon} fallback="Dot" className={`size-3 shrink-0 ${glyph.className}`} aria-label={glyph.label} />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Replacing bb's own PR badge
//
// bb's GitHub PR Status plugin draws its PR badge on the same line and has no
// setting to hide it. This style hides it only on rows where our PR item
// rendered, so a row without our item (setting off, no data yet, or a crash)
// still shows bb's badge. It relies on bb's markup: each item sits in a
// `[data-bb-plugin="<id>"]` wrapper directly inside `[data-thread-row-metadata]`.

const PR_ITEM_ATTRIBUTE = "data-row-info-pull-request";
const HIDE_BUILT_IN_BADGE_CSS = `
[data-thread-row-metadata]:has([${PR_ITEM_ATTRIBUTE}]) > [data-bb-plugin="bb--github-pr-status"] {
  display: none !important;
}`;

function hideBuiltInBadge() {
  const style = document.createElement("style");
  style.dataset.rowInfo = "hide-built-in-pr-badge";
  style.textContent = HIDE_BUILT_IN_BADGE_CSS;
  document.head.append(style);
  return () => style.remove();
}

// ---------------------------------------------------------------------------
// Registration. Items draw left to right by `order`; bb's built-in PR badge
// sets no order, so it would draw after ours. Add further items here.

export default definePluginApp((app) => {
  app.contentScripts.register({ id: "hide-built-in-pr-badge", mount: hideBuiltInBadge });
  app.slots.experimental_threadRowMetadata<GitData>({
    id: "git",
    order: 10,
    useData: useGitData,
    component: GitItem,
  });
});
