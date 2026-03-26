import type { Provider, ProviderConfig } from "./types";

export interface RuntimeConfig {
  defaultProvider: Provider;
  providers: Record<string, ProviderConfig>;
}

export class Config {
  public defaultProvider: Provider = "openai";
  public providers: Record<string, ProviderConfig> = {};

  constructor(overrides: Partial<RuntimeConfig> = {}) {
    this.defaultProvider = overrides.defaultProvider ?? this.defaultProvider;
    this.providers = overrides.providers ?? this.providers;
  }
}
