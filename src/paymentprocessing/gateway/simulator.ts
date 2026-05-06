import type { Payment, PaymentAttempt } from "../db/models/payments";
import { GATEWAY_OUTCOME, type GatewayOutcome } from "../domain/payments";
import { createGatewayPaymentId, createProviderEventId } from "../utils/ids";

export interface GatewayChargeInput {
  payment: Payment;
  attempt: PaymentAttempt;
}

export interface GatewayChargeResult {
  outcome: GatewayOutcome;
  gatewayPaymentId: string;
  providerEventId: string;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface PaymentGateway {
  charge(input: GatewayChargeInput): Promise<GatewayChargeResult>;
}

export interface SimulatedGatewayOptions {
  minDelayMs: number;
  maxDelayMs: number;
  requestTimeoutMs: number;
  successRate: number;
  failureRate: number;
  timeoutRate: number;
  random?: () => number;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function randomBetween(min: number, max: number, random: () => number): number {
  if (max <= min) {
    return min;
  }
  return Math.floor(min + random() * (max - min + 1));
}

export class SimulatedPaymentGateway implements PaymentGateway {
  private readonly random: () => number;

  constructor(private readonly options: SimulatedGatewayOptions) {
    this.random = options.random || Math.random;
  }

  async charge(input: GatewayChargeInput): Promise<GatewayChargeResult> {
    const latencyMs = randomBetween(
      this.options.minDelayMs,
      this.options.maxDelayMs,
      this.random,
    );

    await sleep(latencyMs);

    const gatewayPaymentId = input.payment.gatewayPaymentId || createGatewayPaymentId();
    const providerEventId = createProviderEventId();

    if (latencyMs > this.options.requestTimeoutMs) {
      return {
        outcome: GATEWAY_OUTCOME.Timeout,
        gatewayPaymentId,
        providerEventId,
        latencyMs,
        errorCode: "GATEWAY_TIMEOUT",
        errorMessage: "Gateway request exceeded the configured timeout.",
      };
    }

    const configuredRateTotal =
      this.options.successRate + this.options.failureRate + this.options.timeoutRate;
    if (configuredRateTotal <= 0) {
      return {
        outcome: GATEWAY_OUTCOME.Timeout,
        gatewayPaymentId,
        providerEventId,
        latencyMs,
        errorCode: "GATEWAY_TIMEOUT",
        errorMessage: "Gateway rates were configured to produce no final outcome.",
      };
    }

    const draw = this.random() * configuredRateTotal;
    const successCutoff = this.options.successRate;
    const failureCutoff = successCutoff + this.options.failureRate;

    if (draw < successCutoff) {
      return {
        outcome: GATEWAY_OUTCOME.Success,
        gatewayPaymentId,
        providerEventId,
        latencyMs,
      };
    }

    if (draw < failureCutoff) {
      return {
        outcome: GATEWAY_OUTCOME.Failed,
        gatewayPaymentId,
        providerEventId,
        latencyMs,
        errorCode: "GATEWAY_DECLINED",
        errorMessage: "Simulated gateway declined the payment.",
      };
    }

    return {
      outcome: GATEWAY_OUTCOME.Timeout,
      gatewayPaymentId,
      providerEventId,
      latencyMs,
      errorCode: "GATEWAY_TIMEOUT",
      errorMessage: "Simulated gateway did not return a final response.",
    };
  }
}
