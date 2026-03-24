let currentJobId = ''
export function setJobContext(id: string) { currentJobId = id }
export const tel = {
  info:  (agent: string, step: string, data: object = {}) =>
    console.log(JSON.stringify({ level:'INFO',  job_id: currentJobId, agent, step, ...data, ts: Date.now() })),
  error: (agent: string, step: string, err: unknown, data: object = {}) =>
    console.error(JSON.stringify({ level:'ERROR', job_id: currentJobId, agent, step, error: (err instanceof Error ? err.message : String(err)), ...data, ts: Date.now() })),
  trace: (agent: string, step: string, input: string, output: string, ms: number) =>
    console.log(JSON.stringify({ level:'TRACE', job_id: currentJobId, agent, step, in_len: input.length, out_len: output.length, ms, ts: Date.now() }))
}
