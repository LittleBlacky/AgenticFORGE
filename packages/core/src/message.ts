export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface MessageMetadata {
  [key: string]: unknown;
}

export class Message {
  public readonly content: string;
  public readonly role: MessageRole;
  public readonly timestamp: Date;
  public readonly metadata: MessageMetadata;

  constructor(params: {
    content: string;
    role: MessageRole;
    timestamp?: Date;
    metadata?: MessageMetadata;
  }) {
    this.content = params.content;
    this.role = params.role;
    this.timestamp = params.timestamp ?? new Date();
    this.metadata = params.metadata ?? {};
  }

  /** 转换为字典格式（OpenAI API 格式） */
  toDict(): {role: MessageRole; content: string} {
    return {
      role: this.role,
      content: this.content,
    };
  }

  toString(): string {
    return `[${this.role}] ${this.content}`;
  }
}
