export interface FastAPIError {
  detail: string;
}

export function getErrorMessage(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === "object" && "message" in error) {
    message = String(error.message);
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object" && "detail" in error) {
    message = (error as FastAPIError).detail;
  } else {
    message = "Something went wrong";
  }

  return message;
}
