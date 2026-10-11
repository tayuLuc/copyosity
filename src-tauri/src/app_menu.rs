//! macOS application menu — installed only while the Settings window is on screen.
//!
//! Agent guardrail: docs/architecture/macos-tray-menu.md §1 keeps Tauri's default menubar off
//! the hidden clipboard webview, because that menubar makes the tray status item blink. The menu
//! below is therefore installed by [`install`] at the moment the app is promoted to `Regular`
//! (Settings visible) and removed by [`remove`] when it falls back to `Accessory`, so the
//! tray-only state keeps exactly the startup state that passed 5 tray clicks.
//!
//! Edit and Window entries are `PredefinedMenuItem`s built with `None` titles: AppKit supplies
//! the standard localized titles and the standard key equivalents (⌘Z ⇧⌘Z ⌘X ⌘C ⌘V ⌘A ⌘M ⌘W).
//! Quit is a local item instead of the predefined one so that it goes through
//! `commands::quit_app` — the same exit path as the tray's Quit item.
//!
//! Labels follow the stored `ui_locale` through the same lookup as the tray menu
//! (docs/architecture/macos-tray-menu.md §13).

#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
#[cfg(target_os = "macos")]
use tauri::AppHandle;

#[cfg(target_os = "macos")]
pub const ID_SETTINGS: &str = "app-menu-settings";
#[cfg(target_os = "macos")]
pub const ID_QUIT: &str = "app-menu-quit";
#[cfg(target_os = "macos")]
pub const ID_DOCS: &str = "app-menu-docs";

#[cfg(target_os = "macos")]
const DOCS_URL: &str = "https://github.com/tayuLuc/copyosity#readme";

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AppMenuLabels {
    pub about: &'static str,
    pub settings: &'static str,
    pub quit: &'static str,
    pub edit: &'static str,
    pub window: &'static str,
    pub help: &'static str,
    pub docs: &'static str,
}

#[cfg(target_os = "macos")]
const APP_MENU_LABELS_EN: AppMenuLabels = AppMenuLabels {
    about: "About Copyosity",
    settings: "Settings…",
    quit: "Quit Copyosity",
    edit: "Edit",
    window: "Window",
    help: "Help",
    docs: "Copyosity Documentation",
};

#[cfg(target_os = "macos")]
fn app_menu_labels(locale: &str) -> AppMenuLabels {
    match locale {
        "ru" => AppMenuLabels {
            about: "О программе Copyosity",
            settings: "Настройки…",
            quit: "Завершить Copyosity",
            edit: "Правка",
            window: "Окно",
            help: "Справка",
            docs: "Документация Copyosity",
        },
        "es" => AppMenuLabels {
            about: "Acerca de Copyosity",
            settings: "Ajustes…",
            quit: "Salir de Copyosity",
            edit: "Edición",
            window: "Ventana",
            help: "Ayuda",
            docs: "Documentación de Copyosity",
        },
        "de" => AppMenuLabels {
            about: "Über Copyosity",
            settings: "Einstellungen…",
            quit: "Copyosity beenden",
            edit: "Bearbeiten",
            window: "Fenster",
            help: "Hilfe",
            docs: "Copyosity-Dokumentation",
        },
        "fr" => AppMenuLabels {
            about: "À propos de Copyosity",
            settings: "Réglages…",
            quit: "Quitter Copyosity",
            edit: "Édition",
            window: "Fenêtre",
            help: "Aide",
            docs: "Documentation de Copyosity",
        },
        "zh" => AppMenuLabels {
            about: "关于 Copyosity",
            settings: "设置…",
            quit: "退出 Copyosity",
            edit: "编辑",
            window: "窗口",
            help: "帮助",
            docs: "Copyosity 文档",
        },
        "ja" => AppMenuLabels {
            about: "Copyosity について",
            settings: "設定…",
            quit: "Copyosity を終了",
            edit: "編集",
            window: "ウインドウ",
            help: "ヘルプ",
            docs: "Copyosity ドキュメント",
        },
        _ => APP_MENU_LABELS_EN,
    }
}

/// Build and install the application menu. Idempotent: rebuilds from the stored locale, so a
/// locale change reuses it instead of accumulating menus.
#[cfg(target_os = "macos")]
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let labels = app_menu_labels(&crate::normalize_tray_locale(&crate::tray_locale(app)));

    let about = PredefinedMenuItem::about(app, Some(labels.about), None)?;
    let settings = MenuItemBuilder::with_id(ID_SETTINGS, labels.settings)
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let quit = MenuItemBuilder::with_id(ID_QUIT, labels.quit)
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

    let docs = MenuItemBuilder::with_id(ID_DOCS, labels.docs).build(app)?;

    let app_menu = SubmenuBuilder::new(app, "Copyosity")
        .items(&[
            &about, &app_sep_1, &settings, &app_sep_2, &hide, &app_sep_3, &quit,
        ])
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, labels.edit)
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
    let window_menu = SubmenuBuilder::new(app, labels.window)
        .items(&[&minimize, &maximize, &window_sep, &close])
        .build()?;
    let help_menu = SubmenuBuilder::new(app, labels.help)
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

/// Rebuild the menu after a locale change, but only while Settings is open — tray-only mode
/// must keep the pre-Settings state (no menu installed).
#[cfg(target_os = "macos")]
pub fn refresh(app: &AppHandle) {
    if crate::activation_macos::settings_window_open(app) {
        if let Err(e) = install(app) {
            eprintln!("[app-menu] install failed: {e}");
        }
    }
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
pub fn refresh(_app: &tauri::AppHandle) {}

#[cfg(not(target_os = "macos"))]
pub fn handle_event(_app: &tauri::AppHandle, _id: &str) {}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::{app_menu_labels, APP_MENU_LABELS_EN};

    #[test]
    fn seven_locales_are_localized() {
        assert_eq!(app_menu_labels("ru").quit, "Завершить Copyosity");
        assert_eq!(app_menu_labels("es").window, "Ventana");
        assert_eq!(app_menu_labels("de").edit, "Bearbeiten");
        assert_eq!(app_menu_labels("fr").about, "À propos de Copyosity");
        assert_eq!(app_menu_labels("zh").settings, "设置…");
        assert_eq!(app_menu_labels("ja").help, "ヘルプ");
        assert_eq!(app_menu_labels("en").edit, "Edit");
    }

    #[test]
    fn unknown_locale_falls_back_to_english() {
        for code in ["", "xx", "russian", "zz-ZZ"] {
            assert_eq!(app_menu_labels(code), APP_MENU_LABELS_EN, "{code}");
        }
    }

    #[test]
    fn stored_code_is_normalized_before_lookup() {
        assert_eq!(
            app_menu_labels(&crate::normalize_tray_locale("  RU ")),
            app_menu_labels("ru")
        );
    }

    #[test]
    fn brand_stays_untranslated() {
        for code in ["en", "ru", "es", "de", "fr", "zh", "ja"] {
            let labels = app_menu_labels(code);
            assert!(labels.quit.contains("Copyosity"), "{code}");
            assert!(labels.about.contains("Copyosity"), "{code}");
            assert!(labels.docs.contains("Copyosity"), "{code}");
        }
    }
}
