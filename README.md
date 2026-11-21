# Oblivion Orb · 遺忘寶珠

A PC overlay for League of Legends' **ARAM Mayhem**. When the augment cards show, it ranks them for your champion and the play style you pick, explains why in a few words, and lights the reroll button of the card that suits you least. You make the pick.

Sibling of [Morellonomicon (黑魔禁書)](https://github.com/zelvet-velvet/Morellonomicon), the Traditional Chinese beginner guide whose augment tiers and reasoning it uses. The name is one of the items Morellonomicon builds from.

**Status**: design done, code not started.

## What it shows
- **Play styles** on the left: pick one (Dr. Mundo: Q 消耗 · 穿透, 坦克, 坦克輸出) and the ranking follows it.
- **The champion's special play** on top (Mundo: Q takes no AP, AD or health, so look for damage amps and penetration).
- **Under each card**, a plate whose metal says how well it suits you (prismatic, gold, silver, dull iron), with a one-word verdict and why.
- **Hold Shift** over a card: the game's own detail, with the phrase that matters for your champion marked.

## How it works
A separate always-on-top window (Tauri 2, about 40–80 MB of RAM). It reads your champion from the League client's local API and looks only at the three card areas of the screen when a pick is open. It never reads or changes the game's memory.

## Rules it keeps
- No augment win rates (Riot's developer policy); tiers and reasons only.
- It never picks or rerolls for you.
- It will be registered with Riot before any release.

## Legal
Oblivion Orb isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

MIT license (see `LICENSE`).
