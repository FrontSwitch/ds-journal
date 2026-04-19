# Image / Album Feature

Images are a message subtype stored via a separate `message_images` table. The app stores local file paths only — no bytes in the DB.

- **Formats**: png, jpg, gif, webp, bmp, svg, heic, heif. HEIC renders natively in Tauri/WebKit on macOS — no conversion needed.
- **Posting**: 🖼 button opens `ImagePostForm`. File picker via `@tauri-apps/plugin-dialog` `open()` (`dialog:allow-open` capability required). Drag-drop: `ChatPanel` registers a window-level `getCurrentWindow().onDragDropEvent` listener — dropping any image file anywhere on the window opens `ImagePostForm` with the path pre-loaded. HTML `ondragover`/`ondrop` do NOT fire for OS file drags in Tauri v2. Fields: caption, 📍 location, 👤 people (free text — external names, not avatars).
- **Inline display**: `ImageMessage` renders a 200×150 thumbnail. Click → `Lightbox` (full-window overlay, Escape or × closes). Image messages in log view show `[image] caption`.
- **Album**: virtual channel `ALBUM_ID = -3`, accessible via sidebar (pinned at top of Trackers folder) or `/album`. Renders `AlbumView` — responsive grid, click tile → `Lightbox`.
- **FTS**: image message text stored as `|caption|location|people|` pipe-format so full-text search finds images by caption/location/people content.
- **`LightboxImage` interface** (exported from `Lightbox.tsx`): `{ image_path, image_caption, image_location, image_people, avatar_name, avatar_color, created_at }` — used by both `ImageMessage` and `AlbumView`.
- **`MessageRow`** now includes `image_path`, `image_caption`, `image_location`, `image_people` (nullable, from LEFT JOIN).
- **Asset protocol scope** must include `/Volumes/**` (in both `tauri.conf.json` assetProtocol and `capabilities/default.json` fs:scope) for images on external drives to load.
- **Not built yet**: image editing after post, dedup, multiple images per message, clipboard paste.
