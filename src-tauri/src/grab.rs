// Where the card reader's pixels come from. Normally the screen (GDI), with our own window kept out of every capture so
// the reader never sees the overlay. With 直播顯示 on, the overlay is left in captures (OBS, Discord and screenshots show
// it) and the reader copies League's own window instead (Windows Graphics Capture, the way OBS's window capture does):
// that copy holds only the game's pixels, never a window on top of it, so the overlay stays out of what the reader sees.
// Either way it is the game's picture only: no memory, no hooks.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use crate::diag::Diag;

/// 直播顯示: whether the overlay shows in screen captures (the page tells it on start and when the setting changes).
#[derive(Default)]
pub struct Streaming(pub Arc<AtomicBool>);

#[tauri::command]
pub fn set_streaming(app: AppHandle, state: tauri::State<'_, Streaming>, diag: tauri::State<'_, Arc<Diag>>, on: bool) {
    state.0.store(on, Ordering::Relaxed);
    set_affinity(&app, on, diag.inner().clone());
}

/// Shows the overlay in screen captures, or keeps it out of them (Windows 10 2004 and later), on the window's own thread.
pub fn set_affinity(app: &AppHandle, show: bool, diag: Arc<Diag>) {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            let Some(win) = a.get_webview_window("main") else { return };
            let Ok(h) = win.hwnd() else { return };
            use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
            let ok = unsafe { SetWindowDisplayAffinity(h.0 as _, if show { WDA_NONE } else { WDA_EXCLUDEFROMCAPTURE }) } != 0;
            diag.log(match (show, ok) {
                (true, true) => "直播顯示 on: the overlay shows in captures; the reader copies the game's window",
                (true, false) => "直播顯示 on, but the overlay could not be put back in captures",
                (false, true) => "overlay kept out of the capture",
                (false, false) => "could not keep the overlay out of the capture (Windows older than 10 2004?)",
            });
        });
    }
    #[cfg(not(windows))]
    let _ = (app, show, diag);
}

/// The reader's source of pixels, owned by the reader's thread.
pub struct Grabber {
    streaming: Arc<AtomicBool>,
    diag: Arc<Diag>,
    #[cfg(windows)]
    wgc: Option<wgc::Wgc>,
    wgc_tried: Option<Instant>,
    source: &'static str, // the source of the last copy, logged when it changes
}

impl Grabber {
    pub fn new(streaming: Arc<AtomicBool>, diag: Arc<Diag>) -> Grabber {
        Grabber {
            streaming,
            diag,
            #[cfg(windows)]
            wgc: None,
            wgc_tried: None,
            source: "",
        }
    }

    fn note(&mut self, source: &'static str) {
        if self.source != source {
            self.source = source;
            self.diag.log(&format!("reading from {source}"));
        }
    }

    /// w × h pixels at (x, y) on the screen, BGRA, top-down.
    pub fn pixels(&mut self, x: i32, y: i32, w: i32, h: i32) -> Option<Vec<u8>> {
        if w <= 0 || h <= 0 {
            return None;
        }
        #[cfg(windows)]
        {
            if self.streaming.load(Ordering::Relaxed) {
                if self.wgc.as_ref().is_some_and(|c| !c.alive()) {
                    self.wgc = None;
                    self.diag.log("the game's window is gone: its copy stopped");
                }
                if self.wgc.is_none() && self.wgc_tried.is_none_or(|t| t.elapsed() >= Duration::from_secs(2)) {
                    self.wgc_tried = Some(Instant::now());
                    if let Some(hwnd) = wgc::game_window() {
                        match wgc::Wgc::new(hwnd, &self.diag) {
                            Ok(c) => {
                                self.diag.log("copying the game's window (Windows Graphics Capture)");
                                self.wgc = Some(c);
                            }
                            Err(e) => self.diag.log(&format!("could not copy the game's window: {e}")),
                        }
                    }
                }
                if let Some(c) = &mut self.wgc {
                    self.note("the game's window");
                    return c.pixels(x, y, w, h);
                }
                self.note("the screen (直播顯示 on but no game window to copy: the overlay may be in the way)");
            } else {
                if self.wgc.take().is_some() {
                    self.diag.log("直播顯示 off: the game's window is no longer copied");
                }
                self.note("the screen");
            }
            gdi(x, y, w, h)
        }
        #[cfg(not(windows))]
        {
            let _ = (x, y, &self.streaming, &self.wgc_tried);
            self.note("nothing (not Windows)");
            None
        }
    }
}

#[cfg(windows)]
fn gdi(x: i32, y: i32, w: i32, h: i32) -> Option<Vec<u8>> {
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
        (ok && lines == h).then_some(px)
    }
}

/// League's game window, copied with Windows Graphics Capture. Frames come only when the picture changes; the newest is
/// kept on the GPU and the reader's areas are copied out of it on demand.
#[cfg(windows)]
mod wgc {
    use std::collections::HashMap;
    use std::sync::{Arc, Once};

