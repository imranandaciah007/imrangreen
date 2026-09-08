# I-601 Evidence Portal — roadmap

## In progress (this turn)
- [x] Two-pass AI extraction server function (`src/lib/ai.functions.ts`)
- [ ] Store: runExtraction / confirm-or-dismiss uncertain fields / event+finance updates
- [ ] Inspector: AI panel, per-field confirmation, "Run AI read"
- [ ] Timeline & Finances: events/expenses linked to evidence, clickable links
- [ ] Home dashboard cards navigate to Timeline / Finances / Vault

## Prompt 2 (fold in after the above)
- [ ] One-tap intake: upload -> auto AI run -> short review only if uncertain
- [ ] Duplicate check before save (drive id, filename, date, amount, title similarity) with view / keep both / cancel
- [ ] Evidence review screen: only uncertain fields need confirmation, "Verified by double scan" badge
- [ ] Jibril evidence: optional "How does this affect Aciah?" field (AI suggests, user approves)
- [ ] Timeline events: effect on Aciah / on Jibril, financial impact, follow-up, status, linked evidence
- [ ] Permanent milestone: 18 Aug 2026 family separation begins, prominent
- [ ] Timeline filters (before/since separation, people, categories) + "Since 18 Aug 2026" summary
- [ ] Quick add event from a sentence (+ voice dictation where supported), AI structures it
- [ ] Gentle "no evidence linked" prompt on event save (non-blocking)
- [ ] One-tap "Create task" from any evidence item or event
- [ ] "Ask my evidence" search over stored records only, answers cite stored items

## Deferred / blocked
- Real Drive upload of originals depends on the Drive connector write scope; currently originals stay in Drive untouched and local files are device-only.
