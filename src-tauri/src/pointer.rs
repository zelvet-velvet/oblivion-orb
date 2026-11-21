// Click-through: the window ignores the mouse except over the rects the page reports (its buttons and panels).
// Also tells the page where the cursor is (the hovered card) and when Shift is held (the scaling banner).

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Deserialize, Clone, Copy, Debug)]
pub struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl Rect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.w && y >= self.y && y <= self.y + self.h
    }
}

/// The page's control rects, in physical pixels of the window.
#[derive(Default)]
pub struct HitRegions(Mutex<Vec<Rect>>);

/// Called by the page after each redraw with its control rects in CSS pixels.
#[tauri::command]
pub fn set_hit_regions(state: tauri::State<'_, HitRegions>, rects: Vec<Rect>, scale_factor: f64) {
    let k = if scale_factor > 0.0 { scale_factor } else { 1.0 };
    let physical = rects.into_iter().map(|r| Rect { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }).collect();
    *state.0.lock().unwrap() = physical;
}

#[derive(Serialize, Clone, PartialEq)]
struct Pointer {
    shift: bool,
    x: f64, // CSS pixels of the window
    y: f64,
}

#[cfg(windows)]
fn shift_held() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_SHIFT};
    // the high bit: the key is down now
    unsafe { (GetAsyncKeyState(VK_SHIFT as i32) as u16 & 0x8000) != 0 }
}

#[cfg(not(windows))]
fn shift_held() -> bool {
    false
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut through = true;
        let mut last: Option<Pointer> = None;
        loop {
            thread::sleep(Duration::from_millis(33));
            let Some(win) = app.get_webview_window("main") else { continue };
            let (Ok(c), Ok(p)) = (win.cursor_position(), win.inner_position()) else { continue };
            let (x, y) = (c.x - p.x as f64, c.y - p.y as f64);
            let inside = app.state::<HitRegions>().0.lock().unwrap().iter().any(|r| r.contains(x, y));
            if inside == through {
                through = !inside;
                let _ = win.set_ignore_cursor_events(through);
            }
            let k = win.scale_factor().unwrap_or(1.0);
            let shift = shift_held();
            // the game opens its tooltip on plain hover, so the page follows the cursor all the time (a few pixels of
            // movement at most 30 times a second) and Shift for the scaling banner
            let now = Pointer { shift, x: (x / k).round(), y: (y / k).round() };
            let changed = match &last {
                None => true,
                Some(l) => l.shift != now.shift || (l.x - now.x).abs() >= 3.0 || (l.y - now.y).abs() >= 3.0,
            };
            if changed {
                let _ = app.emit("pointer", now.clone());
                last = Some(now);
            }
        }
    });
}
