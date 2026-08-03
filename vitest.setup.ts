import "@testing-library/jest-dom/vitest";

// Flag explicita para bypass de permissoes em testes automatizados
// Substitui o antigo bypass via NODE_ENV=test que era inseguro
process.env.BYPASS_PERMISSIONS = "true";
