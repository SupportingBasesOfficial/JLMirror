// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Utilitário de paginação para endpoints de listagem da API
// Padroniza query params: ?page=1&limit=20&sort=created_at&order=desc

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
  sort: string;
  order: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const DEFAULT_SORT = "created_at";
const ALLOWED_SORT_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "name",
  "title",
  "status",
  "priority",
  "id",
  "email",
  "hostname",
  "ip_address",
]);

export function parsePaginationParams(query: Record<string, string | undefined>): PaginationParams {
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const requestedSort = query.sort ?? DEFAULT_SORT;
  const sort = ALLOWED_SORT_COLUMNS.has(requestedSort) ? requestedSort : DEFAULT_SORT;

  const order = query.order === "asc" ? "asc" : "desc";

  return { page, limit, offset, sort, order };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit) || 0;
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

// Constrói cláusula ORDER BY segura (sem injeção SQL)
export function buildOrderByClause(params: PaginationParams): string {
  return `ORDER BY ${params.sort} ${params.order.toUpperCase()}`;
}
