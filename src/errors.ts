export interface HttpErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }

  toJSON(): HttpErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message
      }
    };
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
