// Oblivion Orb's app: one transparent, always-on-top window over the game that lets clicks through except over the
// overlay's own controls, a tray icon to quit, and two readers: the game (the client's local APIs) and the pointer.
// It never reads or writes the game's memory and never clicks for the player.

mod diag;
mod game;
mod pointer;
mod reader;

use std::sync::Arc;
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

/// The page's own line in reader.log: what it drew (the phase, the champion, the cards it matched).
#[tauri::command]
fn page_log(diag: tauri::State<'_, Arc<diag::Diag>>, line: String) {
    diag.log(&format!("page: {line}"));
}

/// The champion's builds as item sets, into the client (in champ select): written on a thread, the result in reader.log.
#[tauri::command]
fn write_item_sets(diag: tauri::State<'_, Arc<diag::Diag>>, sets: Vec<serde_json::Value>) {
    let diag = diag.inner().clone();
    std::thread::spawn(move || match game::write_item_sets(sets) {
        Ok(line) => diag.log(&line),
        Err(e) => diag.log(&format!("item sets not written: {e}")),
    });
}

pub fn run() {
    tauri::Builder::default()
        .manage(pointer::HitRegions::default())
        .invoke_handler(tauri::generate_handler![pointer::set_hit_regions, page_log, write_item_sets])
        .setup(|app| {
            let win = app.get_webview_window("main").expect("the main window");
            // cover the primary screen (the game, borderless); clicks pass through until the cursor is over a control
            if let Some(m) = win.primary_monitor()? {
                win.set_position(*m.position())?;
                win.set_size(*m.size())?;
            }
            win.set_ignore_cursor_events(true)?;

            let dir = app.path().app_log_dir().unwrap_or_else(|_| std::env::temp_dir().join("oblivion-orb"));
            let diag = Arc::new(diag::Diag::new(dir));
            app.manage(diag.clone());
            diag.log(&format!("遺忘寶珠 {} started", app.package_info().version));

            let test = CheckMenuItem::with_id(app, "test", "測試模式（不用進遊戲）", true, false, None::<&str>)?;
            let logs = MenuItem::with_id(app, "logs", "開啟記錄資料夾", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "結束遺忘寶珠", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&test, &logs, &quit])?;
            let d = diag.clone();
            let mut tray = TrayIconBuilder::new().tooltip("遺忘寶珠").menu(&menu).on_menu_event(move |app, e| {
                match e.id.as_ref() {
                    "test" => {
                        let on = d.toggle_test();
                        let _ = test.set_checked(on);
                    }
                    "logs" => {
                        let _ = std::process::Command::new("explorer").arg(&d.dir).spawn();
                    }
                    "quit" => app.exit(0),
                    _ => {}
                }
            });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            reader::exclude_from_capture(app.handle(), &diag);
            let in_game = Arc::new(std::sync::atomic::AtomicBool::new(false));
            pointer::spawn(app.handle().clone());
            game::spawn(app.handle().clone(), in_game.clone(), diag.clone());
            reader::spawn(app.handle().clone(), in_game, diag);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
