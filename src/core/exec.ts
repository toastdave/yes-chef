import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface StreamCaptureOptions {
  onChunk?: (chunk: string) => void | Promise<void>;
}

export interface ProcessRunOptions {
  cmd: string[];
  cwd?: string;
  stdin?: string;
  onStdoutChunk?: (chunk: string) => void | Promise<void>;
  onStderrChunk?: (chunk: string) => void | Promise<void>;
}

export interface ProcessRunResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function captureReadableStream(
  stream: ReadableStream<Uint8Array> | null,
  options: StreamCaptureOptions = {},
): Promise<string> {
  if (!stream) {
    return "";
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    output += chunk;
    await options.onChunk?.(chunk);
  }

  output += decoder.decode();
  return output;
}

export async function runProcess(options: ProcessRunOptions): Promise<ProcessRunResult> {
  try {
    const proc = Bun.spawn({
      cmd: options.cmd,
      cwd: options.cwd,
      stdin: options.stdin ? "pipe" : undefined,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    if (options.stdin && proc.stdin) {
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      captureReadableStream(proc.stdout, { onChunk: options.onStdoutChunk }),
      captureReadableStream(proc.stderr, { onChunk: options.onStderrChunk }),
      proc.exited,
    ]);

    return {
      command: options.cmd.join(" "),
      exitCode,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      command: options.cmd.join(" "),
      exitCode: 127,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runShellCommand(
  command: string,
  options: Omit<ProcessRunOptions, "cmd" | "stdin"> & { stdin?: string } = {},
): Promise<ProcessRunResult> {
  return runProcess({
    ...options,
    cmd: ["bash", "-lc", command],
    stdin: options.stdin,
  });
}

export async function writeProcessOutput(filePath: string, contents: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

export function commandExists(command: string): boolean {
  const escaped = command.replace(/'/g, `'\\''`);
  const result = Bun.spawnSync({
    cmd: ["bash", "-lc", `command -v '${escaped}' >/dev/null 2>&1`],
    stdout: "pipe",
    stderr: "pipe",
  });

  return result.exitCode === 0;
}
