// Reads which champion the player has, once a second, from the two local APIs Riot offers on the player's machine:
// the League client (champ select, through its lockfile) and the game's Live Client Data API (port 2999, in game).
// No game memory. Sends "game-reading" to the page whenever the reading changes (and every few seconds, for a new page).

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::diag::Diag;

#[derive(Serialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Reading {
    /// "idle", "champ-select" or "in-game"
    phase: &'static str,
    /// the champion's id as Data Dragon and Morellonomicon name it (DrMundo), from the game
    champion: Option<String>,
    /// the champion's numeric key (36), from the client
    champion_key: Option<i64>,
    /// the tray's test mode is on: "in-game" with the last champion seen, so a screenshot of a pick can be read
    test: bool,
    /// the game is set to exclusive fullscreen (game.cfg WindowMode=0): the overlay can neither show over it nor read the
    /// cards, so the page asks for borderless in champ select
    fullscreen: bool,
}

fn agent() -> ureq::Agent {
    // both APIs answer on 127.0.0.1 with Riot's own certificate, which no store trusts
    let tls = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .expect("TLS");
    ureq::AgentBuilder::new().tls_connector(Arc::new(tls)).timeout(Duration::from_millis(800)).build()
}

/// The client's lockfile: `name:pid:port:password:protocol`.
struct Client {
    port: u16,
    auth: String,
}

fn lockfile_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(p) = std::env::var("OBLIVION_LOCKFILE") {
        v.push(PathBuf::from(p));
    }
    for drive in ["C", "D", "E"] {
        v.push(PathBuf::from(format!("{drive}:\\Riot Games\\League of Legends\\lockfile")));
    }
    v
}

/// The game's window mode from its settings file (Config\game.cfg next to the lockfile): 0 fullscreen, 1 windowed,
/// 2 borderless. A file the game writes when its settings change, not the game's memory.
fn window_mode() -> Option<u8> {
    let text = lockfile_paths().into_iter().find_map(|p| fs::read_to_string(p.parent()?.join("Config").join("game.cfg")).ok())?;
    text.lines().find_map(|l| l.trim().strip_prefix("WindowMode=")?.trim().parse().ok())
}

fn client() -> Option<Client> {
    use base64::Engine;
    let text = lockfile_paths().into_iter().find_map(|p| fs::read_to_string(p).ok())?;
    let parts: Vec<&str> = text.trim().split(':').collect();
    if parts.len() < 5 {
        return None;
    }
    let port = parts[2].parse().ok()?;
    let auth = base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", parts[3]));
    Some(Client { port, auth: format!("Basic {auth}") })
}

fn lcu(agent: &ureq::Agent, c: &Client, path: &str) -> Option<Value> {
    agent.get(&format!("https://127.0.0.1:{}{}", c.port, path)).set("Authorization", &c.auth).call().ok()?.into_json().ok()
}

fn live(agent: &ureq::Agent, path: &str) -> Option<Value> {
    agent.get(&format!("https://127.0.0.1:2999/liveclientdata/{path}")).call().ok()?.into_json().ok()
}

/// In game: the active player's champion from the player list ("game_character_displayname_DrMundo" → "DrMundo").
fn in_game(agent: &ureq::Agent) -> Option<Reading> {
    let me = live(agent, "activeplayername")?.as_str()?.to_string();
    let list = live(agent, "playerlist")?;
    let mine = list.as_array()?.iter().find(|p| {
        [p.get("riotId"), p.get("summonerName")].iter().flatten().any(|n| n.as_str() == Some(me.as_str()))
    });
    let champion = mine
        .and_then(|p| p.get("rawChampionName")?.as_str())
        .and_then(|raw| raw.strip_prefix("game_character_displayname_"))
        .map(str::to_string);
    Some(Reading { phase: "in-game", champion, champion_key: None, test: false, fullscreen: false })
}

/// In champ select: the champion in the player's own cell (ARAM gives one; a pick intent counts while hovering).
fn champ_select(agent: &ureq::Agent, c: &Client) -> Option<Reading> {
    let s = lcu(agent, c, "/lol-champ-select/v1/session")?;
    let cell = s.get("localPlayerCellId")?.as_i64()?;
    let me = s.get("myTeam")?.as_array()?.iter().find(|p| p.get("cellId").and_then(Value::as_i64) == Some(cell))?;
    let key = ["championId", "championPickIntent"]
        .iter()
        .filter_map(|k| me.get(*k).and_then(Value::as_i64))
        .find(|&k| k > 0);
    Some(Reading { phase: "champ-select", champion: None, champion_key: key, test: false, fullscreen: false })
}

