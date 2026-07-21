import { describe, expect, it } from "vitest";
import {
  deriveSourceAcceptancePhase,
  isServerSourceAccepted,
  mayAcceptOrReacceptSource,
  serverSourceLocationId,
} from "./multiPickingSourceAcceptance";

describe("multiPickingSourceAcceptance", () => {
  it("serverSourceLocationId requires matching product", () => {
    expect(serverSourceLocationId({ product_id: 192, location_id: 276 }, 192)).toBe(276);
    expect(serverSourceLocationId({ product_id: 191, location_id: 276 }, 192)).toBeNull();
    expect(serverSourceLocationId(null, 192)).toBeNull();
  });

  it("isServerSourceAccepted false when only UI activeLocationId would match", () => {
    expect(isServerSourceAccepted(null, 192, 276)).toBe(false);
    expect(isServerSourceAccepted({ product_id: 192, location_id: 276 }, 192, 276)).toBe(true);
  });

  it("mayAcceptOrReaccept: continuous lastAccepted yes; bare id no", () => {
    expect(
      mayAcceptOrReacceptSource({
        locationId: 276,
        lastOperatorAcceptedLocationId: 276,
        explicitSelectionLocationId: null,
        locationCount: 2,
        singleLocationId: null,
      }),
    ).toBe(true);
    expect(
      mayAcceptOrReacceptSource({
        locationId: 276,
        lastOperatorAcceptedLocationId: null,
        explicitSelectionLocationId: null,
        locationCount: 2,
        singleLocationId: null,
      }),
    ).toBe(false);
  });

  it("mayAcceptOrReaccept: explicit selection and single-loc auto", () => {
    expect(
      mayAcceptOrReacceptSource({
        locationId: 276,
        lastOperatorAcceptedLocationId: null,
        explicitSelectionLocationId: 276,
        locationCount: 2,
        singleLocationId: null,
      }),
    ).toBe(true);
    expect(
      mayAcceptOrReacceptSource({
        locationId: 10,
        lastOperatorAcceptedLocationId: null,
        explicitSelectionLocationId: null,
        locationCount: 1,
        singleLocationId: 10,
      }),
    ).toBe(true);
  });

  it("deriveSourceAcceptancePhase", () => {
    expect(
      deriveSourceAcceptancePhase({
        requiresBasketPut: true,
        activeLocationId: 276,
        sourceLock: null,
        productId: 192,
        accepting: false,
      }),
    ).toBe("SELECT_SOURCE");
    expect(
      deriveSourceAcceptancePhase({
        requiresBasketPut: true,
        activeLocationId: 276,
        sourceLock: { product_id: 192, location_id: 276 },
        productId: 192,
        accepting: false,
      }),
    ).toBe("SELECT_BASKET");
    expect(
      deriveSourceAcceptancePhase({
        requiresBasketPut: true,
        activeLocationId: 276,
        sourceLock: null,
        productId: 192,
        accepting: true,
      }),
    ).toBe("SOURCE_ACCEPTING");
  });
});
