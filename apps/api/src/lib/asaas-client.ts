// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Cliente da API Asaas para cobranca via PIX, boleto e cartao

const ASAAS_API_URL =
  process.env.ASAAS_API_URL ?? "https://www.asaas.com/api/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY ?? "";

interface AsaasCustomer {
  id?: string;
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
}

interface AsaasSubscription {
  id?: string;
  customer: string;
  billingType: "BOLETO" | "PIX" | "CREDIT_CARD";
  value: number;
  cycle: "MONTHLY" | "QUARTERLY" | "YEARLY";
  nextDueDate: string;
  description?: string;
}

interface AsaasPayment {
  id?: string;
  customer: string;
  billingType: "BOLETO" | "PIX" | "CREDIT_CARD";
  value: number;
  dueDate: string;
  description?: string;
  installmentCount?: number;
}

interface AsaasPaymentResponse {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  barCode?: string;
}

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    access_token: ASAAS_API_KEY,
  };
}

export async function createAsaasCustomer(
  customer: AsaasCustomer,
): Promise<{ id: string } | { error: string }> {
  try {
    const res = await fetch(`${ASAAS_API_URL}/customers`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(customer),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `Asaas: ${err}` };
    }

    const data = (await res.json()) as { id: string };
    return { id: data.id };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Erro ao criar cliente no Asaas",
    };
  }
}

export async function createAsaasSubscription(
  subscription: AsaasSubscription,
): Promise<{ id: string } | { error: string }> {
  try {
    const res = await fetch(`${ASAAS_API_URL}/subscriptions`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(subscription),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `Asaas: ${err}` };
    }

    const data = (await res.json()) as { id: string };
    return { id: data.id };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Erro ao criar assinatura no Asaas",
    };
  }
}

export async function createAsaasPayment(
  payment: AsaasPayment,
): Promise<AsaasPaymentResponse | { error: string }> {
  try {
    const res = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payment),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `Asaas: ${err}` };
    }

    return (await res.json()) as AsaasPaymentResponse;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Erro ao criar pagamento no Asaas",
    };
  }
}

export async function getAsaasPaymentStatus(
  paymentId: string,
): Promise<{ status: string } | { error: string }> {
  try {
    const res = await fetch(`${ASAAS_API_URL}/payments/${paymentId}`, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { error: `Asaas: HTTP ${res.status}` };
    }

    const data = (await res.json()) as { status: string };
    return { status: data.status };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Erro ao consultar pagamento no Asaas",
    };
  }
}

export function isAsaasConfigured(): boolean {
  return !!ASAAS_API_KEY;
}
