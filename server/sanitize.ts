const DANGEROUS_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "link",
  "meta",
  "base",
  "frame",
  "frameset",
  "applet",
];

const EVENT_HANDLERS = [
  "onabort",
  "onblur",
  "onchange",
  "onclick",
  "ondblclick",
  "onerror",
  "onfocus",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onmousedown",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onreset",
  "onresize",
  "onscroll",
  "onselect",
  "onsubmit",
  "onunload",
  "onbeforeunload",
  "oncontextmenu",
  "ondrag",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "oninput",
  "oninvalid",
  "onpointerdown",
  "onpointerup",
  "onpointermove",
  "onpointerenter",
  "onpointerleave",
  "ontouchstart",
  "ontouchmove",
  "ontouchend",
];

export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  let sanitized = input;

  for (const tag of DANGEROUS_TAGS) {
    const openTagRegex = new RegExp(`<${tag}[^>]*>`, "gi");
    const closeTagRegex = new RegExp(`</${tag}>`, "gi");
    const selfClosingRegex = new RegExp(`<${tag}[^>]*/>`, "gi");

    sanitized = sanitized.replace(openTagRegex, "");
    sanitized = sanitized.replace(closeTagRegex, "");
    sanitized = sanitized.replace(selfClosingRegex, "");
  }

  const eventHandlerPattern = EVENT_HANDLERS.map((h) => `${h}\\s*=`).join("|");
  const eventHandlerRegex = new RegExp(
    `(${eventHandlerPattern})\\s*["']?[^"'\\s>]*["']?`,
    "gi"
  );
  sanitized = sanitized.replace(eventHandlerRegex, "");

  sanitized = sanitized.replace(/javascript\s*:/gi, "");
  sanitized = sanitized.replace(/vbscript\s*:/gi, "");
  sanitized = sanitized.replace(/data\s*:[^,]*base64/gi, "");

  sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, "");
  sanitized = sanitized.replace(/url\s*\(\s*["']?\s*javascript/gi, "url(");

  return sanitized;
}

export function stripAllHtml(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  return input.replace(/<[^>]*>/g, "");
}

export function escapeHtml(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
    "`": "&#x60;",
    "=": "&#x3D;",
  };

  return input.replace(/[&<>"'`=/]/g, (char) => htmlEntities[char] || char);
}

export function sanitizeChatMessage(content: string): string {
  if (!content || typeof content !== "string") {
    return "";
  }

  let sanitized = sanitizeHtml(content);

  sanitized = sanitized.trim();

  const MAX_MESSAGE_LENGTH = 10000;
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_MESSAGE_LENGTH);
  }

  return sanitized;
}

export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== "string") {
    return "file";
  }

  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .substring(0, 255);
}

export function isValidUUID(value: string): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}
