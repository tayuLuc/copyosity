//! Microphone authorization: status read and request, both through AVFoundation.
//!
//! The Settings pane treats microphone like accessibility: read the status without prompting, and
//! let one explicit button raise the system dialog. Opening System Settings is the person's
//! decision — the dialog itself offers that button.

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
