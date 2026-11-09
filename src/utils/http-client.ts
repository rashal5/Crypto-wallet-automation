import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { ExternalServiceError, isAppError } from "./errors";
import { retry } from "./retry";
import { toErrorMessage } from "./errors";

export interface HttpClientOptions {
  baseURL: string;
  timeoutMs: number;
  retries: number;
  onRetry?: (message: string) => void;
}

export interface IHttpClient {
  get<T>(path: string, options?: { params?: Record<string, unknown>; headers?: Record<string, string> }): Promise<T>;
}

export class AxiosHttpClient implements IHttpClient {
  private readonly client: AxiosInstance;
  private readonly options: HttpClientOptions;

  constructor(options: HttpClientOptions) {
    this.options = options;
    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeoutMs,
      headers: { Accept: "application/json" },
    });
  }

  async get<T>(
    path: string,
    requestOptions: { params?: Record<string, unknown>; headers?: Record<string, string> } = {},
  ): Promise<T> {
    return retry(
      async () => {
        try {
          const requestConfig: AxiosRequestConfig = {
            params: requestOptions.params,
            headers: requestOptions.headers,
          };
          const response = await this.client.get<T>(path, requestConfig);
          return response.data;
        } catch (error) {
          throw this.normalizeError(error, path);
        }
      },
      {
        retries: this.options.retries,
        baseDelayMs: 300,
        maxDelayMs: 5_000,
        shouldRetry: (error) => {
          if (isAppError(error)) {
            return error.statusCode >= 500 || error.code === "EXTERNAL_SERVICE_ERROR";
          }
          return true;
        },
        onRetry: (error, attempt, delay) => {
          this.options.onRetry?.(
            `HTTP GET ${path} failed (attempt ${attempt}, retrying in ${delay}ms): ${toErrorMessage(error)}`,
          );
        },
      },
    );
  }

  private normalizeError(error: unknown, path: string): Error {
    if (isAppError(error)) return error;

    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const body = error.response?.data as unknown;
      return new ExternalServiceError(
        `Request to ${path} failed${status ? ` with status ${status}` : ""}: ${error.message}`,
        { status, body },
      );
    }

    return new ExternalServiceError(`Request to ${path} failed: ${toErrorMessage(error)}`);
  }
}
