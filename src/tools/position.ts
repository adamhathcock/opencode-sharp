import type { Position } from "../csharp/types.js";

export type PositionArgs = {
  line: number;
  column: number;
};

export function getPosition(args: PositionArgs): Position {
  return {
    line: oneBasedToZeroBased(args.line),
    character: oneBasedToZeroBased(args.column),
  };
}

export function oneBasedToZeroBased(value: number) {
  return Math.max(0, Math.floor(value) - 1);
}
