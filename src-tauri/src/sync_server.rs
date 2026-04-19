use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use axum::{
    extract::State as AxumState,
    http::{HeaderMap, StatusCode, Method},
    response::Json,
    routing::{get, post},
    Router,
};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tower_http::cors::{CorsLayer, Any};

type HmacSha256 = Hmac<Sha256>;

// ── Sync server ───────────────────────────────────────────────────────────────

/// A single sync event as serialised over the wire.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub(crate) struct SyncEventRaw {
    pub(crate) event_id: String,
    pub(crate) device_id: String,
    pub(crate) device_counter: i64,
    pub(crate) entity_type: String,
    pub(crate) entity_id: String,
    pub(crate) operation: String,
    pub(crate) payload: Option<String>,
    pub(crate) timestamp: i64,
}

/// Body of POST /dsj/sync (encrypted).
#[derive(serde::Serialize, serde::Deserialize)]
struct SyncRequest {
    peer_device_id: String,
    from_counter: i64,   // give me all your events after this counter
    events: Vec<SyncEventRaw>,
    request_nonce: u64,  // monotonic — replay protection
    #[serde(default)]
    cold_sync: bool,     // true = peer wants full structure snapshot in response
}

/// Response body of POST /dsj/sync (encrypted).
#[derive(serde::Serialize, serde::Deserialize)]
struct SyncResponse {
    events: Vec<SyncEventRaw>,
    server_time: i64, // ms since epoch — helps client detect clock drift
}

/// Tauri event emitted to the frontend when a sync request arrives.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct SyncRequestEvent {
    request_id: String,
    peer_device_id: String,
    from_counter: i64,
    cold_sync: bool,
    events: Vec<SyncEventRaw>,
}

/// Shared state accessible from both Tauri commands and axum handlers.
pub(crate) struct SyncShared {
    /// port the HTTP server is listening on (updated on restart)
    pub(crate) port: Mutex<u16>,
    /// this device's UUID (set from JS at startup via sync_set_device_id)
    device_id: Mutex<String>,
    /// human-readable name for this device (e.g. "Mac Mini")
    device_name: Mutex<String>,
    /// sync role: "primary" | "full" | "remote" | "cold"
    device_type: Mutex<String>,
    /// active 6-digit pair codes: code → expiry instant
    pair_codes: Mutex<HashMap<String, std::time::Instant>>,
    /// trusted peers: device_id → peer_code (HMAC/enc key material)
    peer_codes: Mutex<HashMap<String, String>>,
    /// in-flight HTTP sync requests waiting for JS to process
    pending: Mutex<HashMap<String, tokio::sync::oneshot::Sender<SyncResponse>>>,
    /// handle to the running axum server task; aborted on port change
    server_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl SyncShared {
    pub(crate) fn new() -> Self {
        Self {
            port: Mutex::new(0),
            device_id: Mutex::new(String::new()),
            device_name: Mutex::new(String::new()),
            device_type: Mutex::new("full".to_string()),
            pair_codes: Mutex::new(HashMap::new()),
            peer_codes: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            server_task: Mutex::new(None),
        }
    }
}

// ── Sync crypto helpers ────────────────────────────────────────────────────────

/// Derive a 32-byte encryption key and 32-byte HMAC key from a peer_code.
fn derive_sync_keys(peer_code: &str) -> ([u8; 32], [u8; 32]) {
    let hk = Hkdf::<Sha256>::new(None, peer_code.as_bytes());
    let mut enc_key = [0u8; 32];
    let mut mac_key = [0u8; 32];
    hk.expand(b"dsj-sync-enc-v1", &mut enc_key)
        .expect("HKDF expand enc key");
    hk.expand(b"dsj-sync-hmac-v1", &mut mac_key)
        .expect("HKDF expand mac key");
    (enc_key, mac_key)
}

/// AES-256-GCM encrypt bytes. Returns `"<hex_nonce>.<hex_ciphertext>"`.
fn encrypt_sync_payload(data: &[u8], key: &[u8; 32]) -> Result<String, String> {
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), data)
        .map_err(|_| "Encryption failed".to_string())?;
    Ok(format!("{}.{}", hex::encode(nonce_bytes), hex::encode(ciphertext)))
}

/// AES-256-GCM decrypt `"<hex_nonce>.<hex_ciphertext>"`.
fn decrypt_sync_payload(encoded: &str, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let (nonce_hex, ct_hex) = encoded
        .split_once('.')
        .ok_or("Invalid payload format")?;
    let nonce_bytes = hex::decode(nonce_hex).map_err(|e| e.to_string())?;
    let ciphertext = hex::decode(ct_hex).map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
        .map_err(|_| "Decryption failed — wrong key or tampered payload".to_string())
}

