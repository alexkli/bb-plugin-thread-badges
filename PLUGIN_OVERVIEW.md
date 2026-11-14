## What you get

- The **branch** of the thread's environment, read live from bb's Git plugin. It is hidden on the default branch unless you turn that off.
- The **pull request** number, with an icon colored by state: open green, draft gray, merged purple, closed red.
- A status glyph on open pull requests: ✕ for failing checks, requested changes or conflicts, • for running checks, ✓ for ready to merge.
- Hover for the title, review state and check counts.

## Requirements

The metadata line under thread titles is a bb experiment. Turn it on with:

```sh
bb settings experiment threadRowMetadata true
bb thread-list prefs set showRowMetadata true
```

Pull request data comes from bb's GitHub PR Status plugin.

## Good to know

Where the plugin shows a pull request, it hides bb's own PR badge on that row. That relies on bb's sidebar markup, so a bb update could bring the duplicate back.
