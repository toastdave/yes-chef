export function normalizeCodexSummary(stdout: string, stderr: string, exitCode: number): string {
  const combined = `${stdout}\n${stderr}`.trim();

  if (!combined) {
    return exitCode === 0 ? "Run completed without harness output." : "Run failed before producing harness output.";
  }

  const lines = combined.split(/\r?\n/).filter(Boolean);
  return lines.slice(-5).join(" ");
}
