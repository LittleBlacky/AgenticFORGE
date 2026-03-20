import { MemoryManager, WorkingMemory, EpisodicMemory, SemanticMemory, InMemoryVectorStore } from "@agenticforge/kit";

const vectorStore = new InMemoryVectorStore();

export const workingMemory = new WorkingMemory({ workingMemoryCapacity: 50 });
export const episodicMemory = new EpisodicMemory({ maxCapacity: 200 });
export const semanticMemory = new SemanticMemory({}, { vectorStore });
export const memoryManager = new MemoryManager({
  userId: "default",
  config: { workingMemoryCapacity: 50, maxCapacity: 200 },
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
});
export default memoryManager;
