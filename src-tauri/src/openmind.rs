use std::{env, io::Cursor, path::PathBuf, time::Duration};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use image::{ImageFormat, ImageReader, Limits};
use reqwest::{Client, Method, StatusCode};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{ipc::Channel, State};
use url::Url;

const DEFAULT_API_URL: &str = "http://127.0.0.1:8765";
const MAX_PREVIEW_FILE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_PREVIEW_DIMENSION: u32 = 20_000;
const PREVIEW_SIZE: u32 = 96;
const IMAGE_EXTENSIONS: &[&str] = &["gif", "jpeg", "jpg", "png", "webp"];

pub struct ClientState {
    http: Client,
}

impl ClientState {
    pub fn new() -> Self {
        let http = Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(300))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("failed to create local HTTP client");
        Self { http }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientError {
    kind: String,
    message: String,
    status: Option<u16>,
}

impl ClientError {
    fn new(kind: &str, message: impl Into<String>) -> Self {
        Self {
            kind: kind.to_string(),
            message: message.into(),
            status: None,
        }
    }

    fn api(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            kind: "api".to_string(),
            message: message.into(),
            status: Some(status.as_u16()),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct StreamEvent {
    event: String,
    data: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePreview {
    data_url: String,
    width: u32,
    height: u32,
}

#[tauri::command]
pub async fn openmind_request(
    state: State<'_, ClientState>,
    base_url: String,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, ClientError> {
    let method = Method::from_bytes(method.as_bytes())
        .map_err(|_| ClientError::new("validation", "Unsupported HTTP method."))?;
    validate_operation(&method, &path)?;
    let url = endpoint_url(&base_url, &path)?;

    let mut request = state.http.request(method, url);
    if path != "/health" {
        request = request.bearer_auth(read_api_token().await?);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }

    let response = request.send().await.map_err(network_error)?;
    response_json(response).await
}

#[tauri::command]
pub async fn openmind_image_preview(
    state: State<'_, ClientState>,
    base_url: String,
    file_id: String,
) -> Result<ImagePreview, ClientError> {
    if !valid_identifier(&file_id, "file_", 21) {
        return Err(ClientError::new(
            "validation",
            "The indexed file ID is invalid.",
        ));
    }

    let token = read_api_token().await?;
    let document_url = endpoint_url(&base_url, &format!("/api/v1/documents/{file_id}"))?;
    let document = authenticated_json(&state.http, document_url, &token).await?;
    let indexed_path = find_string_field(&document, "path")
        .map(PathBuf::from)
        .ok_or_else(|| ClientError::new("response", "OpenMind did not return the image path."))?;
    let canonical_path = tokio::fs::canonicalize(&indexed_path)
        .await
        .map_err(|_| ClientError::new("response", "The indexed image is no longer available."))?;

    let sources_url = endpoint_url(&base_url, "/api/v1/sources")?;
    let sources = authenticated_json(&state.http, sources_url, &token).await?;
    if !path_is_in_enabled_source(&canonical_path, &sources).await {
        return Err(ClientError::new(
            "validation",
            "The indexed image is outside the enabled OpenMind sources.",
        ));
    }

    let extension = canonical_path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| ClientError::new("validation", "This file is not a supported image."))?;
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(ClientError::new(
            "validation",
            "This file is not a supported image.",
        ));
    }

    let metadata = tokio::fs::metadata(&canonical_path)
        .await
        .map_err(|_| ClientError::new("response", "The indexed image is no longer available."))?;
    if !metadata.is_file() || metadata.len() > MAX_PREVIEW_FILE_BYTES {
        return Err(ClientError::new(
            "validation",
            "This image is too large to preview safely.",
        ));
    }

    let bytes = tokio::fs::read(canonical_path)
        .await
        .map_err(|_| ClientError::new("response", "The indexed image could not be read."))?;
    tokio::task::spawn_blocking(move || create_image_preview(bytes))
        .await
        .map_err(|_| ClientError::new("response", "The image preview task stopped."))?
}

#[tauri::command]
pub async fn stream_openmind_ask(
    state: State<'_, ClientState>,
    base_url: String,
    question: String,
    limit: u8,
    include_sources: bool,
    on_event: Channel<StreamEvent>,
) -> Result<(), ClientError> {
    let question = question.trim();
    if question.is_empty() || question.chars().count() > 4000 {
        return Err(ClientError::new(
            "validation",
            "Question must contain between 1 and 4,000 characters.",
        ));
    }
    if !(1..=20).contains(&limit) {
        return Err(ClientError::new(
            "validation",
            "Result limit must be between 1 and 20.",
        ));
    }

    let url = endpoint_url(&base_url, "/api/v1/ask/stream")?;
    let response = state
        .http
        .post(url)
        .bearer_auth(read_api_token().await?)
        .json(&json!({
            "question": question,
            "limit": limit,
            "include_sources": include_sources,
        }))
        .send()
        .await
        .map_err(network_error)?;

    if !response.status().is_success() {
        return Err(response_error(response).await);
    }

    let mut events = response.bytes_stream().eventsource();
    while let Some(event) = events.next().await {
        let event = event.map_err(|error| {
            ClientError::new("stream", format!("OpenMind response stream ended: {error}"))
        })?;
        let data = serde_json::from_str(&event.data).unwrap_or_else(|_| {
            json!({
                "message": event.data,
            })
        });
        on_event
            .send(StreamEvent {
                event: event.event,
                data,
            })
            .map_err(|_| ClientError::new("stream", "The client stopped receiving the answer."))?;
    }

    Ok(())
}

fn endpoint_url(base_url: &str, path: &str) -> Result<Url, ClientError> {
    let mut base = Url::parse(if base_url.trim().is_empty() {
        DEFAULT_API_URL
    } else {
        base_url.trim()
    })
    .map_err(|_| ClientError::new("validation", "The OpenMind API address is invalid."))?;

    if base.scheme() != "http"
        || base.host_str() != Some("127.0.0.1")
        || !base.username().is_empty()
        || base.password().is_some()
        || base.query().is_some()
        || base.fragment().is_some()
        || !matches!(base.path(), "" | "/")
    {
        return Err(ClientError::new(
            "validation",
            "The OpenMind API must use http://127.0.0.1 with a local port.",
        ));
    }
    if base.port_or_known_default().is_none() {
        return Err(ClientError::new(
            "validation",
            "The OpenMind API address needs a port.",
        ));
    }

    base.set_path(path);
    Ok(base)
}

fn validate_operation(method: &Method, path: &str) -> Result<(), ClientError> {
    let exact = matches!(
        (method.as_str(), path),
        ("GET", "/health")
            | ("GET", "/api/v1/status")
            | ("GET", "/api/v1/providers")
            | ("GET", "/api/v1/providers/status")
            | ("GET", "/api/v1/models")
            | ("POST", "/api/v1/models/load")
            | ("PUT", "/api/v1/models/selection")
            | ("GET", "/api/v1/sources")
            | ("POST", "/api/v1/sources")
            | ("POST", "/api/v1/index/start")
            | ("GET", "/api/v1/index/status")
            | ("POST", "/api/v1/index/pause")
            | ("POST", "/api/v1/index/resume")
            | ("POST", "/api/v1/index/stop")
            | ("POST", "/api/v1/search")
            | ("POST", "/api/v1/ask")
            | ("POST", "/api/v1/actions/open")
    );
    let parameterized = match method.as_str() {
        "GET" => valid_id_path(path, "/api/v1/documents/", "file_", 21),
        "DELETE" => valid_id_path(path, "/api/v1/sources/", "src_", 64),
        _ => false,
    };

    if exact || parameterized {
        Ok(())
    } else {
        Err(ClientError::new(
            "validation",
            "This OpenMind API operation is not available to the client.",
        ))
    }
}

fn valid_id_path(path: &str, prefix: &str, id_prefix: &str, max_length: usize) -> bool {
    let Some(identifier) = path.strip_prefix(prefix) else {
        return false;
    };
    valid_identifier(identifier, id_prefix, max_length)
}

fn valid_identifier(identifier: &str, prefix: &str, max_length: usize) -> bool {
    identifier.starts_with(prefix)
        && identifier.len() <= max_length
        && identifier.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
}

async fn authenticated_json(client: &Client, url: Url, token: &str) -> Result<Value, ClientError> {
    let response = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(network_error)?;
    response_json(response).await
}

fn find_string_field<'a>(value: &'a Value, field: &str) -> Option<&'a str> {
    match value {
        Value::Object(object) => object.get(field).and_then(Value::as_str).or_else(|| {
            object
                .values()
                .find_map(|value| find_string_field(value, field))
        }),
        Value::Array(values) => values
            .iter()
            .find_map(|value| find_string_field(value, field)),
        _ => None,
    }
}

async fn path_is_in_enabled_source(path: &std::path::Path, response: &Value) -> bool {
    let Some(sources) = response.get("sources").and_then(Value::as_array) else {
        return false;
    };
    for source in sources {
        if source.get("enabled").and_then(Value::as_bool) == Some(false) {
            continue;
        }
        let Some(source_path) = source.get("path").and_then(Value::as_str) else {
            continue;
        };
        if let Ok(canonical_source) = tokio::fs::canonicalize(source_path).await {
            if path.starts_with(canonical_source) {
                return true;
            }
        }
    }
    false
}

fn create_image_preview(bytes: Vec<u8>) -> Result<ImagePreview, ClientError> {
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| ClientError::new("response", "The image format could not be detected."))?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_PREVIEW_DIMENSION);
    limits.max_image_height = Some(MAX_PREVIEW_DIMENSION);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);

    let image = reader
        .decode()
        .map_err(|_| ClientError::new("response", "The image preview could not be decoded."))?;
    let thumbnail = image.thumbnail(PREVIEW_SIZE, PREVIEW_SIZE);
    let width = thumbnail.width();
    let height = thumbnail.height();
    let mut encoded = Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut encoded, ImageFormat::Png)
        .map_err(|_| ClientError::new("response", "The image preview could not be encoded."))?;

    Ok(ImagePreview {
        data_url: format!(
            "data:image/png;base64,{}",
            STANDARD.encode(encoded.into_inner())
        ),
        width,
        height,
    })
}

