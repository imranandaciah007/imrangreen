# GC case portal — roadmap

## Interface reconstruction
- [x] Replace the crowded phone navigation with the selected ergonomic command dock
- [x] Replace installed app artwork with a crisp American flag icon
- [x] Apply the selected Federal Clean palette with Sora and Manrope typography
- [x] Refine the Files board into compact, information-rich explorer rows
- [x] Simplify the navigation shell and dashboard hierarchy across phone and desktop
- [x] Apply the selected precision layout and premium red, royal-blue and silver system
- [x] Replace the crowded desktop header with a navigation rail
- [x] Simplify the Home view without removing case information
- [x] Scale navigation, panels and actions cleanly across phone and desktop
- [x] Verify every primary navigation and action path
- [x] Keep visible Back and Home controls on every main page, dialog, sheet and document details view
- [x] Make Drive sync a one-step action with confirmation and last-sync status
- [x] Add persistent local reminders and dashboard visibility for every open task
- [x] Replace iPhone PDF reading with server-side diary extraction and preserve page references
- [x] Add the Files board: draggable folder cards, favourites, recently viewed, view all, endless scroll
- [x] Mirror the full Drive folder tree and drill into subfolders as cards
- [x] Add evidence and create folders straight into Drive from the board
- [x] Generate annotated clone PDFs into "I601 Evidence Clones", mirroring the Drive folders
- [x] Reconcile dashboard counters and evidence records from one live Drive scan
- [x] Add main-page manual sync with folder, rename, move, upload, and removal matching
- [x] Keep review attention limited to missing support or important missing details
- [x] Save app uploads as Drive originals and generate matching enriched PDF clones
- [x] Rename and move existing Drive files and folders from the app (full Drive access granted)
- [x] Refresh the board every 20 seconds, on focus and on reopen so Drive changes appear quickly
- [x] Build clone PDFs with an exhibit cover sheet, page references and per-page exhibit stamps

## External limitation
- Original files are never altered; clones are always separate PDFs.

## Current synchronization safeguards
- [x] Exclude every Drive folder named "ignore" and all contents from indexing, counts, AI reading, and clone building
- [x] Make Synch now automatically re-read and highlight evidence with outstanding important details
- [x] Preserve human corrections across later syncs and AI reads, and verify they survive a reload
- [x] Link Google Drive in the new workspace


## Background processing
- [ ] Keep syncing and building exhibits/clones while the app is closed (needs server-side scheduled job + shared storage)
- [ ] Run a real Drive sync and confirm every clone PDF has its own cover sheet with page numbers matching the Drive original

## Background exhibit building
- [x] Server-only Drive core + clone builder shared by app and background job
- [x] Job ledger tables (locked to backend) with lease, retries, self-pause
- [x] Cron every 5 min -> /api/public/gc-clone-tick (dev URL; switch to production URL after publish)
- [x] Dashboard panel shows clones built / waiting / last run
- [ ] Confirm scheduled run returns 200 once this build is deployed
- [ ] Use full two-pass AI extraction (not name/folder heuristics) for background clone metadata

## Exhibit display
- [ ] Show each exhibit short summary (same as clone cover sheet) on the front end
- [ ] Preview the PDF in-app with an Open externally button

- [ ] Redesign clone cover page: large clear headline details, routine metadata at the bottom
- [ ] Build all remaining clones and show cloned / pending / new-this-run counters
- [x] Share evidence edits, records and ignored flags across every device
- [x] Re-link Google Drive after the latest workspace move

## Workspace moves
- [x] Remove the per-item Create task buttons next to flagged items (packet audit, review, details drawer)
- [x] Re-link Google Drive in the newest workspace
- [x] Show the latest case-packet draft time and save a direct link to its Google Drive folder
- [x] Reconnect Google Drive after the latest workspace move
- [x] Fill the Finances tab from financial documents with Gemini
- [x] Reconnect Google Drive in the newest workspace (again)
- [x] Rebuild the money ledger by reading every financial document in full with Gemini
- [x] Connect Google Drive in the newest workspace

## Sync safety & finances (Sep 30)
- [x] Stop a starting device from saving an empty case over shared records
- [x] Reconnect Google Drive in the new workspace
- [x] Rebuild the financial ledger from all 148 financial documents (728 payments, all "Needs confirmation")
- [ ] Update older server-function style (warning only, not urgent)
