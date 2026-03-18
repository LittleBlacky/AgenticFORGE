import {Protocol, ProtocolType} from "../base";
import type {
  A2AServerInfo,
  A2ASkillHandler,
  RegisteredSkill,
  SkillExecuteResult,
  AskResult,
} from "./types";

export class A2AServer extends Protocol {
  readonly name: string;
  readonly description: string;
  readonly capabilities: Record<string, unknown>;

  private readonly _skills = new Map<string, RegisteredSkill>();

  constructor(params: {
    name: string;
    description: string;
    version?: string;
    capabilities?: Record<string, unknown>;
  }) {
    super(ProtocolType.A2A, params.version ?? "1.0.0");
    this.name = params.name;
    this.description = params.description;
    this.capabilities = params.capabilities ?? {};
  }

  addSkill(name: string, description: string, handler: A2ASkillHandler): this {
    this._skills.set(name, {name, description, handler});
    return this;
  }

  skill(name: string, description = ""): (handler: A2ASkillHandler) => A2ASkillHandler {
    return (handler: A2ASkillHandler) => {
      this.addSkill(name, description, handler);
      return handler;
    };
  }

  async executeSkill(
    skillName: string,
    text = "",
    data?: Record<string, unknown>,
  ): Promise<SkillExecuteResult> {
    const sk = this._skills.get(skillName);
    if (!sk) {
      return {
        skill: skillName,
        result: "",
        status: "error",
        error: `Skill '${skillName}' not found. Available: ${this.listSkills().join(", ")}.`,
      };
    }
    try {
      const result = await sk.handler(text, data);
      return {skill: skillName, result, status: "success"};
    } catch (err) {
      return {
        skill: skillName,
        result: "",
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async ask(question: string): Promise<AskResult> {
    for (const [name, sk] of this._skills) {
      try {
        const result = await sk.handler(question);
        if (result && !result.startsWith("Error")) {
          return {answer: result, skillUsed: name, status: "success"};
        }
      } catch {
        // try next skill
      }
    }
    return {answer: "No suitable skill found for this question.", status: "no_match"};
  }

  listSkills(): string[] {
    return Array.from(this._skills.keys());
  }

  getSkillInfo(name: string): RegisteredSkill | undefined {
    return this._skills.get(name);
  }

  getInfo(): A2AServerInfo {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      capabilities: this.capabilities,
      protocol: "A2A",
      skills: this.listSkills(),
    };
  }

  async serve(port = 5000, host = "0.0.0.0"): Promise<void> {
    const {createServer} = await import("node:http");

    const jsonReply = (
      res: import("node:http").ServerResponse,
      data: unknown,
      status = 200,
    ) => {
      const body = JSON.stringify(data);
      res.writeHead(status, {"Content-Type": "application/json"});
      res.end(body);
    };

    const readBody = (
      req: import("node:http").IncomingMessage,
    ): Promise<Record<string, unknown>> =>
      new Promise((resolve) => {
        let raw = "";
        req.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
        req.on("end", () => {
          try { resolve(JSON.parse(raw) as Record<string, unknown>); }
          catch { resolve({}); }
        });
      });

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://${host}:${port}`);
      const pathname = url.pathname;
      try {
        if (pathname === "/health" && req.method === "GET") {
          jsonReply(res, {status: "healthy", agent: this.name}); return;
        }
        if (pathname === "/info" && req.method === "GET") {
          jsonReply(res, this.getInfo()); return;
        }
        if (pathname === "/skills" && req.method === "GET") {
          jsonReply(res, {
            skills: Array.from(this._skills.values()).map(
              ({name, description}) => ({name, description})
            ),
            count: this._skills.size,
          }); return;
        }
        const execMatch = pathname.match(/^\/execute\/(.+)$/);
        if (execMatch && req.method === "POST") {
          const skillName = decodeURIComponent(execMatch[1]!);
          const body = await readBody(req);
          const text = String(body["text"] ?? body["query"] ?? "");
          const data = body["data"] as Record<string, unknown> | undefined;
          const result = await this.executeSkill(skillName, text, data);
          jsonReply(res, result, result.status === "error" ? 500 : 200); return;
        }
        if (pathname === "/ask" && req.method === "POST") {
          const body = await readBody(req);
          const question = String(body["question"] ?? body["text"] ?? "");
          jsonReply(res, await this.ask(question)); return;
        }
        jsonReply(res, {error: `Not found: ${pathname}`}, 404);
      } catch (err) {
        jsonReply(res, {error: err instanceof Error ? err.message : String(err)}, 500);
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.on("error", reject);
      server.listen(port, host, () => {
        console.log(`[A2AServer] '${this.name}' listening on http://${host}:${port}`);
        console.log(`[A2AServer] Skills: ${this.listSkills().join(", ")}`);
        resolve();
      });
    });
  }
}

export function createExampleA2AServer(): A2AServer {
  const server = new A2AServer({
    name: "Example A2A Agent",
    description: "A simple example A2A agent with calculate and greet skills",
    version: "1.0.0",
    capabilities: {chat: true, calculation: true},
  });

  server.addSkill(
    "calculate",
    "Evaluate a simple arithmetic expression extracted from the input text",
    (text) => {
      const match = /calculate\s+([\d+\-*/().\s]+)/i.exec(text);
      if (!match) return "Please provide an expression, e.g. 'calculate 2 + 3'";
      const expr = match[1]!.trim();
      if (!/^[\d+\-*/().\s]+$/.test(expr)) return "Error: invalid characters";
      try {
        // eslint-disable-next-line no-new-func
        const result = new Function('"use strict"; return (' + expr + ')')() as number;
        return `The result is: ${result}`;
      } catch (err) {
        return `Calculation error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  );

  server.addSkill(
    "greet",
    "Greet the user",
    (text) => /hello|hi|greet/i.test(text)
      ? "Hello! I'm an A2A agent. How can I help you today?"
      : "Hi there!",
  );

  return server;
}
