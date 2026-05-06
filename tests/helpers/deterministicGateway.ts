import type {
  GatewayChargeInput,
  GatewayChargeResult,
  PaymentGateway,
} from "../../src/paymentprocessing/gateway/simulator";
import { GATEWAY_OUTCOME } from "../../src/paymentprocessing/domain/payments";

export interface GatewayStep {
  outcome: GatewayChargeResult["outcome"];
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export class DeterministicGateway implements PaymentGateway {
  readonly calls: GatewayChargeInput[] = [];

  constructor(
    private readonly steps: GatewayStep[],
    private readonly delayMs = 0,
  ) {}

  async charge(input: GatewayChargeInput): Promise<GatewayChargeResult> {
    this.calls.push(input);

    if (this.delayMs > 0) {
      await sleep(this.delayMs);
    }

    const step = this.steps[Math.min(this.calls.length - 1, this.steps.length - 1)] || {
      outcome: GATEWAY_OUTCOME.Success,
    };

    return {
      outcome: step.outcome,
      gatewayPaymentId: `gw_test_${input.payment.id}`,
      providerEventId: `evt_test_${this.calls.length}`,
      latencyMs: step.latencyMs ?? this.delayMs,
      errorCode: step.errorCode,
      errorMessage: step.errorMessage,
    };
  }
}
