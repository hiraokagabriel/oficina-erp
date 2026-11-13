// Entrada Deno fina: toda a lógica está em src/server (testada com Vitest). Gerada em bundle.js por scripts/build-functions.mjs.
import { createRuntime } from '../../../src/server/runtime'
import { serveHandler } from '../../../src/server/http'
import { handleMoneyOp } from '../../../src/server/moneyHandler'
import { createMoneyStore } from '../../../src/server/moneyStore'

const rt = createRuntime((k) => Deno.env.get(k))
const deps = { ...rt.deps, store: createMoneyStore(rt.cfg) }

Deno.serve((req) => serveHandler(req, rt.allowed, (r) => handleMoneyOp(deps, r)))
