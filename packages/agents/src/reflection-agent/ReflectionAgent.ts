import {Agent} from "@agenticforge/core";
import {Message} from "@agenticforge/core";
import {ReflectionMemory} from "./Memory";

export interface ReflectionAgentOptions {
  name: string;
  llm: Agent["llm"];
  systemPrompt?: string;
  config?: Agent["config"];
  maxRounds?: number;
  critiquePrompt?: string;
  revisionPrompt?: string;
}

/**
 * ReflectionAgent:
 * 1. Generates an initial draft response.
 * 2. Critiques the draft.
 * 3. Revises based on the critique.
 * Repeats for up to `maxRounds` iterations.
 */
export class ReflectionAgent extends Agent {
  private readonly maxRounds: number;
  private readonly critiquePrompt: string;
  private readonly revisionPrompt: string;
  readonly memory: ReflectionMemory;

  constructor(options: ReflectionAgentOptions) {
    super({
      name: options.name,
      llm: options.llm,
      systemPrompt: options.systemPrompt,
      config: options.config,
    });
    this.maxRounds = options.maxRounds ?? 2;
    this.critiquePrompt =
      options.critiquePrompt ??
      "请批判性地审查以下回答，指出其中的错误、遗漏或可改进之处：";
    this.revisionPrompt =
      options.revisionPrompt ??
      "根据以下批评，请修订并改进回答：";
    this.memory = new ReflectionMemory();
  }

  async run(inputText: string): Promise<string> {
    const sys = this.systemPrompt ?? "你是一个反思型AI助手，擅长自我批评和改进回答。";

    let draft = await this.llm.think([
      {role: "system", content: sys},
      {role: "user", content: inputText},
    ]);

    for (let round = 1; round <= this.maxRounds; round++) {
      const critique = await this.llm.think([
        {role: "system", content: sys},
        {role: "user", content: inputText},
        {role: "assistant", content: draft},
        {role: "user", content: `${this.critiquePrompt}\n\n${draft}`},
      ]);

      const revision = await this.llm.think([
        {role: "system", content: sys},
        {role: "user", content: inputText},
        {role: "assistant", content: draft},
        {role: "user", content: `${this.critiquePrompt}\n\n${draft}`},
        {role: "assistant", content: critique},
        {
          role: "user",
          content: `${this.revisionPrompt}\n\n批评：${critique}\n\n原始回答：${draft}`,
        },
      ]);

      this.memory.add({draft, critique, revision, round});
      draft = revision;
    }

    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: draft}));
    return draft;
  }

}
