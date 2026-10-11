//! macOS application menu — installed only while the Settings window is on screen.
//!
//! Agent guardrail: docs/architecture/macos-tray-menu.md §1 keeps Tauri's default menubar off
//! the hidden clipboard webview, because that menubar makes the tray status item blink. The menu
//! below is therefore installed by [`install`] at the moment the app is promoted to `Regular`
//! (Settings visible) and removed by [`remove`] when it falls back to `Accessory`, so the
//! tray-only state keeps exactly the startup state that passed 5 tray clicks.
//!
//! Edit and Window entries are `PredefinedMenuItem`s built with `None` titles: AppKit supplies the
//! standard localized titles and the standard key equivalents (⌘Z ⇧⌘Z ⌘X ⌘C ⌘V ⌘A ⌘M ⌘W).
//! Quit is a local item instead of the predefined one so that it goes through
//! `commands::quit_app` — the same exit path as the tray's Quit item.
//!
//! Labels do not live here. The webview resolves them from `src/lib/i18n/dict.ts` and pushes them
//! through `commands::set_native_menu_labels`, so the dictionary stays the only place the app keeps
//! its translations. Before the first push (app start, menu opened immediately) the English
//! defaults below are used.

#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
#[cfg(target_os = "macos")]
use tauri::AppHandle;
#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
pub const ID_SETTINGS: &str = "app-menu-settings";
#[cfg(target_os = "macos")]
pub const ID_QUIT: &str = "app-menu-quit";
#[cfg(target_os = "macos")]
pub const ID_DOCS: &str = "app-menu-docs";

#[cfg(target_os = "macos")]
const DOCS_URL: &str = "https://github.com/tayuLuc/copyosity#readme";

/// Menu strings as pushed by the webview (field names match the TS payload in
/// `src/lib/i18n/index.ts`).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct NativeMenuLabels {
    pub about: String,
    pub settings: String,
    pub quit: String,
    pub edit: String,
    pub window: String,
    pub help: String,
    pub docs: String,
}

impl Default for NativeMenuLabels {
    fn default() -> Self {
        Self {
            about: "About Copyosity".to_string(),
            settings: "Settings…".to_string(),
            quit: "Quit Copyosity".to_string(),
            edit: "Edit".to_string(),
            window: "Window".to_string(),
            help: "Help".to_string(),
            docs: "Copyosity Documentation".to_string(),
        }
    }
}

/// Latest labels pushed by the webview; `None` until the first push.
#[derive(Default)]
pub struct NativeMenuState(pub std::sync::Mutex<Option<NativeMenuLabels>>);

/// Labels currently known to the core, falling back to English before the first push.
#[cfg(target_os = "macos")]
pub fn labels(app: &AppHandle) -> NativeMenuLabels {
    app.try_state::<NativeMenuState>()
        .and_then(|state| state.0.lock().ok().and_then(|guard| guard.clone()))
        .unwrap_or_default()
}

/// Build and install the application menu from the labels the webview last pushed.
/// Idempotent: `set_menu` replaces, so rebuilding never accumulates menus.
#[cfg(target_os = "macos")]
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let labels = labels(app);

    let about = PredefinedMenuItem::about(app, Some(&labels.about), None)?;
    let settings = MenuItemBuilder::with_id(ID_SETTINGS, labels.settings.clone())
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let quit = MenuItemBuilder::with_id(ID_QUIT, labels.quit.clone())
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;
    let app_sep_1 = PredefinedMenuItem::separator(app)?;
    let app_sep_2 = PredefinedMenuItem::separator(app)?;
    let app_sep_3 = PredefinedMenuItem::separator(app)?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;
    let edit_sep_1 = PredefinedMenuItem::separator(app)?;
    let edit_sep_2 = PredefinedMenuItem::separator(app)?;

    let minimize = PredefinedMenuItem::minimize(app, None)?;
    let maximize = PredefinedMenuItem::maximize(app, None)?;
    let close = PredefinedMenuItem::close_window(app, None)?;
    let window_sep = PredefinedMenuItem::separator(app)?;

    let docs = MenuItemBuilder::with_id(ID_DOCS, labels.docs.clone()).build(app)?;

    let app_menu = SubmenuBuilder::new(app, "Copyosity")
        .items(&[
            &about, &app_sep_1, &settings, &app_sep_2, &hide, &app_sep_3, &quit,
        ])
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, &labels.edit)
        .items(&[
            &undo,
            &redo,
            &edit_sep_1,
            &cut,
            &copy,
            &paste,
            &edit_sep_2,
            &select_all,
        ])
        .build()?;
    let window_menu = SubmenuBuilder::new(app, &labels.window)
        .items(&[&minimize, &maximize, &window_sep, &close])
        .build()?;
    let help_menu = SubmenuBuilder::new(app, &labels.help)
        .items(&[&docs])
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &edit_menu, &window_menu, &help_menu])
        .build()?;

    app.set_menu(menu)?;
    #[cfg(debug_assertions)]
    eprintln!(
        "[app-menu] installed: edit={} window={} help={} quit={} docs={}",
        labels.edit, labels.window, labels.help, labels.quit, labels.docs
    );
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn remove(app: &AppHandle) {
    let _ = app.remove_menu();
    #[cfg(debug_assertions)]
    eprintln!("[app-menu] removed");
}

/// Rebuild the menu after new labels arrive, but only while Settings is open — tray-only mode must
/// keep the pre-Settings state (no menu installed).
pub fn refresh(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    if crate::activation_macos::settings_window_open(app) {
        if let Err(e) = install(app) {
            eprintln!("[app-menu] install failed: {e}");
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(target_os = "macos")]
pub fn handle_event(app: &AppHandle, id: &str) {
    match id {
        ID_SETTINGS => {
            let _ = crate::commands::open_settings_window(app.clone(), None);
        }
        ID_QUIT => {
            let _ = crate::commands::quit_app(app.clone());
        }
        ID_DOCS => open_docs(app),
        _ => {}
    }
}

#[cfg(target_os = "macos")]
fn open_docs(app: &AppHandle) {
    use tauri_plugin_opener::OpenerExt;

    if let Err(e) = app.opener().open_url(DOCS_URL, None::<String>) {
        eprintln!("[app-menu] open docs failed: {e}");
    }
}

#[cfg(not(target_os = "macos"))]
pub fn install(_app: &tauri::AppHandle) {}

#[cfg(not(target_os = "macos"))]
pub fn remove(_app: &tauri::AppHandle) {}

#[cfg(not(target_os = "macos"))]
pub fn handle_event(_app: &tauri::AppHandle, _id: &str) {}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::NativeMenuLabels;

    #[test]
    fn fallback_labels_keep_the_brand_untranslated() {
        let labels = NativeMenuLabels::default();
        assert_eq!(labels.quit, "Quit Copyosity");
        assert_eq!(labels.about, "About Copyosity");
        assert_eq!(labels.docs, "Copyosity Documentation");
        assert!(labels.settings.ends_with('…'));
    }

    #[test]
    fn labels_deserialize_from_the_webview_payload() {
        let labels: NativeMenuLabels = serde_json::from_str(
            r#"{"about":"О программе Copyosity","settings":"Настройки…","quit":"Завершить Copyosity","edit":"Правка","window":"Окно","help":"Справка","docs":"Документация Copyosity"}"#,
        )
        .expect("payload from src/lib/i18n/index.ts");
        assert_eq!(labels.edit, "Правка");
        assert_eq!(labels.window, "Окно");
    }
}
