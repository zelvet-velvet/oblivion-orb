// The card reader: while a game is on, a few times a second it copies only the area of the three augment cards from
// the screen (GDI), tells whether the pick is open from the cards' frame edges, reads each card's name with Windows' own
// OCR when a card is new or changed, and whether its reroll button is still usable from the button's colour. It sends
// "pick" to the page: the names and where each card and button sits. No game memory; our own window is excluded from
// the capture, so the overlay never reads itself.
//
// Positions follow the game's pick screen at 1920 × 1080 (measured on real screenshots), scaled by the screen's height
// and centred, which is how the game lays out its UI. A pick offers three cards, or four (Jhin's band, for one): the
// cards are always 320 wide, 48 apart and centred, so the reader tries each count in LAYOUTS.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::diag::Diag;

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
pub struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct Card {
    /// the name as the OCR read it ("" when not read yet); the page matches it to an augment
    name: String,
    card: Rect,
    reroll: Option<Rect>,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct Pick {
    open: bool,
    cards: Vec<Card>,
}

// the pick screen at 1920 × 1080
const LAYOUTS: [usize; 2] = [4, 3]; // card counts, most first: the middle cards of four never look like three
const CARD_GAP: f64 = 48.0;
const CARD_Y: f64 = 193.0;
const CARD_W: f64 = 320.0;
const CARD_H: f64 = 526.0;
const REROLL_DX: f64 = 129.0; // the button's left, from the card's left
const REROLL_Y: f64 = 743.0;
const REROLL_W: f64 = 68.0;
const REROLL_H: f64 = 40.0;
const NAME_Y: f64 = 392.0; // the name line: 280 × 80 round the card's centre
const NAME_W: f64 = 280.0;
const NAME_H: f64 = 80.0;

/// The cards' left edges for a pick of n cards (three: 432, 800, 1168).
fn card_xs(n: usize) -> Vec<f64> {
    let first = 960.0 - (n as f64 * CARD_W + (n as f64 - 1.0) * CARD_GAP) / 2.0;
    (0..n).map(|i| first + i as f64 * (CARD_W + CARD_GAP)).collect()
}

/// A copy of part of the screen, BGRA, top-down.
struct Shot {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    px: Vec<u8>,
}

impl Shot {
    fn at(&self, x: i32, y: i32) -> (f32, f32, f32) {
        let (lx, ly) = (x - self.x, y - self.y);
        if lx < 0 || ly < 0 || lx >= self.w || ly >= self.h {
            return (0.0, 0.0, 0.0);
        }
        let i = ((ly * self.w + lx) * 4) as usize;
        (self.px[i + 2] as f32, self.px[i + 1] as f32, self.px[i] as f32)
    }
    fn lum(&self, x: i32, y: i32) -> f32 {
        let (r, g, b) = self.at(x, y);
        0.3 * r + 0.59 * g + 0.11 * b
    }
    /// A part of the shot, scaled by `k` (nearest), as BGRA for the OCR.
    fn crop(&self, x: i32, y: i32, w: i32, h: i32, k: i32) -> (Vec<u8>, i32, i32) {
        let (ow, oh) = (w * k, h * k);
        let mut out = vec![0u8; (ow * oh * 4) as usize];
        for oy in 0..oh {
            for ox in 0..ow {
                let (sx, sy) = (x + ox / k - self.x, y + oy / k - self.y);
                if sx < 0 || sy < 0 || sx >= self.w || sy >= self.h {
                    continue;
                }
                let si = ((sy * self.w + sx) * 4) as usize;
                let oi = ((oy * ow + ox) * 4) as usize;
                out[oi..oi + 3].copy_from_slice(&self.px[si..si + 3]);
                out[oi + 3] = 255;
            }
        }
        (out, ow, oh)
    }
}

#[cfg(windows)]
fn capture(x: i32, y: i32, w: i32, h: i32) -> Option<Shot> {
    use windows_sys::Win32::Graphics::Gdi::*;
    unsafe {
        let screen = GetDC(std::ptr::null_mut());
        if screen.is_null() {
            return None;
        }
        let mem = CreateCompatibleDC(screen);
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(mem, bmp as _);
        let ok = BitBlt(mem, 0, 0, w, h, screen, x, y, SRCCOPY) != 0;
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = w;
        info.bmiHeader.biHeight = -h; // top-down
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        let mut px = vec![0u8; (w * h * 4) as usize];
        let lines = GetDIBits(mem, bmp, 0, h as u32, px.as_mut_ptr() as _, &mut info, DIB_RGB_COLORS);
        SelectObject(mem, old);
        DeleteObject(bmp as _);
        DeleteDC(mem);
        ReleaseDC(std::ptr::null_mut(), screen);
        (ok && lines == h).then_some(Shot { x, y, w, h, px })
    }
}

#[cfg(not(windows))]
fn capture(_x: i32, _y: i32, _w: i32, _h: i32) -> Option<Shot> {
    None
}

/// Windows' OCR in Traditional Chinese, if the language is installed.
#[cfg(windows)]
struct Ocr(windows::Media::Ocr::OcrEngine);

#[cfg(windows)]
impl Ocr {
    fn new() -> Option<Ocr> {
        use windows::core::HSTRING;
        use windows::Globalization::Language;
        use windows::Media::Ocr::OcrEngine;
        unsafe {
            let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
        }
        let lang = Language::CreateLanguage(&HSTRING::from("zh-Hant-TW")).ok()?;
        OcrEngine::TryCreateFromLanguage(&lang).ok().map(Ocr)
    }
    fn read(&self, bgra: &[u8], w: i32, h: i32) -> String {
        use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
        use windows::Storage::Streams::DataWriter;
        let run = || -> windows::core::Result<String> {
            let writer = DataWriter::new()?;
            writer.WriteBytes(bgra)?;
            let buffer = writer.DetachBuffer()?;
            let bmp = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, w, h)?;
            Ok(self.0.RecognizeAsync(&bmp)?.join()?.Text()?.to_string())
        };
        run().unwrap_or_default().chars().filter(|c| !c.is_whitespace()).collect()
    }
}

