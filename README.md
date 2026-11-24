# Contract Review App

A lightweight web app for asking questions about a contract. Upload a PDF, read it on the left, and chat about it on the right. Answers come from an [n8n](https://n8n.io) workflow and include the exact clauses they're based on.

Built with plain HTML, CSS and JavaScript — no frameworks, no npm, no build step.

## Key features

- **PDF upload**: drag and drop a PDF, or click to browse. Non-PDF files are rejected.
- **Side-by-side review**: the contract preview and the chat sit next to each other, and each scrolls on its own.
- **AI answers with sources**: each question is sent, together with the contract, to an n8n webhook. The reply shows:
  - the **answer**
  - numbered **citations**: the exact clauses, with section or page, that support it
  - a short **reasoning** note explaining how the citations support the answer
- **Clear "not found" answers**: if the contract doesn't cover the question, the app says so instead of guessing.
- **Suggested questions**: one-click prompts such as "Summarize key obligations".
- **Polished UI**: navy and orange theme, typing indicator, friendly error messages, and a layout that works on phones.

## Run it locally

1. Download or clone this repository:
   ```bash
   git clone https://github.com/git-for-rimzim/contract-review-app.git
   ```
2. Open `index.html` in your web browser by double-clicking it.

That's it — there's nothing to install.

> **Note:** answers depend on the n8n workflow being **active**, and its Webhook node must allow requests from the browser (set **Allowed Origins (CORS)** to `*`).

## Webhook integration

The webhook URL is set at the top of `app.js` (`WEBHOOK_URL`).

**Request**: `POST` as `multipart/form-data` with two fields:

| Field     | Content                     |
|-----------|-----------------------------|
| `file`    | the uploaded PDF contract   |
| `message` | the user's question         |

**Response**: a JSON object in this shape:

```json
{
  "response": "Final answer based only on the contract",
  "citation": ["Section 7.2 (page 3): exact clause text…"],
  "reasoning": "1–2 sentences on how the citations support the answer"
}
```

If the contract doesn't contain the answer, `response` is `"This information is not mentioned in the contract."`, `citation` is `[]` and `reasoning` is `""`.

## Project structure

```
index.html   Page layout: header, contract panel, chat panel
styles.css   Styling and responsive layout
app.js       PDF upload, chat, and webhook integration
```
