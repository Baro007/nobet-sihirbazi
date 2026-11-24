import { solveSchedule, SolverInput, SolverResult } from './scheduler';

export type WorkerRequest = {
  type: 'solve';
  payload: SolverInput;
};

export type WorkerResponse =
  | { type: 'progress'; pct: number }
  | { type: 'result'; result: SolverResult }
  | { type: 'error'; message: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg?.type === 'solve') {
    try {
      const result = solveSchedule(msg.payload, (pct) => {
        self.postMessage({ type: 'progress', pct } satisfies WorkerResponse);
      });
      self.postMessage({ type: 'result', result } satisfies WorkerResponse);
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      } satisfies WorkerResponse);
    }
  }
};
