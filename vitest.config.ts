import { defineConfig, configDefaults } from "vitest/config";

// O Vitest não deve varrer cópias do projeto em .claude/worktrees (duplicam testes e oscilam os de desempenho).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
