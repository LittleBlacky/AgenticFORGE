import { MemoryManager, WorkingMemory, EpisodicMemory, SemanticMemory, PerceptualMemory, createRagPipeline, InMemoryVectorStore, InMemoryKVStore } from "@agenticforge/kit";
import type { RagPipeline } from "@agenticforge/kit";

const vectorStore = new InMemoryVectorStore();
const kvStore = new InMemoryKVStore();

export const workingMemory = new WorkingMemory({ maxItems: 50 });
export const episodicMemory = new EpisodicMemory({ store: kvStore });
export const semanticMemory = new SemanticMemory({ vectorStore });
export const perceptualMemory = new PerceptualMemory(
  { perceptualMemoryModalities: ["text", "image", "structured"] },
  { vectorStore },
);
export const ragPipeline: RagPipeline = createRagPipeline({ store: vectorStore, ragNamespace: "default" });
export const memoryManager = new MemoryManager({
  working: workingMemory,
  episodic: episodicMemory,
  semantic: semanticMemory,
});
export default memoryManager;
