declare module "next" {
  export type Metadata = Record<string, unknown>;
}

declare module "next/link" {
  import type { AnchorHTMLAttributes } from "react";

  export default function Link(
    props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string },
  ): JSX.Element;
}

declare module "next/font/google" {
  export function Space_Grotesk(options: Record<string, unknown>): {
    variable: string;
    className: string;
  };

  export function IBM_Plex_Sans(options: Record<string, unknown>): {
    variable: string;
    className: string;
  };
}

declare module "@solana/web3-compat" {
  export function fromWeb3Instruction(instruction: unknown): any;
}
