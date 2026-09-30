/** Minimal declarations for the Newman Node API used by this project. */
declare module 'newman' {
  interface NewmanRunStats {
    assertions?: { total?: number; failed?: number };
  }

  interface NewmanRunSummary {
    run?: {
      failures?: unknown[];
      stats?: NewmanRunStats;
    };
  }

  interface NewmanRunOptions {
    collection?: unknown;
    environment?: unknown;
    globals?: unknown;
    reporters?: string[];
    timeoutRequest?: number;
    timeoutScript?: number;
    timeout?: number;
    insecure?: boolean;
    ignoreRedirects?: boolean;
    delayRequest?: number;
    bail?: boolean;
    abortOnFailure?: boolean;
    suppressExitCode?: boolean;
  }

  interface Newman {
    run(
      options: NewmanRunOptions,
      callback: (err: Error | null, summary: NewmanRunSummary) => void,
    ): unknown;
  }

  const newman: Newman;
  export default newman;
}
