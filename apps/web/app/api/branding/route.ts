// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

// Proxy para /api/v1/branding (sem slug) — retorna branding default
export async function GET() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/branding`, {
      cache: "no-store",
    });
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
