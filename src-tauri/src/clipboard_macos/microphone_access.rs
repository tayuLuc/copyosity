//! Microphone authorization: status read and request, both through AVFoundation.
//!
//! The Settings pane treats microphone like accessibility: read the status without prompting, and
//! let one explicit button raise the system dialog. macOS shows that dialog once per app, so after
//! a denial only System Settings grants the permission.

#[cfg(target_os = "macos")]
use block2::DynBlock;
#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};

/// The audio media type, or `None` if the framework has no such constant.
#[cfg(target_os = "macos")]
fn audio_media_type() -> Option<&'static objc2_av_foundation::AVMediaType> {
    // SAFETY: reading a framework-owned constant pointer.
    unsafe { AVMediaTypeAudio }
}

/// Whether the process may record audio.
#[cfg(target_os = "macos")]
pub fn microphone_granted() -> bool {
    let Some(media_type) = audio_media_type() else {
        return false;
    };
    // SAFETY: a read-only class query with a framework-owned constant argument.
    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) };
    status == AVAuthorizationStatus::Authorized
}

/// Ask macOS to show the microphone dialog. The system shows it once per app; after an answer only
/// the status changes.
#[cfg(target_os = "macos")]
pub fn request_microphone() {
    let Some(media_type) = audio_media_type() else {
        return;
    };
    // SAFETY: the framework copies the handler before returning, so it stays valid for the
    // arbitrary dispatch queue it may invoke on later.
    let handler: &DynBlock<dyn Fn(objc2::runtime::Bool)> =
        &RcBlock::new(|_granted: objc2::runtime::Bool| {});
    unsafe {
        AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, handler);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn microphone_granted() -> bool {
    true
}

#[cfg(not(target_os = "macos"))]
pub fn request_microphone() {}

/// Open the Microphone pane in System Settings. macOS shows its permission dialog once, so this
/// is the only way back once a prompt was dismissed.
#[cfg(target_os = "macos")]
pub fn open_microphone_settings() {
    const URLS: &[&str] = &[
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone",
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    ];
    for url in URLS {
        if std::process::Command::new("open")
            .arg(url)
            .status()
            .is_ok_and(|s| s.success())
        {
            return;
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn open_microphone_settings() {}