async fn read_api_token() -> Result<String, ClientError> {
    let path = openmind_home()?.join("api_token");
    let token = tokio::fs::read_to_string(&path).await.map_err(|_| {
        ClientError::new(
            "token",
            "OpenMind API token was not found. Run `openmind setup` first.",
        )
    })?;
    let token = token.trim().to_string();
    if token.len() < 32 {
        return Err(ClientError::new(
            "token",
            "OpenMind API token is invalid. Rotate it from the OpenMind CLI.",
        ));
    }
    Ok(token)
}

fn openmind_home() -> Result<PathBuf, ClientError> {
    if let Some(path) = env::var_os("OPENMIND_HOME") {
        return Ok(PathBuf::from(path));
    }
    dirs::home_dir()
        .map(|home| home.join(".openmind"))
        .ok_or_else(|| ClientError::new("token", "Could not locate the user home directory."))
}

async fn response_json(response: reqwest::Response) -> Result<Value, ClientError> {
    if !response.status().is_success() {
        return Err(response_error(response).await);
    }
    response
        .json::<Value>()
        .await
        .map_err(|_| ClientError::new("response", "OpenMind returned an invalid response."))
}

async fn response_error(response: reqwest::Response) -> ClientError {
    let status = response.status();
    let message = response
        .json::<Value>()
        .await
        .ok()
        .and_then(|body| {
            body.get("detail")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| format!("OpenMind returned HTTP {}.", status.as_u16()));
    ClientError::api(status, message)
}

fn network_error(error: reqwest::Error) -> ClientError {
    if error.is_timeout() {
        ClientError::new("connection", "OpenMind did not respond in time.")
    } else {
        ClientError::new(
            "connection",
            "OpenMind is not reachable. Start it with `openmind serve`.",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_loopback_openmind_urls() {
        assert!(endpoint_url("http://127.0.0.1:8765", "/health").is_ok());
        assert!(endpoint_url("http://127.0.0.1:9000/", "/health").is_ok());
        assert!(endpoint_url("https://127.0.0.1:8765", "/health").is_err());
        assert!(endpoint_url("http://localhost:8765", "/health").is_err());
        assert!(endpoint_url("http://example.com:8765", "/health").is_err());
        assert!(endpoint_url("http://user@127.0.0.1:8765", "/health").is_err());
        assert!(endpoint_url("http://127.0.0.1:8765/api", "/health").is_err());
    }

    #[test]
    fn allows_only_product_level_api_operations() {
        assert!(validate_operation(&Method::GET, "/api/v1/status").is_ok());
        assert!(validate_operation(&Method::POST, "/api/v1/search").is_ok());
        assert!(
            validate_operation(&Method::GET, "/api/v1/documents/file_0123456789abcdef").is_ok()
        );
        assert!(validate_operation(&Method::DELETE, "/api/v1/sources/src_0123456789ab").is_ok());

        assert!(validate_operation(&Method::POST, "/api/v1/raw/query").is_err());
        assert!(validate_operation(&Method::GET, "/api/v1/search").is_err());
        assert!(validate_operation(&Method::DELETE, "/api/v1/sources/../../files").is_err());
        assert!(validate_operation(&Method::GET, "/api/v1/documents/not-a-file-id").is_err());
    }

    #[test]
    fn finds_nested_document_paths() {
        let response = json!({"document": {"file": {"path": "/tmp/example.png"}}});
        assert_eq!(
            find_string_field(&response, "path"),
            Some("/tmp/example.png")
        );
    }

    #[test]
    fn creates_small_png_previews() {
        let image = image::DynamicImage::new_rgb8(320, 180);
        let mut source = Cursor::new(Vec::new());
        image.write_to(&mut source, ImageFormat::Png).unwrap();

        let preview = create_image_preview(source.into_inner()).unwrap();

        assert_eq!((preview.width, preview.height), (96, 54));
        assert!(preview.data_url.starts_with("data:image/png;base64,"));
    }
}
