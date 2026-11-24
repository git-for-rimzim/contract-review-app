(function () {
  const WEBHOOK_URL =
    "https://rimzimb.app.n8n.cloud/webhook/ea2f84c1-d840-434c-bd12-bb3faf8161da";
  const REQUEST_TIMEOUT_MS = 120000; // contract analysis can take a while
  const NOT_FOUND_REPLY = "This information is not mentioned in the contract.";

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const dropError = document.getElementById("drop-error");
  const viewer = document.getElementById("pdf-viewer");
  const filePill = document.getElementById("file-pill");
  const fileNameEl = document.getElementById("file-name");
  const fileSizeEl = document.getElementById("file-size");
  const uploadBtn = document.getElementById("upload-btn");
  const uploadBtnLabel = document.getElementById("upload-btn-label");
  const statusBadge = document.getElementById("status-badge");

  const messages = document.getElementById("messages");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendBtn = form.querySelector('button[type="submit"]');
  const chips = document.querySelectorAll(".chip");

  let currentFile = null;
  let currentUrl = null;
  let waitingForReply = false;

  /* ---------- File upload ---------- */

  function isPdf(file) {
    return file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function loadFile(file) {
    if (!file) return;
    if (!isPdf(file)) {
      dropError.textContent = "That file isn't a PDF. Please choose a .pdf file.";
      return;
    }
    dropError.textContent = "";

    currentFile = file;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(file);

    // Show the PDF in the left panel using the browser's built-in viewer.
    viewer.src = currentUrl;
    viewer.hidden = false;
    dropZone.hidden = true;

    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = "· " + formatSize(file.size);
    filePill.hidden = false;
    statusBadge.textContent = "Uploaded";
    statusBadge.className = "badge badge-active";
    uploadBtnLabel.textContent = "Replace contract";

    addMessage("assistant", "I've loaded " + file.name + ". Ask me anything about it.");
  }

  function openPicker() {
    fileInput.value = "";
    fileInput.click();
  }

  dropZone.addEventListener("click", openPicker);
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  });
  uploadBtn.addEventListener("click", openPicker);
  fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));

  ["dragenter", "dragover"].forEach((type) =>
    dropZone.addEventListener(type, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((type) =>
    dropZone.addEventListener(type, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    })
  );
  dropZone.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));

  // Stop the browser from opening a PDF dropped outside the drop zone.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  /* ---------- Chat rendering ---------- */

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  // Returns the content column for a new message row.
  function createMessage(role) {
    const row = document.createElement("div");
    row.className = "message " + role;
    if (role !== "user") {
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = "CR";
      row.appendChild(avatar);
    }
    const content = document.createElement("div");
    content.className = "message-content";
    row.appendChild(content);
    messages.appendChild(row);
    return content;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text; // textContent: never render webhook text as HTML
    return node;
  }

  function addMessage(role, text) {
    createMessage(role).appendChild(el("div", "bubble", text));
    scrollToBottom();
  }

  function renderTyping(content) {
    const bubble = el("div", "bubble");
    bubble.innerHTML =
      '<span class="typing" aria-label="Assistant is typing"><span></span><span></span><span></span></span>';
    content.appendChild(bubble);
  }

  function renderAnswer(content, answer) {
    content.replaceChildren(el("div", "bubble", answer.response));

    if (answer.citation.length) {
      const sources = el("div", "sources");
      sources.appendChild(
        el("span", "meta-label", answer.citation.length === 1 ? "Citation" : "Citations")
      );
      const list = el("ol", "citation-list");
      answer.citation.forEach((c) => list.appendChild(el("li", "citation", c)));
      sources.appendChild(list);
      content.appendChild(sources);
    }

    if (answer.reasoning) {
      const reasoning = el("div", "reasoning");
      reasoning.appendChild(el("span", "meta-label", "Reasoning"));
      reasoning.appendChild(el("p", null, answer.reasoning));
      content.appendChild(reasoning);
    }
  }

  function renderError(content, text) {
    content.closest(".message").classList.add("error");
    content.replaceChildren(el("div", "bubble", text));
  }

  /* ---------- Webhook ---------- */

  // Checks the webhook's JSON and normalises it to {response, citation[], reasoning}.
  function parseAnswer(data) {
    if (Array.isArray(data) && data.length === 1) data = data[0]; // n8n sometimes wraps items
    if (!data || typeof data !== "object" || typeof data.response !== "string") {
      throw new Error("The webhook returned an unexpected format.");
    }
    const citation = Array.isArray(data.citation)
      ? data.citation.filter((c) => typeof c === "string" && c.trim())
      : [];
    const reasoning = typeof data.reasoning === "string" ? data.reasoning.trim() : "";
    return { response: data.response.trim() || NOT_FOUND_REPLY, citation, reasoning };
  }

  async function askWebhook(file, message) {
    const body = new FormData();
    body.append("file", file, file.name);
    body.append("message", message);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(WEBHOOK_URL, { method: "POST", body, signal: controller.signal });
    } catch (err) {
      if (err.name === "AbortError") throw new Error("The request timed out. Please try again.");
      throw new Error(
        "Couldn't reach the contract assistant. Check your connection, and that the n8n workflow is listening."
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error("The contract assistant returned an error (HTTP " + res.status + ").");
    }

    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw new Error("The webhook response wasn't valid JSON.");
    }
    return parseAnswer(data);
  }

  function setBusy(busy) {
    waitingForReply = busy;
    sendBtn.disabled = busy;
    chips.forEach((c) => (c.disabled = busy));
  }

  async function send(text) {
    text = text.trim();
    if (!text || waitingForReply) return;

    if (!currentFile) {
      addMessage("assistant", "Please upload a PDF contract first, then ask your question.");
      return;
    }

    addMessage("user", text);
    input.value = "";
    autoResize();

    setBusy(true);
    const content = createMessage("assistant");
    renderTyping(content);
    scrollToBottom();

    try {
      renderAnswer(content, await askWebhook(currentFile, text));
    } catch (err) {
      renderError(content, err.message);
    } finally {
      setBusy(false);
      scrollToBottom();
    }
  }

  /* ---------- Input ---------- */

  function autoResize() {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });

  // Enter sends, Shift+Enter adds a new line.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", autoResize);

  chips.forEach((chip) => chip.addEventListener("click", () => send(chip.textContent)));
})();