#[cfg(not(windows))]
struct Ocr;
#[cfg(not(windows))]
impl Ocr {
    fn new() -> Option<Ocr> {
        None
    }
    fn read(&self, _bgra: &[u8], _w: i32, _h: i32) -> String {
        String::new()
    }
}

/// The share of points down an edge where the frame is bright and the card's inside is darker.
fn edge(shot: &Shot, x_frame: i32, x_in: i32, y0: i32, y1: i32, step: usize) -> f32 {
    let (mut ok, mut n) = (0, 0);
    for y in (y0..y1).step_by(step) {
        let (a, b) = (shot.lum(x_frame, y), shot.lum(x_in, y));
        n += 1;
        if a >= 95.0 && a - b >= 25.0 {
            ok += 1;
        }
    }
    if n == 0 { 0.0 } else { ok as f32 / n as f32 }
}

/// A usable reroll button is warm; a used one is grey.
fn reroll_usable(shot: &Shot, r: Rect) -> bool {
    let (mut sum, mut n) = (0.0, 0.0);
    let (x0, y0, x1, y1) = ((r.x + r.w * 0.1) as i32, (r.y + r.h * 0.15) as i32, (r.x + r.w * 0.9) as i32, (r.y + r.h * 0.85) as i32);
    for y in (y0..y1).step_by(2) {
        for x in (x0..x1).step_by(2) {
            let (r_, g, b) = shot.at(x, y);
            let (mx, mn) = (r_.max(g).max(b) / 255.0, r_.min(g).min(b) / 255.0);
            let l = (mx + mn) / 2.0;
            let s = if mx == mn { 0.0 } else if l < 0.5 { (mx - mn) / (mx + mn) } else { (mx - mn) / (2.0 - mx - mn) };
            sum += s * l;
            n += 1.0;
        }
    }
    n > 0.0 && sum / n >= 0.05
}

/// A small brightness signature of a card's icon area, to see when a card changes (a reroll).
fn signature(shot: &Shot, cx: i32, cy: i32, size: i32) -> Vec<f32> {
    let mut out = Vec::with_capacity(64);
    for j in 0..8 {
        for i in 0..8 {
            out.push(shot.lum(cx - size / 2 + i * size / 8 + size / 16, cy - size / 2 + j * size / 8 + size / 16));
        }
    }
    out
}

