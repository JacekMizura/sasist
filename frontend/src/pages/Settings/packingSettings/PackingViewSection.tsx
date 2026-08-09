import { OrdersListLayoutPreview } from "../../../components/wms/packing/ordersList/OrdersListLayoutPreview";
import { ProductDisplayModePreview } from "../../../components/wms/packing/ProductDisplayModePreview";
import { buildPackingProductFieldVisibility } from "../../../components/wms/packing/packingProductDisplay";
import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type { WmsPackingInterfaceDisplay, WmsPackingSettingsRead } from "../../../types/wmsPackingSettings";
import {
  BoolRow,
  CAP_NONE,
  FieldGrid,
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
  const productPreviewVisibility = buildPackingProductFieldVisibility(draft.interface_display, extended);

  return (
    <SectionCard id="wms-pack-view" title="Widok">
      <FieldGrid>
        <SelectField
          settingId="packing.layout_mode"
          label="Wybierz układ"
          value={extended.layoutMode}
          onChange={(v) => patchExtended("layoutMode", v as WmsPackingExtendedUiSettings["layoutMode"])}
          infoKey="packing.layout_mode"
        >
          <option value="with_sidebar">Z sidebarem</option>
          <option value="full_width">Pełna szerokość</option>
        </SelectField>
        <SelectField
          settingId="packing.customer_comment_style"
          label="Wygląd komentarzy klienta"
          value={extended.customerCommentStyle}
          onChange={(v) =>
            patchExtended("customerCommentStyle", v as WmsPackingExtendedUiSettings["customerCommentStyle"])
          }
          infoKey="packing.customer_comment_style"
        >
          <option value="highlighted">Wyróżniony</option>
          <option value="normal">Zwykły</option>
        </SelectField>
        <SelectField
          settingId="packing.sales_document_preview"
          label="Widok dokumentu sprzedaży"
          value={extended.salesDocumentPreview}
          onChange={(v) =>
            patchExtended("salesDocumentPreview", v as WmsPackingExtendedUiSettings["salesDocumentPreview"])
          }
          infoKey="packing.sales_document_preview"
        >
          <option value="simplified">Uproszczony</option>
          <option value="full">Pełny</option>
        </SelectField>
        <SelectField
          settingId="packing.product_display_mode"
          label="Wygląd produktów na liście do spakowania"
          value={extended.productDisplayMode}
          onChange={(v) =>
            patchExtended("productDisplayMode", v as WmsPackingExtendedUiSettings["productDisplayMode"])
          }
          infoKey="packing.product_display_mode"
        >
          <option value="list">Lista</option>
          <option value="grid">Siatka</option>
        </SelectField>
      </FieldGrid>
      <ProductDisplayModePreview mode={extended.productDisplayMode} fieldVisibility={productPreviewVisibility} />
      <FieldGrid>
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

      <div className="mt-3 space-y-1">
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
          infoKey="packing.show_product_image"
        />
        <BoolRow
          settingId="packing.show_product_location"
          label="Wyświetlaj lokalizację produktów"
          checked={extended.showProductLocation}
          onChange={(v) => patchExtended("showProductLocation", v)}
          infoKey="packing.show_product_location"
        />
        <BoolRow
          settingId="packing.move_packed_to_bottom"
          label="Przesuwaj spakowane produkty na koniec listy"
          checked={extended.movePackedToBottom}
          onChange={(v) => patchExtended("movePackedToBottom", v)}
          infoKey="packing.move_packed_to_bottom"
        />
        <BoolRow
          settingId="packing.show_order_phone"
          label="Wyświetlaj numer telefonu"
          checked={extended.showOrderPhone}
          onChange={(v) => patchExtended("showOrderPhone", v)}
          infoKey="packing.show_order_phone"
        />
        <BoolRow
          settingId="packing.show_order_value"
          label="Wyświetlaj wartość zamówienia"
          checked={extended.showOrderValue}
          onChange={(v) => patchExtended("showOrderValue", v)}
          infoKey="packing.show_order_value"
        />
        <BoolRow
          settingId="packing.show_shipping_address"
          label="Wyświetlaj adres dostawy"
          checked={extended.showShippingAddress}
          onChange={(v) => patchExtended("showShippingAddress", v)}
          infoKey="packing.show_shipping_address"
        />
        <BoolRow
          settingId="packing.show_stock"
          label="Wyświetlaj stan magazynowy w produktach"
          checked={draft.interface_display.show_stock}
          onChange={() => toggleInterfaceField("show_stock")}
          infoKey="packing.show_stock"
        />
        <BoolRow
          settingId="packing.show_ean"
          label="Wyświetlaj EAN w produktach"
          checked={draft.interface_display.show_ean}
          onChange={() => toggleInterfaceField("show_ean")}
          infoKey="packing.show_ean"
        />
        <BoolRow
          settingId="packing.show_symbol"
          label="Wyświetlaj symbol w produkcie"
          checked={draft.interface_display.show_symbol}
          onChange={() => toggleInterfaceField("show_symbol")}
          infoKey="packing.show_symbol"
        />
        <BoolRow
          settingId="packing.show_catalog_number"
          label="Wyświetlaj numer katalogowy w produktach"
          checked={draft.interface_display.show_catalog_number}
          onChange={() => toggleInterfaceField("show_catalog_number")}
          infoKey="packing.show_catalog_number"
        />
        <BoolRow
          settingId="packing.show_signature"
          label="Wyświetlaj sygnaturę w produktach"
          checked={extended.showSignature}
          onChange={(v) => patchExtended("showSignature", v)}
          infoKey="packing.show_signature"
        />
        <BoolRow
          settingId="packing.show_price"
          label="Wyświetlaj cenę w produktach"
          checked={extended.showPrice}
          onChange={(v) => patchExtended("showPrice", v)}
          infoKey="packing.show_price"
        />
        <BoolRow
          settingId="packing.show_bundle_info"
          label="Wyświetlaj informację o produkcie z zestawu"
          checked={extended.showBundleInfo}
          onChange={(v) => patchExtended("showBundleInfo", v)}
          infoKey="packing.show_bundle_info"
        />
        <BoolRow
          settingId="packing.show_product_name_during_packing"
          label="Wyświetlaj nazwę produktu podczas pakowania"
          checked={extended.showProductNameDuringPacking}
          onChange={(v) => patchExtended("showProductNameDuringPacking", v)}
          infoKey="packing.show_product_name_during_packing"
        />
        <BoolRow
          settingId="packing.truncate_long_names"
          label="Ograniczaj długość tytułu w produktach"
          checked={extended.truncateLongNames}
          onChange={(v) => patchExtended("truncateLongNames", v)}
          infoKey="packing.truncate_long_names"
        />
      </div>

      <Subsection title="Lista zamówień">
        <FieldGrid>
          <SelectField
            settingId="packing.orders_list_layout"
            label="Wybierz układ listy zamówień w trybie pakowania"
            value={extended.ordersListLayout}
            onChange={(v) => patchExtended("ordersListLayout", v as WmsPackingExtendedUiSettings["ordersListLayout"])}
          >
            <option value="compact">Standardowy</option>
            <option value="cards">Rozbudowany (Poziomy)</option>
            <option value="expanded_vertical">Rozbudowany (Pionowy)</option>
          </SelectField>
        </FieldGrid>
        <OrdersListLayoutPreview
          layout={extended.ordersListLayout}
          productFields={{
            showImage: extended.showProductImageInOrders,
            showSku: extended.showSKUInOrders,
            showEan: extended.showEANInOrders,
            showCatalogNumber: extended.showCatalogNumberInOrders,
            truncateNames: extended.truncateNamesInOrders,
          }}
        />
        <FieldGrid>
          <SelectField
            settingId="packing.initial_orders_count"
            label="Ilość zamówień wczytywanych na start i przy przewijaniu"
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
        <div className="mt-2 space-y-1">
          <BoolRow
            settingId="packing.show_product_image_in_orders"
            label="Wyświetlaj zdjęcie produktu na liście zamówień"
            checked={extended.showProductImageInOrders}
            onChange={(v) => patchExtended("showProductImageInOrders", v)}
            infoKey="packing.show_product_image_in_orders"
          />
          <BoolRow
            settingId="packing.show_sku_in_orders"
            label="Wyświetlaj symbol produktu na liście zamówień"
            checked={extended.showSKUInOrders}
            onChange={(v) => patchExtended("showSKUInOrders", v)}
            infoKey="packing.show_sku_in_orders"
          />
          <BoolRow
            settingId="packing.show_ean_in_orders"
            label="Wyświetlaj EAN produktu na liście zamówień"
            checked={extended.showEANInOrders}
            onChange={(v) => patchExtended("showEANInOrders", v)}
            infoKey="packing.show_ean_in_orders"
          />
          <BoolRow
            settingId="packing.show_catalog_number_in_orders"
            label="Wyświetlaj numer katalogowy produktu na liście zamówień"
            checked={extended.showCatalogNumberInOrders}
            onChange={(v) => patchExtended("showCatalogNumberInOrders", v)}
            infoKey="packing.show_catalog_number_in_orders"
          />
          <BoolRow
            settingId="packing.truncate_names_in_orders"
            label="Ograniczaj długość tytułu w produktach na liście zamówień"
            checked={extended.truncateNamesInOrders}
            onChange={(v) => patchExtended("truncateNamesInOrders", v)}
            infoKey="packing.truncate_names_in_orders"
          />
          <BoolRow
            settingId="packing.show_packed_orders"
            label="Wyświetlaj spakowane zamówienia na liście zamówień"
            checked={extended.showPackedOrders}
            onChange={(v) => patchExtended("showPackedOrders", v)}
            infoKey="packing.show_packed_orders"
          />
        </div>
      </Subsection>
    </SectionCard>
  );
}
