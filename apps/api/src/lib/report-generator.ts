// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Gerador real de PDF e CSV para relatórios
import PDFDocument from "pdfkit";

export interface ReportBranding {
  company_name: string;
  logo_url: string | null;
  logo_width: number;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  footer_text: string | null;
  footer_url: string | null;
  header_bg_color: string;
  header_text_color: string;
  font_family: string;
}

export interface ReportData {
  title: string;
  generatedAt: string;
  columns: string[];
  rows: Record<string, unknown>[];
  branding?: ReportBranding;
}

// Acessor type-safe para propriedades de Record<string, unknown>
// Evita security/detect-object-injection ao não usar indexação dinâmica direta
function getField(row: Record<string, unknown>, column: string): unknown {
  const entries = Object.entries(row);
  const found = entries.find(([key]) => key === column);
  return found ? found[1] : undefined;
}

// Gera CSV a partir dos dados do relatório
export function generateCSV(data: ReportData): string {
  const escapeCSV = (value: unknown): string => {
    const str = value === null || value === undefined ? "" : String(value);
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replace(/"/g, "\"\"")}"`;
    }
    return str;
  };

  const header = data.columns.map(escapeCSV).join(",");
  const lines = data.rows.map(row =>
    data.columns.map(col => escapeCSV(getField(row, col))).join(",")
  );

  return [header, ...lines].join("\n");
}

// Gera PDF a partir dos dados do relatório
export function generatePDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Cabeçalho com branding
    const branding = data.branding;
    if (branding) {
      // Fundo do cabeçalho
      doc.rect(0, 0, doc.page.width, 80).fillColor(branding.header_bg_color).fill();

      // Logo (se disponível)
      if (branding.logo_url) {
        try {
          doc.image(branding.logo_url, 50, 15, { width: branding.logo_width });
        } catch {
          doc.fontSize(16).fillColor(branding.primary_color).text(branding.company_name, 50, 30, { align: "left" });
        }
      } else {
        doc.fontSize(16).fillColor(branding.primary_color).text(branding.company_name, 50, 30, { align: "left" });
      }

      // Titulo do relatório a direita
      doc.fontSize(12).fillColor(branding.header_text_color).text(data.title, 50, 55, { align: "left" });
      doc.moveDown(3);
      doc.fillColor("#000000");
    } else {
      doc.fontSize(20).text(data.title, { align: "center" });
    }
    doc.moveDown();
    doc.fontSize(10).fillColor("#666666").text(`Gerado em: ${data.generatedAt}`, { align: "center" });
    doc.moveDown(2);

    // Tabela
    const tableTop = doc.y;
    const colWidth = (doc.page.width - 100) / data.columns.length;

    // Header da tabela
    doc.fontSize(9).fillColor("#000000");
    data.columns.forEach((col, i) => {
      doc.text(col, 50 + i * colWidth, tableTop, { width: colWidth - 5, align: "left" });
    });

    doc.moveTo(50, tableTop + 15).lineTo(doc.page.width - 50, tableTop + 15).stroke();
    doc.y = tableTop + 25;

    // Linhas
    data.rows.forEach((row) => {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }
      const rowY = doc.y;
      data.columns.forEach((col, i) => {
        const value = getField(row, col);
        const str = value === null || value === undefined ? "" : String(value);
        doc.fontSize(8).text(str, 50 + i * colWidth, rowY, { width: colWidth - 5, align: "left" });
      });
      doc.y = rowY + 20;
    });

    // Rodapé com branding
    doc.moveDown(2);
    if (branding && branding.footer_text) {
      doc.fontSize(8).fillColor("#999999").text(branding.footer_text, { align: "center" });
      if (branding.footer_url) {
        doc.text(branding.footer_url, { align: "center", link: branding.footer_url });
      }
    } else {
      doc.fontSize(8).fillColor("#999999").text("JLMIRROR — Relatório gerado automaticamente", { align: "center" });
    }

    doc.end();
  });
}

// Coleta dados reais das fontes do relatório
export async function collectReportData(
  tenantId: string,
  dataSources: string[],
  columns: string[],
  title: string,
  queryFn: (sql: string, params: unknown[]) => Promise<{ data?: { rows?: Record<string, unknown>[] } | null }>,
): Promise<ReportData> {
  const rows: Record<string, unknown>[] = [];

  for (const source of dataSources) {
    if (source === "devices") {
      const r = await queryFn("SELECT id, hostname, ip, type, status, created_at FROM public.devices WHERE tenant_id = $1 ORDER BY created_at DESC", [tenantId]);
      if (r.data?.rows) rows.push(...r.data.rows);
    } else if (source === "tickets") {
      const r = await queryFn("SELECT id, subject, status, priority, created_at FROM public.tickets WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100", [tenantId]);
      if (r.data?.rows) rows.push(...r.data.rows);
    } else if (source === "compliance") {
      const r = await queryFn("SELECT id, name, framework, severity, is_active, created_at FROM public.compliance_policies WHERE tenant_id = $1 ORDER BY created_at DESC", [tenantId]);
      if (r.data?.rows) rows.push(...r.data.rows);
    } else if (source === "backups") {
      const r = await queryFn("SELECT id, file_path, status, snapshot_type, created_at FROM public.backup_snapshots WHERE tenant_id = $1 ORDER BY created_at DESC", [tenantId]);
      if (r.data?.rows) rows.push(...r.data.rows);
    } else if (source === "ssl") {
      const r = await queryFn("SELECT id, hostname, issuer, valid_from, valid_to FROM public.ssl_certificates WHERE tenant_id = $1 ORDER BY valid_to DESC", [tenantId]);
      if (r.data?.rows) rows.push(...r.data.rows);
    } else if (source === "changes") {
      const r = await queryFn("SELECT id, rfc_number, title, status, priority, planned_start_at FROM public.change_requests WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100", [tenantId]);
      if (r.data?.rows) rows.push(...r.data.rows);
    } else if (source === "assets") {
      const r = await queryFn("SELECT id, name, asset_type, status, assigned_to FROM public.assets WHERE tenant_id = $1 ORDER BY created_at DESC", [tenantId]);
      if (r.data?.rows) rows.push(...r.data.rows);
    }
  }

  const allColumns = columns.length > 0 ? columns : (rows[0] ? Object.keys(rows[0]) : []);

  return {
    title,
    generatedAt: new Date().toISOString(),
    columns: allColumns,
    rows,
  };
}