/// Compute HMAC-SHA256 over `data` using `key`. Returns raw 32-byte tag.
fn make_hmac(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let mut mac = <HmacSha256 as KeyInit>::new_from_slice(key).expect("HMAC key size ok");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// Verify HMAC-SHA256. Constant-time comparison.
fn verify_hmac(data: &[u8], key: &[u8; 32], expected_hex: &str) -> bool {
    let expected = match hex::decode(expected_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let mut mac = <HmacSha256 as KeyInit>::new_from_slice(key).expect("HMAC key size ok");
    mac.update(data);
    mac.verify_slice(&expected).is_ok()
}

// ── Axum handlers ──────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AxumAppState {
    shared: Arc<SyncShared>,
    app: AppHandle,
}

/// GET /dsj/info — unauthenticated; used for pairing discovery
async fn handle_info(AxumState(s): AxumState<AxumAppState>) -> Json<serde_json::Value> {
    let port = *s.shared.port.lock().unwrap();
    let device_id = s.shared.device_id.lock().unwrap().clone();
    let device_name = s.shared.device_name.lock().unwrap().clone();
    let device_type = s.shared.device_type.lock().unwrap().clone();
    Json(serde_json::json!({
        "device_id": device_id,
        "device_name": device_name,
        "device_type": device_type,
        "version": env!("CARGO_PKG_VERSION"),
        "port": port,
    }))
}

/// POST /dsj/pair — body: `{ "requester_device_id": "...", "pair_code": "..." }`
/// Returns `{ "peer_code": "..." }` on success.
async fn handle_pair(
    AxumState(s): AxumState<AxumAppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let code = body["pair_code"].as_str().ok_or(StatusCode::BAD_REQUEST)?;
    let requester_id = body["requester_device_id"]
        .as_str()
        .ok_or(StatusCode::BAD_REQUEST)?;
    let requester_address = body["requester_address"].as_str().unwrap_or("").to_string();
    let requester_name = body["requester_device_name"].as_str().unwrap_or("").to_string();
    let requester_type = body["requester_device_type"].as_str().unwrap_or("full").to_string();

    // Verify the pair code is valid and unexpired
    {
        let mut codes = s.shared.pair_codes.lock().unwrap();
        let expiry = codes.get(code).copied().ok_or(StatusCode::UNAUTHORIZED)?;
        if std::time::Instant::now() > expiry {
            codes.remove(code);
            return Err(StatusCode::UNAUTHORIZED);
        }
        codes.remove(code); // one-time use
    }

    // Generate a shared peer_code (random 32 bytes hex)
    let mut peer_code_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut peer_code_bytes);
    let peer_code = hex::encode(peer_code_bytes);

    // Store in cache and emit to frontend so JS can persist it
    s.shared
        .peer_codes
        .lock()
        .unwrap()
        .insert(requester_id.to_string(), peer_code.clone());

    s.app
        .emit(
            "dsj-peer-paired",
            serde_json::json!({
                "device_id": requester_id,
                "device_name": requester_name,
                "device_type": requester_type,
                "peer_code": peer_code,
                "peer_address": requester_address,
            }),
        )
        .ok();

    Ok(Json(serde_json::json!({ "peer_code": peer_code })))
}

