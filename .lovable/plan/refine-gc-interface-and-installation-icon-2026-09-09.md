# Refine GC interface and installation icon

## What will change
- Replace the installed app icon, favicon, and touch icon with a crisp American flag mark while keeping the app name **GC**.
- Rework the main shell into the selected modern legal explorer: Federal Clean colours, Sora headings, Manrope body text, concise navigation, and restrained surfaces.
- Simplify the dashboard hierarchy so the most useful actions, case status, tasks, timeline, and recent evidence are easier to scan on iPhone and desktop.
- Refine the Drive Files view into compact, high-contrast, information-rich rows while preserving folder navigation, favourites, reordering, uploads, folder creation, clone generation, and automatic sync.
- Improve touch targets, spacing, overflow behaviour, labels, empty states, and mobile bottom navigation without changing case data or business rules.

## Verification
- Check the main navigation and primary actions on phone and desktop sizes.
- Confirm the American flag icon is referenced by the manifest and page metadata at the correct sizes.
- Confirm the app builds cleanly and the preview reports no runtime errors.

## Technical details
- Keep all existing workflows and data intact; changes are limited to presentation and navigation wiring.
- Apply semantic design tokens in the shared stylesheet and reuse the existing button/control components.
- Preserve current Drive permissions and automatic two-minute reconciliation behaviour.
