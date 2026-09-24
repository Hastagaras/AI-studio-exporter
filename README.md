# AI Studio ShareGPT Exporter

A fork of [Sukarth/AI-studio-exporter](https://github.com/Sukarth/AI-studio-exporter) that saves a Google AI Studio conversation directly as ShareGPT JSONL. No markdown file, no ZIP, and no image export.

## Features

- One click downloads a `.jsonl` file. One conversation is one JSON line.
- ShareGPT roles: `system`, `human`, and `gpt`.
- System instructions are checked on the actual chat. They are saved as the first turn only when the chat has them and the setting is on. If the chat has none, the file starts at the first message.
- Skip turns is any whole number: `0`, `1`, `2`, `3`, and so on. `0` keeps every pair. `1` drops the first user + assistant pair. The system turn is never counted.
- `[MIND]` / `[/MIND]` in model text are saved as `<think>` / `</think>`.
- Runs entirely in the browser. Nothing is uploaded.

## Installation

1. Clone this fork:

```bash
git clone https://github.com/Hastagaras/AI-studio-exporter.git
cd AI-studio-exporter
```

2. Open `chrome://extensions/`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Pin **AI Studio ShareGPT Exporter**.

After pulling updates, click **Reload** on the extension card.

## Usage

1. Open a conversation at `https://aistudio.google.com/prompts/...`.
2. Open the extension. The popup shows the current skip count and whether system saving is on.
3. Click **Export ShareGPT**.
4. A file named after the conversation, for example `My chat.jsonl`, downloads when the export finishes.

Change **Skip turns** and **Save system instructions** from the gear icon. There is no upper limit on the skip number.

## Output

Each download is one JSONL line. `JSON.stringify` matches Python `json.dumps(..., ensure_ascii=False, separators=(",", ":"))`.

Chat with system instructions, and system saving on:

```json
{"conversations":[{"from":"system","value":"You are a tutor."},{"from":"human","value":"Hello"},{"from":"gpt","value":"<think>\nplan\n</think>\nHi."}]}
```

Same chat with system saving off, or a chat that has no system instructions:

```json
{"conversations":[{"from":"human","value":"Hello"},{"from":"gpt","value":"<think>\nplan\n</think>\nHi."}]}
```

Skip turns removes that many opening user + assistant pairs before the system turn is inserted. Skip `1` on the chat above keeps the system turn, if it was saved, and drops `Hello` / `Hi.`.

Several downloads can be concatenated into one training file:

```bash
cat *.jsonl > sharegpt.jsonl
```

Images and file attachments are not exported. A media-only turn fails the export instead of being dropped, because dropping it would break human/gpt alternation.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Save system instructions | On | Write `{"from":"system","value":"..."}` only if this chat has a system prompt. Off never writes one. |
| Skip turns | 0 | `0` keeps every pair. `1`, `2`, `3`, … drop that many opening pairs. |
| Include reasoning | On | Keep thinking and convert `[MIND]` tags to `<think>` tags. |
| Element load delay | 700 ms | Raise this if messages are missing. |

The old converter's `SKIP_TURNS = 1` is this skip setting set to `1`.

## Privacy

- Extension pages use `script-src 'self'; object-src 'none'`.
- The popup only talks to `https://aistudio.google.com/prompts/` tabs.
- Messages are rejected unless they come from this extension.
- Settings are sanitized before use.

## Development

```bash
npm test
```

`test/sharegpt.test.js` checks the JSONL line against Python's `json.dumps`.

## Troubleshooting

- **Export failed on a media-only turn:** that turn has an image or file and no text. Image export was removed, and skipping the turn would corrupt the pair order.
- **Missing text or spacing:** wait until the page is fully loaded, then raise **Element load delay**.
- **Nothing left after skip:** the skip number is higher than the number of pairs in the chat. Lower it.
- **System prompt missing:** turn **Save system instructions** on. If the chat has no system instructions, the file correctly starts at the first message.
- **Button says not on AI Studio:** open a prompt URL and refresh the page so the content script loads.

## License

MIT. Original extension by Sukarth Acharya.
