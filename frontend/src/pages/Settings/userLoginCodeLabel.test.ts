import { describe, expect, it } from "vitest";

import { LABEL_VARIABLE_CATEGORIES, TEMPLATE_TYPE_CATEGORIES, PREVIEW_SAMPLES } from "../../types/labelSystem";
import { buildLoginCodeLabelRecord, generateBarcodeLoginCode } from "../../utils/userLoginCodeLabel";
import { ADMINISTRATORS_TABS } from "./administratorsTabs";

describe("user login code labels", () => {
  it("exposes Kod logowania in variable catalog for user_login templates", () => {
    expect(TEMPLATE_TYPE_CATEGORIES.user_login).toContain("user");
    const cat = LABEL_VARIABLE_CATEGORIES.find((c) => c.id === "user");
    expect(cat).toBeTruthy();
    const item = cat!.items.find((i) => i.id === "barcode_login_code");
    expect(item?.label).toBe("Kod logowania");
    expect(item?.token).toBe("{barcode_login_code}");
    expect(PREVIEW_SAMPLES.user_login.barcode_login_code).toBeTruthy();
  });

  it("builds render record for PDF/preview", () => {
    const rec = buildLoginCodeLabelRecord({
      login: "jmizura",
      first_name: "Jacek",
      last_name: "Mizura",
      barcode_login_code: "MAG123",
    });
    expect(rec.barcode_login_code).toBe("MAG123");
    expect(rec.barcode_data).toBe("MAG123");
    expect(rec["{barcode_login_code}"]).toBe("MAG123");
    expect(rec.user_full_name).toBe("Jacek Mizura");
  });

  it("generates non-empty alphanumeric code", () => {
    const code = generateBarcodeLoginCode("jmizura");
    expect(code.length).toBeGreaterThanOrEqual(6);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });
});

describe("administrators module still lists users hub", () => {
  it("keeps users tab", () => {
    expect(ADMINISTRATORS_TABS[0].label).toBe("Użytkownicy");
  });
});
