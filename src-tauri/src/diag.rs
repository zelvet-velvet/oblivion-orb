// What the app sees, for testing: a log file (reader.log in the app's log folder, %LOCALAPPDATA%\com.zelvet.oblivionorb\logs)
// with the game reading, how sure the card reader is that each card frame is there and what the OCR read, plus copies of
// the captured card area as .bmp. And the test mode (tray menu): the card reader runs without a game, so a screenshot of
// a pick screen shown full screen tests it.

use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

pub struct Diag {
    test: AtomicBool,
    pub dir: PathBuf,
    file: Mutex<Option<File>>,
}

impl Diag {
    /// Starts reader.log afresh; the previous run's log is kept as reader.old.log.
    pub fn new(dir: PathBuf) -> Diag {
        let _ = fs::create_dir_all(&dir);
        let log = dir.join("reader.log");
        let _ = fs::rename(&log, dir.join("reader.old.log"));
        Diag { test: AtomicBool::new(false), file: Mutex::new(File::create(&log).ok()), dir }
    }

    pub fn test(&self) -> bool {
        self.test.load(Ordering::Relaxed)
    }

    /// Flips the test mode; returns the new state.
    pub fn toggle_test(&self) -> bool {
        let on = !self.test.fetch_xor(true, Ordering::Relaxed);
        self.log(if on { "test mode on: the card reader runs without a game" } else { "test mode off" });
        on
    }

    pub fn log(&self, msg: &str) {
        if let Some(f) = self.file.lock().unwrap().as_mut() {
            let _ = writeln!(f, "{} {msg}", now());
            let _ = f.flush();
        }
    }

    /// Saves a BGRA, top-down image as a 24-bit .bmp in the log folder.
    pub fn save_bmp(&self, name: &str, w: i32, h: i32, bgra: &[u8]) {
        let row = ((w * 3 + 3) / 4 * 4) as usize;
        let size = 54 + row * h as usize;
        let mut out = Vec::with_capacity(size);
        out.extend_from_slice(b"BM");
        out.extend_from_slice(&(size as u32).to_le_bytes());
        out.extend_from_slice(&[0; 4]);
        out.extend_from_slice(&54u32.to_le_bytes());
        out.extend_from_slice(&40u32.to_le_bytes());
        out.extend_from_slice(&w.to_le_bytes());
        out.extend_from_slice(&h.to_le_bytes()); // positive: bottom-up rows
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&24u16.to_le_bytes());
        out.extend_from_slice(&[0; 24]);
        for y in (0..h).rev() {
            let start = out.len();
            for x in 0..w {
                let i = ((y * w + x) * 4) as usize;
                out.extend_from_slice(&bgra[i..i + 3]);
            }
            out.resize(start + row, 0);
        }
        if fs::write(self.dir.join(name), out).is_ok() {
            self.log(&format!("saved {name}"));
        }
    }
}

#[cfg(windows)]
fn now() -> String {
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;
    let mut t = unsafe { std::mem::zeroed() };
    unsafe { GetLocalTime(&mut t) };
    format!("{:02}:{:02}:{:02}.{:03}", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds)
}

#[cfg(not(windows))]
fn now() -> String {
    let s = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("{:02}:{:02}:{:02} UTC", s / 3600 % 24, s / 60 % 60, s % 60)
}
