// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

// Proxy para /api/v1/branding — retorna branding publico do tenant
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug?: string }> },
) {
  const { slug } = await params;
  const url = slug
    ? `${API_BASE_URL}/api/v1/branding/${encodeURIComponent(slug)}`
    : `${API_BASE_URL}/api/v1/branding`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        company_name: null,
        logo_url: null,
        primary_color: "#1BA898",
        secondary_color: "#35D0C4",
        custom_css: null,
        login_message: null,
      },
      { status: 200 },
    );
  }
}
