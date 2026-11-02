import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ApiErrorPayload, ExecuteRequest, SpecResolveRequest } from "../shared/types";
import { executeRequest, ExecuteProblem } from "./execute";
import { resolveSpec, SpecProblem } from "./spec";

const app = express();
const host = process.env.API_CANVAS_HOST || "127.0.0.1";
const port = Number(process.env.API_CANVAS_PORT || 4174);

app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));

app.post("/internal/spec/resolve", async (request, response) => {
  const input = request.body as Partial<SpecResolveRequest>;
  if (!input.url || typeof input.url !== "string") {
    response.status(400).json({ error: "Поле url обязательно.", code: "BAD_REQUEST" });
    return;
  }
  try {
    response.json(await resolveSpec(input.url, input.headers ?? {}));
  } catch (error) {
    const problem = error instanceof SpecProblem ? error : new SpecProblem(String(error), 500);
    const payload: ApiErrorPayload = {
      error: problem.message,
      status: problem.status,
      code: problem.code,
    };
    response.status(problem.status).json(payload);
  }
});

app.post("/internal/execute", async (request, response) => {
  try {
    response.json(await executeRequest(request.body as ExecuteRequest));
  } catch (error) {
    const problem = error instanceof ExecuteProblem ? error : new ExecuteProblem(String(error), 500);
    response.status(problem.status).json({ error: problem.message, code: "BAD_REQUEST" });
  }
});

const staticRoot = resolve(process.cwd(), "dist");
if (existsSync(staticRoot)) {
  app.use(express.static(staticRoot, {
    setHeaders: (response, filePath) => {
      if (filePath.endsWith("index.html")) {
        response.setHeader("Cache-Control", "no-store");
      } else if (filePath.includes(`${resolve(staticRoot, "assets")}`)) {
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));
  app.get("*path", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.sendFile(resolve(staticRoot, "index.html"));
  });
}

app.listen(port, host, () => {
  console.log(`API Canvas: http://${host}:${port}`);
});
