import { analyzeLocalReplay } from "../replay/aoe2rec-parser";
import { assertRecordingByteLength } from "../replay/limits";
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
      assertRecordingByteLength(message.sizeBytes, message.fileName || "Selected recording");
      assertRecordingByteLength(message.buffer.byteLength, "Selected recording buffer");
      if (message.sizeBytes !== message.buffer.byteLength) {
        throw new Error(
          `Selected recording size changed before parsing: file metadata says ${message.sizeBytes} bytes, ` +
            `transferred buffer has ${message.buffer.byteLength} bytes.`
        );
      }
      const report = await analyzeLocalReplay(
        message.buffer,
        message.fileName,
        message.lastModified,
        message.expected,
        (phase, statusMessage) => {
          workerScope.postMessage({
            type: "local-recording-status",
            requestId: message.requestId,
            phase,
            message: statusMessage
          });
        }
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
