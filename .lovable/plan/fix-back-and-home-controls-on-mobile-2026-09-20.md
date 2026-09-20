# Fix Back and Home controls on mobile

## Changes
- Move the shared Back and Home bar below the iPhone status/notch safe area.
- Increase both controls to reliable finger-sized tap targets and keep the bar visible while scrolling.
- Make Back explicitly close the current document or pop-up.
- Make Home close the current document or pop-up, then return to the case overview.
- Apply the same behavior to every dialog and drawer that uses these shared controls.

## Verification
- Open a real document details drawer at the screenshot’s phone size.
- Scroll the document, then confirm the controls remain reachable.
- Test Back closes the drawer.
- Reopen it and test Home closes the drawer and returns to the case overview.
- Check the phone layout visually and confirm there are no app errors.
