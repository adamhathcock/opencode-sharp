import type { Range } from "../csharp/types";
import { oneBasedToZeroBased } from "./position";

type RangeArgs = {
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
};

export function getRange(args: RangeArgs, text: string): Range {
  const lines = text.split(/\r?\n/);
  if (args.startLine === undefined) {
    const lastLine = Math.max(lines.length - 1, 0);
    return {
      start: { line: 0, character: 0 },
      end: { line: lastLine, character: lines[lastLine]?.length || 0 },
    };
  }

  return {
    start: {
      line: oneBasedToZeroBased(args.startLine),
      character: oneBasedToZeroBased(args.startColumn ?? 1),
    },
    end: {
      line: oneBasedToZeroBased(args.endLine ?? args.startLine),
      character: oneBasedToZeroBased(args.endColumn ?? args.startColumn ?? 1),
    },
  };
}
