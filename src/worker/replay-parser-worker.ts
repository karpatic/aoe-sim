import { analyzeLocalReplay } from "../replay/aoe2rec-parser";
import type { LocalReplayParserRequest, LocalReplayParserResponse } from "../replay/local-recording";

type ReplayParserWorkerScope = typeof globalThis & {
  postMessage(message: LocalReplayParserResponse): void;
  onmessage: ((event: MessageEvent<LocalReplayParserRequest>) => void) | null;
};

const workerScope = self as ReplayParserWorkerScope;

workerScope.onmessage = (event: MessageEvent<LocalReplayParserRequest>) => {
  handleMessage(event.data).catch((error: unknown) => {
    workerScope.postMessage({
      type: "local-recording-error",
      requestId: event.data.requestId,
      message: error instanceof Error ? error.message : String(error)
    });
  });
};

async function handleMessage(message: LocalReplayParserRequest): Promise<void> {
  switch (message.type) {
    case "parse-local-recording": {
      const report = await analyzeLocalReplay(
        message.buffer,
        message.fileName,
        message.lastModified,
        message.expected
      );
      workerScope.postMessage({
        type: "local-recording-report",
        requestId: message.requestId,
        report
      });
      return;
    }
  }
}
