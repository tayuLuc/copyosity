//! macOS `ActivationPolicy` transitions between menu-bar (`Accessory`) and windowed (`Regular`) UI.
//!
//! Agent guardrail: docs/architecture/macos-tray-menu.md §9 — tray startup uses `Accessory`;
//! promote to `Regular` only for Settings. `maybe_restore_accessory` must not run while the
//! settings window still exists (check `is_some()`, not `is_visible()`).
//!
//! The application menu rides the same transition (`app_menu::install` on promote,
//! `app_menu::remove` on restore) so the menu exists exactly while the menu bar is displayed;
//! see docs/architecture/macos-tray-menu.md §14.

#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
pub fn promote_to_regular(app: &tauri::AppHandle) {
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    // Menu first: the bar must carry its items by the time the policy switch exposes it.
    let _ = crate::app_menu::install(app);
}

#[cfg(target_os = "macos")]
pub fn maybe_restore_accessory(app: &tauri::AppHandle) {
    if settings_window_open(app) {
        return;
    }
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    crate::app_menu::remove(app);
}

#[cfg(target_os = "macos")]
pub(crate) fn settings_window_open(app: &tauri::AppHandle) -> bool {
    // is_some() not is_visible() — closing animation left us stuck in Regular when using visible
    app.get_webview_window("settings").is_some()
}
