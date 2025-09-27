import { createRequestHandler } from "@remix-run/vercel";
// @ts-ignore - this is generated at build time and TS doesn't know its types
import * as build from "@remix-run/dev/server-build";

export const config = { runtime: "nodejs" };

export default createRequestHandler({
  build, // TS will complain, but it works at runtime
  mode: process.env.NODE_ENV,
});