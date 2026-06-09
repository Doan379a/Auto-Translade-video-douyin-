// Logger don gian, co prefix buoc, de doc tien trinh pipeline.
const t = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg: string) => console.log(`[${t()}] ${msg}`),
  step: (msg: string) => console.log(`[${t()}] → ${msg}`),
  ok: (msg: string) => console.log(`[${t()}] ✓ ${msg}`),
  warn: (msg: string) => console.warn(`[${t()}] ! ${msg}`),
  err: (msg: string) => console.error(`[${t()}] ✗ ${msg}`),
};
