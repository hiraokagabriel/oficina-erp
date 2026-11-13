// Shim mínimo do global `Deno` só para o type-check (tsconfig.functions.json); o runtime da Edge o fornece.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}
