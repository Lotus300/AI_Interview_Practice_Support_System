export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function toErrorResponse(error) {
  return {
    statusCode: error.statusCode || 500,
    body: {
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: error.statusCode ? error.message : "サーバー処理中にエラーが発生しました"
    }
  };
}
