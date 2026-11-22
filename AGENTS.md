# Oblivion Orb: agent instructions

遺忘寶珠: a PC overlay for League's ARAM Mayhem that ranks the offered augments for the player's champion and play style. Any coding agent reads this file; Claude Code reads it through `CLAUDE.md`.

## Start here
- **Work log**: the private Folio vault `../oblivion-orb-folio` (GitHub `zelvet-velvet/oblivion-orb-folio`): progress (`LLM/DEV_STATUS.md`, read only the part you need), decisions (`Notes/Decisions.md`: Riot's policy, how the game is read, the stack, the data), the screens (`Spec/Screens.md`, Vellum JSON in `Spec/Screens/`). Its own `AGENTS.md` and `LLM/LLM_GUIDE.md` give its rules; never write work-log notes into this public repo.
- Commands are typed as `/cmd-*`; the work-log skills (`cmd-*`, `git-workflow`, `test-queue`) are symlinks from the vault, listed in `.git/info/exclude` (`python3 ../oblivion-orb-folio/Tools/setup/folio.py link` makes them). A cloud session has no vault: it records nothing in the work log and says so.
- **Data** comes from the Morellonomicon repo (`../Morellonomicon`, public): `_data/augment-tiers.json`, `_data/item-builds.json`, the augment rules in `tools/reason/augment_tiers.py`. Change data there, not here.
- UI text is Traditional Chinese; code, notes and commits English. Reply in the language Zaviel writes in.

## Hard rules (Riot's developer policy, see Notes/Decisions.md in the vault)
- Never show augment win rates, anywhere. Tiers, verdicts and reasons only.
- Never pick, reroll or click for the player; highlight and explain.
- Never read or write the game's memory, inject, or hook the game; only the client's local APIs and screen capture of the card areas.
- Keep Riot's disclaimer in the README and the app's about box.

## Repo regulation
Solo project, owner **Zaviel** (GitHub `zelvet-velvet`); no branches or pull requests.
- Commit straight to `main` and push, small and often, one topic per commit; never force-push. **Every change = commit + push**, without asking.
- Git identity: `Zaviel` / `81034608+zelvet-velvet@users.noreply.github.com` at repo level.
- Messages `type(scope): summary`, lowercase, imperative, no trailing period; `type` is feat, fix, refactor, chore or docs; `scope` is app, capture, rank, ui, data, docs. End with the co-author line from the session's attribution rules.
- Stage only the files of the change; never `git add -A`.
- Each change is recorded in the vault's `DEV_STATUS.md` (`/cmd-sync`).
