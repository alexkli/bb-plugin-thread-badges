# Thread Badges (bb plugin)

Adds one item to the metadata line under each thread title in bb's sidebar:

```
⇡ feature-x #42 ✕     PR: icon and number in the PR state's color, branch in muted gray
⑂ feature-x           no PR: muted branch icon
```

- **Branch**: the environment's current git branch, read live from bb's Git plugin.
  Hidden on the repository's default branch unless you turn off *Hide the default branch*.
- **Pull request**: number and leading icon colored by state (open green, draft gray,
  merged purple, closed red), and a trailing glyph on open PRs for failing checks,
  requested changes or conflicts (✕), running checks (•), or ready to merge (✓).
  Hover for the title, review state and check counts. Data comes from bb's GitHub PR
  Status plugin. Where this item shows a PR, a content script hides bb's own PR badge
  on that row (it relies on bb's sidebar markup, so a bb update could bring it back).

The line is drawn only while both are on:

```sh
bb settings experiment threadRowMetadata true
bb thread-list prefs set showRowMetadata true
```

## Settings

```sh
bb plugin config thread-badges                      # show
bb plugin config thread-badges set showPullRequest true
bb plugin config thread-badges set hideDefaultBranch false
bb plugin config thread-badges set showBranch false
```

## Adding an item

Each item is one `app.slots.experimental_threadRowMetadata` registration in `app.tsx`
with a `useData` hook (one batched keyed read for every listed thread) and a small
component. Items draw left to right by `order`.

## Develop

```sh
bb plugin install .   # once
bb plugin dev         # rebuild and reload on save
```
