export function logUsage(
  label: string, 
  inputTokensApprox: number, 
  outputTokensApprox: number,
  userId?: string
) {
  console.log(JSON.stringify({
    evt: "rag_usage",
    ts: new Date().toISOString(),
    label,
    userId,
    inputTokensApprox,
    outputTokensApprox,
    estimatedCost: (inputTokensApprox * 0.00015 + outputTokensApprox * 0.0006) / 1000
  }));
}
