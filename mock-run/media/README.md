# mock-run/media — where the demo video goes

This folder holds the screen recordings the mocked runs link to. It ships empty
on purpose: the files are big, and they go out of date faster than the docs do.

## Add the `orc ui` walkthrough

1. Start the panel on canned data, so nothing private is on screen:

   ```bash
   orc ui --fixtures
   ```

2. Record it. Keep it under about two minutes. A good route is:
   Overview → Worth doing → Settings (stage two edits, apply) → Flow (the
   stepper) → Crosslink (the graph) → **Mocked Skill Use** → Maintenance
   (preview, then apply).

3. Save the files here with **these exact names** — the links in
   [`../orc-ui.md`](../orc-ui.md) and in the repository `README.md` already
   point at them:

   | File | What it is |
   |---|---|
   | `orc-ui-demo.mp4` | the recording (H.264 mp4 plays everywhere) |
   | `orc-ui-demo-poster.png` | one still frame, used as the clickable image |

4. Delete the placeholder comment block at the top of `../orc-ui.md`.

## Playing it on GitHub

A `<video>` tag with a repo-relative `src` does **not** play inline on
github.com. Two things that do work:

- the image link that is already in the docs — clicking it opens the file, or
- drag `orc-ui-demo.mp4` into a GitHub issue or pull request comment, copy the
  `https://github.com/user-attachments/...` URL that GitHub generates, and paste
  that URL on its own line in the markdown. GitHub renders that as a player.

## Size

Keep each file under about 10 MB. If the recording is bigger, host it somewhere
else and link it instead — a repository is a bad video host.
