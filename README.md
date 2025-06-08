# 🧵 NeedleWhatsappCrawler

A Node.js project using `@open-wa/wa-automate` to extract and analyze messages from WhatsApp groups.
This tool is useful for academic data analysis, research, or social behavior insight based on exported chat data.

---

## 🚀 Features

- Authenticates with your WhatsApp Web account.
- Crawls and loads full chat history from a target group
- Enriches messages with metadata (author, replies, reactions)
- Outputs:
  - `group_export.json` — cleaned & enriched messages
  - `participants_table.json` — mapping between user names and phone numbers

---

## ⚙️ Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/Viderspace/NeedleWhatsappCrawler.git
cd NeedleWhatsappCrawler
```

### 2. Install dependencies

Make sure you have Node.js (v18 or newer) and `npm` installed.

```bash
npm install
```

### 3. Configure project (optional)

Edit the following constant at the top of `crawl.js` if needed:

```js
const TARGET_GROUP_NAME = 'Your WhatsApp Group Name Here';
```

---

## 🧪 Running the script

```bash
node crawl.js
```

On first run, a browser window will open for WhatsApp Web login — scan your QR code.

> ✅ After successful login, the script will:
> - Locate the target group
> - Crawl up to 1000 messages
> - Print message summaries and links
> - Save results to `group_export.json`

---

## 🧼 Cleaning up or starting fresh

If your session gets stuck or cached unexpectedly, delete the `.wwebjs_auth` or `.wwebjs_cache` folder before retrying.

---

## 📁 Output Files

| File | Description |
|------|-------------|
| `group_export.json` | Main enriched dataset of messages |
| `participants_table.json` | Table mapping participant IDs, names & phones |
| `messages.json` | Raw dump of all messages for inspection/debugging |

---

## 🤝 Contributing

1. Fork this repository
2. Create your feature branch: `git checkout -b my-feature`
3. Commit your changes
4. Push to the branch: `git push origin my-feature`
5. Open a pull request 🎉

---

## 📜 License

MIT License – see `LICENSE` file for details.
