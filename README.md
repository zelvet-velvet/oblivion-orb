# Oblivion Orb · 遺忘寶珠

A PC overlay for League of Legends' **ARAM Mayhem**. When the augment cards show, it ranks them for your champion and the play style you pick, explains why in a few words, and lights the reroll button of the card that suits you least. You make the pick.

Sibling of [Morellonomicon (黑魔禁書)](https://github.com/zelvet-velvet/Morellonomicon), the Traditional Chinese beginner guide whose augment tiers and reasoning it uses. The name is one of the items Morellonomicon builds from.

**Status**: early. The overlay's look, the ranking and the app shell work; the app shows the play-style panel in champ select and reads the augment cards from the screen (three or four), still being tested in real games.

## What it shows
- **Play styles** on the left: pick one (Dr. Mundo: Q 消耗 · 穿透, 坦克, 坦克輸出) and the ranking follows it.
- **The champion's special play** on top (Mundo: Q takes no AP, AD or health, so look for damage amps and penetration).
- **Under each card**, a plate with its verdict and why: **頭獎！** (a game changer for this champion), **首選**, **可考慮**, **不合** or **垃圾** (far worse than the champion's other augments, or bad on nearly every champion). Several cards can share a verdict. The best card gets a line round it; every 不合 and 垃圾 card that can still be rerolled gets a reroll tag, while rerolling a 可考慮 or better card is your call.
- **能力值加成 rounds** (stat shards such as 魔法攻擊碎片 or 不屈碎片): rated from the play style's role and damage type, as 首選, 可考慮 or 不合.
- **The arrow tab** on the left edge in game opens or closes the panels at any time (drag it to move it). They open by themselves at a pick and while the shop is open (found wherever it was dragged), beside the cards or the shop, and close again after.
- **Hovering a card** hides everything over the cards, so the game's tooltip is never covered; **hold Shift** over it for the card's verdict and full reason above the cards.
- **Item sets**: in champ select the champion's builds go into the client as item sets (one per play style, the chosen one first), so the in-game shop lists them in its item-set menu. Only sets titled 遺忘寶珠 · … are replaced; your own stay. Off in 設定 › 商店.
- **Motion**: the panels show only once their icons have loaded, and fade in; a rerolled card's plate turns over with the card.

## How it works
A separate always-on-top window (Tauri 2, about 40–80 MB of RAM) that lets clicks through to the game except over its own controls. It reads your champion from the League client's local API (champ select) and the game's Live Client Data API, and will look only at the three card areas of the screen when a pick is open. It never reads or changes the game's memory.

## Development
The data comes from [Morellonomicon](https://github.com/zelvet-velvet/Morellonomicon), cloned next to this repo.

```sh
npm install
npm run data      # src/data/game-data.json from ../Morellonomicon (tiers, reasons; no win rates)
npm test          # the ranking
npm run dev       # the overlay in a browser: http://localhost:1420/?sample=mundo (also kaisa, ahri, jhin, unknown)
```

In the browser, hold **Shift** over a card for the note, press **R** to reroll the first card; the play-style panel, the mode and 設定 work.

### The app (Windows)
Needs the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/): Microsoft C++ Build Tools (the "Desktop development with C++" workload), Rust and Node.js, for example:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install Rustlang.Rustup
winget install OpenJS.NodeJS.LTS
```

Then, in the repo (delete `node_modules` first if it was installed from WSL):

```powershell
npm install
npm run tauri dev     # the overlay over the screen; quit from its tray icon
npm run tauri build   # an installer in src-tauri/target/release/bundle/nsis
```

Run the game in borderless mode: an overlay cannot sit over exclusive fullscreen.

### Testing the card reader
- **Without a game**: tray icon › 測試模式（不用進遊戲）. The reader runs as if a game were on, with the last champion seen (a red 測試模式 badge shows it is on). Open a screenshot of a pick screen full screen (Photos, F11) on the main screen: the plates should appear on its cards.
- **The log**: tray icon › 開啟記錄資料夾 (`%LOCALAPPDATA%\com.zelvet.oblivionorb\logs`). `reader.log` holds the game reading, whether the Traditional Chinese OCR is installed, the screen size, every 10 s how much each card frame looks present (`look:`; a pick opens when every card of a count is 0.40 or more), what the OCR read on each card, and the cards it sent. `pick-capture.bmp` is the card area when a pick opened; `test-capture.bmp` the area the reader sees in test mode. The previous run's log is `reader.old.log`.
- A pick offers three cards, or four (Jhin's band); both layouts are read.

## Rules it keeps
- No augment win rates (Riot's developer policy); tiers and reasons only.
- It never picks or rerolls for you.
- It will be registered with Riot before any release.

## Legal
Oblivion Orb isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

MIT license (see `LICENSE`).
