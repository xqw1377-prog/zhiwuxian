declare module 'openai' {
  export interface OpenAIClientOptions {
    apiKey?: string;
    [key: string]: unknown;
  }

  export default class OpenAI {
    constructor(options?: OpenAIClientOptions);
    chat: {
      completions: {
        create: (args: unknown) => Promise<any>;
      };
    };
    audio: {
      transcriptions: {
        create: (args: unknown) => Promise<any>;
      };
    };
    embeddings: {
      create: (args: unknown) => Promise<any>;
    };
  }
}
