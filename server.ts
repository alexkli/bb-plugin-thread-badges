// bb-plugin-thread-badges — backend entry.
//
// The plugin is frontend-only: app.tsx draws items on each sidebar thread
// row's metadata line from data owned by bb's Git (`bb--git`) and GitHub PR
// Status (`bb--github-pr-status`) plugins. The server only declares the
// settings that switch each item on or off; app.tsx reads them live.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  bb.settings.define({
    showBranch: {
      type: "boolean",
      label: "Show branch",
      description: "Show the environment's current git branch on each thread row.",
      default: true,
    },
    hideDefaultBranch: {
      type: "boolean",
      label: "Hide the default branch",
      description:
        "Leave the branch out when a thread sits on its repository's default branch, such as main.",
      default: true,
    },
    showPullRequest: {
      type: "boolean",
      label: "Show pull request",
      description:
        "Show the branch's GitHub pull request with its state, checks and review, in place of bb's own PR badge on that row.",
      default: true,
    },
  });
}