/// POST /dsj/sync
/// Header: `X-DSJ-Auth: <request_nonce_hex>.<hmac_hex>`
/// Body: encrypted SyncRequest payload
async fn handle_sync(
    AxumState(s): AxumState<AxumAppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<String>, StatusCode> {
    // --- 1. Parse auth header ---
    let auth = headers
        .get("X-DSJ-Auth")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let (nonce_hex, sig_hex) = auth.split_once('.').ok_or(StatusCode::UNAUTHORIZED)?;

    // --- 2. Peek at device_id (first pass: unencrypted header field) ---
    // The body is: `<device_id_hex>.<encrypted_payload>` so we can look up the peer_code
    // before decrypting the full body.
    let body_str = std::str::from_utf8(&body).map_err(|_| StatusCode::BAD_REQUEST)?;
    let (device_id_part, encrypted_part) = body_str
        .split_once('|')
        .ok_or(StatusCode::BAD_REQUEST)?;

    // --- 3. Look up peer_code ---
    let peer_code = s
        .shared
        .peer_codes
        .lock()
        .unwrap()
        .get(device_id_part)
        .cloned()
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let (enc_key, mac_key) = derive_sync_keys(&peer_code);

    // --- 4. Verify HMAC over (nonce + "|" + encrypted_payload) ---
    let mac_data = format!("{nonce_hex}|{encrypted_part}");
    if !verify_hmac(mac_data.as_bytes(), &mac_key, sig_hex) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // --- 5. Decrypt payload ---
    let plaintext = decrypt_sync_payload(encrypted_part, &enc_key)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let req: SyncRequest =
        serde_json::from_slice(&plaintext).map_err(|_| StatusCode::BAD_REQUEST)?;

    // --- 6. Hand off to JS via oneshot ---
    let request_id = {
        let mut bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut bytes);
        hex::encode(bytes)
    };
    let (tx, rx) = tokio::sync::oneshot::channel::<SyncResponse>();
    s.shared
        .pending
        .lock()
        .unwrap()
        .insert(request_id.clone(), tx);

    s.app
        .emit(
            "dsj-sync-request",
            SyncRequestEvent {
                request_id: request_id.clone(),
                peer_device_id: req.peer_device_id,
                from_counter: req.from_counter,
                cold_sync: req.cold_sync,
                events: req.events,
            },
        )
        .ok();

    // --- 7. Wait for JS to call sync_complete_request (30s timeout) ---
    let response = tokio::time::timeout(std::time::Duration::from_secs(30), rx)
        .await
        .map_err(|_| {
            s.shared.pending.lock().unwrap().remove(&request_id);
            StatusCode::GATEWAY_TIMEOUT
        })?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // --- 8. Encrypt and return response ---
    let response_json =
        serde_json::to_vec(&response).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let encrypted = encrypt_sync_payload(&response_json, &enc_key)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(encrypted))
}

// ── Sync Tauri commands ────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub(crate) struct SyncServerInfo {
    device_id: String,
    local_ip: String,
    port: u16,
}

/// Set this device's UUID in shared state. Called from JS during initSyncCtx().
#[tauri::command]
pub(crate) fn sync_set_device_id(device_id: String, shared: State<'_, Arc<SyncShared>>) {
    *shared.device_id.lock().unwrap() = device_id;
}

/// Set this device's display name and type in shared state.
#[tauri::command]
pub(crate) fn sync_set_device_info(
    device_name: String,
    device_type: String,
    shared: State<'_, Arc<SyncShared>>,
) {
    *shared.device_name.lock().unwrap() = device_name;
    *shared.device_type.lock().unwrap() = device_type;
}

/// Returns this device's sync server address for QR code display.
#[tauri::command]
pub(crate) fn sync_get_server_info(shared: State<'_, Arc<SyncShared>>) -> SyncServerInfo {
    let device_id = shared.device_id.lock().unwrap().clone();
    let port = *shared.port.lock().unwrap();
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    SyncServerInfo {
        device_id,
        local_ip,
        port,
    }
}

/// Generate a 6-digit pair code valid for 5 minutes. Returns the code.
#[tauri::command]
pub(crate) fn sync_generate_pair_code(shared: State<'_, Arc<SyncShared>>) -> String {
    let mut bytes = [0u8; 4];
    rand::thread_rng().fill_bytes(&mut bytes);
    let code = format!("{:06}", u32::from_be_bytes(bytes) % 1_000_000);
    let expiry = std::time::Instant::now() + std::time::Duration::from_secs(300);
    shared.pair_codes.lock().unwrap().insert(code.clone(), expiry);
    code
}

/// Called by JS after processing a sync request to send our events back to the peer.
#[tauri::command]
pub(crate) async fn sync_complete_request(
    request_id: String,
    events: Vec<SyncEventRaw>,
    shared: State<'_, Arc<SyncShared>>,
) -> Result<(), String> {
    let tx = shared
        .pending
        .lock()
        .unwrap()
        .remove(&request_id)
        .ok_or("Unknown request_id")?;
    let server_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    tx.send(SyncResponse { events, server_time })
        .map_err(|_| "Peer disconnected before response".to_string())
}

/// Cache peer codes so the HTTP server can verify requests (called by JS at startup and after pairing).
#[tauri::command]
pub(crate) fn sync_update_peer_cache(
    device_id: String,
    peer_code: String,
    shared: State<'_, Arc<SyncShared>>,
) {
    shared
        .peer_codes
        .lock()
        .unwrap()
        .insert(device_id, peer_code);
}

/// Remove a peer from the cache (block device).
#[tauri::command]
pub(crate) fn sync_remove_peer(device_id: String, shared: State<'_, Arc<SyncShared>>) {
    shared.peer_codes.lock().unwrap().remove(&device_id);
}

