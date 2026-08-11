//! Calendar integration (macOS EventKit).
//!
//! Reads the user's local calendars — whatever accounts they've added to the
//! macOS Calendar app (iCloud, Google, Exchange) all surface through EventKit,
//! so there is no OAuth to set up. Two jobs: report/obtain calendar access, and
//! list upcoming events so a recording can be matched to the meeting it belongs
//! to (title + attendees). Windows and Google are future providers behind the
//! same command surface.
//!
//! Uses the typed `objc2-event-kit` bindings (not raw `msg_send!`) so the
//! EventKit calls are checked at compile time.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// One calendar event, flattened for the UI.
#[derive(Serialize, Clone)]
pub struct CalEvent {
    /// Stable EventKit identifier — used to match a recording to its meeting.
    pub id: String,
    pub title: String,
    /// Unix seconds.
    pub start: f64,
    pub end: f64,
    /// Display names (or emails) of the invitees, best-effort.
    pub attendees: Vec<String>,
    /// Invitee email addresses, for pre-filling a follow-up email's recipients.
    #[serde(rename = "attendeeEmails")]
    pub attendee_emails: Vec<String>,
    pub location: Option<String>,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CalAuth {
    Granted,
    Denied,
    Restricted,
    /// Never asked.
    Undetermined,
    /// Platform without calendar gating, or EventKit unavailable.
    Unknown,
}

#[tauri::command]
pub fn calendar_authorization() -> CalAuth {
    status()
}

/// Ask macOS for calendar access; the answer arrives as a
/// `calendar-permission-result` event (boolean) since the prompt is async.
#[tauri::command]
pub fn request_calendar_access(app: AppHandle) {
    request(move |granted| {
        let _ = app.emit("calendar-permission-result", granted);
    });
}

/// Events between now and `days` from now (default 7). Empty until access is
/// granted, so the UI can call it freely.
#[tauri::command]
pub fn upcoming_events(days: Option<u32>) -> Vec<CalEvent> {
    events_within(days.unwrap_or(7))
}

// ── macOS: EventKit ─────────────────────────────────────────────────────────
#[cfg(target_os = "macos")]
fn status() -> CalAuth {
    use objc2_event_kit::{EKEntityType, EKEventStore};
    let s = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
    match s.0 {
        0 => CalAuth::Undetermined,
        1 => CalAuth::Restricted,
        2 => CalAuth::Denied,
        3 => CalAuth::Granted,     // FullAccess
        4 => CalAuth::Denied,      // WriteOnly — can't read events
        _ => CalAuth::Unknown,
    }
}

#[cfg(target_os = "macos")]
fn request(done: impl Fn(bool) + Send + Sync + 'static) {
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_event_kit::EKEventStore;
    use objc2_foundation::NSError;

    let store = unsafe { EKEventStore::new() };
    // EventKit copies the completion block, so the RcBlock may drop after the
    // call. The store, however, must survive the async request — leak one for
    // the app's lifetime rather than risk cancelling the prompt.
    let handler = RcBlock::new(move |granted: Bool, _err: *mut NSError| done(granted.as_bool()));
    unsafe {
        store.requestFullAccessToEventsWithCompletion(&*handler as *const _ as *mut _);
    }
    std::mem::forget(store);
}

#[cfg(target_os = "macos")]
fn events_within(days: u32) -> Vec<CalEvent> {
    use objc2_event_kit::EKEventStore;
    use objc2_foundation::NSDate;

    if status() != CalAuth::Granted {
        return Vec::new();
    }
    let store = unsafe { EKEventStore::new() };
    let start = NSDate::now();
    let end = NSDate::dateWithTimeIntervalSinceNow(f64::from(days) * 86_400.0);
    let events = unsafe {
        let predicate = store.predicateForEventsWithStartDate_endDate_calendars(&start, &end, None);
        store.eventsMatchingPredicate(&predicate)
    };

    let mut out = Vec::with_capacity(events.count());
    for i in 0..events.count() {
        out.push(map_event(&events.objectAtIndex(i)));
    }
    out
}

#[cfg(target_os = "macos")]
fn map_event(ev: &objc2_event_kit::EKEvent) -> CalEvent {
    let title = unsafe { ev.title() }.to_string();
    let id = unsafe { ev.eventIdentifier() }
        .map(|s| s.to_string())
        .unwrap_or_default();
    let start = unsafe { ev.startDate() }.timeIntervalSince1970();
    let end = unsafe { ev.endDate() }.timeIntervalSince1970();
    let location = unsafe { ev.location() }.map(|s| s.to_string());

    let mut attendees = Vec::new();
    let mut attendee_emails = Vec::new();
    if let Some(list) = unsafe { ev.attendees() } {
        for i in 0..list.count() {
            let p = list.objectAtIndex(i);
            let name = unsafe { p.name() }.map(|s| s.to_string());
            // EKParticipant.URL is a `mailto:` URL; keep the bare address.
            let email = unsafe { p.URL() }
                .absoluteString()
                .map(|s| s.to_string())
                .map(|e| e.strip_prefix("mailto:").unwrap_or(&e).trim().to_string())
                .filter(|e| e.contains('@'));
            if let Some(em) = &email {
                attendee_emails.push(em.clone());
            }
            if let Some(label) = attendee_label(name, email) {
                attendees.push(label);
            }
        }
    }

    CalEvent { id, title, start, end, attendees, attendee_emails, location }
}

/// Prefer a real name; fall back to the email (minus the `mailto:` scheme).
#[cfg(target_os = "macos")]
fn attendee_label(name: Option<String>, email: Option<String>) -> Option<String> {
    if let Some(n) = name {
        if !n.trim().is_empty() {
            return Some(n.trim().to_string());
        }
    }
    if let Some(e) = email {
        let e = e.strip_prefix("mailto:").unwrap_or(&e).trim().to_string();
        if !e.is_empty() {
            return Some(e);
        }
    }
    None
}

// ── Other platforms: no calendar provider yet ───────────────────────────────
#[cfg(not(target_os = "macos"))]
fn status() -> CalAuth {
    CalAuth::Unknown
}

#[cfg(not(target_os = "macos"))]
fn request(done: impl Fn(bool) + Send + Sync + 'static) {
    done(false);
}

#[cfg(not(target_os = "macos"))]
fn events_within(_days: u32) -> Vec<CalEvent> {
    Vec::new()
}
