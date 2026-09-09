# Correct counters and make Drive sync authoritative

## What will change
- Add a prominent **Synch now** control on the main dashboard with progress, confirmation, and the last successful sync time.
- Use one shared Drive sync operation for both the dashboard and Files page, so folder and file counts come from the same fresh Drive snapshot.
- Reconcile indexed evidence against Drive by stable Drive file ID: add new supported files, update renamed or moved files, and remove local index entries only when their Drive originals no longer exist.
- Keep originals in their current Drive folders and keep enriched PDF clones under the mirrored `I601 Evidence Clones` folder structure.
- Ensure app uploads go to the selected original folder, become indexed evidence, and can generate a traceable enriched PDF clone in the matching clone folder.

## Counter and review rules
- Recalculate all dashboard and Review counters from the same current records and consistent task-status helpers.
- Stop treating every non-ready item as a review problem.
- Show attention only when supporting evidence is missing or an important detail is missing/uncertain, such as date, person, category, translation, Aciah impact, or a confirmed AI conflict.
- During sync, clear old generic “Needs confirmation” states when no important issue remains; preserve genuine missing-detail and supporting-evidence states.

## Drive behavior
- A manual sync will scan the complete visible Drive tree, including newly created Drive folders, and immediately refresh the app’s folder board.
- App-created original uploads remain unchanged in the original side; enriched clones are separate PDFs and never overwrite originals.
- Existing Drive permissions will be respected. The app can mirror Drive changes and write app-created originals/clones, but moving or renaming pre-existing Drive files from inside the app still requires the broader permission previously declined.

## Verification
- Check type safety and the latest build result.
- Test main-page sync, updated counters, new Drive folders appearing in Files, and original/clone upload behavior in the running app.
