// Mot doan loi noi co moc thoi gian (giay).
export interface Segment {
  start: number; // giay
  end: number; // giay
  text: string; // van ban goc (vd tieng Trung)
  translated?: string; // van ban da dich (vd tieng Viet)
}

export interface DubResult {
  awemeId: string;
  videoPath: string; // file mp4 ket qua
  srtPath: string; // file phu de
  segments: Segment[];
}