fn read(agent: &ureq::Agent) -> Reading {
    if let Some(r) = in_game(agent) {
        return r;
    }
    if let Some(c) = client() {
        let phase = lcu(agent, &c, "/lol-gameflow/v1/gameflow-phase");
        if phase.as_ref().and_then(Value::as_str) == Some("ChampSelect") {
            if let Some(r) = champ_select(agent, &c) {
                return r;
            }
        }
    }
    Reading { phase: "idle", ..Default::default() }
}

/// `in_game` is set while the game's Live Client Data API answers: the card reader looks at the screen only then.
pub fn spawn(app: AppHandle, in_game: Arc<std::sync::atomic::AtomicBool>, diag: Arc<Diag>) {
    thread::spawn(move || {
        let agent = agent();
        let mut last: Option<Reading> = None;
        let mut sent = Instant::now();
        let mut seen = Reading::default(); // the last champion read, for the test mode
        let mut mode: Option<u8> = None;
        loop {
            let mut now = read(&agent);
            if now.phase == "champ-select" || mode.is_none() {
                let m = window_mode();
                if m != mode {
                    diag.log(&format!("game window mode: {}", match m {
                        Some(0) => "fullscreen (the overlay cannot show or read the cards: set it to borderless)",
                        Some(1) => "windowed",
                        Some(2) => "borderless",
                        _ => "unknown (no game.cfg found)",
                    }));
                    mode = m.or(Some(255));
                }
            }
            now.fullscreen = mode == Some(0);
            let idle = now.phase == "idle";
            in_game.store(now.phase == "in-game", std::sync::atomic::Ordering::Relaxed);
            if now.champion.is_some() || now.champion_key.is_some() {
                seen = now.clone();
            }
            if idle && diag.test() {
                now = Reading { phase: "in-game", test: true, ..seen.clone() };
            }
            if last.as_ref() != Some(&now) {
                diag.log(&format!("game: {} · champion {} · key {}{}", now.phase,
                    now.champion.as_deref().unwrap_or("none"),
                    now.champion_key.map_or("none".into(), |k| k.to_string()),
                    if now.test { " · test mode" } else { "" }));
            }
            if last.as_ref() != Some(&now) || sent.elapsed() > Duration::from_secs(5) {
                let _ = app.emit("game-reading", now.clone());
                last = Some(now);
                sent = Instant::now();
            }
            // the client is asked once a second only in champ select or in game; idle, every 5 s, so a client left
            // open for hours is not asked 86 400 times a day
            let pause = if idle { 5 } else { 1 };
            thread::sleep(Duration::from_secs(pause));
        }
    });
}

/// Writes the page's item sets (the champion's builds) into the client, so the shop lists them in game: the player's
/// own sets stay, ours (titled "遺忘寶珠 · …") are replaced. Each set is tied to the map of the game being picked for
/// (the gameflow session's), so they never show on another map. The client's own local API, the way any build app does.
pub fn write_item_sets(mut sets: Vec<Value>) -> Result<String, String> {
    const PREFIX: &str = "遺忘寶珠 · ";
    let agent = agent();
    let c = client().ok_or("no League client (no lockfile)")?;
    let me = lcu(&agent, &c, "/lol-summoner/v1/current-summoner").ok_or("no summoner")?;
    let id = me.get("summonerId").and_then(Value::as_i64).ok_or("no summoner id")?;
    let map = lcu(&agent, &c, "/lol-gameflow/v1/session")
        .and_then(|s| s.pointer("/map/id").and_then(Value::as_i64))
        .filter(|&m| m > 0)
        .unwrap_or(12); // the Howling Abyss
    for s in &mut sets {
        s["associatedMaps"] = serde_json::json!([map]);
    }
    let path = format!("/lol-item-sets/v1/item-sets/{id}/sets");
    let mut all = lcu(&agent, &c, &path).ok_or("the client's item sets did not answer")?;
    let list = all.get_mut("itemSets").and_then(Value::as_array_mut).ok_or("no itemSets in the client's answer")?;
    let before = list.len();
    list.retain(|s| !s.get("title").and_then(Value::as_str).is_some_and(|t| t.starts_with(PREFIX)));
    let kept = list.len();
    let n = sets.len();
    list.extend(sets);
    all["timestamp"] = serde_json::json!(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64));
    agent
        .put(&format!("https://127.0.0.1:{}{}", c.port, path))
        .set("Authorization", &c.auth)
        .send_json(all)
        .map_err(|e| format!("the client refused the item sets: {e}"))?;
    Ok(format!("{n} item sets written for map {map} ({} of ours replaced, {kept} of the player's kept)", before - kept))
}