fn differs(a: &[f32], b: &[f32]) -> bool {
    a.len() != b.len() || a.iter().zip(b).map(|(x, y)| (x - y).abs()).sum::<f32>() / a.len() as f32 > 18.0
}

/// Keep our own window out of screen captures (Windows 10 2004 and later), so the reader never sees the overlay.
pub fn exclude_from_capture(app: &AppHandle, diag: &Diag) {
    #[cfg(windows)]
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(h) = win.hwnd() {
            use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE};
            let ok = unsafe { SetWindowDisplayAffinity(h.0 as _, WDA_EXCLUDEFROMCAPTURE) } != 0;
            diag.log(if ok { "overlay kept out of the capture" } else { "could not keep the overlay out of the capture (Windows older than 10 2004?)" });
        }
    }
    #[cfg(not(windows))]
    let _ = (app, diag);
}

pub fn spawn(app: AppHandle, in_game: Arc<AtomicBool>, diag: Arc<Diag>) {
    thread::spawn(move || {
        let ocr = Ocr::new();
        diag.log(if ocr.is_some() {
            "ocr: Traditional Chinese ready"
        } else {
            "ocr: NOT available: add 中文(繁體，台灣) in Windows Settings > Time & language > Language & region, with its optical character recognition feature; the cards cannot be named until then"
        });
        let mut open: Option<usize> = None; // the card count of the open pick
        let mut sigs: Vec<Vec<f32>> = Vec::new();
        let mut names: Vec<String> = Vec::new();
        let mut last: Option<Pick> = None;
        let mut last_sent = Instant::now();
        let mut last_look = Instant::now() - Duration::from_secs(60); // the "look" line in the log, every 10 s
        let mut screen_logged = (0.0, 0.0, 0.0);
        let close = |app: &AppHandle, diag: &Diag, why: &str| {
            diag.log(&format!("pick closed ({why})"));
            let _ = app.emit("pick", Pick { open: false, cards: vec![] });
        };
        loop {
            let reading = in_game.load(Ordering::Relaxed) || diag.test();
            thread::sleep(Duration::from_millis(if reading { 250 } else { 1000 }));
            if !reading {
                if open.take().is_some() {
                    close(&app, &diag, "the game is over");
                    last = None;
                }
                continue;
            }
            let Some(win) = app.get_webview_window("main") else { continue };
            let Ok(Some(mon)) = win.primary_monitor() else { continue };
            let (sw, sh) = (mon.size().width as f64, mon.size().height as f64);
            let (mx, my) = (mon.position().x as f64, mon.position().y as f64);
            let scale = win.scale_factor().unwrap_or(1.0);
            if screen_logged != (sw, sh, scale) {
                screen_logged = (sw, sh, scale);
                diag.log(&format!("screen {sw}x{sh} at ({mx}, {my}), scaling {:.0}%{}", scale * 100.0,
                    if (sw / sh - 16.0 / 9.0).abs() > 0.02 { ": not 16:9, the card positions may be off" } else { "" }));
            }
            let k = sh / 1080.0;
            let ox = mx + (sw - 1920.0 * k) / 2.0;
            let px = |v: f64| (ox + v * k).round() as i32;
            let py = |v: f64| (my + v * k).round() as i32;
            // one copy round the widest pick (four cards) and the buttons
            let widest = card_xs(LAYOUTS[0]);
            let (x0, y0) = (px(widest[0]), py(CARD_Y));
            let (x1, y1) = (px(widest[widest.len() - 1] + CARD_W), py(REROLL_Y + REROLL_H + 4.0));
            let Some(shot) = capture(x0, y0, x1 - x0, y1 - y0) else {
                if last_look.elapsed() > Duration::from_secs(10) {
                    last_look = Instant::now();
                    diag.log("screen capture failed");
                }
                continue;
            };

            let frame = |cx: f64| {
                let (l, r) = (px(cx), px(cx + CARD_W));
                let (ya, yb) = (py(CARD_Y + 80.0), py(CARD_Y + 460.0));
                let step = (20.0 * k).max(4.0) as usize;
                let o = |v: f64| (v * k).round() as i32;
                edge(&shot, l + o(8.0), l + o(26.0), ya, yb, step).min(edge(&shot, r - o(9.0), r - o(27.0), ya, yb, step))
            };
            let scores: Vec<(usize, Vec<f32>)> = LAYOUTS.iter().map(|&n| (n, card_xs(n).into_iter().map(frame).collect())).collect();
            let seen = |n: usize| scores.iter().find(|s| s.0 == n).map_or(0, |s| s.1.iter().filter(|&&v| v >= 0.4).count());
            if last_look.elapsed() > Duration::from_secs(10) {
                last_look = Instant::now();
                let parts: Vec<String> = scores.iter().map(|(n, v)| {
                    format!("{n} cards [{}]", v.iter().map(|x| format!("{x:.2}")).collect::<Vec<_>>().join(" "))
                }).collect();
                diag.log(&format!("look: frames {} (a pick opens when every card of a count is 0.40 or more){}",
                    parts.join(", "), if diag.test() { " · test mode" } else { "" }));
                if diag.test() && open.is_none() {
                    diag.save_bmp("test-capture.bmp", shot.w, shot.h, &shot.px);
                }
            }
            // opens when every frame of a count is there; stays open while all but one are (the tooltip may cover one)
            let now_open = match open {
                Some(n) if seen(n) + 1 >= n => Some(n),
                Some(_) => None,
                None => LAYOUTS.iter().copied().find(|&n| seen(n) == n),
            };
            if now_open != open {
                if open.is_some() {
                    close(&app, &diag, "the frames are gone");
                    last = None;
                }
                if let Some(n) = now_open {
                    diag.log(&format!("pick open: {n} cards"));
                    diag.save_bmp("pick-capture.bmp", shot.w, shot.h, &shot.px);
                    sigs = vec![Vec::new(); n];
                    names = vec![String::new(); n];
                }
                open = now_open;
            }
            let Some(n) = open else { continue };

            let css = |r: Rect| Rect { x: (r.x - mx) / scale, y: (r.y - my) / scale, w: r.w / scale, h: r.h / scale };
            let mut cards = Vec::with_capacity(n);
            for (i, cx) in card_xs(n).into_iter().enumerate() {
                let card = Rect { x: ox + cx * k, y: my + CARD_Y * k, w: CARD_W * k, h: CARD_H * k };
                let rr = Rect { x: ox + (cx + REROLL_DX) * k, y: my + REROLL_Y * k, w: REROLL_W * k, h: REROLL_H * k };
                let mid = px(cx + CARD_W / 2.0);
                let sig = signature(&shot, mid, py(310.0), (170.0 * k) as i32);
                if names[i].is_empty() || differs(&sig, &sigs[i]) {
                    if let Some(o) = &ocr {
                        let (img, w, h) = shot.crop(px(cx + CARD_W / 2.0 - NAME_W / 2.0), py(NAME_Y), (NAME_W * k) as i32, (NAME_H * k) as i32, 2);
                        let read = o.read(&img, w, h);
                        diag.log(&format!("card {}: ocr read \"{read}\"", i + 1));
                        if !read.is_empty() {
                            names[i] = read;
                        }
                    }
                    sigs[i] = sig;
                }
                cards.push(Card { name: names[i].clone(), card: css(card), reroll: reroll_usable(&shot, rr).then(|| css(rr)) });
            }
            let pick = Pick { open: true, cards };
            let gist = |p: &Pick| p.cards.iter().map(|c| (c.name.clone(), c.reroll.is_some())).collect::<Vec<_>>();
            if last.as_ref().map(gist) != Some(gist(&pick)) {
                let line: Vec<String> = pick.cards.iter().map(|c| {
                    format!("\"{}\"{}", c.name, if c.reroll.is_some() { " (reroll usable)" } else { "" })
                }).collect();
                diag.log(&format!("cards: {}", line.join(", ")));
            }
            if last.as_ref() != Some(&pick) || last_sent.elapsed() > Duration::from_secs(3) {
                let _ = app.emit("pick", pick.clone());
                last = Some(pick);
                last_sent = Instant::now();
            }
        }
    });
}
