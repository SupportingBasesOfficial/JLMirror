// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Builder de UPDATE dinamico — elimina padrao fieldMap/updateFields/params repetido

interface BuildUpdateResult {
  setClause: string;
  params: unknown[];
}

export function buildDynamicUpdate(
  data: Record<string, unknown>,
  fieldMap: Record<string, string>,
  options?: {
    jsonFields?: string[];
    skipValues?: unknown[];
  },
): BuildUpdateResult {
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;
  const jsonFields = new Set(options?.jsonFields ?? []);
  const skipValues = new Set(options?.skipValues ?? []);

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key] !== undefined && !skipValues.has(data[key])) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(jsonFields.has(key) ? JSON.stringify(data[key]) : data[key]);
    }
  }

  return {
    setClause: updateFields.join(", "),
    params,
  };
}

export function appendWhereClause(
  base: string,
  setClause: string,
  params: unknown[],
  whereConditions: string[],
  whereValues: unknown[],
): { sql: string; params: unknown[] } {
  let paramIdx = params.length + 1;
  const whereClause = whereConditions
    .map((cond) => {
      if (cond.includes("$")) return cond;
      return cond.replace(/\?/g, () => `$${paramIdx++}`);
    })
    .join(" AND ");

  const sql = `${base} ${setClause} WHERE ${whereClause}`;
  return {
    sql,
    params: [...params, ...whereValues],
  };
}