    use windows::core::{Interface, Result};
    use windows::Graphics::Capture::{
        Direct3D11CaptureFramePool, GraphicsCaptureAccess, GraphicsCaptureAccessKind, GraphicsCaptureItem, GraphicsCaptureSession,
    };
    use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
    use windows::Graphics::DirectX::DirectXPixelFormat;
    use windows::Graphics::SizeInt32;
    use windows::Win32::Foundation::{HMODULE, HWND};
    use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
    use windows::Win32::Graphics::Direct3D11::*;
    use windows::Win32::Graphics::Dxgi::Common::DXGI_SAMPLE_DESC;
    use windows::Win32::Graphics::Dxgi::IDXGIDevice;
    use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};
    use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;

    use crate::diag::Diag;

    const FORMAT: DirectXPixelFormat = DirectXPixelFormat::B8G8R8A8UIntNormalized;

    /// The game's window (not the client's): its class is RiotWindowClass.
    pub fn game_window() -> Option<isize> {
        let class: Vec<u16> = "RiotWindowClass\0".encode_utf16().collect();
        let h = unsafe { windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW(class.as_ptr(), std::ptr::null()) };
        (!h.is_null()).then_some(h as isize)
    }

    /// Asks Windows once to drop the yellow frame it draws round a captured window (Windows 11; an app without a package
    /// is usually let without a prompt). On its own thread, so a prompt never holds up the reader.
    fn ask_borderless(diag: &Arc<Diag>) {
        static ONCE: Once = Once::new();
        let diag = diag.clone();
        ONCE.call_once(move || {
            std::thread::spawn(move || {
                unsafe {
                    let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
                }
                match GraphicsCaptureAccess::RequestAccessAsync(GraphicsCaptureAccessKind::Borderless).and_then(|op| op.join()) {
                    Ok(s) => diag.log(&format!("capture without the yellow frame: access {} (0 allowed)", s.0)),
                    Err(e) => diag.log(&format!("capture without the yellow frame: not asked ({e})")),
                }
            });
        });
    }

    pub struct Wgc {
        hwnd: isize,
        d3d: IDirect3DDevice,
        context: ID3D11DeviceContext,
        device: ID3D11Device,
        pool: Direct3D11CaptureFramePool,
        session: GraphicsCaptureSession,
        pool_size: SizeInt32,
        last: Option<(ID3D11Texture2D, u32, u32)>, // the newest frame, our own copy, and the size of its content
        staging: HashMap<(i32, i32), ID3D11Texture2D>,
    }

    impl Drop for Wgc {
        fn drop(&mut self) {
            let _ = self.session.Close();
            let _ = self.pool.Close();
        }
    }

    impl Wgc {
        pub fn new(hwnd: isize, diag: &Arc<Diag>) -> Result<Wgc> {
            ask_borderless(diag);
            unsafe {
                let (mut device, mut context) = (None, None);
                D3D11CreateDevice(None, D3D_DRIVER_TYPE_HARDWARE, HMODULE(std::ptr::null_mut()), D3D11_CREATE_DEVICE_BGRA_SUPPORT, None,
                    D3D11_SDK_VERSION, Some(&mut device), None, Some(&mut context))?;
                let (Some(device), Some(context)): (Option<ID3D11Device>, Option<ID3D11DeviceContext>) = (device, context) else {
                    return Err(windows::core::Error::from_hresult(windows::Win32::Foundation::E_FAIL));
                };
                let d3d: IDirect3DDevice = CreateDirect3D11DeviceFromDXGIDevice(&device.cast::<IDXGIDevice>()?)?.cast()?;
                let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
                let item: GraphicsCaptureItem = interop.CreateForWindow(HWND(hwnd as _))?;
                let pool_size = item.Size()?;
                let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(&d3d, FORMAT, 2, pool_size)?;
                let session = pool.CreateCaptureSession(&item)?;
                let _ = session.SetIsCursorCaptureEnabled(false); // the cursor on the cards would spoil the reads
                if let Err(e) = session.SetIsBorderRequired(false) {
                    diag.log(&format!("the yellow frame stays (this Windows cannot drop it: {e})"));
                }
                session.StartCapture()?;
                Ok(Wgc { hwnd, d3d, context, device, pool, session, pool_size, last: None, staging: HashMap::new() })
            }
        }

        pub fn alive(&self) -> bool {
            unsafe { windows_sys::Win32::UI::WindowsAndMessaging::IsWindow(self.hwnd as _) != 0 }
        }

        /// Takes the newest frame that came since the last look, if any.
        fn refresh(&mut self) -> Result<()> {
            let mut newest = None;
            while let Ok(f) = self.pool.TryGetNextFrame() {
                if let Some(old) = newest.replace(f) {
                    let _ = old.Close();
                }
            }
            let Some(frame) = newest else { return Ok(()) };
            let content = frame.ContentSize()?;
            let tex: ID3D11Texture2D = unsafe { frame.Surface()?.cast::<IDirect3DDxgiInterfaceAccess>()?.GetInterface()? };
            let mut desc = D3D11_TEXTURE2D_DESC::default();
            unsafe { tex.GetDesc(&mut desc) };
            let fits = self.last.as_ref().is_some_and(|(t, _, _)| {
                let mut d = D3D11_TEXTURE2D_DESC::default();
                unsafe { t.GetDesc(&mut d) };
                (d.Width, d.Height) == (desc.Width, desc.Height)
            });
            if !fits {
                let own = D3D11_TEXTURE2D_DESC {
                    Usage: D3D11_USAGE_DEFAULT, BindFlags: 0, CPUAccessFlags: 0, MiscFlags: 0, MipLevels: 1, ArraySize: 1,
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 }, ..desc
                };
                let mut t = None;
                unsafe { self.device.CreateTexture2D(&own, None, Some(&mut t))? };
                self.last = t.map(|t| (t, 0, 0));
            }
            if let Some((own, cw, ch)) = &mut self.last {
                unsafe { self.context.CopyResource(&*own, &tex) };
                *cw = (content.Width.max(0) as u32).min(desc.Width);
                *ch = (content.Height.max(0) as u32).min(desc.Height);
            }
            let _ = frame.Close();
            // the window changed size (a resolution change): the pool follows it
            if (content.Width, content.Height) != (self.pool_size.Width, self.pool_size.Height) && content.Width > 0 && content.Height > 0 {
                self.pool.Recreate(&self.d3d, FORMAT, 2, content)?;
                self.pool_size = content;
            }
            Ok(())
        }

        /// The window's top-left on the screen, as the capture sees it (its visible frame, without the drop shadow).
        fn origin(&self) -> (i32, i32) {
            use windows_sys::Win32::Foundation::RECT;
            let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            let ok = unsafe {
                windows_sys::Win32::Graphics::Dwm::DwmGetWindowAttribute(self.hwnd as _,
                    windows_sys::Win32::Graphics::Dwm::DWMWA_EXTENDED_FRAME_BOUNDS as u32, &mut r as *mut RECT as _,
                    std::mem::size_of::<RECT>() as u32) >= 0
            };
            if !ok {
                unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect(self.hwnd as _, &mut r) };
            }
            (r.left, r.top)
        }

        /// w × h pixels at (x, y) on the screen, from the newest frame; what lies outside the game's window is black.
        pub fn pixels(&mut self, x: i32, y: i32, w: i32, h: i32) -> Option<Vec<u8>> {
            if unsafe { windows_sys::Win32::UI::WindowsAndMessaging::IsIconic(self.hwnd as _) } != 0 {
                return None; // minimized: the frames are stale
            }
            self.refresh().ok()?;
            let (tex, cw, ch) = self.last.clone()?;
            let (ox, oy) = self.origin();
            let (fx, fy) = (x - ox, y - oy); // the area's top-left in the frame
            let (l, t) = (fx.max(0), fy.max(0));
            let (r, b) = ((fx + w).min(cw as i32), (fy + h).min(ch as i32));
            let mut out = vec![0u8; (w * h * 4) as usize];
            if r <= l || b <= t {
                return Some(out);
            }
            let (sw, sh) = (r - l, b - t);
            if self.staging.len() > 8 {
                self.staging.clear();
            }
            if !self.staging.contains_key(&(sw, sh)) {
                let desc = D3D11_TEXTURE2D_DESC {
                    Width: sw as u32, Height: sh as u32, MipLevels: 1, ArraySize: 1,
                    Format: windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM,
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 }, Usage: D3D11_USAGE_STAGING, BindFlags: 0,
                    CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32, MiscFlags: 0,
                };
                let mut s = None;
                unsafe { self.device.CreateTexture2D(&desc, None, Some(&mut s)).ok()? };
                self.staging.insert((sw, sh), s?);
            }
            let staging = &self.staging[&(sw, sh)];
            let area = D3D11_BOX { left: l as u32, top: t as u32, front: 0, right: r as u32, bottom: b as u32, back: 1 };
            unsafe {
                self.context.CopySubresourceRegion(staging, 0, 0, 0, 0, &tex, 0, Some(&area));
                let mut map = D3D11_MAPPED_SUBRESOURCE::default();
                self.context.Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut map)).ok()?;
                let (dx, dy) = (l - fx, t - fy); // where the copied part sits in the area
                for row in 0..sh {
                    let src = std::slice::from_raw_parts((map.pData as *const u8).add(row as usize * map.RowPitch as usize), sw as usize * 4);
                    let at = (((dy + row) * w + dx) * 4) as usize;
                    out[at..at + sw as usize * 4].copy_from_slice(src);
                }
                self.context.Unmap(staging, 0);
            }
            Some(out)
        }
    }
}
