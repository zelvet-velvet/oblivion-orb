// Oblivion Orb's app: one transparent, always-on-top window over the game that lets clicks through except over the
// overlay's own controls, a tray icon to quit, and two readers: the game (the client's local APIs) and the pointer.
// It never reads or writes the game's memory and never clicks for the player.

mod game;
mod pointer;
mod reader;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(pointer::HitRegions::default())
        .invoke_handler(tauri::generate_handler![pointer::set_hit_regions])
        .setup(|app| {
            let win = app.get_webview_window("main").expect("the main window");
            // cover the primary screen (the game, borderless); clicks pass through until the cursor is over a control
            if let Some(m) = win.primary_monitor()? {
                win.set_position(*m.position())?;
                win.set_size(*m.size())?;
            }
            win.set_ignore_cursor_events(true)?;

            let quit = MenuItem::with_id(app, "quit", "結束遺忘寶珠", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let mut tray = TrayIconBuilder::new().tooltip("遺忘寶珠").menu(&menu).on_menu_event(|app, e| {
                if e.id.as_ref() == "quit" {
                    app.exit(0);
                }
            });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            reader::exclude_from_capture(app.handle());
            let in_game = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
            pointer::spawn(app.handle().clone());
            game::spawn(app.handle().clone(), in_game.clone());
            reader::spawn(app.handle().clone(), in_game);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
