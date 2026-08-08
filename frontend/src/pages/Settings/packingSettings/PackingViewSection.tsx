import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type { WmsPackingInterfaceDisplay, WmsPackingSettingsRead } from "../../../types/wmsPackingSettings";
import {
  BoolRow,
  CAP_NONE,
  FieldGrid,
  Help,
  SectionCard,
  SelectField,
  Subsection,
} from "./packingSettingsUi";

type Props = {
  extended: WmsPackingExtendedUiSettings;
  draft: WmsPackingSettingsRead;
  patchExtended: <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => void;
  toggleInterfaceField: (key: keyof WmsPackingInterfaceDisplay) => void;
};

/** Grupa 2: Widok — wszystko wizualne. */
export function PackingViewSection({ extended, draft, patchExtended, toggleInterfaceField }: Props) {
  return (
    <SectionCard
      id="wms-pack-view"
      title="Widok"
      summary="Konfiguracja widoku Trybu Pakowania [Wersja Beta]"
    >
      <FieldGrid>
        <SelectField
          settingId="packing.layout_mode"
          label="Wybierz układ"
          capability={CAP_NONE}
          value={extended.layoutMode}
          onChange={(v) => patchExtended("layoutMode", v as WmsPackingExtendedUiSettings["layoutMode"])}
        >
          <option value="full_width">Pełna szerokość</option>
          <option value="centered">Wyśrodkowany</option>
        </SelectField>
        <SelectField
          settingId="packing.customer_comment_style"
          label="Wygląd komentarzy klienta"
          capability={CAP_NONE}
          value={extended.customerCommentStyle}
          onChange={(v) =>
            patchExtended("customerCommentStyle", v as WmsPackingExtendedUiSettings["customerCommentStyle"])
          }
        >
          <option value="highlighted">Wyróżniony</option>
          <option value="normal">Zwykły</option>
        </SelectField>
        <SelectField
          settingId="packing.sales_document_preview"
          label="Widok dokumentu sprzedaży"
          capability={CAP_NONE}
          value={extended.salesDocumentPreview}
          onChange={(v) =>
            patchExtended("salesDocumentPreview", v as WmsPackingExtendedUiSettings["salesDocumentPreview"])
          }
        >
          <option value="simplified">Uproszczony</option>
          <option value="full">Pełny</option>
        </SelectField>
        <SelectField
          settingId="packing.product_display_mode"
          label="Wygląd produktów na liście do spakowania"
          capability={CAP_NONE}
          value={extended.productDisplayMode}
          onChange={(v) =>
            patchExtended("productDisplayMode", v as WmsPackingExtendedUiSettings["productDisplayMode"])
          }
        >
          <option value="list">Lista</option>
          <option value="grid">Siatka</option>
        </SelectField>
        <SelectField
          settingId="packing.location_badge_position"
          label="Umiejscowienie informacji o lokalizacji na produkcie"
          capability={CAP_NONE}
          value={extended.locationBadgePosition}
          onChange={(v) =>
            patchExtended("locationBadgePosition", v as WmsPackingExtendedUiSettings["locationBadgePosition"])
          }
        >
          <option value="top_right">Góra prawo</option>
          <option value="top_left">Góra lewo</option>
          <option value="bottom_right">Dół prawo</option>
          <option value="bottom_left">Dół lewo</option>
        </SelectField>
        <SelectField
          settingId="packing.automation_buttons_position"
          label="Położenie przycisków aktywatorów automatyzacji"
          capability={CAP_NONE}
          value={extended.automationButtonsPosition}
          onChange={(v) =>
            patchExtended(
              "automationButtonsPosition",
              v as WmsPackingExtendedUiSettings["automationButtonsPosition"],
            )
          }
        >
          <option value="bottom">Dół</option>
          <option value="right">Prawa kolumna</option>
          <option value="floating">Pływające</option>
        </SelectField>
      </FieldGrid>

      <div className="mt-3 space-y-2">
        <BoolRow
          settingId="packing.packed_products_extra_list"
          label="Dodatkowa lista produktów spakowanych"
          checked={extended.packedProductsExtraList}
          onChange={(v) => patchExtended("packedProductsExtraList", v)}
          capability={CAP_NONE}
        />
        <BoolRow
          settingId="packing.show_product_image"
          label="Zdjęcie produktu na liście do spakowania"
          checked={extended.showProductImage}
          onChange={(v) => patchExtended("showProductImage", v)}
          capability={CAP_NONE}
        />
        <BoolRow
          settingId="packing.show_product_location"
          label="Wyświetlaj lokalizację produktów"
          checked={extended.showProductLocation}
          onChange={(v) => patchExtended("showProductLocation", v)}
          capability={CAP_NONE}
        />
        <BoolRow
          settingId="packing.move_packed_to_bottom"
          label="Przesuwaj spakowane produkty na koniec listy"
          checked={extended.movePackedToBottom}
          onChange={(v) => patchExtended("movePackedToBottom", v)}
          capability={CAP_NONE}
        />
        <BoolRow
          settingId="packing.show_stock"
          label="Wyświetlaj stan magazynowy w produktach"
          checked={draft.interface_display.show_stock}
          onChange={() => toggleInterfaceField("show_stock")}
        />
        <BoolRow
          settingId="packing.show_ean"
          label="Wyświetlaj EAN w produktach"
          checked={draft.interface_display.show_ean}
          onChange={() => toggleInterfaceField("show_ean")}
        />
        <BoolRow
          settingId="packing.show_symbol"
          label="Wyświetlaj symbol w produkcie"
          checked={draft.interface_display.show_symbol}
          onChange={() => toggleInterfaceField("show_symbol")}
        />
        <BoolRow
          settingId="packing.show_catalog_number"
          label="Wyświetlaj numer katalogowy w produktach"
          checked={draft.interface_display.show_catalog_number}
          onChange={() => toggleInterfaceField("show_catalog_number")}
        />
        <BoolRow
          settingId="packing.show_signature"
          label="Wyświetlaj sygnaturę w produktach"
          checked={extended.showSignature}
          onChange={(v) => patchExtended("showSignature", v)}
          capability={CAP_NONE}
        />
        <BoolRow
          settingId="packing.show_price"
          label="Wyświetlaj cenę w produktach"
          checked={extended.showPrice}
          onChange={(v) => patchExtended("showPrice", v)}
          capability={CAP_NONE}
        />
        <BoolRow
          settingId="packing.show_bundle_info"
          label="Wyświetlaj informację o produkcie z zestawu"
          checked={extended.showBundleInfo}
          onChange={(v) => patchExtended("showBundleInfo", v)}
          capability={CAP_NONE}
        />
        <BoolRow
          settingId="packing.show_product_name_during_packing"
          label="Wyświetlaj nazwę produktu podczas pakowania"
          checked={extended.showProductNameDuringPacking}
          onChange={(v) => patchExtended("showProductNameDuringPacking", v)}
          capability={CAP_NONE}
        />
        <BoolRow
          settingId="packing.truncate_long_names"
          label="Ograniczaj długość tytułu w produktach"
          checked={extended.truncateLongNames}
          onChange={(v) => patchExtended("truncateLongNames", v)}
          capability={CAP_NONE}
        />
      </div>

      <Subsection title="Lista zamówień">
        <FieldGrid>
          <SelectField
            settingId="packing.orders_list_layout"
            label="Wybierz układ listy zamówień w trybie pakowania"
            capability={CAP_NONE}
            value={extended.ordersListLayout}
            onChange={(v) => patchExtended("ordersListLayout", v as WmsPackingExtendedUiSettings["ordersListLayout"])}
          >
            <option value="expanded_vertical">Rozbudowany (pionowo)</option>
            <option value="compact">Kompaktowy</option>
            <option value="cards">Karty</option>
          </SelectField>
          <SelectField
            settingId="packing.initial_orders_count"
            label="Ilość zamówień wczytywanych na start i przy przewijaniu"
            capability={CAP_NONE}
            value={String(extended.initialOrdersCount)}
            onChange={(v) => {
              const n = Number(v);
              if (Number.isFinite(n)) patchExtended("initialOrdersCount", Math.min(200, Math.max(5, Math.floor(n))));
            }}
          >
            {[10, 25, 50, 75, 100, 150, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectField>
        </FieldGrid>
        <Help>Poniższe ustawienia dotyczą układu listy w typie rozbudowanym.</Help>
        <div className="mt-2 space-y-2">
          <BoolRow
            settingId="packing.show_product_image_in_orders"
            label="Wyświetlaj zdjęcie produktu na liście zamówień"
            checked={extended.showProductImageInOrders}
            onChange={(v) => patchExtended("showProductImageInOrders", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.show_sku_in_orders"
            label="Wyświetlaj symbol produktu na liście zamówień"
            checked={extended.showSKUInOrders}
            onChange={(v) => patchExtended("showSKUInOrders", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.show_ean_in_orders"
            label="Wyświetlaj EAN produktu na liście zamówień"
            checked={extended.showEANInOrders}
            onChange={(v) => patchExtended("showEANInOrders", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.show_catalog_number_in_orders"
            label="Wyświetlaj numer katalogowy produktu na liście zamówień"
            checked={extended.showCatalogNumberInOrders}
            onChange={(v) => patchExtended("showCatalogNumberInOrders", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.truncate_names_in_orders"
            label="Ograniczaj długość tytułu w produktach na liście zamówień"
            checked={extended.truncateNamesInOrders}
            onChange={(v) => patchExtended("truncateNamesInOrders", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.show_packed_orders"
            label="Wyświetlaj spakowane zamówienia na liście zamówień"
            checked={extended.showPackedOrders}
            onChange={(v) => patchExtended("showPackedOrders", v)}
            capability={CAP_NONE}
            infoKey="packing.show_packed_orders"
          />
        </div>
      </Subsection>
    </SectionCard>
  );
}
