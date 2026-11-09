import { spawn } from "node:child_process";
import fs from "node:fs";
import type { AppConfig } from "../../config";
import type { FeatureVector, RawPrediction } from "../../types/domain";
import { ConfigurationError, ExternalServiceError, toErrorMessage } from "../../utils/errors";
import type { ILogger } from "../../utils/logger";
import { MODULES } from "../../config/constants";
import type { IPredictionProvider } from "./prediction.interface";
import { normalizePrediction } from "./prediction.utils";

/**
 * Bridge to the Python AI process.
 *
 * The Node process writes one JSON payload to stdin and reads one JSON object from
 * stdout. No exchange credentials are ever passed to Python, and Python has no
 * ability to place orders.
 */
export class PythonPredictionProvider implements IPredictionProvider {
  readonly name = "python";

  constructor(
    private readonly config: AppConfig,
    private readonly logger: ILogger,
  ) {}

  async predict(features: FeatureVector): Promise<RawPrediction> {
    const scriptPath = this.config.prediction.scriptPath;

    if (!fs.existsSync(scriptPath)) {
      throw new ConfigurationError(`Python prediction script not found at ${scriptPath}`);
    }

    const payload = JSON.stringify({
      generatedAt: new Date().toISOString(),
      features,
    });

    return new Promise<RawPrediction>((resolve, reject) => {
      const child = spawn(this.config.prediction.pythonBin, [scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (error: Error | null, result?: RawPrediction): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else if (result) resolve(result);
      };

      const timeout = setTimeout(() => {
        child.kill();
        finish(
          new ExternalServiceError(
            `Python prediction timed out after ${this.config.prediction.timeoutMs}ms`,
          ),
        );
      }, this.config.prediction.timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.on("error", (error) => {
        finish(
          new ExternalServiceError(`Failed to start Python predictor: ${toErrorMessage(error)}`),
        );
      });

      child.on("close", (code) => {
        if (code !== 0) {
          finish(
            new ExternalServiceError(
              `Python predictor exited with code ${code}: ${stderr.trim() || "no stderr"}`,
            ),
          );
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim()) as unknown;
          const prediction = normalizePrediction(parsed);
          this.logger.debug(MODULES.PREDICTION, "Python prediction received", { ...prediction });
          finish(null, prediction);
        } catch (error) {
          finish(
            new ExternalServiceError(
              `Invalid Python prediction output: ${toErrorMessage(error)}`,
              { stdout: stdout.trim(), stderr: stderr.trim() },
            ),
          );
        }
      });

      child.stdin.on("error", (error) => {
        this.logger.debug(MODULES.PREDICTION, "Python stdin closed early", {
          error: toErrorMessage(error),
        });
      });

      child.stdin.write(payload);
      child.stdin.end();
    });
  }
}
