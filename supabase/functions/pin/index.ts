// Entrada Deno fina: toda a lógica está em src/server (testada com Vitest). Gerada em bundle.js por scripts/build-functions.mjs.
import { makeFetchHandler } from '../../../src/server/runtime'
import { handlePin } from '../../../src/server/pinHandler'

Deno.serve(makeFetchHandler((k) => Deno.env.get(k), handlePin))
