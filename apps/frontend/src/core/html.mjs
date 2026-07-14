export const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export function badge(text, tone = "") {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

export function field(name, label, value = "", type = "text", attributes = "") {
  return `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attributes}></label>`;
}

export function textarea(name, label, value = "", attributes = "") {
  return `<label class="field"><span>${esc(label)}</span><textarea name="${name}" ${attributes}>${esc(value)}</textarea></label>`;
}

export function select(name, label, value, options, attributes = "") {
  return `<label class="field"><span>${esc(label)}</span><select name="${name}" ${attributes}>${options.map((item) => {
    const optionValue = typeof item === "string" ? item : (item.value ?? item.label);
    const optionLabel = typeof item === "string" ? item : item.label;
    const disabled = typeof item === "object" && item.disabled ? "disabled" : "";
    return `<option value="${esc(optionValue)}" ${optionValue === value ? "selected" : ""} ${disabled}>${esc(optionLabel)}</option>`;
  }).join("")}</select></label>`;
}

export function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
