# Protect ignored files and preserve evidence corrections

## What will change
- Exclude any Google Drive folder named `ignore`, regardless of capitalisation or location, together with every file and subfolder inside it.
- Apply that exclusion to the Files view, counters, evidence indexing, background AI reading, clone generation, and sync reconciliation.
- Extend **Synch now** so it also re-reads evidence with unresolved important fields, saves successful AI suggestions, and leaves unresolved items visibly marked for attention.
- Treat edits you make in the fix wizard, document details, and edit form as human-confirmed values so later syncs or AI reads cannot silently replace them.
- Keep the audit history and saved timestamp updated for every correction.

## Verification
- Test a Drive tree containing mixed-case `ignore` folders and confirm descendants never appear or enter the clone queue.
- Edit title, date, people, category, notes, and Aciah impact; sync and reload; confirm the values remain.
- Run **Synch now** with an outstanding item and confirm it attempts the AI read, saves usable results, and still highlights anything unresolved.
- Check the current build and browser errors before completion.

## Important storage note
- Evidence corrections are currently saved in this browser's local app storage, not shared account-wide storage. This work will make that saving reliable on this device and prevent sync/AI overwrites; moving all case edits into shared cloud storage would be a separate migration.