/// Start (or restart) the axum sync HTTP server on the given port.
/// Pass port=0 to bind on a random available port.
/// Aborts any existing server task first.
/// Returns the actual port bound.
pub(crate) fn start_sync_server(shared: Arc<SyncShared>, app_handle: tauri::AppHandle, port: u16) -> u16 {
    // Abort previous server task if any
    if let Some(task) = shared.server_task.lock().unwrap().take() {
        task.abort();
    }

    let bind_addr = format!("0.0.0.0:{port}");
    let std_listener = std::net::TcpListener::bind(&bind_addr)
        .or_else(|e| {
            if port != 0 {
                eprintln!("[sync] Could not bind port {port}: {e}; falling back to random");
                std::net::TcpListener::bind("0.0.0.0:0")
            } else {
                Err(e)
            }
        })
        .expect("failed to bind sync listener");
    let actual_port = std_listener.local_addr().unwrap().port();
    std_listener.set_nonblocking(true).unwrap();
    *shared.port.lock().unwrap() = actual_port;

    let axum_state = AxumAppState { shared: shared.clone(), app: app_handle };
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);
    let router = Router::new()
        .route("/dsj/info", get(handle_info))
        .route("/dsj/pair", post(handle_pair))
        .route("/dsj/sync", post(handle_sync))
        .layer(cors)
        .with_state(axum_state);

    let task = tauri::async_runtime::spawn(async move {
        let listener = tokio::net::TcpListener::from_std(std_listener).unwrap();
        axum::serve(listener, router).await.ok();
    });
    *shared.server_task.lock().unwrap() = Some(task);

    actual_port
}

/// Restart the sync server on the requested port (0 = random).
/// Called from JS after the preferred port is read from device_config.
/// Returns the actual port bound.
#[tauri::command]
pub(crate) async fn sync_restart_on_port(
    port: u16,
    shared: State<'_, Arc<SyncShared>>,
    app_handle: tauri::AppHandle,
) -> Result<u16, String> {
    let shared = shared.inner().clone();
    // Brief yield so the old task's drop can propagate before we try to bind
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    let actual = start_sync_server(shared, app_handle, port);
    println!("[sync] Restarted HTTP server on port {actual}");
    Ok(actual)
}

#[derive(serde::Serialize)]
pub(crate) struct SyncSendResult {
    events: Vec<SyncEventRaw>,
    server_time: i64,
}

/// Make an outgoing sync HTTP call to a peer. Handles HKDF key derivation,
/// AES-256-GCM encryption, HMAC signing, and response decryption.
#[tauri::command]
pub(crate) async fn sync_send_to_peer(
    peer_address: String,
    peer_code: String,
    our_device_id: String,
    from_counter: i64,
    cold_sync: bool,
    events: Vec<SyncEventRaw>,
) -> Result<SyncSendResult, String> {
    let (enc_key, mac_key) = derive_sync_keys(&peer_code);

    // Build and encrypt the request body
    let mut nonce_bytes = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let request_nonce = u64::from_be_bytes(nonce_bytes);
    let nonce_hex = hex::encode(nonce_bytes);

    let req = SyncRequest {
        peer_device_id: our_device_id.clone(),
        from_counter,
        events,
        request_nonce,
        cold_sync,
    };
    let req_json = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
    let encrypted = encrypt_sync_payload(&req_json, &enc_key)?;

    // HTTP body: "{our_device_id}|{encrypted}"
    let body = format!("{our_device_id}|{encrypted}");

    // HMAC over "{nonce_hex}|{encrypted}"
    let mac_data = format!("{nonce_hex}|{encrypted}");
    let sig = hex::encode(make_hmac(mac_data.as_bytes(), &mac_key));
    let auth_header = format!("{nonce_hex}.{sig}");

    // Send
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(format!("http://{peer_address}/dsj/sync"))
        .header("X-DSJ-Auth", auth_header)
        .header("Content-Type", "text/plain")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("HTTP error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Peer returned {}", resp.status()));
    }

    // Decrypt response
    let resp_encrypted: String = resp.json().await.map_err(|e| e.to_string())?;
    let resp_bytes = decrypt_sync_payload(&resp_encrypted, &enc_key)?;
    let sync_resp: SyncResponse =
        serde_json::from_slice(&resp_bytes).map_err(|e| e.to_string())?;

    Ok(SyncSendResult {
        events: sync_resp.events,
        server_time: sync_resp.server_time,
    })
}
