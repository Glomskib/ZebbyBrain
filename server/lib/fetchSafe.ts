export async function fetchSafe(
  url: string, 
  opts: RequestInit = {}, 
  tries = 3, 
  timeoutMs = 4000
): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      
      if (res.ok) return res;
      if (res.status >= 500) throw new Error(`Server ${res.status}`);
      return res; // 4xx - don't retry
    } catch (e) {
      clearTimeout(timer);
      if (i === tries - 1) throw new Error(`fetch failed after ${tries} attempts: ${e}`);
      await new Promise(r => setTimeout(r, 250 * (i + 1) * (i + 1)));
    }
  }
  
  throw new Error("unreachable");
}
