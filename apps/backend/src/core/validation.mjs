import { ApiError } from "./errors.mjs";

export function requireText(value, label, maxLength = 4000) {
  const text = String(value ?? "").trim();
  if (!text) throw new ApiError(400, "VALIDATION_ERROR", `${label}は必須です`);
  if (text.length > maxLength) throw new ApiError(400, "VALIDATION_ERROR", `${label}が長すぎます`);
  return text;
}

export function optionalText(value, maxLength = 4000) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) throw new ApiError(400, "VALIDATION_ERROR", "入力値が長すぎます");
  return text;
}

export function numberInRange(value, label, min, max, fallback) {
  const number = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${label}は${min}〜${max}で指定してください`);
  }
  return number;
}
